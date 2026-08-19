from sqlalchemy.orm import Session

from app.db.models import Agent


DEFAULT_AGENTS = [
    {
        "name": "GitHub Agent",
        "type": "github",
        "description": "Handles GitHub repository metadata, branches, commits, and pull requests.",
    },
    {
        "name": "Code Agent",
        "type": "code",
        "description": "Handles codebase and RAG-oriented engineering questions.",
    },
    {
        "name": "Documentation Agent",
        "type": "documentation",
        "description": "Reserved interface for documentation retrieval and summarization.",
    },
    {
        "name": "Jira Agent",
        "type": "jira",
        "description": "Reserved interface for Jira issue and workflow queries.",
    },
    {
        "name": "Slack Agent",
        "type": "slack",
        "description": "Reserved interface for Slack message and incident context queries.",
    },
    {
        "name": "CI/CD Agent",
        "type": "ci_cd",
        "description": "Handles CI/CD workflow and pipeline failure investigations.",
    },
    {
        "name": "Monitoring Agent",
        "type": "monitoring",
        "description": "Reserved interface for observability and monitoring questions.",
    },
    {
        "name": "Analytics Agent",
        "type": "analytics",
        "description": "Reserved interface for engineering metrics and analytics questions.",
    },
]


def seed_agents(db: Session) -> None:
    existing_names = {agent.name for agent in db.query(Agent).all()}
    for payload in DEFAULT_AGENTS:
        if payload["name"] in existing_names:
            continue
        db.add(Agent(name=payload["name"], type=payload["type"], description=payload["description"]))
    db.commit()
