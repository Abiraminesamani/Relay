from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.code import (
    FileContentResponse,
    InlineAssistRequest,
    InlineAssistResponse,
    RepoTreeResponse,
)
from app.services.code_service import (
    get_file_content_service,
    get_repository_tree_service,
    perform_inline_assist_service,
)

router = APIRouter(tags=["Code Explorer & Inline Assistant"])


@router.get(
    "/repositories/{repository_id}/tree",
    response_model=RepoTreeResponse,
    summary="Get full repository file and folder tree",
)
def get_repository_tree_endpoint(
    repository_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_repository_tree_service(db, current_user, repository_id)


@router.get(
    "/repositories/{repository_id}/file-content",
    response_model=FileContentResponse,
    summary="Get decoded file content and metadata",
)
def get_file_content_endpoint(
    repository_id: int,
    path: str = Query(..., description="Path to file within repository, e.g. 'backend/app/main.py'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_file_content_service(db, current_user, repository_id, path)


@router.post(
    "/code/inline-assist",
    response_model=InlineAssistResponse,
    summary="Perform inline AI code assistance (explain, refactor, generate tests, security scan)",
)
def inline_assist_endpoint(
    payload: InlineAssistRequest,
    current_user: User = Depends(get_current_user),
):
    return perform_inline_assist_service(payload)
