from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx
from langchain_openai import ChatOpenAI

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"

PR_NUMBER_PATTERN = re.compile(
    r"\b(?:pr|pull\s*request|review)\s*#?(\d+)\b",
    re.IGNORECASE,
)

SECURITY_PATTERNS = (
    re.compile(r"(?im)\b([A-Z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)"),
    re.compile(r"(?im)\b(authorization)\s*[:=]\s*(bearer\s+[^\s,;]+)"),
    re.compile(r"(?i)\b(sk-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)\b"),
)


class GitHubAuthError(RuntimeError):
    """Raised when the GitHub token is missing or invalid."""


class GitHubRepositoryNotFoundError(RuntimeError):
    """Raised when the configured GitHub repository cannot be found."""


class PullRequestNotFoundError(RuntimeError):
    """Raised when no pull request is found."""


class OpenAIServiceError(RuntimeError):
    """Raised when the OpenAI call fails."""


@dataclass(slots=True)
class PRFileChange:
    filename: str
    status: str
    additions: int
    deletions: int
    patch: str | None


@dataclass(slots=True)
class PRReviewDetails:
    pr_number: int
    title: str
    state: str
    html_url: str
    author: str
    base_branch: str
    head_branch: str
    changed_files_count: int
    total_additions: int
    total_deletions: int
    files: list[PRFileChange]
    risk_level: str
    risk_reasons: list[str]


class PRReviewAgent(RelayAgent):
    name = "PR Review Agent"
    agent_type = "pr_review"
    description = "Inspects pull requests, analyzes code diffs, detects breaking changes and security risks, and generates automated code reviews."

    def can_handle(self, request: AgentRequest) -> bool:
        text = request.query_text.casefold()
        keywords = (
            "pr review",
            "review pr",
            "pull request review",
            "review pull request",
            "diff review",
            "code review",
            "review diff",
            "inspect pr",
            "check pr",
            "audit pr",
        )
        if any(keyword in text for keyword in keywords):
            return True
        return PR_NUMBER_PATTERN.search(request.query_text) is not None and "review" in text

    def handle(self, request: AgentRequest) -> AgentResult:
        response_text = review_pull_request(request.query_text)
        return AgentResult(agent_name=self.name, response_text=response_text)


def review_pull_request(question: str) -> str:
    """Analyze target pull request diff and generate a structured review."""
    owner = ""
    repo = ""
    pr_number: int | None = None

    try:
        _validate_required_settings()
        owner, repo = _parse_repo_name()

        with _github_client() as client:
            pr_number = extract_pr_number(question)
            pr_data = _fetch_target_pr(client, owner, repo, pr_number)
            files = _fetch_pr_files(client, owner, repo, int(pr_data["number"]))
            details = _build_pr_review_details(pr_data, files)

        return _render_review_report(question, details)
    except PullRequestNotFoundError:
        return _build_pr_not_found_message(owner, repo, pr_number)
    except GitHubRepositoryNotFoundError:
        return "Repository not found. Check GITHUB_REPO and confirm the repository exists."
    except GitHubAuthError:
        return "GitHub authentication failed. Check GITHUB_TOKEN and confirm it can read pull requests."
    except OpenAIServiceError:
        return "OpenAI API failed while analyzing the PR diff. Please try again in a moment."
    except Exception:
        logger.exception("Unexpected error while reviewing pull request.")
        return (
            "I encountered an unexpected error while analyzing the pull request diff. "
            "Please check the backend logs and try again."
        )


def extract_pr_number(question: str) -> int | None:
    match = PR_NUMBER_PATTERN.search(question)
    if match:
        return int(match.group(1))
    standalone_match = re.search(r"#(\d+)\b", question)
    if standalone_match:
        return int(standalone_match.group(1))
    return None


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
            "User-Agent": "Relay-PR-Reviewer",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        follow_redirects=True,
        timeout=30.0,
    )


def _fetch_target_pr(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int | None,
) -> dict[str, Any]:
    if pr_number is not None:
        response = client.get(f"/repos/{owner}/{repo}/pulls/{pr_number}")
        if response.status_code == 404:
            raise PullRequestNotFoundError(f"Pull request #{pr_number} does not exist.")
        _raise_for_github_error(response)
        return response.json()

    # Query latest open PRs
    response = client.get(f"/repos/{owner}/{repo}/pulls?state=open&per_page=5")
    _raise_for_github_error(response)
    open_prs = response.json()
    if open_prs and len(open_prs) > 0:
        return open_prs[0]

    # Fallback to any recent PR
    fallback_resp = client.get(f"/repos/{owner}/{repo}/pulls?state=all&per_page=5")
    _raise_for_github_error(fallback_resp)
    all_prs = fallback_resp.json()
    if all_prs and len(all_prs) > 0:
        return all_prs[0]

    raise PullRequestNotFoundError("No pull requests found in this repository.")


def _fetch_pr_files(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int,
) -> list[PRFileChange]:
    response = client.get(f"/repos/{owner}/{repo}/pulls/{pr_number}/files?per_page=100")
    if response.status_code == 404:
        return []
    _raise_for_github_error(response)

    files_data = response.json()
    results = []
    for item in files_data:
        results.append(
            PRFileChange(
                filename=str(item.get("filename", "")),
                status=str(item.get("status", "modified")),
                additions=int(item.get("additions", 0)),
                deletions=int(item.get("deletions", 0)),
                patch=item.get("patch"),
            )
        )
    return results


def _build_pr_review_details(
    pr: dict[str, Any],
    files: list[PRFileChange],
) -> PRReviewDetails:
    total_add = sum(f.additions for f in files)
    total_del = sum(f.deletions for f in files)

    risk_reasons: list[str] = []
    has_security_sensitive_file = False
    has_hardcoded_secrets = False
    has_test_files = False

    for f in files:
        fname = f.filename.casefold()
        if any(marker in fname for marker in ("security", "auth", "jwt", "password", ".env", "config")):
            has_security_sensitive_file = True

        if any(marker in fname for marker in ("test", "spec", "__tests__")):
            has_test_files = True

        if f.patch:
            for line in f.patch.splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    for pattern in SECURITY_PATTERNS:
                        if pattern.search(line):
                            has_hardcoded_secrets = True
                            risk_reasons.append(f"Potential sensitive secret found in `{f.filename}`")
                            break

    if has_hardcoded_secrets:
        risk_reasons.append("Hardcoded credentials or API keys detected in diff patch.")
    if has_security_sensitive_file:
        risk_reasons.append("Modifies core authentication, security, or configuration modules.")
    if total_add + total_del > 500:
        risk_reasons.append(f"Large diff volume ({total_add + total_del} lines changed across {len(files)} files).")
    if not has_test_files and total_add > 50:
        risk_reasons.append("Adds substantial new logic but does not include accompanying unit tests.")

    if has_hardcoded_secrets or (has_security_sensitive_file and total_add > 200):
        risk_level = "HIGH"
    elif has_security_sensitive_file or total_add + total_del > 300 or not has_test_files:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return PRReviewDetails(
        pr_number=int(pr.get("number", 0)),
        title=str(pr.get("title", "Untitled PR")),
        state=str(pr.get("state", "open")),
        html_url=str(pr.get("html_url", "")),
        author=str(pr.get("user", {}).get("login", "Unknown")),
        base_branch=str(pr.get("base", {}).get("ref", "main")),
        head_branch=str(pr.get("head", {}).get("ref", "feature")),
        changed_files_count=len(files),
        total_additions=total_add,
        total_deletions=total_del,
        files=files,
        risk_level=risk_level,
        risk_reasons=risk_reasons,
    )


def _render_review_report(question: str, details: PRReviewDetails) -> str:
    if not settings.openai_api_key.strip():
        return _build_fallback_review(details)

    file_diff_summaries = []
    for f in details.files[:8]:
        patch_snippet = (f.patch[:400] + "...") if f.patch and len(f.patch) > 400 else (f.patch or "No patch text")
        file_diff_summaries.append(f"File: {f.filename} (+{f.additions}/-{f.deletions}, {f.status})\nPatch:\n{patch_snippet}")

    diff_context = "\n\n---\n\n".join(file_diff_summaries)

    prompt = (
        "You are DevCopilot, an expert principal software architect conducting an automated pull request review.\n"
        "Analyze the provided pull request diff and metadata. Provide a structured review with:\n"
        "1. Executive Summary (1-2 sentences on what this PR accomplishes)\n"
        "2. Risk Level (LOW, MEDIUM, or HIGH) and rationale\n"
        "3. Key Changes & Architecture Impact\n"
        "4. Code Quality, Security & Edge Case Findings\n"
        "5. Merge Recommendation & Actionable Suggestions\n\n"
        f"User Query: {question}\n\n"
        f"PR #{details.pr_number}: {details.title} ({details.state})\n"
        f"Author: {details.author}\n"
        f"Branches: {details.head_branch} -> {details.base_branch}\n"
        f"Stats: {details.changed_files_count} files (+{details.total_additions}/-{details.total_deletions})\n"
        f"Heuristic Risk Score: {details.risk_level} ({', '.join(details.risk_reasons) or 'No major heuristic flags'})\n\n"
        f"Code Diff Context:\n{diff_context}\n\n"
        "Format cleanly with bullet points and bold section headers."
    )

    try:
        llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
        )
        response = llm.invoke(prompt)
    except Exception:
        logger.exception("OpenAI call failed while reviewing PR.")
        return _build_fallback_review(details)

    content = getattr(response, "content", "")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        return "".join(str(item) for item in content)
    return _build_fallback_review(details)


def _build_fallback_review(details: PRReviewDetails) -> str:
    lines = [
        f"### PR #{details.pr_number}: {details.title}",
        f"**Author**: @{details.author} | **Branch**: `{details.head_branch}` ➔ `{details.base_branch}` | **State**: {details.state.upper()}",
        f"**Changes**: {details.changed_files_count} file(s) (+{details.total_additions} / -{details.total_deletions} lines)",
        "",
        f"#### 🛡️ Risk Assessment: **{details.risk_level}**",
    ]

    if details.risk_reasons:
        for reason in details.risk_reasons:
            lines.append(f"- ⚠️ {reason}")
    else:
        lines.append("- ✓ No severe security or diff volume anomalies detected.")

    lines.append("")
    lines.append("#### 📂 Modified Files:")
    for f in details.files[:6]:
        lines.append(f"- `{f.filename}` (`{f.status}`, +{f.additions}/-{f.deletions})")
    if len(details.files) > 6:
        lines.append(f"- *... and {len(details.files) - 6} more file(s)*")

    lines.append("")
    lines.append("#### 💡 Merge Recommendations:")
    if details.risk_level == "HIGH":
        lines.append("- ⛔ **Do not merge yet**: Address potential security/credential flags and conduct thorough manual testing.")
    elif details.risk_level == "MEDIUM":
        lines.append("- ⚠️ **Review with care**: Ensure adequate automated tests are added and check edge case handling.")
    else:
        lines.append("- ✅ **Ready for review**: Change footprint is focused and looks clean.")

    if details.html_url:
        lines.append(f"\n[View Pull Request on GitHub]({details.html_url})")

    return "\n".join(lines)


def _build_pr_not_found_message(owner: str, repo: str, pr_number: int | None) -> str:
    repo_name = f"{owner}/{repo}" if owner and repo else settings.github_repo or "the configured repository"
    if pr_number is not None:
        return (
            f"I could not find Pull Request #{pr_number} in '{repo_name}'. "
            "Please check the PR number, or ask me to review the latest open pull request."
        )
    return (
        f"No pull requests were found in '{repo_name}'. "
        "Create a pull request on GitHub or specify a specific PR number to inspect."
    )


def _raise_for_github_error(response: httpx.Response) -> None:
    if response.status_code == 401 or response.status_code == 403:
        raise GitHubAuthError(response.text)
    if response.status_code == 404:
        raise GitHubRepositoryNotFoundError(response.text)
    response.raise_for_status()
