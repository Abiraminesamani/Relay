from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.repository import RepositoryCreate, RepositoryRead, RepositoryUpdate
from app.services.repository_service import (
    create_repository,
    delete_repository,
    get_repository_or_404,
    list_repositories,
    update_repository,
)


router = APIRouter(prefix="/repositories", tags=["Repositories"])


@router.post("", response_model=RepositoryRead, status_code=status.HTTP_201_CREATED, summary="Create a repository")
def create_repository_endpoint(
    payload: RepositoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_repository(db, current_user, payload)


@router.get("", response_model=list[RepositoryRead], summary="List repositories for the authenticated user")
def list_repositories_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_repositories(db, current_user)


@router.get("/{repository_id}", response_model=RepositoryRead, summary="Get a repository by id")
def get_repository_endpoint(
    repository_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_repository_or_404(db, current_user, repository_id)


@router.put("/{repository_id}", response_model=RepositoryRead, summary="Update a repository")
def update_repository_endpoint(
    repository_id: int,
    payload: RepositoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repository = get_repository_or_404(db, current_user, repository_id)
    return update_repository(db, repository, payload)


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a repository")
def delete_repository_endpoint(
    repository_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repository = get_repository_or_404(db, current_user, repository_id)
    delete_repository(db, repository)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
