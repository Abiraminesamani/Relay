import unittest
from unittest.mock import MagicMock, patch

from app.agents.base import AgentRequest
from app.agents.code_rag_agent import CodeAgent
from app.agents.orchestrator import route_query
from app.ingestion.index_repo import (
    FastCodeEmbeddingFunction,
    chunk_code_file,
    sanitize_collection_name,
)


class TestCodeRAGAgent(unittest.TestCase):
    def setUp(self):
        self.agent = CodeAgent()

    def test_chunk_code_file_python(self):
        code = (
            "class UserService:\n"
            "    def __init__(self, db):\n"
            "        self.db = db\n\n"
            "    def get_user_by_id(self, user_id: int):\n"
            "        return self.db.query(user_id)\n\n"
            "    def create_user(self, name: str, email: str):\n"
            "        return self.db.insert({'name': name, 'email': email})\n"
        )
        chunks = chunk_code_file(code, "app/services/user_service.py")
        self.assertGreaterEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["path"], "app/services/user_service.py")
        self.assertIn("UserService", chunks[0]["content"])

    def test_chunk_code_file_typescript(self):
        ts_code = (
            "export interface User {\n"
            "  id: number;\n"
            "  name: string;\n"
            "}\n\n"
            "export function formatUserName(user: User): string {\n"
            "  return `${user.id}: ${user.name}`;\n"
            "}\n"
        )
        chunks = chunk_code_file(ts_code, "frontend/src/utils/user.ts")
        self.assertGreaterEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["path"], "frontend/src/utils/user.ts")
        self.assertIn("formatUserName", chunks[0]["content"])

    def test_sanitize_collection_name(self):
        name = sanitize_collection_name("Abiraminesamani/spendwise.app")
        self.assertTrue(name.startswith("relay_"))
        self.assertNotIn("/", name)
        self.assertNotIn(".", name)

    def test_fast_embedding_function(self):
        ef = FastCodeEmbeddingFunction()
        embeddings = ef(["def authenticate(): pass", "class DatabaseConnection: pass"])
        self.assertEqual(len(embeddings), 2)
        self.assertEqual(len(embeddings[0]), 128)
        self.assertEqual(len(embeddings[1]), 128)

    def test_code_agent_can_handle(self):
        request = AgentRequest(query_text="How does user authentication work in the backend?")
        self.assertTrue(self.agent.can_handle(request))

    @patch("app.agents.code_rag_agent.settings")
    @patch("app.agents.code_rag_agent.chromadb.PersistentClient")
    def test_handle_with_chroma_retrieval(self, mock_chroma_client_cls, mock_settings):
        mock_settings.github_repo = "owner/repo"
        mock_settings.github_token = "ghp_fake"
        mock_settings.openai_api_key = ""
        mock_settings.chroma_persist_dir = "./chroma_store"

        mock_client = MagicMock()
        mock_chroma_client_cls.return_value = mock_client

        mock_col_info = MagicMock()
        mock_col_info.name = "relay_owner_repo"
        mock_client.list_collections.return_value = [mock_col_info]

        mock_collection = MagicMock()
        mock_client.get_collection.return_value = mock_collection
        mock_collection.query.return_value = {
            "documents": [["def verify_jwt_token(token: str): return decode(token)"]],
            "metadatas": [[{"path": "backend/app/auth.py"}]],
            "distances": [[0.1]],
        }

        result = self.agent.handle(AgentRequest(query_text="Where is JWT verification handled?"))
        self.assertEqual(result.agent_name, "Code Agent")
        self.assertIn("backend/app/auth.py", result.response_text)

    def test_orchestrator_routes_to_code_agent(self):
        result = route_query("Explain the overall architecture and services in this repo")
        self.assertEqual(result.agent_name, "Code Agent")


if __name__ == "__main__":
    unittest.main()
