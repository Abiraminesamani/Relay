from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Relay API"
    api_v1_prefix: str = "/api"
    database_url: str = "postgresql+psycopg://devcopilot:devcopilot@localhost:5432/devcopilot"
    auth_secret_key: str = "change-me-in-env"
    auth_token_expiry_minutes: int = 1440
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    github_token: str = ""
    github_webhook_secret: str = ""
    github_repo: str = ""

    openai_api_key: str = ""
    chroma_persist_dir: str = "./chroma_store"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
