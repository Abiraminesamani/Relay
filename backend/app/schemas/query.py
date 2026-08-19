from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.repository import RepositoryRead


class QueryCreate(BaseModel):
    query_text: str = Field(min_length=1, max_length=5000)
    repository_id: int | None = None


class ResponseRead(BaseModel):
    id: int
    query_id: int
    response_text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class QueryRead(BaseModel):
    id: int
    query_text: str
    asked_at: datetime
    user_id: int
    repository_id: int | None
    agent_id: int | None
    repository: RepositoryRead | None = None

    model_config = {"from_attributes": True}


class QueryDetail(QueryRead):
    responses: list[ResponseRead] = []
