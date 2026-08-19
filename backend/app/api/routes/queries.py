from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.query import QueryCreate, QueryDetail, QueryRead, ResponseRead
from app.services.query_service import create_query, get_query_or_404, list_queries, list_responses


router = APIRouter(prefix="/queries", tags=["Queries"])


@router.post("", response_model=QueryDetail, status_code=status.HTTP_201_CREATED, summary="Create a developer query")
def create_query_endpoint(
    payload: QueryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_query(db, current_user, payload)


@router.get("", response_model=list[QueryRead], summary="List queries for the authenticated user")
def list_queries_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_queries(db, current_user)


@router.get("/{query_id}", response_model=QueryDetail, summary="Get a query by id")
def get_query_endpoint(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_query_or_404(db, current_user, query_id)


@router.get("/{query_id}/responses", response_model=list[ResponseRead], summary="List responses for a query")
def list_responses_endpoint(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_responses(db, current_user, query_id)
