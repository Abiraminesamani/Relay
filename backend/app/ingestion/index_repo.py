from __future__ import annotations

import base64
import hashlib
import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import chromadb
import httpx
from langchain.text_splitter import Language, RecursiveCharacterTextSplitter

from app.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"

SUPPORTED_EXTENSIONS: dict[str, Language | None] = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".java": Language.JAVA,
    ".go": Language.GO,
    ".html": Language.HTML,
    ".md": Language.MARKDOWN,
    ".sql": None,
    ".json": None,
    ".yml": None,
    ".yaml": None,
    ".toml": None,
    ".properties": None,
    ".gradle": None,
    ".xml": None,
}

IGNORE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "Env",
    "ENV",
    "site-packages",
    "Lib",
    "lib",
    "Scripts",
    "bin",
    "include",
    "dist",
    "build",
    "target",
    "out",
    ".next",
    ".idea",
    ".vscode",
    ".cache",
    ".pytest_cache",
    ".tox",
    "coverage",
    ".turbo",
    ".gradle",
    ".mvn",
    "vendor",
    "Pods",
}

IGNORE_FILENAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Pipfile.lock",
    "Cargo.lock",
    "composer.lock",
}


class FastCodeEmbeddingFunction(chromadb.EmbeddingFunction):
    """Fast, deterministic, offline embedding function for code retrieval."""

    def __call__(self, input: list[str]) -> list[list[float]]:
        embeddings: list[list[float]] = []
        dim = 128
        for doc in input:
            vec = [0.0] * dim
            words = re.findall(r"[A-Za-z0-9_]+", doc.lower())
            for word in words:
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                idx = h % dim
                sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
                vec[idx] += sign
            norm = math.sqrt(sum(x * x for x in vec)) or 1.0
            embeddings.append([x / norm for x in vec])
        return embeddings


default_embedding_fn = FastCodeEmbeddingFunction()


def sanitize_collection_name(repo_name: str) -> str:
    """Format repository name into a valid Chroma collection identifier."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", repo_name).strip("_")
    cleaned = f"relay_{cleaned}"
    return cleaned[:63]


def get_chroma_client() -> chromadb.PersistentClient:
    persist_dir = Path(settings.chroma_persist_dir)
    persist_dir.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(persist_dir))


def chunk_code_file(content: str, file_path: str) -> list[dict[str, Any]]:
    """Split source code into logical chunks preserving structure and context."""
    if not content.strip():
        return []

    suffix = Path(file_path).suffix.lower()
    language = SUPPORTED_EXTENSIONS.get(suffix)

    if language:
        try:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=language,
                chunk_size=1000,
                chunk_overlap=150,
            )
        except Exception:
            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    else:
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)

    raw_chunks = splitter.split_text(content)
    chunks = []
    for idx, text in enumerate(raw_chunks):
        if not text.strip():
            continue
        chunks.append({
            "content": text,
            "path": file_path,
            "chunk_index": idx,
            "total_chunks": len(raw_chunks),
        })
    return chunks


def _get_github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Relay-Code-Indexer",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _fetch_file_content(client: httpx.Client, owner: str, repo: str, path: str, ref: str | None = None) -> str:
    url = f"/repos/{owner}/{repo}/contents/{path}"
    params = {"ref": ref} if ref else {}
    try:
        response = client.get(url, params=params)
        if response.status_code != 200:
            return ""
        payload = response.json()
        if isinstance(payload, list) or "content" not in payload:
            return ""
        decoded = base64.b64decode(payload["content"])
        return decoded.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def index_repo(repo: str | None = None) -> dict[str, Any]:
    """Index a GitHub repository into Chroma vector database using parallel fetching and smart filtering."""
    target_repo = repo or settings.github_repo
    if not target_repo or "/" not in target_repo:
        raise ValueError("A valid repository in 'owner/repo' format is required for indexing.")

    owner, repo_name = target_repo.split("/", 1)
    collection_name = sanitize_collection_name(target_repo)
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=collection_name, embedding_function=default_embedding_fn)

    with httpx.Client(base_url=GITHUB_API_URL, headers=_get_github_headers(), timeout=30.0, follow_redirects=True) as http_client:
        # Fetch default branch
        repo_resp = http_client.get(f"/repos/{owner}/{repo_name}")
        if repo_resp.status_code != 200:
            raise RuntimeError(f"Failed to access repository {target_repo}: {repo_resp.text}")
        default_branch = repo_resp.json().get("default_branch", "main")

        # Fetch git tree recursively
        tree_resp = http_client.get(f"/repos/{owner}/{repo_name}/git/trees/{default_branch}?recursive=1")
        if tree_resp.status_code != 200:
            raise RuntimeError(f"Failed to fetch git tree for {target_repo}: {tree_resp.text}")
        tree_entries = tree_resp.json().get("tree", [])

        # Filter candidate files
        candidate_paths: list[str] = []
        for entry in tree_entries:
            if entry.get("type") != "blob":
                continue
            path_str = entry.get("path", "")
            path_obj = Path(path_str)
            path_parts = path_obj.parts

            # Skip virtual environments, build directories, and lock files
            if any(part in IGNORE_DIRS for part in path_parts):
                continue
            if path_obj.name in IGNORE_FILENAMES:
                continue
            suffix = path_obj.suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                continue

            size = int(entry.get("size") or 0)
            if size > 150_000:  # Skip oversized files
                continue

            candidate_paths.append(path_str)

        # Cap max files to prevent memory/rate-limit issues on giant monorepos
        candidate_paths = candidate_paths[:250]

        # Fetch file contents concurrently using a ThreadPool
        documents: list[str] = []
        metadatas: list[dict[str, Any]] = []
        ids: list[str] = []
        indexed_files = 0

        def fetch_worker(path: str) -> tuple[str, str]:
            with httpx.Client(base_url=GITHUB_API_URL, headers=_get_github_headers(), timeout=20.0, follow_redirects=True) as worker_client:
                return path, _fetch_file_content(worker_client, owner, repo_name, path, ref=default_branch)

        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_path = {executor.submit(fetch_worker, p): p for p in candidate_paths}
            for future in as_completed(future_to_path):
                try:
                    path_str, content = future.result()
                    if not content:
                        continue

                    chunks = chunk_code_file(content, path_str)
                    for chunk in chunks:
                        chunk_id = f"{collection_name}:{path_str}:{chunk['chunk_index']}"
                        documents.append(chunk["content"])
                        metadatas.append({
                            "path": path_str,
                            "chunk_index": chunk["chunk_index"],
                            "total_chunks": chunk["total_chunks"],
                            "repo": target_repo,
                            "branch": default_branch,
                        })
                        ids.append(chunk_id)

                    indexed_files += 1
                except Exception:
                    logger.exception("Error fetching and chunking file.")

        total_chunks = len(documents)
        if documents:
            # Batch upsert into Chroma (batches of 100)
            batch_size = 100
            for i in range(0, len(documents), batch_size):
                collection.upsert(
                    documents=documents[i : i + batch_size],
                    metadatas=metadatas[i : i + batch_size],
                    ids=ids[i : i + batch_size],
                )

    return {
        "status": "success",
        "repository": target_repo,
        "collection": collection_name,
        "files_indexed": indexed_files,
        "chunks_indexed": total_chunks,
    }


def index_files(paths: list[str], commit_sha: str, repo: str | None = None) -> dict[str, Any]:
    """Incrementally re-index changed files from a push event."""
    target_repo = repo or settings.github_repo
    if not target_repo or "/" not in target_repo:
        return {"status": "skipped", "reason": "No valid repository configured."}

    owner, repo_name = target_repo.split("/", 1)
    collection_name = sanitize_collection_name(target_repo)
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=collection_name, embedding_function=default_embedding_fn)

    updated_files = 0
    with httpx.Client(base_url=GITHUB_API_URL, headers=_get_github_headers(), timeout=30.0, follow_redirects=True) as http_client:
        for path_str in paths:
            path_obj = Path(path_str)
            if any(part in IGNORE_DIRS for part in path_obj.parts):
                continue
            if path_obj.name in IGNORE_FILENAMES:
                continue
            suffix = path_obj.suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                continue

            content = _fetch_file_content(http_client, owner, repo_name, path_str, ref=commit_sha)
            if not content:
                continue

            chunks = chunk_code_file(content, path_str)
            if not chunks:
                continue

            documents = [c["content"] for c in chunks]
            metadatas = [
                {
                    "path": path_str,
                    "chunk_index": c["chunk_index"],
                    "total_chunks": c["total_chunks"],
                    "repo": target_repo,
                    "commit": commit_sha,
                }
                for c in chunks
            ]
            ids = [f"{collection_name}:{path_str}:{c['chunk_index']}" for c in chunks]

            collection.upsert(documents=documents, metadatas=metadatas, ids=ids)
            updated_files += 1

    return {
        "status": "success",
        "repository": target_repo,
        "files_updated": updated_files,
        "commit": commit_sha,
    }
