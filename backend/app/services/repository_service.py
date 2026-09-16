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

    clean_jira_key = payload.jira_project_key.strip().upper() if payload.jira_project_key and payload.jira_project_key.strip() else None
    clean_slack_url = payload.slack_webhook_url.strip() if payload.slack_webhook_url and payload.slack_webhook_url.strip() else None

    repository = Repository(
        name=payload.name.strip(),
        repo_url=payload.repo_url.strip(),
        user_id=user.id,
        jira_project_key=clean_jira_key,
        slack_webhook_url=clean_slack_url,
    )
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
    if payload.name is not None:
        repository.name = payload.name.strip()
    if payload.repo_url is not None:
        repository.repo_url = payload.repo_url.strip()
    if payload.jira_project_key is not None:
        val = payload.jira_project_key.strip().upper()
        repository.jira_project_key = val if val else None
    if payload.slack_webhook_url is not None:
        val = payload.slack_webhook_url.strip()
        repository.slack_webhook_url = val if val else None

    db.commit()
    db.refresh(repository)
    return repository


def delete_repository(db: Session, repository: Repository) -> None:
    db.delete(repository)
    db.commit()
