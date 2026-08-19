from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import Repository, User
from app.schemas.repository import RepositoryCreate, RepositoryUpdate


def create_repository(db: Session, user: User, payload: RepositoryCreate) -> Repository:
    duplicate = (
        db.query(Repository)
        .filter(Repository.user_id == user.id, Repository.repo_url == payload.repo_url)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repository already exists for this user")

    repository = Repository(name=payload.name.strip(), repo_url=payload.repo_url.strip(), user_id=user.id)
    db.add(repository)
    db.commit()
    db.refresh(repository)
    return repository


def list_repositories(db: Session, user: User) -> list[Repository]:
    return db.query(Repository).filter(Repository.user_id == user.id).order_by(Repository.added_at.desc()).all()


def get_repository_or_404(db: Session, user: User, repository_id: int) -> Repository:
    repository = db.query(Repository).filter(Repository.id == repository_id, Repository.user_id == user.id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repository


def update_repository(db: Session, repository: Repository, payload: RepositoryUpdate) -> Repository:
    repository.name = payload.name.strip()
    repository.repo_url = payload.repo_url.strip()
    db.commit()
    db.refresh(repository)
    return repository


def delete_repository(db: Session, repository: Repository) -> None:
    db.delete(repository)
    db.commit()
