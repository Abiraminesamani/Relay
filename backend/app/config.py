from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://devcopilot:devcopilot@localhost:5432/devcopilot"

    github_token: str = ""
    github_webhook_secret: str = ""
    github_repo: str = ""  # e.g. "your-org/your-repo"

    openai_api_key: str = ""

    chroma_persist_dir: str = "./chroma_store"

    class Config:
        env_file = ".env"


settings = Settings()
