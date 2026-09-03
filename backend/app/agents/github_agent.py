from __future__ import annotations

import logging
import re
from fastapi import HTTPException

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings
from app.core.llm import get_chat_llm
from app.integrations.github import GitHubRepositoryOverview, get_repository_overview

logger = logging.getLogger(__name__)


class GitHubAgent(RelayAgent):
    name = "GitHub Agent"
    agent_type = "github"
    description = "Handles GitHub repository metadata, creator/owner info, branch, commit, and pull request questions."

    def can_handle(self, request: AgentRequest) -> bool:
        text = request.query_text.casefold()

        # Defer PR code review and diff inspection queries to PRReviewAgent
        if any(action in text for action in ("review", "diff", "suggest fixes", "audit", "inspect")) and any(
            target in text for target in ("pr", "pull request", "diff", "patch")
        ):
            return False

        # Keywords covering metadata, branches, commits, PRs, creators, and authors
        keywords = (
            "github",
            "branch",
            "branches",
            "commit",
            "commits",
            "pull request",
            "pull requests",
            "prs",
            "repository metadata",
            "overview",
            "contributor",
            "contributors",
            "author",
            "authors",
            "creator",
            "created",
            "who created",
            "who made",
            "who built",
            "who wrote",
            "who is the owner",
            "owner",
            "stats",
            "stars",
            "forks",
            "when was this",
        )
        if any(k in text for k in keywords):
            return True

        # Check if the query asks about the owner mentioned in repository URL
        target_repo = request.repository_url or settings.github_repo
        if target_repo:
            cleaned = re.sub(r"^https?://github\.com/", "", target_repo).strip("/")
            if "/" in cleaned:
                owner, _ = cleaned.split("/", 1)
                if owner.lower() in text:
                    return True

        return False

    def handle(self, request: AgentRequest) -> AgentResult:
        try:
            overview = get_repository_overview(repo_target=request.repository_url)
        except HTTPException as exc:
            return AgentResult(agent_name=self.name, response_text=str(exc.detail))
        except Exception as exc:
            return AgentResult(agent_name=self.name, response_text=f"GitHub Agent encountered an error: {exc}")

        # Synthesize a specific, tailored answer using LLM
        response_text = self._synthesize_answer(request.query_text, overview)
        return AgentResult(agent_name=self.name, response_text=response_text)

    def _synthesize_answer(self, question: str, overview: GitHubRepositoryOverview) -> str:
        commits_text = "\n".join(
            f"- `{c.sha[:7]}`: {c.message} (by **{c.author}**)" for c in overview.recent_commits
        ) or "None found."

        pulls_text = "\n".join(
            f"- **#{p.number}** [{p.state.upper()}]: {p.title} (created by {p.author})"
            for p in overview.pull_requests
        ) or "No pull requests found."

        branches_text = ", ".join(f"`{b}`" for b in overview.branches) or "`main`"

        context = (
            f"Repository: {overview.repository.full_name}\n"
            f"HTML URL: {overview.repository.html_url}\n"
            f"Creator / Owner: {overview.repository.owner or 'Unknown'}\n"
            f"Created At: {overview.repository.created_at or 'Unknown'}\n"
            f"Primary Language: {overview.repository.language or 'Not specified'}\n"
            f"Stars: {overview.repository.stars} | Forks: {overview.repository.forks}\n"
            f"Description: {overview.repository.description or 'No description provided.'}\n"
            f"Default Branch: `{overview.repository.default_branch}`\n"
            f"All Branches: {branches_text}\n\n"
            f"Recent Commits:\n{commits_text}\n\n"
            f"Recent Pull Requests:\n{pulls_text}\n"
        )

        prompt = (
            "You are Relay's GitHub Agent, an expert Git & GitHub intelligence copilot.\n"
            "Answer the user's question directly, conversationally, and accurately based on the live repository data provided below.\n"
            "Guidelines:\n"
            "- If the user asks who created or owns the repository, state the creator/owner and creation date.\n"
            "- If the user asks about branches, explain the available branches and highlight the default branch.\n"
            "- If the user asks about commits or recent changes, describe what was changed, by whom, and provide short commit SHAs.\n"
            "- If the user asks about PRs, detail the pull requests and their current states.\n"
            "- If the user asks for a general overview or summary, provide a clean, structured repository brief.\n"
            "- Format your answer with clean Markdown (bullet points, bold text, inline code for branches and SHAs).\n\n"
            f"User Question:\n{question}\n\n"
            f"Live GitHub Data:\n{context}"
        )

        try:
            llm = get_chat_llm(model="openai/gpt-4o-mini", temperature=0.1)
            response = llm.invoke(prompt)
            content = getattr(response, "content", "")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                return "".join(str(item) for item in content).strip()
        except Exception:
            logger.exception("LLM call failed in GitHubAgent. Falling back to structured overview.")

        # Fallback to structured markdown if LLM is unavailable
        return self._build_fallback_summary(overview)

    def _build_fallback_summary(self, overview: GitHubRepositoryOverview) -> str:
        response_lines = [
            f"### 🐙 Repository: `{overview.repository.full_name}`",
            f"- **Owner / Creator**: `{overview.repository.owner}`",
            f"- **Default Branch**: `{overview.repository.default_branch}`",
        ]
        if overview.repository.created_at:
            response_lines.append(f"- **Created At**: {overview.repository.created_at}")
        if overview.repository.language:
            response_lines.append(f"- **Language**: {overview.repository.language}")
        if overview.repository.description:
            response_lines.append(f"- **Description**: {overview.repository.description}")
        if overview.branches:
            response_lines.append(f"- **Branches**: {', '.join(f'`{b}`' for b in overview.branches)}")
        if overview.recent_commits:
            response_lines.append("\n**Recent Commits:**")
            for commit in overview.recent_commits[:5]:
                response_lines.append(f"- `{commit.sha[:7]}` {commit.message} *(by {commit.author})*")
        if overview.pull_requests:
            response_lines.append("\n**Pull Requests:**")
            for pull in overview.pull_requests[:5]:
                response_lines.append(f"- **#{pull.number}** {pull.title} `({pull.state})`")
        return "\n".join(response_lines)
