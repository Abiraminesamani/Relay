from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.orchestrator import route_query

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Route chat messages through the backend orchestrator."""
    reply = route_query(req.message)
    return ChatResponse(reply=reply)
