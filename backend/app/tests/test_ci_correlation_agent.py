import unittest
from unittest.mock import MagicMock, patch

from app.agents.base import AgentRequest, AgentResult
from app.agents.ci_correlation_agent import (
    CICorrelationAgent,
    WorkflowFailureDetails,
    _build_failure_details,
    _build_fallback_summary,
    _extract_run_id,
    investigate_failure,
)
from app.agents.orchestrator import route_query


class TestCICorrelationAgent(unittest.TestCase):
    def setUp(self):
        self.agent = CICorrelationAgent()

    def test_can_handle_ci_queries(self):
        queries = [
            "Why did the build fail?",
            "What went wrong in the workflow?",
            "Show me the pipeline status",
            "Why did the deploy step fail?",
            "Inspect run #123456",
            "CI/CD error on main branch",
            "Actions failure details",
        ]
        for query in queries:
            request = AgentRequest(query_text=query)
            self.assertTrue(self.agent.can_handle(request), f"Failed to handle query: {query}")

    def test_cannot_handle_unrelated_queries(self):
        queries = [
            "List all repository branches",
            "What does this repository do?",
            "Explain user authentication in backend/app/api/routes/auth.py",
        ]
        for query in queries:
            request = AgentRequest(query_text=query)
            self.assertFalse(self.agent.can_handle(request), f"Incorrectly handled query: {query}")

    def test_extract_run_id(self):
        self.assertEqual(_extract_run_id("Why did workflow #987654 fail?"), 987654)
        self.assertEqual(_extract_run_id("Check run 123456"), 123456)
        self.assertEqual(_extract_run_id("Analyze 99887766"), 99887766)
        self.assertIsNone(_extract_run_id("Why did the latest CI run fail?"))

    def test_build_failure_details(self):
        run = {
            "id": 101,
            "name": "CI Pipeline",
            "html_url": "https://github.com/example/repo/actions/runs/101",
            "head_branch": "feature-auth",
            "head_sha": "abcdef1234567890",
        }
        jobs = [
            {
                "name": "test-job",
                "steps": [
                    {"name": "Setup Python", "conclusion": "success"},
                    {"name": "Run tests", "conclusion": "failure"},
                ],
            }
        ]
        logs_text = (
            "Setting up environment...\n"
            "FAILED tests/test_auth.py::test_login - AssertionError: expected 200 got 401\n"
            "##[error]Process completed with exit code 1.\n"
        )
        commit_meta = {"author": "Alice Developer", "message": "Refactor token validation"}

        details = _build_failure_details(run, jobs, logs_text, commit_meta)

        self.assertEqual(details.run_id, 101)
        self.assertEqual(details.workflow_name, "CI Pipeline")
        self.assertEqual(details.head_branch, "feature-auth")
        self.assertEqual(details.head_sha, "abcdef1234567890")
        self.assertEqual(details.commit_author, "Alice Developer")
        self.assertEqual(details.commit_message, "Refactor token validation")
        self.assertIn("test-job -> Run tests", details.failed_steps)
        self.assertTrue(any("tests/test_auth.py" in ref for ref in details.file_references))
        self.assertIn("AssertionError", details.error_excerpt)

    def test_build_fallback_summary(self):
        details = WorkflowFailureDetails(
            run_id=101,
            workflow_name="CI Pipeline",
            html_url="https://github.com/example/repo/actions/runs/101",
            head_branch="main",
            head_sha="123456789abcdef",
            failed_steps=["build -> Run unit tests"],
            error_excerpt="AssertionError: 1 != 2",
            file_references=["backend/app/main.py"],
            commit_author="Bob Engineer",
            commit_message="Fix main entry point",
        )
        summary = _build_fallback_summary(details)
        self.assertIn("CI Pipeline", summary)
        self.assertIn("Bob Engineer", summary)
        self.assertIn("Fix main entry point", summary)
        self.assertIn("Run unit tests", summary)
        self.assertIn("AssertionError", summary)
        self.assertIn("backend/app/main.py", summary)

    @patch("app.agents.ci_correlation_agent.settings")
    @patch("app.agents.ci_correlation_agent._github_client")
    def test_handle_with_mocked_github(self, mock_client_factory, mock_settings):
        mock_settings.github_repo = "owner/repo"
        mock_settings.github_token = "ghp_fake_token"
        mock_settings.openai_api_key = ""

        mock_client = MagicMock()
        mock_client_factory.return_value.__enter__.return_value = mock_client

        # Mock runs response
        mock_runs_resp = MagicMock()
        mock_runs_resp.status_code = 200
        mock_runs_resp.json.return_value = {
            "workflow_runs": [
                {
                    "id": 202,
                    "name": "Integration Tests",
                    "conclusion": "failure",
                    "html_url": "https://github.com/owner/repo/actions/runs/202",
                    "head_branch": "main",
                    "head_sha": "a1b2c3d4e5f6",
                }
            ]
        }

        # Mock jobs response
        mock_jobs_resp = MagicMock()
        mock_jobs_resp.status_code = 200
        mock_jobs_resp.json.return_value = {
            "jobs": [
                {
                    "name": "integration",
                    "steps": [{"name": "pytest", "conclusion": "failure"}],
                }
            ]
        }

        # Mock logs response
        mock_logs_resp = MagicMock()
        mock_logs_resp.status_code = 200
        mock_logs_resp.content = b"##[error]Test suite failed in app/main.py"
        mock_logs_resp.text = "##[error]Test suite failed in app/main.py"

        # Mock commit response
        mock_commit_resp = MagicMock()
        mock_commit_resp.status_code = 200
        mock_commit_resp.json.return_value = {
            "commit": {"author": {"name": "Charlie"}, "message": "Initial commit\nDetails"}
        }

        def get_side_effect(url):
            if "/actions/runs?per_page=10" in url:
                return mock_runs_resp
            elif "/jobs" in url:
                return mock_jobs_resp
            elif "/logs" in url:
                return mock_logs_resp
            elif "/commits/" in url:
                return mock_commit_resp
            return MagicMock(status_code=404)

        mock_client.get.side_effect = get_side_effect

        result = self.agent.handle(AgentRequest(query_text="Why did the latest CI build fail?"))
        self.assertEqual(result.agent_name, "CI/CD Agent")
        self.assertIn("Integration Tests", result.response_text)
        self.assertIn("pytest", result.response_text)
        self.assertIn("Charlie", result.response_text)

    def test_orchestrator_routing_to_ci_agent(self):
        result = route_query("Why did the workflow run fail?")
        # When unconfigured in local test env, it gracefully catches config errors and returns agent output
        self.assertEqual(result.agent_name, "CI/CD Agent")


if __name__ == "__main__":
    unittest.main()
