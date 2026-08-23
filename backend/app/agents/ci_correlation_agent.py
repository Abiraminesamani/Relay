from __future__ import annotations

import io
import logging
import re
import zipfile
from dataclasses import dataclass

import httpx
from langchain_openai import ChatOpenAI

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"
ERROR_LINE_PATTERN = re.compile(
    r"(error|exception|traceback|failed|failure|npm ERR!|##\[error\]|AssertionError)",
    re.IGNORECASE,
)
FILE_REFERENCE_PATTERN = re.compile(
    r"([A-Za-z0-9_./-]+\.(py|ts|tsx|js|jsx|json|ya?ml|sh|sql))(?::(\d+))?",
    re.IGNORECASE,
)


class GitHubAuthError(RuntimeError):
    """Raised when the GitHub token is missing or invalid."""


class GitHubRepositoryNotFoundError(RuntimeError):
    """Raised when the configured GitHub repository cannot be found."""


class WorkflowNotFoundError(RuntimeError):
    """Raised when no relevant workflow run can be found."""


class OpenAIServiceError(RuntimeError):
    """Raised when the OpenAI call fails."""


@dataclass(slots=True)
class WorkflowFailureDetails:
    run_id: int
    workflow_name: str
    html_url: str
    head_branch: str
    head_sha: str
    failed_steps: list[str]
    error_excerpt: str
    file_references: list[str]
    commit_author: str | None = None
    commit_message: str | None = None


class CICorrelationAgent(RelayAgent):
    name = "CI/CD Agent"
    agent_type = "ci"
    description = "Investigates GitHub Actions CI/CD workflow failures, correlates commits, and identifies root causes."

    def can_handle(self, request: AgentRequest) -> bool:
        text = request.query_text.casefold()
        keywords = (
            "build",
            "workflow",
            "pipeline",
            "deploy",
            "failed",
            "failure",
            "ci/cd",
            "actions",
            "test failure",
            "run #",
        )
        if any(keyword in text for keyword in keywords):
            return True
        return _extract_run_id(request.query_text) is not None

    def handle(self, request: AgentRequest) -> AgentResult:
        response_text = investigate_failure(request.query_text)
        return AgentResult(agent_name=self.name, response_text=response_text)


def investigate_failure(question: str) -> str:
    """Inspect the latest relevant GitHub Actions failure and explain it."""
    owner = ""
    repo = ""
    run_id: int | None = None

    try:
        _validate_required_settings()
        owner, repo = _parse_repo_name()

        with _github_client() as client:
            run_id = _extract_run_id(question)
            run = _fetch_target_run(client, owner, repo, run_id)
            jobs = _fetch_jobs_for_run(client, owner, repo, int(run["id"]))
            logs_text = _fetch_logs_for_run(client, owner, repo, int(run["id"]))
            commit_meta = _fetch_commit_metadata(client, owner, repo, str(run.get("head_sha", "")))
            details = _build_failure_details(run, jobs, logs_text, commit_meta)

        return _render_failure_report(question, details)
    except WorkflowNotFoundError:
        return _build_workflow_not_found_message(owner, repo, run_id)
    except GitHubRepositoryNotFoundError:
        return "Repository not found. Check GITHUB_REPO and confirm the repository exists."
    except GitHubAuthError:
        return "GitHub authentication failed. Check GITHUB_TOKEN and confirm it can access Actions data."
    except OpenAIServiceError:
        return "OpenAI API failed while analyzing the workflow failure. Please try again in a moment."
    except Exception:
        logger.exception("Unexpected error while investigating a CI failure.")
        return (
            "I hit an unexpected error while investigating the workflow failure. "
            "Please check the backend logs and try again."
        )


def _validate_required_settings() -> None:
    if not settings.github_repo.strip():
        raise GitHubRepositoryNotFoundError("Missing GITHUB_REPO configuration.")
    if not settings.github_token.strip():
        raise GitHubAuthError("Missing GITHUB_TOKEN configuration.")


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
        timeout=30.0,
    )


def _extract_run_id(question: str) -> int | None:
    match = re.search(r"\b(?:run|workflow)\s*#?(\d{4,})\b", question, re.IGNORECASE)
    if match:
        return int(match.group(1))
    standalone_match = re.search(r"\b(\d{6,})\b", question)
    if standalone_match:
        return int(standalone_match.group(1))
    return None


def _fetch_target_run(
    client: httpx.Client,
    owner: str,
    repo: str,
    run_id: int | None,
) -> dict:
    if run_id is not None:
        response = client.get(f"/repos/{owner}/{repo}/actions/runs/{run_id}")
        if response.status_code == 404:
            raise WorkflowNotFoundError("Requested workflow run does not exist.")
        _raise_for_github_error(response)
        payload = response.json()
        if payload.get("conclusion") == "failure":
            return payload
        raise WorkflowNotFoundError("Requested workflow run is not a failure.")

    response = client.get(f"/repos/{owner}/{repo}/actions/runs?per_page=10")
    _raise_for_github_error(response)
    workflow_runs = response.json().get("workflow_runs", [])
    for workflow_run in workflow_runs:
        if workflow_run.get("conclusion") == "failure":
            return workflow_run
    raise WorkflowNotFoundError("No failed workflow runs returned by GitHub.")


def _fetch_jobs_for_run(
    client: httpx.Client,
    owner: str,
    repo: str,
    run_id: int,
) -> list[dict]:
    response = client.get(f"/repos/{owner}/{repo}/actions/runs/{run_id}/jobs?per_page=100")
    if response.status_code == 404:
        raise WorkflowNotFoundError("Workflow jobs were not found.")
    _raise_for_github_error(response)
    return list(response.json().get("jobs", []))


def _fetch_logs_for_run(
    client: httpx.Client,
    owner: str,
    repo: str,
    run_id: int,
) -> str:
    response = client.get(f"/repos/{owner}/{repo}/actions/runs/{run_id}/logs")
    if response.status_code == 404:
        return ""
    _raise_for_github_error(response)

    if not response.content:
        return ""

    try:
        archive = zipfile.ZipFile(io.BytesIO(response.content))
    except zipfile.BadZipFile:
        return response.text

    log_parts: list[str] = []
    for name in archive.namelist():
        try:
            log_parts.append(archive.read(name).decode("utf-8", errors="ignore"))
        except KeyError:
            continue
    return "\n".join(log_parts)


def _fetch_commit_metadata(
    client: httpx.Client,
    owner: str,
    repo: str,
    head_sha: str,
) -> dict[str, str | None]:
    """Retrieve commit details (author, message) from DB or GitHub API."""
    if not head_sha:
        return {"author": None, "message": None}

    # Attempt local DB lookup first (e.g. from webhook data)
    try:
        from app.db.models import Commit
        from app.db.session import SessionLocal

        with SessionLocal() as db:
            commit_record = db.query(Commit).filter_by(sha=head_sha).first()
            if commit_record:
                return {
                    "author": commit_record.author,
                    "message": commit_record.message,
                }
    except Exception:
        # DB may not be connected during offline development; continue to API fallback
        pass

    # Fallback to GitHub API
    try:
        response = client.get(f"/repos/{owner}/{repo}/commits/{head_sha}")
        if response.status_code == 200:
            commit_data = response.json()
            commit_info = commit_data.get("commit", {})
            author = (
                commit_info.get("author", {}).get("name")
                or commit_data.get("author", {}).get("login")
            )
            message = commit_info.get("message", "").split("\n", 1)[0]
            return {"author": author, "message": message}
    except Exception:
        pass

    return {"author": None, "message": None}


def _build_failure_details(
    run: dict,
    jobs: list[dict],
    logs_text: str,
    commit_meta: dict[str, str | None] | None = None,
) -> WorkflowFailureDetails:
    failed_steps: list[str] = []
    for job in jobs:
        for step in job.get("steps", []):
            if step.get("conclusion") == "failure":
                failed_steps.append(f"{job.get('name', 'job')} -> {step.get('name', 'unnamed step')}")

    if not failed_steps:
        failed_jobs = [job.get("name", "job") for job in jobs if job.get("conclusion") == "failure"]
        failed_steps = failed_jobs or ["No failed job or step name was available."]

    error_lines = [
        line.strip()
        for line in logs_text.splitlines()
        if ERROR_LINE_PATTERN.search(line)
    ]
    error_excerpt = "\n".join(error_lines[:20]).strip()
    if not error_excerpt:
        error_excerpt = "No log excerpt was available from GitHub Actions."

    file_references = sorted(
        {
            match.group(0)
            for match in FILE_REFERENCE_PATTERN.finditer(logs_text)
        }
    )[:10]

    author = commit_meta.get("author") if commit_meta else None
    message = commit_meta.get("message") if commit_meta else None

    return WorkflowFailureDetails(
        run_id=int(run["id"]),
        workflow_name=str(run.get("name", "Unknown workflow")),
        html_url=str(run.get("html_url", "")),
        head_branch=str(run.get("head_branch", "")),
        head_sha=str(run.get("head_sha", "")),
        failed_steps=failed_steps,
        error_excerpt=error_excerpt,
        file_references=file_references,
        commit_author=author,
        commit_message=message,
    )


def _render_failure_report(question: str, details: WorkflowFailureDetails) -> str:
    if not settings.openai_api_key.strip():
        return _build_fallback_summary(details)

    commit_context = ""
    if details.commit_author or details.commit_message:
        commit_context = (
            f"Commit Author: {details.commit_author or 'Unknown'}\n"
            f"Commit Message: {details.commit_message or 'Unknown'}\n"
        )

    prompt = (
        "You are DevCopilot, a senior engineer diagnosing GitHub Actions failures.\n"
        "Summarize the failure, explain the most likely root cause, correlate the commit, and suggest concrete fixes.\n"
        "Be specific and only use the provided workflow information.\n\n"
        f"User question:\n{question}\n\n"
        f"Workflow name: {details.workflow_name}\n"
        f"Run ID: {details.run_id}\n"
        f"Branch: {details.head_branch}\n"
        f"Commit SHA: {details.head_sha}\n"
        f"{commit_context}"
        f"Failed steps: {', '.join(details.failed_steps)}\n"
        f"File references: {', '.join(details.file_references) or 'None'}\n"
        f"Error excerpt:\n{details.error_excerpt}\n\n"
        "Structure the answer in short paragraphs covering summary, root cause, commit correlation, and suggested fixes."
    )

    try:
        llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
        )
        response = llm.invoke(prompt)
    except Exception as exc:
        logger.exception("OpenAI call failed while analyzing workflow failure.")
        raise OpenAIServiceError(str(exc)) from exc

    content = getattr(response, "content", "")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        return "".join(str(item) for item in content)
    return _build_fallback_summary(details)


def _build_fallback_summary(details: WorkflowFailureDetails) -> str:
    lines = [
        f"Workflow '{details.workflow_name}' failed on branch '{details.head_branch}' for commit {details.head_sha[:7]}.",
    ]
    if details.commit_author or details.commit_message:
        lines.append(
            f"Commit details: {details.commit_message or 'N/A'} (by {details.commit_author or 'Unknown'})."
        )
    lines.append(
        f"Failing step: {', '.join(details.failed_steps)}."
    )
    lines.append(f"Error log excerpt:\n{details.error_excerpt}")
    if details.file_references:
        lines.append("Referenced files: " + ", ".join(details.file_references))
    if details.html_url:
        lines.append(f"Workflow URL: {details.html_url}")
    return "\n\n".join(lines)


def _build_workflow_not_found_message(owner: str, repo: str, run_id: int | None) -> str:
    repo_name = f"{owner}/{repo}" if owner and repo else settings.github_repo or "the configured repository"
    if run_id is not None:
        return (
            f"I checked GitHub Actions run {run_id} for '{repo_name}', but I could not find a failed run "
            "with that id. Make sure the run id is correct, or ask me about the latest failed workflow instead."
        )
    return (
        f"I checked the latest 10 GitHub Actions runs for '{repo_name}', and none of them were marked as failed. "
        "If the failure is older, ask with a specific run id so I can inspect that exact workflow."
    )


def _raise_for_github_error(response: httpx.Response) -> None:
    if response.status_code == 401 or response.status_code == 403:
        raise GitHubAuthError(response.text)
    if response.status_code == 404:
        raise GitHubRepositoryNotFoundError(response.text)
    response.raise_for_status()
