from __future__ import annotations

import base64
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
import httpx
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings
from app.ingestion.index_repo import default_embedding_fn

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"
MAX_SAFE_SNIPPET_CHARS = 140
SUPPORTED_SOURCE_SUFFIXES = {
    ".java",
    ".kt",
    ".kts",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".html",
    ".css",
    ".scss",
    ".xml",
    ".properties",
    ".gradle",
    ".json",
    ".sql",
    ".md",
    ".yml",
    ".yaml",
    ".toml",
    ".sh",
}
STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "what",
    "where",
    "when",
    "how",
    "does",
    "into",
    "about",
    "repo",
    "repository",
    "file",
    "code",
    "function",
    "class",
    "please",
    "explain",
    "overview",
    "implemented",
    "implementation",
}
SECRET_PATTERNS = (
    re.compile(r"(?im)\b([A-Z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)"),
    re.compile(r"(?im)\b(authorization)\s*[:=]\s*(bearer\s+[^\s,;]+)"),
    re.compile(r"(?i)\b(sk-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)\b"),
    re.compile(r"(?i)\bjdbc:[^\s]+:[^/\s]+://([^:\s/]+):([^@\s/]+)@"),
)


class GitHubAuthError(RuntimeError):
    """Raised when the GitHub token is missing or invalid."""


class GitHubRepositoryNotFoundError(RuntimeError):
    """Raised when the configured GitHub repository cannot be found."""


class OpenAIServiceError(RuntimeError):
    """Raised when the OpenAI call fails."""


@dataclass(slots=True)
class RetrievedChunk:
    path: str
    content: str
    source: str


@dataclass(slots=True)
class SecurityFinding:
    severity: str
    title: str
    detail: str
    path: str


class CodeAgent(RelayAgent):
    name = "Code Agent"
    agent_type = "code"
    description = "Answers repository code questions, architecture, functions, files, and security audits using Chroma RAG retrieval and live code inspection."

    def can_handle(self, request: AgentRequest) -> bool:
        # CodeAgent handles code/repository queries and acts as the deep code intelligence layer
        return True

    def handle(self, request: AgentRequest) -> AgentResult:
        response_text = answer_code_question(request.query_text)
        return AgentResult(agent_name=self.name, response_text=response_text)


def answer_code_question(question: str) -> str:
    """Answer a repository question using indexed context or live GitHub fallback."""
    try:
        _validate_required_settings()
        if _is_repository_list_question(question):
            return _build_repository_list_answer()
        chunks = _retrieve_relevant_chunks(question)
        if not chunks:
            return (
                "Repository indexing has not been built yet, so I could not retrieve "
                "enough source context to answer that question."
            )
        return _generate_grounded_answer(question, chunks)
    except GitHubRepositoryNotFoundError:
        return "Repository not found. Check GITHUB_REPO and confirm the repository exists."
    except GitHubAuthError:
        return "GitHub authentication failed. Check GITHUB_TOKEN and confirm it can read the repository."
    except OpenAIServiceError:
        return "OpenAI API failed while generating the answer. Please try again in a moment."
    except Exception:
        logger.exception("Unexpected error while answering a code question.")
        return (
            "I hit an unexpected error while answering that repository question. "
            "Please try again after checking the backend logs."
        )


def _validate_required_settings() -> None:
    if not settings.github_repo.strip():
        raise GitHubRepositoryNotFoundError("Missing GITHUB_REPO configuration.")
    if not settings.github_token.strip():
        raise GitHubAuthError("Missing GITHUB_TOKEN configuration.")


def _retrieve_relevant_chunks(question: str) -> list[RetrievedChunk]:
    indexed_chunks = _retrieve_from_chroma(question)
    if indexed_chunks:
        return indexed_chunks
    return _retrieve_live_repository_context(question)


def _retrieve_from_chroma(question: str) -> list[RetrievedChunk]:
    persist_dir = Path(settings.chroma_persist_dir)
    if not persist_dir.exists():
        return []

    try:
        client = chromadb.PersistentClient(path=str(persist_dir))
        collections = client.list_collections()
        if not collections:
            return []
    except Exception:
        logger.exception("Failed to connect to Chroma persistent store.")
        return []

    best_chunks: list[RetrievedChunk] = []

    for collection_info in collections:
        collection_name = (
            collection_info.name
            if hasattr(collection_info, "name")
            else str(collection_info)
        )
        try:
            collection = client.get_collection(
                collection_name,
                embedding_function=default_embedding_fn,
            )
            result = collection.query(
                query_texts=[question],
                n_results=4,
                include=["documents", "metadatas", "distances"],
            )

            documents = result.get("documents", [[]])[0]
            metadatas = result.get("metadatas", [[]])[0]
            if documents:
                for document, metadata in zip(documents, metadatas):
                    if document:
                        best_chunks.append(
                            RetrievedChunk(
                                path=str((metadata or {}).get("path", "unknown")),
                                content=document,
                                source="chroma",
                            )
                        )
                if best_chunks:
                    return best_chunks[:4]
        except Exception:
            logger.exception("Failed to query Chroma collection '%s'.", collection_name)
            continue

    return best_chunks


def _retrieve_live_repository_context(question: str) -> list[RetrievedChunk]:
    owner, repo = _parse_repo_name()
    with _github_client() as client:
        default_branch = _fetch_default_branch(client, owner, repo)
        tree = _fetch_repository_tree(client, owner, repo, default_branch)
        candidate_paths = _rank_repository_paths(question, tree)

        chunks: list[RetrievedChunk] = []
        for path in candidate_paths[:4]:
            file_content = _fetch_file_contents(client, owner, repo, path)
            if not file_content:
                continue
            chunks.append(
                RetrievedChunk(
                    path=path,
                    content=_trim_content(file_content),
                    source="github",
                )
            )
        return chunks


def _parse_repo_name() -> tuple[str, str]:
    if "/" not in settings.github_repo:
        raise GitHubRepositoryNotFoundError("GITHUB_REPO must use the 'owner/repo' format.")
    owner, repo = settings.github_repo.split("/", 1)
    if not owner or not repo:
        raise GitHubRepositoryNotFoundError("GITHUB_REPO must use the 'owner/repo' format.")
    return owner, repo


def _github_client() -> httpx.Client:
    return httpx.Client(
        base_url=GITHUB_API_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {settings.github_token}",
            "User-Agent": "DevCopilot",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        follow_redirects=True,
        timeout=20.0,
    )


def _fetch_default_branch(client: httpx.Client, owner: str, repo: str) -> str:
    response = client.get(f"/repos/{owner}/{repo}")
    _raise_for_github_error(response)
    return str(response.json().get("default_branch", "main"))


def _fetch_repository_tree(
    client: httpx.Client,
    owner: str,
    repo: str,
    ref: str,
) -> list[dict[str, Any]]:
    response = client.get(f"/repos/{owner}/{repo}/git/trees/{ref}?recursive=1")
    _raise_for_github_error(response)
    return list(response.json().get("tree", []))


def _rank_repository_paths(question: str, tree: list[dict[str, Any]]) -> list[str]:
    query_tokens = _tokenize(question)
    overview_query = _is_repository_overview_question(question)
    security_query = _is_security_question(question)
    scored_paths: list[tuple[int, str]] = []

    for entry in tree:
        if entry.get("type") != "blob":
            continue

        path = str(entry.get("path", ""))
        suffix = Path(path).suffix.lower()
        size = int(entry.get("size") or 0)
        if suffix not in SUPPORTED_SOURCE_SUFFIXES or size > 60_000:
            continue

        path_tokens = _tokenize(path.replace("/", " ").replace("_", " ").replace("-", " "))
        overlap_score = len(query_tokens & path_tokens)
        heuristic_bonus = 0
        if path.startswith(("backend/", "app/", "src/")):
            heuristic_bonus += 1
        if path.startswith(("src/main/", "src/main/java/", "src/main/resources/")):
            heuristic_bonus += 2
        if suffix in {".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".kt"}:
            heuristic_bonus += 1
        if "readme" in path.casefold():
            heuristic_bonus += 3 if overview_query else -1
        if path.endswith(("pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle")):
            heuristic_bonus += 3
        if path.endswith(("application.properties", "application.yml", "application.yaml")):
            heuristic_bonus += 2
        if security_query and any(
            marker in path.casefold()
            for marker in ("security", "auth", "jwt", "userdetails", "properties", "config")
        ):
            heuristic_bonus += 4
        if overview_query and path.startswith(("src/main/", "src/test/")):
            heuristic_bonus -= 1

        total_score = overlap_score * 3 + heuristic_bonus
        if total_score > 0:
            scored_paths.append((total_score, path))

    if not scored_paths:
        fallback_paths = _select_fallback_paths(tree, overview_query)
        return fallback_paths[:4]

    scored_paths.sort(key=lambda item: (-item[0], item[1]))
    return [path for _, path in scored_paths[:8]]


def _fetch_file_contents(client: httpx.Client, owner: str, repo: str, path: str) -> str:
    response = client.get(f"/repos/{owner}/{repo}/contents/{path}")
    _raise_for_github_error(response)
    payload = response.json()

    if isinstance(payload, list):
        return ""

    encoded_content = payload.get("content")
    if not encoded_content:
        return ""
    encoding = str(payload.get("encoding", "base64"))
    if encoding != "base64":
        return str(encoded_content)

    decoded = base64.b64decode(encoded_content)
    return decoded.decode("utf-8", errors="ignore")


def _generate_grounded_answer(question: str, chunks: list[RetrievedChunk]) -> str:
    if _is_security_question(question):
        return _generate_security_answer(question, chunks)

    if not settings.openai_api_key.strip():
        return _build_fallback_answer(question, chunks)

    context_sections = []
    for chunk in chunks:
        context_sections.append(
            f"File: {chunk.path}\nSource: {chunk.source}\n{_sanitize_content(chunk.content)}"
        )

    prompt = (
        "You are DevCopilot, a GitHub-integrated senior engineering assistant.\n"
        "Answer the repository question using only the provided context.\n"
        "If the context is incomplete, say what is missing.\n"
        "Always cite file paths when you make a claim.\n\n"
        f"Question:\n{question}\n\n"
        "Context:\n"
        + "\n\n---\n\n".join(context_sections)
    )

    try:
        llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
        )
        response = llm.invoke(prompt)
    except Exception:
        logger.exception("OpenAI call failed while answering a code question.")
        return _build_fallback_answer(question, chunks)

    content = getattr(response, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(item) for item in content)
    return str(content)


def _generate_security_answer(question: str, chunks: list[RetrievedChunk]) -> str:
    findings = _scan_security_findings(chunks)
    if not settings.openai_api_key.strip():
        return _build_security_fallback_answer(chunks, findings)

    sanitized_context = []
    for chunk in chunks:
        sanitized_context.append(
            f"File: {chunk.path}\nSource: {chunk.source}\n{_sanitize_content(chunk.content)}"
        )

    findings_text = "\n".join(
        f"- Severity: {finding.severity}; Title: {finding.title}; Detail: {finding.detail}; File: {finding.path}"
        for finding in findings
    ) or "- No concrete heuristic findings from the retrieved files."

    prompt = (
        "You are DevCopilot performing a cautious repository security review.\n"
        "Use only the provided evidence.\n"
        "Do not invent vulnerabilities that are not supported by the files.\n"
        "Treat heuristic findings as signals, not proof.\n"
        "Write a concise report with two sections titled Findings and Gaps.\n"
        "Each finding must include severity and at least one file path.\n"
        "If evidence is incomplete, say so clearly.\n\n"
        f"User question:\n{question}\n\n"
        f"Heuristic findings:\n{findings_text}\n\n"
        "Retrieved file context:\n"
        + "\n\n---\n\n".join(sanitized_context)
    )

    try:
        llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
        )
        response = llm.invoke(prompt)
    except Exception:
        logger.exception("OpenAI call failed while generating a security review.")
        return _build_security_fallback_answer(chunks, findings)

    content = getattr(response, "content", "")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        flattened = "".join(str(item) for item in content)
        if flattened.strip():
            return flattened
    return _build_security_fallback_answer(chunks, findings)


def _trim_content(content: str, max_chars: int = 6_000) -> str:
    cleaned = content.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars] + "\n... [truncated]"


def _sanitize_content(content: str) -> str:
    sanitized = content
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub(_redact_match, sanitized)
    return sanitized


def _redact_match(match: re.Match[str]) -> str:
    if match.lastindex and match.lastindex >= 2:
        return f"{match.group(1)}=[REDACTED]"
    return "[REDACTED]"


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9_]{3,}", text.casefold())
        if token not in STOP_WORDS
    }


def _is_repository_overview_question(question: str) -> bool:
    normalized = question.casefold()
    overview_markers = (
        "what are the repository about",
        "what is the repository about",
        "what is this repository about",
        "what are this repository about",
        "what is this repo about",
        "what are this repo about",
        "what is the repo about",
        "what are the repo about",
        "explain this repository",
        "explain this repo",
        "repository overview",
        "repo overview",
        "what does this repository do",
        "what does this repo do",
    )
    return any(marker in normalized for marker in overview_markers)


def _is_repository_list_question(question: str) -> bool:
    normalized = question.casefold()
    list_markers = (
        "what repositories do i have",
        "what repository do i have",
        "which repository do i have",
        "which repositories do i have",
        "what are the repositories i have",
        "show my repositories",
        "list my repositories",
    )
    return any(marker in normalized for marker in list_markers)


def _is_security_question(question: str) -> bool:
    normalized = question.casefold()
    markers = (
        "security",
        "vulnerab",
        "secure",
        "hardcoded",
        "token",
        "password",
        "jwt",
        "auth",
        "authorization",
        "authentication",
        "owasp",
        "scan this repository",
    )
    return any(marker in normalized for marker in markers)


def _build_fallback_answer(question: str, chunks: list[RetrievedChunk]) -> str:
    unique_paths: list[str] = []
    seen_paths: set[str] = set()
    for chunk in chunks:
        if chunk.path in seen_paths:
            continue
        unique_paths.append(chunk.path)
        seen_paths.add(chunk.path)

    if _is_repository_overview_question(question):
        summary_points = _summarize_repository_chunks(chunks)
        if not summary_points:
            summary_points = [
                "I found relevant files, but not enough high-signal context to summarize the repository confidently."
            ]
        return _format_structured_answer(
            intro="Here is a grounded repository overview:",
            bullet_points=summary_points,
            source_label="Primary sources",
            source_paths=unique_paths[:4],
        )

    if _is_security_question(question):
        findings = _scan_security_findings(chunks)
        return _build_security_fallback_answer(chunks, findings)

    summary_points = _summarize_non_overview_chunks(chunks)
    if not summary_points:
        summary_points = [
            "I found relevant files, but I could not produce a confident grounded summary from the retrieved context."
        ]
    return _format_structured_answer(
        intro="Here is a grounded summary from the retrieved files:",
        bullet_points=summary_points,
        source_label="Relevant files",
        source_paths=unique_paths[:4],
    )


def _build_repository_list_answer() -> str:
    return (
        "I currently have one configured repository:\n"
        f"- {settings.github_repo}\n\n"
        "If you want, ask something like:\n"
        "- What does this repository do?\n"
        "- Explain the backend structure.\n"
        "- Why did the latest workflow fail?"
    )


def _format_structured_answer(
    intro: str,
    bullet_points: list[str],
    source_label: str,
    source_paths: list[str],
) -> str:
    rendered_points = "\n".join(f"- {point}" for point in bullet_points)
    rendered_sources = "\n".join(f"- {path}" for path in source_paths)
    if rendered_sources:
        return f"{intro}\n{rendered_points}\n\n{source_label}:\n{rendered_sources}"
    return f"{intro}\n{rendered_points}"


def _summarize_repository_chunks(chunks: list[RetrievedChunk]) -> list[str]:
    summary_points: list[str] = []

    for chunk in chunks:
        path_lower = chunk.path.casefold()
        content = _sanitize_content(chunk.content).strip()
        if not content:
            continue

        if "readme" in path_lower:
            first_nonempty_line = next(
                (line.strip(" #\t") for line in content.splitlines() if line.strip()),
                "",
            )
            if first_nonempty_line:
                summary_points.append(
                    f"The repository appears to be centered around {first_nonempty_line} as described in {chunk.path}."
                )
        elif path_lower.endswith(("pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle")):
            dependencies = []
            if "spring-boot" in content.casefold():
                dependencies.append("Spring Boot")
            if "mysql" in content.casefold():
                dependencies.append("MySQL")
            if "jpa" in content.casefold():
                dependencies.append("JPA")
            if dependencies:
                summary_points.append(
                    f"The build configuration in {chunk.path} suggests a stack based on {', '.join(dependencies)}."
                )
        elif path_lower.endswith(("application.properties", "application.yml", "application.yaml")):
            config_hints = []
            lower_content = content.casefold()
            if "datasource" in lower_content:
                config_hints.append("database connectivity")
            if "server.port" in lower_content:
                config_hints.append("server configuration")
            if config_hints:
                summary_points.append(
                    f"The runtime configuration in {chunk.path} focuses on {', '.join(config_hints)}."
                )
        elif path_lower.endswith((".java", ".kt", ".py", ".ts", ".tsx")):
            class_match = re.search(r"\b(class|interface|def|function)\s+([A-Za-z0-9_]+)", content)
            if class_match:
                summary_points.append(
                    f"{chunk.path} includes core implementation details such as `{class_match.group(2)}`."
                )

        if len(summary_points) >= 3:
            break

    return summary_points[:3]


def _summarize_non_overview_chunks(chunks: list[RetrievedChunk]) -> list[str]:
    summary_points: list[str] = []
    for chunk in chunks:
        sanitized_content = _sanitize_content(chunk.content)
        lower_path = chunk.path.casefold()
        important_lines = [
            line.strip()
            for line in sanitized_content.splitlines()
            if line.strip() and not _looks_sensitive(line)
        ]
        if not important_lines:
            continue

        if lower_path.endswith(("application.properties", "application.yml", "application.yaml")):
            config_hints = []
            lower_content = sanitized_content.casefold()
            if "datasource" in lower_content:
                config_hints.append("database configuration")
            if "jwt" in lower_content:
                config_hints.append("JWT settings")
            if "server.port" in lower_content:
                config_hints.append("server port configuration")
            if config_hints:
                summary_points.append(
                    f"{chunk.path} contains runtime settings related to {', '.join(config_hints)}."
                )
                continue

        class_match = re.search(r"\b(class|interface|enum)\s+([A-Za-z0-9_]+)", sanitized_content)
        if class_match:
            summary_points.append(
                f"{chunk.path} defines `{class_match.group(2)}`, which looks relevant to this question."
            )
            continue

        summary_points.append(f"{chunk.path} includes relevant implementation details such as {_first_safe_snippet(important_lines)}")

        if len(summary_points) >= 3:
            break

    return summary_points[:3]


def _first_safe_snippet(lines: list[str]) -> str:
    for line in lines:
        if _looks_sensitive(line):
            continue
        snippet = line[:MAX_SAFE_SNIPPET_CHARS].rstrip(" ,;:")
        if snippet:
            return f"`{snippet}`."
    return "configuration and code structure."


def _looks_sensitive(line: str) -> bool:
    lowered = line.casefold()
    return any(marker in lowered for marker in ("password", "secret", "token", "api_key", "apikey"))


def _select_fallback_paths(tree: list[dict[str, Any]], overview_query: bool) -> list[str]:
    preferred_paths: list[str] = []
    general_paths: list[str] = []

    for entry in tree:
        if entry.get("type") != "blob":
            continue

        path = str(entry.get("path", ""))
        suffix = Path(path).suffix.lower()
        size = int(entry.get("size") or 0)
        if suffix not in SUPPORTED_SOURCE_SUFFIXES or size > 40_000:
            continue

        lower_path = path.casefold()
        if overview_query and (
            "readme" in lower_path
            or lower_path.endswith(("pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle"))
            or lower_path.endswith(("application.properties", "application.yml", "application.yaml"))
        ):
            preferred_paths.append(path)
            continue

        if lower_path.startswith(("src/main/", "backend/", "app/", "src/")):
            preferred_paths.append(path)
            continue

        general_paths.append(path)

    ordered_paths = preferred_paths + general_paths
    deduplicated_paths: list[str] = []
    seen_paths: set[str] = set()
    for path in ordered_paths:
        if path in seen_paths:
            continue
        deduplicated_paths.append(path)
        seen_paths.add(path)
    return deduplicated_paths


def _build_security_fallback_answer(
    chunks: list[RetrievedChunk],
    findings: list[SecurityFinding],
) -> str:
    unique_paths: list[str] = []
    seen_paths: set[str] = set()
    for chunk in chunks:
        if chunk.path in seen_paths:
            continue
        unique_paths.append(chunk.path)
        seen_paths.add(chunk.path)

    if findings:
        rendered_findings = " ".join(
            f"[{finding.severity}] {finding.title}: {finding.detail} ({finding.path})."
            for finding in findings[:4]
        )
        return (
            f"I found {len(findings)} potential security issue(s) in the retrieved files. "
            f"{rendered_findings} "
            f"Reviewed files: {', '.join(unique_paths[:4])}."
        )

    return (
        "I reviewed the retrieved auth and configuration files, but I did not find a concrete vulnerability "
        "from this limited context. I can see security-related code, but I would need broader repository coverage "
        f"to verify authorization rules, token validation, and secret handling. Reviewed files: {', '.join(unique_paths[:4])}."
    )


def _scan_security_findings(chunks: list[RetrievedChunk]) -> list[SecurityFinding]:
    findings: list[SecurityFinding] = []
    seen_keys: set[tuple[str, str]] = set()

    for chunk in chunks:
        path = chunk.path
        content = chunk.content
        lower_path = path.casefold()
        lower_content = content.casefold()
        sanitized_content = _sanitize_content(content)

        if _has_hardcoded_secret(content):
            _append_finding(
                findings,
                seen_keys,
                SecurityFinding(
                    severity="high",
                    title="Possible hardcoded secret in repository code or config",
                    detail="This file appears to contain credential-like configuration values. Secrets should be moved to environment variables or a secret manager",
                    path=path,
                ),
            )

        if lower_path.endswith(("application.properties", "application.yml", "application.yaml")) and "root" in lower_content:
            _append_finding(
                findings,
                seen_keys,
                SecurityFinding(
                    severity="medium",
                    title="Application configuration appears to use a privileged database account",
                    detail="Using a root or highly privileged database user increases blast radius if the app is compromised",
                    path=path,
                ),
            )

        if "jwtauthfilter" in lower_path and "onceperrequestfilter" in lower_content and "setauthentication" in lower_content:
            if not any(marker in lower_content for marker in ("authorization", "hasrole", "hasauthority", "preauthorize")):
                _append_finding(
                    findings,
                    seen_keys,
                    SecurityFinding(
                        severity="medium",
                        title="JWT authentication flow is visible, but authorization enforcement is not evident in retrieved context",
                        detail="The filter appears to authenticate requests, but I do not see clear role or permission checks in the retrieved files",
                        path=path,
                    ),
                )

        if "jwtutil" in lower_path or "jwt" in lower_path:
            if not any(marker in lower_content for marker in ("expiration", "isTokenExpired".casefold(), "validate", "parserbuilder", "verify")):
                _append_finding(
                    findings,
                    seen_keys,
                    SecurityFinding(
                        severity="medium",
                        title="JWT utility may be missing strong validation safeguards",
                        detail="From the retrieved context, I cannot confirm token expiry, signature verification, and claim validation are all enforced",
                        path=path,
                    ),
                )

        if "authentrypoint" in lower_path and not any(marker in lower_content for marker in ("senderror", "httpservletresponse.sc_unauthorized", "setstatus")):
            _append_finding(
                findings,
                seen_keys,
                SecurityFinding(
                    severity="low",
                    title="Authentication entry point handling is incomplete in retrieved context",
                    detail="I can see the auth entry point class, but not enough evidence that unauthorized requests return a consistent security response",
                    path=path,
                ),
            )

        if "customuserdetailsservice" in lower_path and "findby" in lower_content and "passwordencoder" not in lower_content:
            _append_finding(
                findings,
                seen_keys,
                SecurityFinding(
                    severity="low",
                    title="User lookup is present, but password-handling safeguards are not visible here",
                    detail="This may be fine elsewhere, but I cannot confirm password encoding or account-state checks from the retrieved files",
                    path=path,
                ),
            )

        if "[REDACTED]" in sanitized_content and lower_path.endswith(("properties", ".yml", ".yaml", ".env")):
            _append_finding(
                findings,
                seen_keys,
                SecurityFinding(
                    severity="high",
                    title="Sensitive configuration values are stored in repository-managed configuration",
                    detail="Even though values are redacted in the response, storing secrets directly in tracked config files is risky",
                    path=path,
                ),
            )

    severity_order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda item: (severity_order.get(item.severity, 3), item.path, item.title))
    return findings


def _append_finding(
    findings: list[SecurityFinding],
    seen_keys: set[tuple[str, str]],
    finding: SecurityFinding,
) -> None:
    key = (finding.path, finding.title)
    if key in seen_keys:
        return
    seen_keys.add(key)
    findings.append(finding)


def _has_hardcoded_secret(content: str) -> bool:
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "//", "/*", "*")):
            continue
        if any(token in stripped.casefold() for token in ("password=", "secret=", "token=", "api_key=", "apikey=", "authorization=")):
            return True
    return False


def _raise_for_github_error(response: httpx.Response) -> None:
    if response.status_code == 401 or response.status_code == 403:
        raise GitHubAuthError(response.text)
    if response.status_code == 404:
        raise GitHubRepositoryNotFoundError(response.text)
    response.raise_for_status()
