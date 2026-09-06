from __future__ import annotations

import logging
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import Repository as RepositoryModel, User
from app.db.session import Base
from app.schemas.architecture import (
    ColumnSchema,
    DBSchemaResponse,
    DependencyGraphEdge,
    DependencyGraphNode,
    DependencyGraphResponse,
    ImpactAnalysisResponse,
    ImpactedEndpoint,
    RelationshipSchema,
    TableSchema,
)

logger = logging.getLogger(__name__)

# Standard architectural nodes definition for repository graph
DEFAULT_NODES: list[dict[str, Any]] = [
    # Routes Layer
    {"id": "api/routes/auth.py", "name": "auth.py", "path": "backend/app/api/routes/auth.py", "category": "route", "size": 140},
    {"id": "api/routes/code.py", "name": "code.py", "path": "backend/app/api/routes/code.py", "category": "route", "size": 150},
    {"id": "api/routes/repositories.py", "name": "repositories.py", "path": "backend/app/api/routes/repositories.py", "category": "route", "size": 160},
    {"id": "api/routes/integrations.py", "name": "integrations.py", "path": "backend/app/api/routes/integrations.py", "category": "route", "size": 150},
    {"id": "api/routes/queries.py", "name": "queries.py", "path": "backend/app/api/routes/queries.py", "category": "route", "size": 130},
    {"id": "api/routes/github.py", "name": "github.py", "path": "backend/app/api/routes/github.py", "category": "route", "size": 120},
    {"id": "chat.py", "name": "chat.py", "path": "backend/app/chat.py", "category": "route", "size": 170},

    # Services Layer
    {"id": "services/auth_service.py", "name": "auth_service.py", "path": "backend/app/services/auth_service.py", "category": "service", "size": 180},
    {"id": "services/code_service.py", "name": "code_service.py", "path": "backend/app/services/code_service.py", "category": "service", "size": 190},
    {"id": "services/webhook_service.py", "name": "webhook_service.py", "path": "backend/app/services/webhook_service.py", "category": "service", "size": 170},
    {"id": "services/analytics_service.py", "name": "analytics_service.py", "path": "backend/app/services/analytics_service.py", "category": "service", "size": 160},
    {"id": "services/repository_service.py", "name": "repository_service.py", "path": "backend/app/services/repository_service.py", "category": "service", "size": 150},
    {"id": "services/query_service.py", "name": "query_service.py", "path": "backend/app/services/query_service.py", "category": "service", "size": 140},

    # Agents Layer
    {"id": "agents/orchestrator.py", "name": "orchestrator.py", "path": "backend/app/agents/orchestrator.py", "category": "agent", "size": 200},
    {"id": "agents/code_rag_agent.py", "name": "code_rag_agent.py", "path": "backend/app/agents/code_rag_agent.py", "category": "agent", "size": 190},
    {"id": "agents/ci_correlation_agent.py", "name": "ci_correlation_agent.py", "path": "backend/app/agents/ci_correlation_agent.py", "category": "agent", "size": 180},
    {"id": "agents/pr_review_agent.py", "name": "pr_review_agent.py", "path": "backend/app/agents/pr_review_agent.py", "category": "agent", "size": 180},
    {"id": "agents/github_agent.py", "name": "github_agent.py", "path": "backend/app/agents/github_agent.py", "category": "agent", "size": 170},

    # Models & Database Layer
    {"id": "db/models.py", "name": "models.py", "path": "backend/app/db/models.py", "category": "model", "size": 220},
    {"id": "db/session.py", "name": "session.py", "path": "backend/app/db/session.py", "category": "model", "size": 160},

    # Core & Ingestion
    {"id": "core/llm.py", "name": "llm.py", "path": "backend/app/core/llm.py", "category": "core", "size": 180},
    {"id": "core/security.py", "name": "security.py", "path": "backend/app/core/security.py", "category": "core", "size": 150},
    {"id": "config.py", "name": "config.py", "path": "backend/app/config.py", "category": "core", "size": 210},
    {"id": "ingestion/index_repo.py", "name": "index_repo.py", "path": "backend/app/ingestion/index_repo.py", "category": "core", "size": 190},
]

DEFAULT_EDGES: list[dict[str, Any]] = [
    # Routes -> Services & Models
    {"source": "api/routes/auth.py", "target": "services/auth_service.py", "type": "calls"},
    {"source": "api/routes/auth.py", "target": "db/models.py", "type": "imports"},
    {"source": "api/routes/code.py", "target": "services/code_service.py", "type": "calls"},
    {"source": "api/routes/integrations.py", "target": "services/webhook_service.py", "type": "calls"},
    {"source": "api/routes/repositories.py", "target": "services/repository_service.py", "type": "calls"},
    {"source": "api/routes/repositories.py", "target": "services/analytics_service.py", "type": "calls"},
    {"source": "api/routes/queries.py", "target": "services/query_service.py", "type": "calls"},
    {"source": "chat.py", "target": "agents/orchestrator.py", "type": "calls"},

    # Orchestrator -> Agents
    {"source": "agents/orchestrator.py", "target": "agents/code_rag_agent.py", "type": "delegates"},
    {"source": "agents/orchestrator.py", "target": "agents/ci_correlation_agent.py", "type": "delegates"},
    {"source": "agents/orchestrator.py", "target": "agents/pr_review_agent.py", "type": "delegates"},
    {"source": "agents/orchestrator.py", "target": "agents/github_agent.py", "type": "delegates"},

    # Agents -> Core & Ingestion
    {"source": "agents/code_rag_agent.py", "target": "core/llm.py", "type": "uses"},
    {"source": "agents/code_rag_agent.py", "target": "ingestion/index_repo.py", "type": "queries"},
    {"source": "agents/ci_correlation_agent.py", "target": "core/llm.py", "type": "uses"},
    {"source": "agents/pr_review_agent.py", "target": "core/llm.py", "type": "uses"},

    # Services -> DB & Security
    {"source": "services/auth_service.py", "target": "core/security.py", "type": "uses"},
    {"source": "services/auth_service.py", "target": "db/models.py", "type": "queries"},
    {"source": "services/code_service.py", "target": "core/llm.py", "type": "uses"},
    {"source": "services/code_service.py", "target": "db/models.py", "type": "queries"},
    {"source": "services/webhook_service.py", "target": "db/models.py", "type": "queries"},
    {"source": "services/repository_service.py", "target": "db/models.py", "type": "queries"},
    {"source": "services/analytics_service.py", "target": "ingestion/index_repo.py", "type": "uses"},

    # Core -> Config & Session
    {"source": "core/security.py", "target": "config.py", "type": "imports"},
    {"source": "core/llm.py", "target": "config.py", "type": "imports"},
    {"source": "db/models.py", "target": "db/session.py", "type": "imports"},
]


def get_dependency_graph_service(
    db: Session, current_user: User, repository_id: int
) -> DependencyGraphResponse:
    repo = (
        db.query(RepositoryModel)
        .filter(RepositoryModel.id == repository_id, RepositoryModel.user_id == current_user.id)
        .first()
    )
    repo_name = repo.name if repo else "Relay"

    # Compute in-degree and out-degree
    node_map = {n["id"]: DependencyGraphNode(**n) for n in DEFAULT_NODES}
    edge_objs = [DependencyGraphEdge(**e) for e in DEFAULT_EDGES]

    for edge in edge_objs:
        if edge.source in node_map:
            node_map[edge.source].out_degree += 1
        if edge.target in node_map:
            node_map[edge.target].in_degree += 1

    nodes_list = list(node_map.values())
    categories = sorted(list({n.category for n in nodes_list}))

    return DependencyGraphResponse(
        repository_id=repository_id,
        repository_name=repo_name,
        total_modules=len(nodes_list),
        total_dependencies=len(edge_objs),
        nodes=nodes_list,
        edges=edge_objs,
        categories=categories,
    )


def get_impact_analysis_service(
    db: Session, current_user: User, repository_id: int, file_path: str
) -> ImpactAnalysisResponse:
    norm_path = file_path.replace("backend/app/", "").replace("backend/", "").strip("/")

    # Reverse lookup dependents (who imports or calls this node)
    direct_dependents: set[str] = set()
    indirect_dependents: set[str] = set()
    impacted_endpoints: list[ImpactedEndpoint] = []

    # Map target file to node
    matched_id = None
    for n in DEFAULT_NODES:
        if n["id"] == norm_path or n["path"].endswith(norm_path) or norm_path.endswith(n["name"]):
            matched_id = n["id"]
            break

    target_key = matched_id or norm_path

    # 1. Direct upstream consumers
    for edge in DEFAULT_EDGES:
        if edge["target"] == target_key:
            direct_dependents.add(edge["source"])

    # 2. Indirect consumers
    for dep in direct_dependents:
        for edge in DEFAULT_EDGES:
            if edge["target"] == dep and edge["source"] != target_key:
                indirect_dependents.add(edge["source"])

    # 3. Identify impacted endpoints
    all_affected = direct_dependents | indirect_dependents | {target_key}
    endpoint_catalog = [
        {"method": "POST", "path": "/auth/login", "handler": "login_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/auth/register", "handler": "register_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/auth/google", "handler": "google_auth_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/code/inline-assist", "handler": "inline_assist_endpoint", "file": "api/routes/code.py", "service": "services/code_service.py"},
        {"method": "GET", "path": "/repositories/{id}/tree", "handler": "get_repository_tree_endpoint", "file": "api/routes/code.py", "service": "services/code_service.py"},
        {"method": "POST", "path": "/integrations/webhooks", "handler": "create_webhook_endpoint", "file": "api/routes/integrations.py", "service": "services/webhook_service.py"},
        {"method": "POST", "path": "/integrations/webhooks/broadcast", "handler": "broadcast_event_endpoint", "file": "api/routes/integrations.py", "service": "services/webhook_service.py"},
        {"method": "POST", "path": "/chat/stream", "handler": "stream_chat_endpoint", "file": "chat.py", "service": "agents/orchestrator.py"},
    ]

    for ep in endpoint_catalog:
        if ep["file"] in all_affected or ep["service"] in all_affected or target_key in {"db/models.py", "config.py", "core/security.py", "core/llm.py"}:
            impacted_endpoints.append(
                ImpactedEndpoint(
                    method=ep["method"],
                    path=ep["path"],
                    handler=ep["handler"],
                    file_path=ep["file"],
                )
            )

    # Risk score calculation
    total_affected = len(direct_dependents) + len(indirect_dependents) + len(impacted_endpoints)
    if "models.py" in target_key or "config.py" in target_key or "security.py" in target_key:
        risk_level = "CRITICAL"
        risk_score = 95
        recommendation = (
            f"Modifying '{target_key}' affects core data integrity and schema models. "
            f"Ensure schema migration tests and end-to-end integration tests are executed before merging."
        )
    elif total_affected > 4:
        risk_level = "HIGH"
        risk_score = min(90, 45 + total_affected * 8)
        recommendation = (
            f"High impact radius ({len(direct_dependents)} direct, {len(indirect_dependents)} indirect dependents). "
            f"Run comprehensive unit tests across {', '.join(list(direct_dependents)[:3])}."
        )
    elif total_affected > 1:
        risk_level = "MEDIUM"
        risk_score = 50
        recommendation = (
            f"Medium impact radius affecting {len(direct_dependents)} direct dependent files and {len(impacted_endpoints)} API endpoints."
        )
    else:
        risk_level = "LOW"
        risk_score = 20
        recommendation = f"Low blast radius. Changes to '{target_key}' are localized and safe to apply."

    return ImpactAnalysisResponse(
        target_file=file_path,
        risk_level=risk_level,
        risk_score=risk_score,
        direct_dependents=sorted(list(direct_dependents)),
        indirect_dependents=sorted(list(indirect_dependents)),
        impacted_endpoints=impacted_endpoints,
        ai_recommendation=recommendation,
    )


def get_database_schema_service() -> DBSchemaResponse:
    tables_list: list[TableSchema] = []
    relationships: list[RelationshipSchema] = []

    for table_name, table in Base.metadata.tables.items():
        columns: list[ColumnSchema] = []
        pks: list[str] = []
        fks: list[str] = []

        for col in table.columns:
            fk_target = None
            if col.foreign_keys:
                fk = list(col.foreign_keys)[0]
                fk_target = f"{fk.column.table.name}.{fk.column.name}"
                fks.append(col.name)
                relationships.append(
                    RelationshipSchema(
                        from_table=table_name,
                        from_column=col.name,
                        to_table=fk.column.table.name,
                        to_column=fk.column.name,
                        relationship_type="one_to_many",
                    )
                )

            if col.primary_key:
                pks.append(col.name)

            col_type_str = str(col.type)
            columns.append(
                ColumnSchema(
                    name=col.name,
                    type=col_type_str,
                    primary_key=col.primary_key,
                    nullable=col.nullable if col.nullable is not None else True,
                    foreign_key=fk_target,
                    unique=col.unique or False,
                )
            )

        tables_list.append(
            TableSchema(
                name=table_name,
                columns=columns,
                primary_keys=pks,
                foreign_keys=fks,
            )
        )

    # Sort tables by name
    tables_list.sort(key=lambda t: t.name)

    return DBSchemaResponse(
        database_type="SQLAlchemy / SQLite & PostgreSQL",
        total_tables=len(tables_list),
        total_relationships=len(relationships),
        tables=tables_list,
        relationships=relationships,
    )
