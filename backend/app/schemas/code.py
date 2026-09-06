from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class FileTreeNode(BaseModel):
    path: str
    name: str
    type: str  # "blob" (file) or "tree" (folder)
    size: Optional[int] = 0
    extension: Optional[str] = ""


class RepoTreeResponse(BaseModel):
    repository_id: int
    repository_name: str
    default_branch: str
    total_files: int
    tree: list[FileTreeNode]


class FileContentResponse(BaseModel):
    path: str
    name: str
    size: int
    lines: int
    language: str
    content: str


class InlineAssistRequest(BaseModel):
    repository_id: Optional[int] = None
    repository_url: Optional[str] = None
    file_path: str
    code_snippet: str
    full_file_context: Optional[str] = None
    action: str = Field(
        "explain",
        description="Action type: explain | refactor | generate_tests | security_scan | docstring | custom",
    )
    custom_prompt: Optional[str] = None


class InlineAssistResponse(BaseModel):
    action: str
    file_path: str
    language: str
    summary: str
    explanation: str
    suggested_code: Optional[str] = None
    unit_tests: Optional[str] = None
    security_risks: Optional[list[str]] = None
