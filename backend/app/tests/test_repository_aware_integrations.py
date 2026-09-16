import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agents.base import AgentRequest
from app.agents.jira_agent import JiraAgent, get_repository_jira_project_key
from app.agents.slack_agent import SlackAgent, get_repository_slack_webhook
from app.config import settings
from app.db.models import Base, Repository, User, WebhookSubscription
from app.schemas.repository import RepositoryCreate, RepositoryRead, RepositoryUpdate, mask_webhook_url
from app.services.repository_service import create_repository, update_repository


class TestRepositoryAwareIntegrations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Seed test user
        self.user = User(
            name="Test Engineer",
            email="engineer@relay.dev",
            password_hash="hashed_pw_123",
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        # Seed test repositories with different mappings
        self.repo_smartems = Repository(
            name="smartems",
            repo_url="https://github.com/ja1sreen/smartems",
            jira_project_key="SCRUM",
            slack_webhook_url="https://hooks.slack.com/services/T11/B11/smartems-alerts",
            user_id=self.user.id,
        )
        self.repo_frontend = Repository(
            name="frontend",
            repo_url="https://github.com/relay/frontend",
            jira_project_key="FRONT",
            slack_webhook_url="https://hooks.slack.com/services/T22/B22/frontend-alerts",
            user_id=self.user.id,
        )
        self.repo_unmapped = Repository(
            name="unmapped-repo",
            repo_url="https://github.com/relay/unmapped",
            jira_project_key=None,
            slack_webhook_url=None,
            user_id=self.user.id,
        )
        self.db.add_all([self.repo_smartems, self.repo_frontend, self.repo_unmapped])
        self.db.commit()

        self.jira_agent = JiraAgent()
        self.slack_agent = SlackAgent()

    def tearDown(self):
        self.db.query(WebhookSubscription).delete()
        self.db.query(Repository).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    # 1. Repository with Jira mapping -> mapped Jira project is selected
    @patch("app.db.session.SessionLocal")
    @patch("app.services.jira_service.create_jira_issue")
    def test_repo_with_jira_mapping_routes_to_custom_project(self, mock_create, mock_session):
        mock_session.return_value = self.db
        mock_create.return_value = {
            "success": True,
            "key": "FRONT-10",
            "id": "10010",
            "url": "https://company.atlassian.net/browse/FRONT-10",
            "project_key": "FRONT",
            "issue_type": "Task",
            "priority": "High",
            "summary": "Fix button alignment in header",
        }

        req = AgentRequest(
            query_text="Create a high priority Jira bug for fix button alignment in header",
            repository_url="https://github.com/relay/frontend",
        )
        res = self.jira_agent.handle(req)

        self.assertIn("Jira Issue Created Successfully", res.response_text)
        self.assertIn("FRONT-10", res.response_text)
        self.assertIn("FRONT", res.response_text)
        self.assertEqual(mock_create.call_args[1]["project_key"], "FRONT")

    # 2. Repository without Jira mapping -> JIRA_DEFAULT_PROJECT_KEY is selected
    @patch("app.db.session.SessionLocal")
    @patch("app.services.jira_service.create_jira_issue")
    def test_repo_without_jira_mapping_falls_back_to_default_project(self, mock_create, mock_session):
        mock_session.return_value = self.db
        mock_create.return_value = {
            "success": True,
            "key": "SCRUM-42",
            "id": "10042",
            "url": "https://company.atlassian.net/browse/SCRUM-42",
            "project_key": "SCRUM",
            "issue_type": "Task",
            "priority": "Medium",
            "summary": "Implement caching layer",
        }

        with patch.object(settings, "jira_default_project_key", "SCRUM"):
            req = AgentRequest(
                query_text="Create a Jira task for implement caching layer",
                repository_url="https://github.com/relay/unmapped",
            )
            res = self.jira_agent.handle(req)

            self.assertIn("Jira Issue Created Successfully", res.response_text)
            self.assertIn("SCRUM-42", res.response_text)
            self.assertEqual(mock_create.call_args[1]["project_key"], "SCRUM")

    # 3. Repository with Slack webhook -> repository Slack webhook is selected
    @patch("app.db.session.SessionLocal")
    @patch("app.services.webhook_service.send_slack_notification")
    def test_repo_with_slack_webhook_dispatches_to_repo_webhook(self, mock_slack_send, mock_session):
        mock_session.return_value = self.db
        mock_slack_send.return_value = (True, 200, "ok")

        req = AgentRequest(
            query_text="Send a Slack alert to #dev-alerts about CI build failure",
            repository_url="https://github.com/relay/frontend",
        )
        res = self.slack_agent.handle(req)

        self.assertIn("Slack Notification Broadcast", res.response_text)
        self.assertIn("Live Dispatch Successful", res.response_text)
        mock_slack_send.assert_called_once()
        self.assertEqual(
            mock_slack_send.call_args[1]["webhook_url"],
            "https://hooks.slack.com/services/T22/B22/frontend-alerts",
        )

    # 4. Repository without Slack webhook -> global default / subscription is selected
    @patch("app.db.session.SessionLocal")
    @patch("app.services.webhook_service.send_slack_notification")
    def test_repo_without_slack_webhook_falls_back_to_global_webhook(self, mock_slack_send, mock_session):
        mock_session.return_value = self.db
        mock_slack_send.return_value = (True, 200, "ok")

        with patch.object(settings, "slack_webhook_url", "https://hooks.slack.com/services/T99/B99/global-fallback"):
            req = AgentRequest(
                query_text="Send a Slack alert to #dev-alerts about database migration",
                repository_url="https://github.com/relay/unmapped",
            )
            res = self.slack_agent.handle(req)

            self.assertIn("Live Dispatch Successful", res.response_text)
            mock_slack_send.assert_called_once()
            self.assertEqual(
                mock_slack_send.call_args[1]["webhook_url"],
                "https://hooks.slack.com/services/T99/B99/global-fallback",
            )

    # 5. Jira issue creation still calls real JiraService
    @patch("app.db.session.SessionLocal")
    @patch("app.services.jira_service.create_jira_issue")
    def test_jira_issue_calls_real_service_with_extracted_priority(self, mock_create, mock_session):
        mock_session.return_value = self.db
        mock_create.return_value = {
            "success": True,
            "key": "SCRUM-99",
            "id": "10099",
            "url": "https://company.atlassian.net/browse/SCRUM-99",
            "project_key": "SCRUM",
            "issue_type": "Task",
            "priority": "Highest",
            "summary": "Blocker regression in authentication",
        }

        req = AgentRequest(
            query_text="Create a Highest Priority Jira Bug ticket for blocker regression in authentication in project SCRUM",
            repository_url="https://github.com/ja1sreen/smartems",
        )
        res = self.jira_agent.handle(req)

        self.assertIn("SCRUM-99", res.response_text)
        mock_create.assert_called_once()
        self.assertEqual(mock_create.call_args[1]["priority"], "Highest")

    # 6. Random/fake Jira issue keys do not exist in real output
    def test_no_fake_random_issue_generation(self):
        import inspect
        from app.agents import jira_agent

        source = inspect.getsource(jira_agent)
        self.assertNotIn("randint", source)
        self.assertNotIn("random.", source)

    # 7. Jira credentials are never returned by repository schemas or models
    def test_jira_credentials_never_in_repository_read(self):
        repo_read = RepositoryRead.model_validate(self.repo_smartems)
        serialized = repo_read.model_dump()
        self.assertNotIn("jira_api_token", serialized)
        self.assertNotIn("jira_email", serialized)
        self.assertNotIn("password", serialized)

    # 8. Slack webhook secret is not exposed in RepositoryRead GET model
    def test_slack_webhook_masked_in_repository_read(self):
        repo_read = RepositoryRead.model_validate(self.repo_smartems)
        serialized = repo_read.model_dump()
        self.assertTrue(serialized["has_slack_webhook"])
        self.assertIn("slack_webhook_masked", serialized)
        self.assertNotIn("smartems-alerts", serialized["slack_webhook_masked"])
        self.assertNotIn("slack_webhook_url", serialized)

    # 9. Repository service CRUD supports jira_project_key and slack_webhook_url
    def test_repository_service_crud_with_integrations(self):
        create_payload = RepositoryCreate(
            name="backend-api",
            repo_url="https://github.com/relay/backend-api",
            jira_project_key="BACK",
            slack_webhook_url="https://hooks.slack.com/services/T33/B33/backend-alerts",
        )
        new_repo = create_repository(self.db, self.user, create_payload)
        self.assertEqual(new_repo.jira_project_key, "BACK")
        self.assertEqual(new_repo.slack_webhook_url, "https://hooks.slack.com/services/T33/B33/backend-alerts")

        update_payload = RepositoryUpdate(
            jira_project_key="BACKLOG",
            slack_webhook_url="https://hooks.slack.com/services/T33/B33/updated-webhook",
        )
        updated_repo = update_repository(self.db, new_repo, update_payload)
        self.assertEqual(updated_repo.jira_project_key, "BACKLOG")
        self.assertEqual(updated_repo.slack_webhook_url, "https://hooks.slack.com/services/T33/B33/updated-webhook")


if __name__ == "__main__":
    unittest.main()
