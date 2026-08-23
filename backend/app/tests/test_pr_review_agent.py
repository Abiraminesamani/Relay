import unittest
from unittest.mock import MagicMock, patch

from app.agents.base import AgentRequest
from app.agents.orchestrator import route_query
from app.agents.pr_review_agent import (
    PRFileChange,
    PRReviewAgent,
    _build_fallback_review,
    _build_pr_review_details,
    extract_pr_number,
)


class TestPRReviewAgent(unittest.TestCase):
    def setUp(self):
        self.agent = PRReviewAgent()

    def test_extract_pr_number(self):
        self.assertEqual(extract_pr_number("Review PR #5 please"), 5)
        self.assertEqual(extract_pr_number("Can you review pull request 14?"), 14)
        self.assertEqual(extract_pr_number("Check code diff in #22"), 22)
        self.assertIsNone(extract_pr_number("Review the latest open pull request"))

    def test_can_handle(self):
        valid_queries = [
            "Please review PR #3",
            "Can you conduct a pull request review on the latest PR?",
            "Review diff changes in pull request 7",
            "Perform a code review on #12",
            "Inspect PR diff",
        ]
        for query in valid_queries:
            request = AgentRequest(query_text=query)
            self.assertTrue(self.agent.can_handle(request), f"Failed for query: {query}")

        unrelated_queries = [
            "Why did the build pipeline fail?",
            "What branches are in this repository?",
            "Explain user authentication in backend/app/main.py",
        ]
        for query in unrelated_queries:
            request = AgentRequest(query_text=query)
            self.assertFalse(self.agent.can_handle(request), f"Incorrectly matched query: {query}")

    def test_build_pr_review_details_and_risk(self):
        pr = {
            "number": 12,
            "title": "Add JWT Auth Filter and Token Utility",
            "state": "open",
            "html_url": "https://github.com/owner/repo/pull/12",
            "user": {"login": "johndoe"},
            "base": {"ref": "main"},
            "head": {"ref": "feature-jwt"},
        }
        files = [
            PRFileChange(
                filename="src/main/java/com/example/security/JwtFilter.java",
                status="added",
                additions=120,
                deletions=0,
                patch="+ public class JwtFilter extends OncePerRequestFilter {\n+ String token = getBearerToken();\n+ }",
            ),
            PRFileChange(
                filename="src/main/resources/application.properties",
                status="modified",
                additions=10,
                deletions=2,
                patch="+ jwt.secret.key=sk-secret-token-key-12345",
            ),
        ]

        details = _build_pr_review_details(pr, files)
        self.assertEqual(details.pr_number, 12)
        self.assertEqual(details.title, "Add JWT Auth Filter and Token Utility")
        self.assertEqual(details.changed_files_count, 2)
        self.assertEqual(details.total_additions, 130)
        self.assertEqual(details.risk_level, "HIGH")  # Due to hardcoded secret detection
        self.assertTrue(any("secret" in r.lower() for r in details.risk_reasons))

    def test_fallback_review_formatting(self):
        pr = {
            "number": 7,
            "title": "Refactor Transaction Calculation Logic",
            "state": "open",
            "html_url": "https://github.com/owner/repo/pull/7",
            "user": {"login": "alice"},
            "base": {"ref": "main"},
            "head": {"ref": "calc-refactor"},
        }
        files = [
            PRFileChange(
                filename="src/main/java/com/example/service/TransactionService.java",
                status="modified",
                additions=30,
                deletions=15,
                patch="+ double total = calculateMonthlyBudget(userId);",
            ),
            PRFileChange(
                filename="src/test/java/com/example/service/TransactionServiceTest.java",
                status="modified",
                additions=25,
                deletions=5,
                patch="+ @Test public void testCalculate() { assertEquals(100, service.calc()); }",
            ),
        ]

        details = _build_pr_review_details(pr, files)
        review_text = _build_fallback_review(details)

        self.assertIn("PR #7: Refactor Transaction Calculation Logic", review_text)
        self.assertIn("@alice", review_text)
        self.assertIn("Risk Assessment", review_text)
        self.assertIn("TransactionService.java", review_text)
        self.assertIn("Merge Recommendations", review_text)

    @patch("app.agents.pr_review_agent.settings")
    @patch("app.agents.pr_review_agent._github_client")
    def test_handle_with_mocked_github(self, mock_client_factory, mock_settings):
        mock_settings.github_repo = "owner/repo"
        mock_settings.github_token = "ghp_fake"
        mock_settings.openai_api_key = ""

        mock_client = MagicMock()
        mock_client_factory.return_value.__enter__.return_value = mock_client

        mock_pr_resp = MagicMock()
        mock_pr_resp.status_code = 200
        mock_pr_resp.json.return_value = {
            "number": 3,
            "title": "Fix Currency Conversion Rate Cache",
            "state": "open",
            "html_url": "https://github.com/owner/repo/pull/3",
            "user": {"login": "bob"},
            "base": {"ref": "main"},
            "head": {"ref": "fix-cache"},
        }

        mock_files_resp = MagicMock()
        mock_files_resp.status_code = 200
        mock_files_resp.json.return_value = [
            {
                "filename": "src/utils/currency.py",
                "status": "modified",
                "additions": 12,
                "deletions": 4,
                "patch": "+ cache.set(currency_key, rate, ttl=3600)",
            }
        ]

        def get_side_effect(url):
            if "/pulls/3/files" in url:
                return mock_files_resp
            elif "/pulls/3" in url:
                return mock_pr_resp
            elif "/pulls" in url:
                mock_list = MagicMock()
                mock_list.status_code = 200
                mock_list.json.return_value = [mock_pr_resp.json.return_value]
                return mock_list
            return MagicMock(status_code=404)

        mock_client.get.side_effect = get_side_effect

        result = self.agent.handle(AgentRequest(query_text="Conduct a code review on PR #3"))
        self.assertEqual(result.agent_name, "PR Review Agent")
        self.assertIn("Fix Currency Conversion Rate Cache", result.response_text)
        self.assertIn("currency.py", result.response_text)

    def test_orchestrator_routes_to_pr_review_agent(self):
        result = route_query("Review PR #3 and check the code diff")
        self.assertEqual(result.agent_name, "PR Review Agent")


if __name__ == "__main__":
    unittest.main()
