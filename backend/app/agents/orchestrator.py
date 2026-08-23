from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.base import AgentRequest, AgentResult
from app.agents.ci_correlation_agent import CICorrelationAgent
from app.agents.code_rag_agent import answer_code_question
from app.agents.github_agent import GitHubAgent


class OrchestrationState(TypedDict):
    request: AgentRequest
    route: str
    result: AgentResult | None


github_agent = GitHubAgent()
ci_agent = CICorrelationAgent()


def _analyze_intent(state: OrchestrationState) -> OrchestrationState:
    if ci_agent.can_handle(state["request"]):
        state["route"] = "ci"
    elif github_agent.can_handle(state["request"]):
        state["route"] = "github"
    else:
        state["route"] = "code"
    return state


def _run_github_agent(state: OrchestrationState) -> OrchestrationState:
    state["result"] = github_agent.handle(state["request"])
    return state


def _run_ci_agent(state: OrchestrationState) -> OrchestrationState:
    state["result"] = ci_agent.handle(state["request"])
    return state


def _run_code_agent(state: OrchestrationState) -> OrchestrationState:
    state["result"] = AgentResult(
        agent_name="Code Agent",
        response_text=answer_code_question(state["request"].query_text),
    )
    return state


def _route(state: OrchestrationState) -> str:
    return state["route"]


graph = StateGraph(OrchestrationState)
graph.add_node("analyze_intent", _analyze_intent)
graph.add_node("github", _run_github_agent)
graph.add_node("ci", _run_ci_agent)
graph.add_node("code", _run_code_agent)
graph.add_edge(START, "analyze_intent")
graph.add_conditional_edges("analyze_intent", _route, {"github": "github", "ci": "ci", "code": "code"})
graph.add_edge("github", END)
graph.add_edge("ci", END)
graph.add_edge("code", END)
orchestrator = graph.compile()


def route_query(query_text: str, repository_url: str | None = None) -> AgentResult:
    request = AgentRequest(query_text=query_text.strip(), repository_url=repository_url)
    if not request.query_text:
        return AgentResult(
            agent_name="Code Agent",
            response_text="Please ask a question about your repository, GitHub activity, or CI/CD pipeline.",
        )

    result = orchestrator.invoke({"request": request, "route": "code", "result": None})
    return result["result"] or AgentResult(agent_name="Code Agent", response_text="No response was produced.")
