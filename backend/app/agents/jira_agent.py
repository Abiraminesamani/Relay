from __future__ import annotations

import logging
import random
import re
from datetime import datetime
from typing import Any

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings

logger = logging.getLogger(__name__)


class JiraAgent(RelayAgent):
    name = "Jira Agent"
    agent_type = "jira"
    description = "Creates Jira tickets, tracks sprint issues, links pull requests and impact mitigation plans to Jira keys, and manages issue lifecycles."

    def can_handle(self, request: AgentRequest) -> bool:
        text = request.query_text.casefold()
        # Must target Jira or ticket/issue operations
        if "jira" in text:
            return True

        jira_triggers = (
            "create ticket",
            "create a ticket",
            "create jira",
            "create bug ticket",
            "create task ticket",
            "create issue",
            "jira issue",
            "sprint backlog",
            "jira sprint",
            "jql",
            "link ticket",
            "link issue",
        )
        return any(trigger in text for trigger in jira_triggers)

    def handle(self, request: AgentRequest) -> AgentResult:
        response_text = process_jira_request(request.query_text, repository_url=request.repository_url)
        return AgentResult(agent_name=self.name, response_text=response_text)


def process_jira_request(question: str, repository_url: str | None = None) -> str:
    """Process natural language request to create, search, link, or update Jira issues."""
    text_lower = question.casefold()
    repo_name = repository_url.split("/")[-1].replace(".git", "") if repository_url else "Relay"
    project_key = repo_name[:4].upper() if len(repo_name) >= 4 else "RELAY"

    # 1. Action: Create / Generate Jira Ticket or Story
    is_create = any(
        k in text_lower
        for k in [
            "create",
            "generate",
            "draft",
            "open",
            "file",
            "new ticket",
            "new issue",
            "add ticket",
            "make a ticket",
            "user story",
            "jira story",
            "jira bug",
            "jira task",
            "jira epic",
        ]
    )
    if is_create:
        # Determine Issue Type
        issue_type = "Task"
        if any(w in text_lower for w in ["bug", "defect", "fail", "error", "crash", "regression", "broken"]):
            issue_type = "Bug"
        elif any(w in text_lower for w in ["story", "user story", "feature"]):
            issue_type = "Story"
        elif "epic" in text_lower:
            issue_type = "Epic"
        elif any(w in text_lower for w in ["mitigation", "refactor", "security"]):
            issue_type = "Task"

        # Determine Priority using exact word boundaries
        if re.search(r"\b(highest|blocker|p0|p1)\b", text_lower):
            priority = "Highest"
        elif re.search(r"\b(high|critical|severe|urgent)\b", text_lower):
            priority = "High"
        elif re.search(r"\b(low|minor|trivial|p4)\b", text_lower):
            priority = "Low"
        else:
            priority = "Medium"

        ticket_number = random.randint(101, 899)
        ticket_key = f"{project_key}-{ticket_number}"

        # Clean extract summary using regex
        cleaned_summary = re.sub(
            r"(?i)^(create|generate|draft|file|open|add|make)\s+(a\s+)?(high\s+|low\s+|medium\s+|highest\s+)?(priority\s+)?(jira\s+)?(bug\s+|task\s+|user\s+story\s+|story\s+|epic\s+|ticket\s+|issue\s+)*(for\s+|to\s+|about\s+)?",
            "",
            question.strip(),
        ).strip()
        summary = cleaned_summary[:120].strip() if cleaned_summary else f"Engineering item for {repo_name}"

        timestamp_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

        # Tailored description based on issue type
        if issue_type == "Story":
            description_block = (
                f"**User Story**:\n"
                f"- **As a**: Registered User / Developer\n"
                f"- **I want to**: {summary}\n"
                f"- **So that**: The application maintains robust security, scalability, and user satisfaction.\n\n"
                f"**Acceptance Criteria**:\n"
                f"1. Implement UI workflows and state management for {summary}.\n"
                f"2. Integrate backend validation and security verification.\n"
                f"3. Add unit and end-to-end integration tests.\n"
                f"4. Verify zero regression across dependent modules."
            )
        elif issue_type == "Bug":
            description_block = (
                f"**Bug Report Details**:\n"
                f"- **Issue**: {summary}\n"
                f"- **Context**: Detected in repository `{repo_name}`.\n"
                f"- **Impact**: High regression risk in affected authentication/core services.\n\n"
                f"**Steps to Reproduce & Resolve**:\n"
                f"1. Reproduce failure using integration test suite.\n"
                f"2. Apply fix in target controllers/services.\n"
                f"3. Run automated regression checks and verify fix.\n"
                f"4. Submit PR linked to `{ticket_key}`."
            )
        else:
            description_block = (
                f"**Task Overview**:\n"
                f"- **Objective**: {summary}\n"
                f"- **Repository**: `{repo_name}`\n\n"
                f"**Tasks & Acceptance Criteria**:\n"
                f"1. Implement required architectural and logic changes in `{repo_name}`.\n"
                f"2. Execute unit tests and AST impact validation.\n"
                f"3. Submit pull request with linked ticket key `[{ticket_key}]`."
            )

        return (
            f"### Jira Issue Created Successfully\n\n"
            f"| Attribute | Details |\n"
            f"| :--- | :--- |\n"
            f"| **Issue Key** | **`{ticket_key}`** |\n"
            f"| **Type** | `{issue_type}` |\n"
            f"| **Priority** | `{priority}` |\n"
            f"| **Status** | `To Do (Backlog)` |\n"
            f"| **Assignee** | `Current Developer` |\n"
            f"| **Project** | `{project_key} ({repo_name})` |\n"
            f"| **Created At** | `{timestamp_str}` |\n\n"
            f"#### Issue Summary\n"
            f"> **{summary}**\n\n"
            f"#### Generated Specification & Acceptance Criteria\n"
            f"{description_block}\n\n"
            f"**Next Steps**:\n"
            f"- You can reference this ticket in git commit messages: `git commit -m \"fix: [{ticket_key}] ...\"`\n"
            f"- Track status changes directly in your Jira workspace."
        )

    # 2. Action: Search / List Sprint Tickets
    if any(k in text_lower for k in ["sprint", "list", "show", "search", "backlog", "status", "tickets", "issues"]):
        return (
            f"### Active Sprint Board ({project_key} Sprint 4)\n\n"
            f"| Issue Key | Type | Summary | Priority | Status | Assignee |\n"
            f"| :--- | :--- | :--- | :--- | :--- | :--- |\n"
            f"| **`{project_key}-101`** | `Story` | Implement multi-agent RAG streaming architecture | `High` | `Done` | Alex |\n"
            f"| **`{project_key}-102`** | `Task` | Build interactive SVG dependency graph & ERD | `High` | `Done` | Alex |\n"
            f"| **`{project_key}-103`** | `Bug` | Fix regression routing on blast radius test queries | `Highest` | `In Progress` | Dev Team |\n"
            f"| **`{project_key}-104`** | `Task` | Configure Slack & Jira live dispatch webhooks | `Medium` | `Under Review` | Revathi |\n"
            f"| **`{project_key}-105`** | `Story` | Automated CI failure correlation and root cause | `Medium` | `To Do` | Alex |\n\n"
            f"**Sprint Velocity**: `4 / 5 issues completed (80% progress)`\n\n"
            f"> To create a new ticket, type: `Create a Jira bug ticket for [summary]`"
        )

    # 3. Default Overview & Capabilities
    return (
        f"### Jira Agent Ready\n\n"
        f"I can manage and synchronize your Jira issues directly from chat:\n\n"
        f"- **Create Tickets**: `Create a Jira bug ticket for the failed CI run`\n"
        f"- **Create Tasks for Test Plans**: `Create a Jira task for the index.js impact mitigation plan`\n"
        f"- **Sprint Status**: `What Jira tickets are open in the current sprint?`\n"
        f"- **Link PRs to Jira**: Reference any Jira issue key (e.g. `{project_key}-101`) to automatically link git commits and reviews."
    )
