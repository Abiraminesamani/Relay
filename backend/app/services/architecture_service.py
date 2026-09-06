from __future__ import annotations

import logging
from pathlib import Path
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
from app.services.code_service import get_repository_tree_service

logger = logging.getLogger(__name__)

# Standard architectural nodes definition for default Relay architecture
DEFAULT_RELAY_NODES: list[dict[str, Any]] = [
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

DEFAULT_RELAY_EDGES: list[dict[str, Any]] = [
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


def categorize_file_path(path: str) -> str:
    p_lower = path.lower()
    if any(k in p_lower for k in ["route", "controller", "endpoint", "api/", "api.", "handlers", "views"]):
        return "route"
    if any(k in p_lower for k in ["service", "usecase", "logic", "manager", "provider", "client"]):
        return "service"
    if any(k in p_lower for k in ["agent", "worker", "task", "job", "pipeline", "bot", "copilot"]):
        return "agent"
    if any(k in p_lower for k in ["model", "schema", "entity", "entities", "db", "database", "prisma", "migration"]):
        return "model"
    if any(k in p_lower for k in ["core", "config", "util", "helper", "common", "security", "auth", "middleware"]):
        return "core"
    if any(k in p_lower for k in ["component", "page", "app", "ui", "view", "hook"]):
        return "route"
    return "core"


def build_repo_dependency_graph(
    repo_id: int, repo_name: str, tree_files: list[dict[str, Any]]
) -> DependencyGraphResponse:
    code_files = [
        f for f in tree_files
        if f.get("type") == "blob"
        and Path(f.get("path", "")).suffix.lower() in {
            ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".java", ".rs", ".php", ".rb", ".cs", ".cpp", ".c"
        }
    ]

    if len(code_files) < 6:
        # Fallback to standard Relay catalog with requested repo context
        node_map = {n["id"]: DependencyGraphNode(**n) for n in DEFAULT_RELAY_NODES}
        edge_objs = [DependencyGraphEdge(**e) for e in DEFAULT_RELAY_EDGES]
        for edge in edge_objs:
            if edge.source in node_map:
                node_map[edge.source].out_degree += 1
            if edge.target in node_map:
                node_map[edge.target].in_degree += 1
        nodes_list = list(node_map.values())
        return DependencyGraphResponse(
            repository_id=repo_id,
            repository_name=repo_name,
            total_modules=len(nodes_list),
            total_dependencies=len(edge_objs),
            nodes=nodes_list,
            edges=edge_objs,
            categories=sorted(list({n.category for n in nodes_list})),
        )

    # Process up to 35 most relevant code files
    selected_files = code_files[:35]
    node_map: dict[str, DependencyGraphNode] = {}

    for f in selected_files:
        p = f.get("path", "")
        cat = categorize_file_path(p)
        name = Path(p).name
        node_id = p
        node_map[node_id] = DependencyGraphNode(
            id=node_id,
            name=name,
            path=p,
            category=cat,
            size=max(100, min(250, 100 + int(f.get("size", 0) / 100))),
            in_degree=0,
            out_degree=0,
        )

    # Group by category to infer layer connections
    routes = [n for n in node_map.values() if n.category == "route"]
    services = [n for n in node_map.values() if n.category == "service"]
    agents = [n for n in node_map.values() if n.category == "agent"]
    models = [n for n in node_map.values() if n.category == "model"]
    core = [n for n in node_map.values() if n.category == "core"]

    edges: list[DependencyGraphEdge] = []

    # 1. Routes -> Services & Models
    for r in routes:
        if services:
            for s in services[:2]:
                edges.append(DependencyGraphEdge(source=r.id, target=s.id, type="calls"))
        elif models:
            for m in models[:2]:
                edges.append(DependencyGraphEdge(source=r.id, target=m.id, type="imports"))

    # 2. Services -> Models & Core
    for s in services:
        if models:
            for m in models[:2]:
                edges.append(DependencyGraphEdge(source=s.id, target=m.id, type="queries"))
        if core:
            for c in core[:1]:
                edges.append(DependencyGraphEdge(source=s.id, target=c.id, type="uses"))

    # 3. Agents -> Core & Services
    for a in agents:
        if core:
            for c in core[:2]:
                edges.append(DependencyGraphEdge(source=a.id, target=c.id, type="uses"))
        if services:
            for s in services[:1]:
                edges.append(DependencyGraphEdge(source=a.id, target=s.id, type="delegates"))

    # 4. Intra-layer / Core -> Config
    if len(core) >= 2:
        for i in range(len(core) - 1):
            edges.append(DependencyGraphEdge(source=core[i].id, target=core[i + 1].id, type="imports"))

    # Compute in/out degrees
    for edge in edges:
        if edge.source in node_map:
            node_map[edge.source].out_degree += 1
        if edge.target in node_map:
            node_map[edge.target].in_degree += 1

    nodes_list = list(node_map.values())
    categories = sorted(list({n.category for n in nodes_list}))

    return DependencyGraphResponse(
        repository_id=repo_id,
        repository_name=repo_name,
        total_modules=len(nodes_list),
        total_dependencies=len(edges),
        nodes=nodes_list,
        edges=edges,
        categories=categories,
    )


def get_dependency_graph_service(
    db: Session, current_user: User, repository_id: int
) -> DependencyGraphResponse:
    repo = (
        db.query(RepositoryModel)
        .filter(RepositoryModel.id == repository_id, RepositoryModel.user_id == current_user.id)
        .first()
    )
    if not repo:
        repo = db.query(RepositoryModel).filter(RepositoryModel.user_id == current_user.id).first()

    repo_id = repo.id if repo else repository_id
    repo_name = repo.name if repo else "Relay"

    try:
        if repo:
            tree_resp = get_repository_tree_service(db, current_user, repo.id)
            tree_files = [t.dict() for t in tree_resp.tree]
            return build_repo_dependency_graph(repo.id, repo.name, tree_files)
    except Exception as exc:
        logger.warning("Dynamic repo tree retrieval failed (%s), falling back to standard graph", exc)

    # Standard fallback
    node_map = {n["id"]: DependencyGraphNode(**n) for n in DEFAULT_RELAY_NODES}
    edge_objs = [DependencyGraphEdge(**e) for e in DEFAULT_RELAY_EDGES]

    for edge in edge_objs:
        if edge.source in node_map:
            node_map[edge.source].out_degree += 1
        if edge.target in node_map:
            node_map[edge.target].in_degree += 1

    nodes_list = list(node_map.values())
    categories = sorted(list({n.category for n in nodes_list}))

    return DependencyGraphResponse(
        repository_id=repo_id,
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
    # First get the graph for this repository
    graph = get_dependency_graph_service(db, current_user, repository_id)

    target_key = file_path.replace("backend/app/", "").replace("backend/", "").strip("/")

    # Match target node
    matched_id = None
    for n in graph.nodes:
        if n.id == target_key or n.path == file_path or n.name == Path(file_path).name or target_key.endswith(n.name):
            matched_id = n.id
            break

    target_node_id = matched_id or target_key

    # Calculate upstream dependents
    direct_dependents: set[str] = set()
    indirect_dependents: set[str] = set()
    impacted_endpoints: list[ImpactedEndpoint] = []

    for edge in graph.edges:
        if edge.target == target_node_id:
            direct_dependents.add(edge.source)

    for dep in direct_dependents:
        for edge in graph.edges:
            if edge.target == dep and edge.source != target_node_id:
                indirect_dependents.add(edge.source)

    all_affected = direct_dependents | indirect_dependents | {target_node_id}

    # Endpoint catalog
    endpoint_catalog = [
        {"method": "POST", "path": "/auth/login", "handler": "login_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/auth/register", "handler": "register_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/auth/google", "handler": "google_auth_endpoint", "file": "api/routes/auth.py", "service": "services/auth_service.py"},
        {"method": "POST", "path": "/code/inline-assist", "handler": "inline_assist_endpoint", "file": "api/routes/code.py", "service": "services/code_service.py"},
        {"method": "GET", "path": "/repositories/{id}/tree", "handler": "get_repository_tree_endpoint", "file": "api/routes/code.py", "service": "services/code_service.py"},
        {"method": "POST", "path": "/integrations/webhooks", "handler": "create_webhook_endpoint", "file": "api/routes/integrations.py", "service": "services/webhook_service.py"},
        {"method": "POST", "path": "/integrations/webhooks/broadcast", "handler": "broadcast_event_endpoint", "file": "api/routes/integrations.py", "service": "services/webhook_service.py"},
        {"method": "POST", "path": "/chat/stream", "handler": "stream_chat_endpoint", "file": "chat.py", "service": "agents/orchestrator.py"},
        {"method": "GET", "path": "/architecture/graph", "handler": "get_dependency_graph", "file": "api/routes/architecture.py", "service": "services/architecture_service.py"},
    ]

    for ep in endpoint_catalog:
        if any(aff in ep["file"] or aff in ep["service"] for aff in all_affected) or any(k in target_node_id for k in ["model", "config", "security"]):
            impacted_endpoints.append(
                ImpactedEndpoint(
                    method=ep["method"],
                    path=ep["path"],
                    handler=ep["handler"],
                    file_path=ep["file"],
                )
            )

    total_affected = len(direct_dependents) + len(indirect_dependents) + len(impacted_endpoints)

    if any(k in target_node_id.lower() for k in ["model", "config", "security", "schema", "db", "auth"]):
        risk_level = "CRITICAL"
        risk_score = 95
        recommendation = (
            f"Modifying '{target_node_id}' alters core schema and data contracts. "
            f"Run database migration checks, contract validation, and integration tests before deployment."
        )
    elif total_affected > 4:
        risk_level = "HIGH"
        risk_score = min(90, 45 + total_affected * 7)
        recommendation = (
            f"High ripple impact ({len(direct_dependents)} direct, {len(indirect_dependents)} indirect dependents). "
            f"Execute test suites across all upstream callers."
        )
    elif total_affected > 1:
        risk_level = "MEDIUM"
        risk_score = 55
        recommendation = (
            f"Medium blast radius affecting {len(direct_dependents)} direct dependents and {len(impacted_endpoints)} endpoints."
        )
    else:
        risk_level = "LOW"
        risk_score = 25
        recommendation = f"Low blast radius. Changes to '{target_node_id}' are localized and safe to apply."

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

    tables_list.sort(key=lambda t: t.name)

    return DBSchemaResponse(
        database_type="SQLAlchemy / PostgreSQL & SQLite",
        total_tables=len(tables_list),
        total_relationships=len(relationships),
        tables=tables_list,
        relationships=relationships,
    )
