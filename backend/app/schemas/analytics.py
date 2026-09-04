from pydantic import BaseModel
from app.schemas.github import GitHubPullRequest


class LanguageStat(BaseModel):
    name: str
    bytes: int
    percentage: float
    color: str


class MonthlyActivity(BaseModel):
    month: str
    commits: int


class ActivityEvent(BaseModel):
    icon: str
    title: str
    desc: str
    time: str
    type: str


class CIStatusSummary(BaseModel):
    status: str
    passing_count: int
    total_count: int
    latest_run_id: int | None = None
    latest_run_name: str | None = None
    latest_conclusion: str | None = None


class RepositoryAnalytics(BaseModel):
    repo_id: int
    name: str
    full_name: str
    owner: str
    repo_url: str
    description: str | None = None
    default_branch: str = "main"
    created_at: str | None = None
    stars: int = 0
    forks: int = 0
    open_issues: int = 0
    open_prs_count: int = 0
    total_prs_count: int = 0
    ci_status: CIStatusSummary
    languages: list[LanguageStat] = []
    activity_timeline: list[MonthlyActivity] = []
    recent_activities: list[ActivityEvent] = []
    pull_requests: list[GitHubPullRequest] = []
    chunks_indexed: int = 0
