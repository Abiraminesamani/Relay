from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class RepositoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    repo_url: str = Field(min_length=10, max_length=512)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str) -> str:
        lowered = value.lower()
        if not (lowered.startswith("https://") or lowered.startswith("http://")):
            raise ValueError("Repository URL must start with http:// or https://")
        return value


class RepositoryCreate(RepositoryBase):
    pass


class RepositoryUpdate(RepositoryBase):
    pass


class RepositoryRead(RepositoryBase):
    id: int
    added_at: datetime
    user_id: int

    model_config = {"from_attributes": True}
