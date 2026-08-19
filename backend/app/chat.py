from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.orchestrator import route_query

router = APIRouter(prefix="/chat", tags=["Chat Compatibility"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class ChatResponse(BaseModel):
    reply: str
    agent_name: str


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Route chat messages through the backend orchestrator."""
    result = route_query(req.message)
    return ChatResponse(reply=result.response_text, agent_name=result.agent_name)
