import unittest

from app.agents.base import AgentRequest
from app.agents.jira_agent import JiraAgent
from app.agents.orchestrator import route_query
from app.agents.slack_agent import SlackAgent


class TestSlackAndJiraAgents(unittest.TestCase):
    def setUp(self):
        self.slack_agent = SlackAgent()
        self.jira_agent = JiraAgent()

    def test_slack_agent_can_handle(self):
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Send a Slack alert to #dev-alerts about CI failure")))
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Post PR review summary to slack")))
        self.assertTrue(self.slack_agent.can_handle(AgentRequest("Summarize recent Slack discussions on #general")))
        self.assertFalse(self.slack_agent.can_handle(AgentRequest("Explain the database schema for users table")))

    def test_slack_agent_send_alert(self):
        req = AgentRequest(
            query_text="Send a Slack alert to #security-ops about critical vulnerability in smartems",
            repository_url="https://github.com/ja1sreen/smartems",
        )
        res = self.slack_agent.handle(req)
        self.assertEqual(res.agent_name, "Slack Agent")
        self.assertIn("#security-ops", res.response_text)
        self.assertIn("Live Dispatch Successful", res.response_text)
        self.assertIn("Block Kit Preview", res.response_text)

    def test_jira_agent_can_handle(self):
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("Create a Jira bug ticket for this failed CI run")))
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("What Jira tickets are open in this sprint?")))
        self.assertTrue(self.jira_agent.can_handle(AgentRequest("Create a Jira task for index.js impact mitigation plan")))
        self.assertFalse(self.jira_agent.can_handle(AgentRequest("Review the latest open pull request diff")))

    def test_jira_agent_create_ticket(self):
        req = AgentRequest(
            query_text="Create a high priority Jira bug ticket for AST regression failure",
            repository_url="https://github.com/ja1sreen/smartems",
        )
        res = self.jira_agent.handle(req)
        self.assertEqual(res.agent_name, "Jira Agent")
        self.assertIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("Bug", res.response_text)
        self.assertIn("SMAR-", res.response_text)

    def test_orchestrator_routes_to_code_agent_for_mitigation_plan(self):
        # Verify the exact query that previously was misrouted to PRReviewAgent
        query = (
            "Generate a comprehensive blast radius impact mitigation and regression testing plan "
            "for modifying 'smartems-frontend/src/index.js' in repository 'SmartEms'."
        )
        res = route_query(query, repository_url="https://github.com/ja1sreen/smartems")
        # Should route to Code Agent and NOT PR Review Agent
        self.assertEqual(res.agent_name, "Code Agent")
        self.assertNotIn("No pull requests were found", res.response_text)


if __name__ == "__main__":
    unittest.main()
