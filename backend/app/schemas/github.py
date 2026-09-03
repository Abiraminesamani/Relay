from pydantic import BaseModel


class GitHubRepoMetadata(BaseModel):
    full_name: str
    owner: str | None = None
    created_at: str | None = None
    language: str | None = None
    stars: int = 0
    forks: int = 0
    description: str | None = None
    default_branch: str = "main"
    html_url: str = ""


class GitHubCommit(BaseModel):
    sha: str
    message: str
    author: str


class GitHubPullRequest(BaseModel):
    number: int
    title: str
    state: str
    html_url: str


class GitHubRepositoryOverview(BaseModel):
    repository: GitHubRepoMetadata
    branches: list[str]
    recent_commits: list[GitHubCommit]
    pull_requests: list[GitHubPullRequest]
