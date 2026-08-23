from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.base import AgentRequest
from app.agents.orchestrator import (
    ci_agent,
    code_agent,
    github_agent,
    pr_review_agent,
    route_query,
)

router = APIRouter(prefix="/chat", tags=["Chat Compatibility"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    agent_type: str | None = None
    repository_url: str | None = None


class ChatResponse(BaseModel):
    reply: str
    agent_name: str


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Route chat messages through the backend orchestrator or direct agent selection."""
    if req.agent_type == "github":
        result = github_agent.handle(AgentRequest(query_text=req.message, repository_url=req.repository_url))
    elif req.agent_type == "ci":
        result = ci_agent.handle(AgentRequest(query_text=req.message, repository_url=req.repository_url))
    elif req.agent_type == "code":
        result = code_agent.handle(AgentRequest(query_text=req.message, repository_url=req.repository_url))
    elif req.agent_type == "pr_review":
        result = pr_review_agent.handle(AgentRequest(query_text=req.message, repository_url=req.repository_url))
    else:
        result = route_query(req.message, repository_url=req.repository_url)

    return ChatResponse(reply=result.response_text, agent_name=result.agent_name)
