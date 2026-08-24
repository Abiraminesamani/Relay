import asyncio
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.agents.base import AgentResult
from app.agents.orchestrator import stream_route_query
from app.main import app


class TestStreamingChat(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_stream_route_query_emits_steps_and_tokens(self):
        async def run_stream():
            events = []
            async for event in stream_route_query("Why did the CI build fail?"):
                events.append(event)
            return events

        events = asyncio.run(run_stream())
        self.assertGreater(len(events), 0)

        step_events = [e for e in events if e.get("type") == "step"]
        token_events = [e for e in events if e.get("type") == "token"]
        done_events = [e for e in events if e.get("type") == "done"]

        self.assertGreater(len(step_events), 0, "No step events found in stream")
        self.assertGreater(len(token_events), 0, "No token events found in stream")
        self.assertEqual(len(done_events), 1, "Expected exactly 1 done event")
        self.assertEqual(done_events[0]["agent_name"], "CI/CD Agent")

    def test_stream_route_query_with_agent_override(self):
        async def run_stream():
            events = []
            async for event in stream_route_query("Show me something", agent_type="github"):
                events.append(event)
            return events

        events = asyncio.run(run_stream())
        done_events = [e for e in events if e.get("type") == "done"]
        self.assertEqual(done_events[0]["agent_name"], "GitHub Agent")

    @patch("app.agents.orchestrator.code_agent.handle")
    def test_chat_stream_api_endpoint(self, mock_handle):
        mock_handle.return_value = AgentResult(
            agent_name="Code Agent",
            response_text="The backend services are modular.",
        )

        response = self.client.post(
            "/chat/stream",
            json={"message": "Explain the backend architecture"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers.get("content-type", ""))
        self.assertIn("data:", response.text)
        self.assertIn("Code Agent", response.text)


if __name__ == "__main__":
    unittest.main()
