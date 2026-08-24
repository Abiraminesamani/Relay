from __future__ import annotations

import asyncio
from typing import AsyncGenerator, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.base import AgentRequest, AgentResult
from app.agents.ci_correlation_agent import CICorrelationAgent
from app.agents.code_rag_agent import CodeAgent
from app.agents.github_agent import GitHubAgent
from app.agents.pr_review_agent import PRReviewAgent


class OrchestrationState(TypedDict):
    request: AgentRequest
    route: str
    result: AgentResult | None


github_agent = GitHubAgent()
ci_agent = CICorrelationAgent()
code_agent = CodeAgent()
pr_review_agent = PRReviewAgent()


def _analyze_intent(state: OrchestrationState) -> OrchestrationState:
    if pr_review_agent.can_handle(state["request"]):
        state["route"] = "pr_review"
    elif ci_agent.can_handle(state["request"]):
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
    state["result"] = code_agent.handle(state["request"])
    return state


def _run_pr_review_agent(state: OrchestrationState) -> OrchestrationState:
    state["result"] = pr_review_agent.handle(state["request"])
    return state


def _route(state: OrchestrationState) -> str:
    return state["route"]


graph = StateGraph(OrchestrationState)
graph.add_node("analyze_intent", _analyze_intent)
graph.add_node("github", _run_github_agent)
graph.add_node("ci", _run_ci_agent)
graph.add_node("code", _run_code_agent)
graph.add_node("pr_review", _run_pr_review_agent)
graph.add_edge(START, "analyze_intent")
graph.add_conditional_edges(
    "analyze_intent",
    _route,
    {
        "github": "github",
        "ci": "ci",
        "code": "code",
        "pr_review": "pr_review",
    },
)
graph.add_edge("github", END)
graph.add_edge("ci", END)
graph.add_edge("code", END)
graph.add_edge("pr_review", END)
orchestrator = graph.compile()


def route_query(query_text: str, repository_url: str | None = None) -> AgentResult:
    request = AgentRequest(query_text=query_text.strip(), repository_url=repository_url)
    if not request.query_text:
        return AgentResult(
            agent_name="Code Agent",
            response_text="Please ask a question about your repository, GitHub activity, pull requests, or CI/CD pipeline.",
        )

    result = orchestrator.invoke({"request": request, "route": "code", "result": None})
    return result["result"] or AgentResult(agent_name="Code Agent", response_text="No response was produced.")


async def stream_route_query(
    query_text: str,
    repository_url: str | None = None,
    agent_type: str | None = None,
) -> AsyncGenerator[dict, None]:
    """Stream thought steps and response tokens for a user query via Server-Sent Events."""
    cleaned_query = query_text.strip()
    if not cleaned_query:
        yield {"type": "error", "message": "Query text cannot be empty."}
        return

    request = AgentRequest(query_text=cleaned_query, repository_url=repository_url)

    yield {"type": "step", "step": "🧠 Analyzing query semantics and user intent..."}
    await asyncio.sleep(0.05)

    # Determine target agent
    if agent_type == "pr_review" or (not agent_type and pr_review_agent.can_handle(request)):
        target_agent = pr_review_agent
        yield {"type": "step", "step": "🔍 Directing to PR Review Agent for code diff inspection"}
        yield {"type": "step", "step": "📄 Fetching pull request files and patches via GitHub API..."}
    elif agent_type == "ci" or (not agent_type and ci_agent.can_handle(request)):
        target_agent = ci_agent
        yield {"type": "step", "step": "⚙️ Directing to CI/CD Agent for Actions failure analysis"}
        yield {"type": "step", "step": "📊 Fetching workflow runs, job logs, and failure traces..."}
    elif agent_type == "github" or (not agent_type and github_agent.can_handle(request)):
        target_agent = github_agent
        yield {"type": "step", "step": "🐙 Directing to GitHub Agent for metadata & branch lookup"}
        yield {"type": "step", "step": "🌐 Fetching repository overview, commits, and pull requests..."}
    else:
        target_agent = code_agent
        yield {"type": "step", "step": "⚡ Directing to Code / RAG Agent for semantic analysis"}
        yield {"type": "step", "step": "📂 Querying ChromaDB vector collections and code AST..."}

    await asyncio.sleep(0.05)

    # Execute agent in background thread pool to avoid blocking the event loop
    try:
        agent_result: AgentResult = await asyncio.to_thread(target_agent.handle, request)
    except Exception as exc:
        yield {"type": "error", "message": f"Agent execution encountered an error: {exc}"}
        return

    yield {"type": "step", "step": f"✨ Synthesizing grounded response ({agent_result.agent_name})"}
    await asyncio.sleep(0.05)

    # Stream the tokens in chunks
    full_text = agent_result.response_text or ""
    words = full_text.split(" ")
    chunk_size = 4

    for i in range(0, len(words), chunk_size):
        token_chunk = " ".join(words[i : i + chunk_size])
        if i + chunk_size < len(words):
            token_chunk += " "
        yield {"type": "token", "content": token_chunk}
        await asyncio.sleep(0.015)

    yield {
        "type": "done",
        "agent_name": agent_result.agent_name,
        "reply": full_text,
    }
