"""
Step 2 of the build order: repo indexing for RAG.

Plan:
1. Pull file contents for the target repo via the GitHub REST API
   (GET /repos/{owner}/{repo}/contents/{path}, recursively).
2. Chunk each file by function/class using tree-sitter, not naive line-splitting -
   this is what makes retrieval meaningful instead of returning half a function.
3. Embed each chunk (OpenAI embeddings or a local model) and upsert into Chroma,
   tagged with file path + commit sha so results can cite their source.
4. Call index_repo() once at startup for the full repo, then call
   index_files(changed_paths, commit_sha) from the push webhook handler
   for incremental updates.

Nothing here is implemented yet - this is the scaffold for where that logic goes.
"""

from app.config import settings


def index_repo(repo: str = None) -> None:
    repo = repo or settings.github_repo
    raise NotImplementedError("Pull repo tree, chunk with tree-sitter, embed, upsert into Chroma.")


def index_files(paths: list[str], commit_sha: str) -> None:
    raise NotImplementedError("Incremental re-index for files changed in a single push event.")
