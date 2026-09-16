import unittest
from unittest.mock import MagicMock, patch

from app.agents.base import AgentRequest
from app.agents.jira_agent import JiraAgent
from app.agents.orchestrator import route_query
from app.agents.slack_agent import SlackAgent
from app.config import settings
from app.services import jira_service
from app.services.jira_service import (
    JiraAuthError,
    JiraConfigError,
    JiraNetworkError,
    JiraNotFoundError,
    JiraPermissionError,
    JiraValidationError,
    create_jira_issue,
    search_jira_issues,
    verify_jira_connectivity,
)


class TestSlackAndJiraAgents(unittest.TestCase):
    def setUp(self):
        self.slack_agent = SlackAgent()
        self.jira_agent = JiraAgent()

    # --- SLACK AGENT TESTS (PRESERVED) ---
    def test_slack_agent_can_handle(self):
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Send a Slack alert to #dev-alerts about CI failure")))
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Post PR review summary to slack")))
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Summarize recent Slack discussions on #general")))
        self.assertFalse(self.slack_agent.can_handle(AgentRequest("Explain the database schema for users table")))

    @patch("app.services.webhook_service.send_slack_notification")
    def test_slack_agent_send_alert(self, mock_send):
        mock_send.return_value = (True, 200, "ok")
        with patch.object(settings, "slack_webhook_url", "https://hooks.slack.com/services/test/alerts"):
            req = AgentRequest(
                query_text="Send a Slack alert to #security-ops about critical vulnerability in smartems",
                repository_url="https://github.com/ja1sreen/smartems",
            )
            res = self.slack_agent.handle(req)
            self.assertEqual(res.agent_name, "Slack Agent")
            self.assertIn("#security-ops", res.response_text)
            self.assertIn("Live Dispatch Successful", res.response_text)
            self.assertIn("Block Kit Preview", res.response_text)

    # --- JIRA AGENT INTENT DETECTION TESTS ---
    def test_jira_agent_can_handle(self):
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("Create a Jira bug ticket for this failed CI run")))
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("What Jira tickets are open in this sprint?")))
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("Create a Jira task for index.js impact mitigation plan")))
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("Create a Jira story for login authentication flow")))
        self.assertFalse(self.jira_agent.can_handle(AgentRequest("Review the latest open pull request diff")))

    # --- JIRA AGENT SUCCESSFUL ISSUE CREATION TESTS ---
    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_create_bug_success(self, mock_create):
        mock_create.return_value = {
            "success": True,
            "key": "SMAR-342",
            "id": "10042",
            "url": "https://test-company.atlassian.net/browse/SMAR-342",
            "project_key": "SMAR",
            "issue_type": "Bug",
            "priority": "High",
            "summary": "critical regression in login authentication flow in AuthController.java",
        }

        with patch.object(settings, "jira_default_project_key", "SMAR"):
            req = AgentRequest(
                query_text="Create a High Priority Jira Bug ticket for critical regression in login authentication flow in AuthController.java",
                repository_url="https://github.com/ja1sreen/smartems",
            )
            res = self.jira_agent.handle(req)

            self.assertEqual(res.agent_name, "Jira Agent")
            self.assertIn("Jira Issue Created Successfully", res.response_text)
            self.assertIn("SMAR-342", res.response_text)
            self.assertIn("https://test-company.atlassian.net/browse/SMAR-342", res.response_text)
            self.assertIn("Bug", res.response_text)
            self.assertIn("High", res.response_text)

            # Verify call arguments passed to real service
            mock_create.assert_called_once()
            kwargs = mock_create.call_args[1]
            self.assertEqual(kwargs["project_key"], "SMAR")
            self.assertEqual(kwargs["issue_type"], "Bug")
            self.assertEqual(kwargs["priority"], "High")

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_create_task_success(self, mock_create):
        mock_create.return_value = {
            "success": True,
            "key": "SMAR-501",
            "id": "10051",
            "url": "https://test-company.atlassian.net/browse/SMAR-501",
            "project_key": "SMAR",
            "issue_type": "Task",
            "priority": "Medium",
            "summary": "implement blast radius impact mitigation plan for index.js",
        }

        req = AgentRequest(
            query_text="Create a Jira task for implementing blast radius impact mitigation plan for index.js",
            repository_url="https://github.com/ja1sreen/smartems",
        )
        res = self.jira_agent.handle(req)

        self.assertIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("SMAR-501", res.response_text)
        self.assertEqual(mock_create.call_args[1]["issue_type"], "Task")

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_create_story_success(self, mock_create):
        mock_create.return_value = {
            "success": True,
            "key": "SMAR-602",
            "id": "10062",
            "url": "https://test-company.atlassian.net/browse/SMAR-602",
            "project_key": "SMAR",
            "issue_type": "Story",
            "priority": "Highest",
            "summary": "two-factor authentication support for enterprise users",
        }

        req = AgentRequest(
            query_text="Create a Highest Priority Jira user story for two-factor authentication support for enterprise users",
            repository_url="https://github.com/ja1sreen/smartems",
        )
        res = self.jira_agent.handle(req)

        self.assertIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("SMAR-602", res.response_text)
        self.assertEqual(mock_create.call_args[1]["issue_type"], "Story")
        self.assertEqual(mock_create.call_args[1]["priority"], "Highest")

    # --- JIRA AGENT ERROR HANDLING TESTS ---
    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_missing_credentials(self, mock_create):
        mock_create.side_effect = JiraConfigError("Jira integration is not configured.")

        req = AgentRequest(query_text="Create a Jira bug ticket for login failure")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Integration Not Configured", res.response_text)
        self.assertIn("JIRA_BASE_URL", res.response_text)
        self.assertIn("JIRA_API_TOKEN", res.response_text)

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_401_auth_failure(self, mock_create):
        mock_create.side_effect = JiraAuthError("Jira authentication failed.")

        req = AgentRequest(query_text="Create a Jira bug ticket for login failure")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Authentication Failed (HTTP 401)", res.response_text)
        self.assertIn("JIRA_EMAIL", res.response_text)

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_403_permission_failure(self, mock_create):
        mock_create.side_effect = JiraPermissionError("Jira account does not have permission to create issues in project 'SMAR'.")

        req = AgentRequest(query_text="Create a Jira bug ticket in project SMAR")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Permission Denied (HTTP 403)", res.response_text)

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_404_not_found(self, mock_create):
        mock_create.side_effect = JiraNotFoundError("Jira project 'INVALID' was not found.")

        req = AgentRequest(query_text="Create a Jira bug ticket in project INVALID")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Project Not Found (HTTP 404)", res.response_text)

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_400_validation_error(self, mock_create):
        mock_create.side_effect = JiraValidationError("Jira rejected the issue payload: summary is required")

        req = AgentRequest(query_text="Create Jira ticket")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Payload Rejected (HTTP 400)", res.response_text)

    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_agent_network_timeout_error(self, mock_create):
        mock_create.side_effect = JiraNetworkError("Unable to connect to Jira Cloud instance at 'https://example.atlassian.net'.")

        req = AgentRequest(query_text="Create a Jira bug ticket for timeout")
        res = self.jira_agent.handle(req)

        self.assertNotIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Jira Connection Error", res.response_text)

    # --- JIRA SEARCH / SPRINT LISTING TESTS ---
    @patch("app.services.jira_service.search_jira_issues")
    def test_jira_agent_search_sprint_issues(self, mock_search):
        mock_search.return_value = {
            "success": True,
            "total": 2,
            "issues": [
                {
                    "key": "SMAR-101",
                    "summary": "Fix login regression",
                    "status": "In Progress",
                    "type": "Bug",
                    "priority": "High",
                    "assignee": "Alex",
                    "url": "https://test.atlassian.net/browse/SMAR-101",
                },
                {
                    "key": "SMAR-102",
                    "summary": "Add 2FA authentication",
                    "status": "To Do",
                    "type": "Story",
                    "priority": "Medium",
                    "assignee": "Sarah",
                    "url": "https://test.atlassian.net/browse/SMAR-102",
                },
            ],
            "project_key": "SMAR",
        }

        req = AgentRequest(query_text="What Jira tickets are open in this sprint for project SMAR?")
        res = self.jira_agent.handle(req)

        self.assertIn("Active Jira Issues (SMAR)", res.response_text)
        self.assertIn("SMAR-101", res.response_text)
        self.assertIn("SMAR-102", res.response_text)
        self.assertIn("Fix login regression", res.response_text)

    # --- SECURITY TEST: SECRETS ARE NEVER RETURNED ---
    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_secrets_never_exposed(self, mock_create):
        mock_token = "secret_atlassian_api_token_xyz123"
        mock_create.side_effect = Exception(f"Internal connection exception with token {mock_token}")

        with patch.object(settings, "jira_api_token", mock_token):
            req = AgentRequest(query_text="Create a Jira bug ticket")
            res = self.jira_agent.handle(req)
            self.assertNotIn(mock_token, res.response_text)

    # --- JIRA SERVICE REST CLIENT TESTS ---
    @patch("httpx.Client.post")
    def test_jira_service_create_issue_http(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {
            "id": "10099",
            "key": "SMAR-999",
            "self": "https://example.atlassian.net/rest/api/3/issue/10099",
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        with patch.object(settings, "jira_base_url", "https://example.atlassian.net"), \
             patch.object(settings, "jira_email", "dev@example.com"), \
             patch.object(settings, "jira_api_token", "api_token_123"):
            
            result = create_jira_issue(
                project_key="SMAR",
                summary="Auth controller regression",
                description="Test bug description",
                issue_type="Bug",
                priority="High",
            )

            self.assertTrue(result["success"])
            self.assertEqual(result["key"], "SMAR-999")
            self.assertEqual(result["url"], "https://example.atlassian.net/browse/SMAR-999")

            mock_post.assert_called_once()
            called_url = mock_post.call_args[0][0]
            called_json = mock_post.call_args[1]["json"]
            self.assertEqual(called_url, "https://example.atlassian.net/rest/api/3/issue")
            self.assertEqual(called_json["fields"]["project"]["key"], "SMAR")
            self.assertEqual(called_json["fields"]["issuetype"]["name"], "Bug")
            self.assertEqual(called_json["fields"]["priority"]["name"], "High")

    @patch("httpx.Client.get")
    def test_jira_service_verify_connectivity_http(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "10000",
            "key": "SMAR",
            "name": "SmartEMS Project",
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        with patch.object(settings, "jira_base_url", "https://example.atlassian.net"), \
             patch.object(settings, "jira_email", "dev@example.com"), \
             patch.object(settings, "jira_api_token", "api_token_123"):

            result = verify_jira_connectivity("SMAR")
            self.assertTrue(result["success"])
            self.assertEqual(result["project_key"], "SMAR")
            self.assertEqual(result["project_name"], "SmartEMS Project")

    # --- CODE AGENT ROUTING TEST (PRESERVED) ---
    def test_orchestrator_routes_to_code_agent_for_mitigation_plan(self):
        query = (
            "Generate a comprehensive blast radius impact mitigation and regression testing plan "
            "for modifying 'smartems-frontend/src/index.js' in repository 'SmartEms'."
        )
        res = route_query(query, repository_url="https://github.com/ja1sreen/smartems")
        self.assertEqual(res.agent_name, "Code Agent")
        self.assertNotIn("No pull requests were found", res.response_text)


if __name__ == "__main__":
    unittest.main()
