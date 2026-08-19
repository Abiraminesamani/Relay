from __future__ import annotations

import logging

from app.agents.ci_correlation_agent import investigate_failure
from app.agents.code_rag_agent import answer_code_question

logger = logging.getLogger(__name__)

CI_ROUTE_KEYWORDS = (
    "build",
    "workflow",
    "action",
    "failed",
    "deploy",
    "pipeline",
    "error",
)


def _is_ci_query(query: str) -> bool:
    normalized_query = query.casefold()
    return any(keyword in normalized_query for keyword in CI_ROUTE_KEYWORDS)


def route_query(query: str) -> str:
    """Route the incoming chat message to the most relevant agent."""
    cleaned_query = query.strip()
    if not cleaned_query:
        return "Please ask a question about your repository or a CI failure."

    try:
        if _is_ci_query(cleaned_query):
            return investigate_failure(cleaned_query)
        return answer_code_question(cleaned_query)
    except Exception:
        logger.exception("Unexpected orchestrator failure while handling a chat request.")
        return (
            "I ran into an unexpected error while processing that request. "
            "Please try again in a moment."
        )
