import unittest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.db.models import User
from app.schemas.auth import GoogleAuthRequest, UserCreate
from app.services.auth_service import (
    authenticate_with_google,
    get_google_auth_url,
    login_user,
    register_user,
)


class TestAuthService(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database for testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_register_and_login_user(self):
        payload = UserCreate(name="Test User", email="test@example.com", password="password123")
        res = register_user(self.db, payload)
        self.assertIsNotNone(res.access_token)
        self.assertEqual(res.user.email, "test@example.com")

        # Login
        login_res = login_user(self.db, "test@example.com", "password123")
        self.assertIsNotNone(login_res.access_token)
        self.assertEqual(login_res.user.id, res.user.id)

    def test_get_google_auth_url(self):
        res = get_google_auth_url()
        self.assertTrue(res.url.startswith("https://accounts.google.com/o/oauth2/v2/auth"))
        self.assertIn("response_type=code", res.url)

    def test_authenticate_with_google_direct_profile(self):
        payload = GoogleAuthRequest(email="sarah.connor@gmail.com", name="Sarah Connor")
        res = authenticate_with_google(self.db, payload)
        self.assertIsNotNone(res.access_token)
        self.assertEqual(res.user.email, "sarah.connor@gmail.com")
        self.assertEqual(res.user.name, "Sarah Connor")

        # Authenticate again should return same existing user
        res2 = authenticate_with_google(self.db, payload)
        self.assertEqual(res2.user.id, res.user.id)

    @patch("app.services.auth_service.httpx.Client")
    def test_authenticate_with_google_credential(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "email": "google.user@gmail.com",
            "name": "Google User",
        }
        mock_client.get.return_value = mock_response

        payload = GoogleAuthRequest(credential="mock_id_token_123")
        res = authenticate_with_google(self.db, payload)
        self.assertIsNotNone(res.access_token)
        self.assertEqual(res.user.email, "google.user@gmail.com")


if __name__ == "__main__":
    unittest.main()
