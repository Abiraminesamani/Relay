import unittest
from unittest.mock import MagicMock, patch
from app.agents.base import AgentRequest
from app.agents.github_agent import GitHubAgent
from app.schemas.github import (
    GitHubCommit,
    GitHubPullRequest,
    GitHubRepoMetadata,
    GitHubRepositoryOverview,
)


class TestGitHubAgent(unittest.TestCase):
    def setUp(self):
        self.agent = GitHubAgent()

    @patch("app.agents.github_agent.get_repository_overview")
    def test_github_agent_with_pull_requests(self, mock_get_overview):
        mock_get_overview.return_value = GitHubRepositoryOverview(
            repository=GitHubRepoMetadata(
                full_name="Yasvanth0508/Evidence",
                owner="Yasvanth0508",
                created_at="2026-01-10T12:00:00Z",
                language="Python",
                stars=5,
                forks=1,
                default_branch="main",
                html_url="https://github.com/Yasvanth0508/Evidence",
            ),
            branches=["main", "feature/auth"],
            recent_commits=[
                GitHubCommit(sha="abc1234567", message="Initial commit", author="Yasvanth"),
                GitHubCommit(sha="def7890123", message="Add auth middleware", author="Contributor1"),
            ],
            pull_requests=[
                GitHubPullRequest(
                    number=1,
                    title="Add JWT validation",
                    state="open",
                    html_url="https://github.com/Yasvanth0508/Evidence/pull/1",
                    author="Yasvanth0508",
                ),
                GitHubPullRequest(
                    number=2,
                    title="Fix CORS bug",
                    state="closed",
                    html_url="https://github.com/Yasvanth0508/Evidence/pull/2",
                    author="Alice",
                ),
            ],
        )

        request = AgentRequest(
            query_text="commit history",
            repository_url="https://github.com/Yasvanth0508/Evidence",
        )

        result = self.agent.handle(request)
        self.assertEqual(result.agent_name, "GitHub Agent")
        self.assertIsNotNone(result.response_text)
        self.assertNotIn("encountered an error", result.response_text)
        self.assertIn("Yasvanth0508/Evidence", result.response_text)


if __name__ == "__main__":
    unittest.main()
