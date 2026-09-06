import unittest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.db.models import User, WebhookSubscription
from app.schemas.webhook import WebhookCreate, WebhookUpdate, WebhookTestRequest
from app.services.webhook_service import (
    create_webhook_service,
    delete_webhook_service,
    list_webhooks_service,
    test_webhook_service,
    update_webhook_service,
)


class TestWebhookIntegrations(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()

        self.user = User(name="Test Dev", email="dev@relay.ai", password_hash="hash")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_create_and_list_webhooks(self):
        payload = WebhookCreate(
            name="Slack #dev-alerts",
            service_type="slack",
            webhook_url="https://hooks.slack.com/services/T00/B00/X00",
            events="pr_review,ci_failure",
            is_active=True,
        )
        created = create_webhook_service(self.db, self.user, payload)
        self.assertIsNotNone(created.id)
        self.assertEqual(created.name, "Slack #dev-alerts")

        hooks = list_webhooks_service(self.db, self.user)
        self.assertEqual(len(hooks), 1)
        self.assertEqual(hooks[0].id, created.id)

    def test_update_and_delete_webhook(self):
        payload = WebhookCreate(
            name="Discord Alerts",
            service_type="discord",
            webhook_url="https://discord.com/api/webhooks/123/abc",
        )
        created = create_webhook_service(self.db, self.user, payload)

        update_payload = WebhookUpdate(name="Discord Prod Alerts", is_active=False)
        updated = update_webhook_service(self.db, self.user, created.id, update_payload)
        self.assertEqual(updated.name, "Discord Prod Alerts")
        self.assertFalse(updated.is_active)

        delete_webhook_service(self.db, self.user, created.id)
        hooks = list_webhooks_service(self.db, self.user)
        self.assertEqual(len(hooks), 0)

    @patch("app.services.webhook_service.httpx.Client")
    def test_slack_webhook_delivery(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.text = "ok"
        mock_client.post.return_value = mock_res

        payload = WebhookTestRequest(
            service_type="slack",
            webhook_url="https://hooks.slack.com/services/T/B/X",
            title="Test PR Review",
            message="All checks passed",
        )
        res = test_webhook_service(self.db, self.user, payload)
        self.assertTrue(res.success)
        self.assertEqual(res.status_code, 200)


if __name__ == "__main__":
    unittest.main()
