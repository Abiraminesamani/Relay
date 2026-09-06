from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, HttpUrl


class WebhookCreate(BaseModel):
    name: str
    service_type: str = "slack"  # "slack" | "discord" | "custom"
    webhook_url: str
    repository_id: Optional[int] = None
    events: Optional[str] = "pr_review,ci_failure,security_alert"
    is_active: bool = True


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    webhook_url: Optional[str] = None
    repository_id: Optional[int] = None
    events: Optional[str] = None
    is_active: Optional[bool] = None


class WebhookRead(BaseModel):
    id: int
    user_id: int
    repository_id: Optional[int] = None
    name: str
    service_type: str
    webhook_url: str
    events: str
    is_active: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class WebhookTestRequest(BaseModel):
    webhook_id: Optional[int] = None
    service_type: Optional[str] = "slack"
    webhook_url: Optional[str] = None
    event_type: str = "test_ping"
    title: Optional[str] = "Relay Integration Test Alert"
    message: Optional[str] = "Relay AI Engineering Copilot is successfully connected to your channel!"


class WebhookTestResponse(BaseModel):
    success: bool
    status_code: int
    message: str
    service_type: str


class BroadcastEventRequest(BaseModel):
    repository_id: Optional[int] = None
    event_type: str = "pr_review"  # "pr_review" | "ci_failure" | "security_alert" | "custom"
    title: str
    summary: str
    details: Optional[str] = None
    url: Optional[str] = None
    agent_name: Optional[str] = "Relay AI Copilot"
