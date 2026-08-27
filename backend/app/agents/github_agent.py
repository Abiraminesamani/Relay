from __future__ import annotations

from fastapi import HTTPException

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.integrations.github import get_repository_overview


class GitHubAgent(RelayAgent):
    name = "GitHub Agent"
    agent_type = "github"
    description = "Handles GitHub repository metadata, branch, commit, and pull request questions."

    def can_handle(self, request: AgentRequest) -> bool:
        text = request.query_text.casefold()
        # Defer code review and diff inspection queries to PRReviewAgent
        if any(action in text for action in ("review", "diff", "suggest fixes", "audit", "inspect")) and any(
            target in text for target in ("pr", "pull request", "diff", "patch")
        ):
            return False
        return any(
            keyword in text
            for keyword in (
                "github",
                "branch",
                "branches",
                "commit",
                "commits",
                "pull request",
                "pull requests",
                "repository metadata",
                "overview",
            )
        )

    def handle(self, request: AgentRequest) -> AgentResult:
        try:
            overview = get_repository_overview(repo_target=request.repository_url)
        except HTTPException as exc:
            return AgentResult(agent_name=self.name, response_text=str(exc.detail))
        except Exception as exc:
            return AgentResult(agent_name=self.name, response_text=f"GitHub Agent encountered an error: {exc}")

        response_lines = [
            f"Repository: {overview.repository.full_name}",
            f"Default branch: {overview.repository.default_branch}",
        ]
        if overview.repository.description:
            response_lines.append(f"Description: {overview.repository.description}")
        if overview.branches:
            response_lines.append("Branches: " + ", ".join(overview.branches[:5]))
        if overview.recent_commits:
            response_lines.append(
                "Recent commits: "
                + "; ".join(f"{commit.sha[:7]} {commit.message}" for commit in overview.recent_commits[:3])
            )
        if overview.pull_requests:
            response_lines.append(
                "Pull requests: "
                + "; ".join(f"#{pull.number} {pull.title} ({pull.state})" for pull in overview.pull_requests[:3])
            )
        return AgentResult(agent_name=self.name, response_text="\n".join(response_lines))
