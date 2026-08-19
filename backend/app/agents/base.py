from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(slots=True)
class AgentRequest:
    query_text: str
    repository_url: str | None = None


@dataclass(slots=True)
class AgentResult:
    agent_name: str
    response_text: str


class RelayAgent(ABC):
    name: str
    agent_type: str
    description: str

    @abstractmethod
    def can_handle(self, request: AgentRequest) -> bool:
        raise NotImplementedError

    @abstractmethod
    def handle(self, request: AgentRequest) -> AgentResult:
        raise NotImplementedError
