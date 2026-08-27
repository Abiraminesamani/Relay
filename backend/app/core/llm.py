from __future__ import annotations

import logging
from langchain_openai import ChatOpenAI

from app.config import settings

logger = logging.getLogger(__name__)


def get_chat_llm(model: str = "openai/gpt-4o-mini", temperature: float = 0.1) -> ChatOpenAI:
    """Return a configured ChatOpenAI instance supporting direct OpenAI and OpenRouter keys."""
    api_key = settings.openai_api_key.strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured in .env.")

    if api_key.startswith("sk-or-"):
        # OpenRouter endpoint configuration
        routed_model = model if "/" in model else f"openai/{model}"
        logger.info("Using OpenRouter provider with model %s", routed_model)
        return ChatOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            model=routed_model,
            temperature=temperature,
            default_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Relay Engineering Copilot",
            },
        )

    # Standard direct OpenAI configuration
    standard_model = model.split("/")[-1] if "/" in model else model
    logger.info("Using direct OpenAI provider with model %s", standard_model)
    return ChatOpenAI(
        api_key=api_key,
        model=standard_model,
        temperature=temperature,
    )
