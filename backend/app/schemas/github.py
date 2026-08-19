from pydantic import BaseModel


class GitHubRepoMetadata(BaseModel):
    full_name: str
    description: str | None
    default_branch: str
    html_url: str


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
