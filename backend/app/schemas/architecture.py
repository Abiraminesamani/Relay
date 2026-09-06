from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class DependencyGraphNode(BaseModel):
    id: str
    name: str
    path: str
    category: str  # "route" | "service" | "model" | "agent" | "core" | "frontend" | "util"
    size: int = 100
    in_degree: int = 0
    out_degree: int = 0


class DependencyGraphEdge(BaseModel):
    source: str
    target: str
    type: str = "imports"  # "imports" | "calls" | "depends_on"
    weight: int = 1


class DependencyGraphResponse(BaseModel):
    repository_id: int
    repository_name: str
    total_modules: int
    total_dependencies: int
    nodes: list[DependencyGraphNode]
    edges: list[DependencyGraphEdge]
    categories: list[str]


class ImpactedEndpoint(BaseModel):
    method: str
    path: str
    handler: str
    file_path: str


class ImpactAnalysisResponse(BaseModel):
    target_file: str
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    risk_score: int  # 0 to 100
    direct_dependents: list[str]
    indirect_dependents: list[str]
    impacted_endpoints: list[ImpactedEndpoint]
    ai_recommendation: str


class ColumnSchema(BaseModel):
    name: str
    type: str
    primary_key: bool = False
    nullable: bool = True
    foreign_key: Optional[str] = None
    unique: bool = False


class RelationshipSchema(BaseModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    relationship_type: str = "one_to_many"  # "one_to_one" | "one_to_many" | "many_to_many"


class TableSchema(BaseModel):
    name: str
    columns: list[ColumnSchema]
    primary_keys: list[str]
    foreign_keys: list[str]


class DBSchemaResponse(BaseModel):
    database_type: str
    total_tables: int
    total_relationships: int
    tables: list[TableSchema]
    relationships: list[RelationshipSchema]
