from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.architecture import (
    DBSchemaResponse,
    DependencyGraphResponse,
    ImpactAnalysisResponse,
)
from app.services.architecture_service import (
    get_database_schema_service,
    get_dependency_graph_service,
    get_impact_analysis_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/architecture", tags=["Architecture & Dependency Graph"])


@router.get(
    "/graph",
    response_model=DependencyGraphResponse,
    summary="Get interactive module dependency graph",
)
def get_dependency_graph(
    repository_id: Optional[int] = Query(default=1, description="Repository ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_dependency_graph_service(
        db=db, current_user=current_user, repository_id=repository_id or 1
    )


@router.get(
    "/impact",
    response_model=ImpactAnalysisResponse,
    summary="Calculate blast radius and impact analysis for a specific file",
)
def get_impact_analysis(
    file_path: str = Query(..., description="File path to analyze"),
    repository_id: Optional[int] = Query(default=1, description="Repository ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_impact_analysis_service(
        db=db,
        current_user=current_user,
        repository_id=repository_id or 1,
        file_path=file_path,
    )


@router.get(
    "/schema",
    response_model=DBSchemaResponse,
    summary="Extract SQLAlchemy database ERD models, tables, columns, and relationships",
)
def get_database_schema(
    current_user: User = Depends(get_current_user),
):
    return get_database_schema_service()
