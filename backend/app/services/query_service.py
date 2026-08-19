from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.agents.orchestrator import route_query
from app.db.models import Agent, Query, Repository, Response, User
from app.schemas.query import QueryCreate


def create_query(db: Session, user: User, payload: QueryCreate) -> Query:
    repository = None
    if payload.repository_id is not None:
        repository = (
            db.query(Repository)
            .filter(Repository.id == payload.repository_id, Repository.user_id == user.id)
            .first()
        )
        if repository is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    agent_result = route_query(payload.query_text, repository.repo_url if repository else None)
    agent = db.query(Agent).filter(Agent.name == agent_result.agent_name).first()

    query = Query(
        query_text=payload.query_text.strip(),
        user_id=user.id,
        repository_id=repository.id if repository else None,
        agent_id=agent.id if agent else None,
    )
    db.add(query)
    db.flush()

    response = Response(query_id=query.id, response_text=agent_result.response_text)
    db.add(response)
    db.commit()
    db.refresh(query)
    return get_query_or_404(db, user, query.id)


def list_queries(db: Session, user: User) -> list[Query]:
    return (
        db.query(Query)
        .options(joinedload(Query.repository), joinedload(Query.responses))
        .filter(Query.user_id == user.id)
        .order_by(Query.asked_at.desc())
        .all()
    )


def get_query_or_404(db: Session, user: User, query_id: int) -> Query:
    query = (
        db.query(Query)
        .options(joinedload(Query.repository), joinedload(Query.responses))
        .filter(Query.id == query_id, Query.user_id == user.id)
        .first()
    )
    if query is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Query not found")
    return query


def list_responses(db: Session, user: User, query_id: int) -> list[Response]:
    query = get_query_or_404(db, user, query_id)
    return query.responses
