from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


def mask_webhook_url(url: str | None) -> str | None:
    if not url:
        return None
    url_str = str(url).strip()
    if not url_str:
        return None
    if len(url_str) <= 25:
        return "https://hooks.slack.com/services/...****"
    return f"{url_str[:28]}...****"


class RepositoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    repo_url: str = Field(min_length=10, max_length=512)
    jira_project_key: Optional[str] = Field(default=None, max_length=50)
    slack_webhook_url: Optional[str] = Field(default=None, max_length=1024)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str) -> str:
        lowered = value.lower()
        if not (lowered.startswith("https://") or lowered.startswith("http://")):
            raise ValueError("Repository URL must start with http:// or https://")
        return value


class RepositoryCreate(RepositoryBase):
    pass


class RepositoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    repo_url: Optional[str] = Field(default=None, min_length=10, max_length=512)
    jira_project_key: Optional[str] = Field(default=None, max_length=50)
    slack_webhook_url: Optional[str] = Field(default=None, max_length=1024)


class RepositoryRead(BaseModel):
    id: int
    name: str
    repo_url: str
    jira_project_key: Optional[str] = None
    has_slack_webhook: bool = False
    slack_webhook_masked: Optional[str] = None
    added_at: datetime
    user_id: int

    @model_validator(mode="before")
    @classmethod
    def process_slack_webhook(cls, data: Any) -> Any:
        if isinstance(data, dict):
            raw_url = data.get("slack_webhook_url")
            return {
                "id": data.get("id"),
                "name": data.get("name"),
                "repo_url": data.get("repo_url"),
                "jira_project_key": data.get("jira_project_key"),
                "has_slack_webhook": bool(raw_url and str(raw_url).strip()),
                "slack_webhook_masked": mask_webhook_url(raw_url),
                "added_at": data.get("added_at"),
                "user_id": data.get("user_id"),
            }

        raw_url = getattr(data, "slack_webhook_url", None)
        return {
            "id": getattr(data, "id", None),
            "name": getattr(data, "name", None),
            "repo_url": getattr(data, "repo_url", None),
            "jira_project_key": getattr(data, "jira_project_key", None),
            "has_slack_webhook": bool(raw_url and str(raw_url).strip()),
            "slack_webhook_masked": mask_webhook_url(raw_url),
            "added_at": getattr(data, "added_at", None),
            "user_id": getattr(data, "user_id", None),
        }

    model_config = {"from_attributes": True}
