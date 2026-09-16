from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CONFIG_DIR.parent
_ROOT_DIR = _BACKEND_DIR.parent

_ENV_FILES = (
    str(_ROOT_DIR / ".env"),
    str(_BACKEND_DIR / ".env"),
)


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

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:3000/auth/callback"

    jira_base_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""
    jira_default_project_key: str = "SMAR"
    slack_webhook_url: str = ""

    @property
    def is_jira_configured(self) -> bool:
        return bool(
            self.jira_base_url.strip()
            and self.jira_email.strip()
            and self.jira_api_token.strip()
        )

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
