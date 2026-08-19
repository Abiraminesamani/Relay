from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user
from app.db.models import User
from app.integrations.github import get_repository_overview
from app.schemas.github import GitHubRepositoryOverview


router = APIRouter(prefix="/github", tags=["GitHub"])


@router.get(
    "/repository",
    response_model=GitHubRepositoryOverview,
    summary="Get configured GitHub repository metadata and activity",
)
def github_repository_overview(current_user: User = Depends(get_current_user)):
    return get_repository_overview()
