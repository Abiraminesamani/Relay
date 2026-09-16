from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from app.agents.base import AgentRequest, AgentResult, RelayAgent
from app.config import settings
from app.services import jira_service
from app.services.jira_service import (
    JiraAuthError,
    JiraConfigError,
    JiraNetworkError,
    JiraNotFoundError,
    JiraPermissionError,
    JiraValidationError,
)

logger = logging.getLogger(__name__)


class JiraAgent(RelayAgent):
    name = "Jira Agent"
    agent_type = "jira"
    description = "Creates real Jira tickets in Jira Cloud, tracks sprint issues, and synchronizes issue lifecycles via Jira REST API."

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
            "create story ticket",
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


def get_repository_jira_project_key(repository_url: str | None) -> str | None:
    """Retrieve repository's configured jira_project_key from database."""
    if not repository_url:
        return None
    try:
        from app.db.models import Repository
        from app.db.session import SessionLocal

        clean_url = repository_url.strip().rstrip("/").removesuffix(".git")
        db = SessionLocal()
        try:
            repo = (
                db.query(Repository)
                .filter(
                    (Repository.repo_url == repository_url.strip())
                    | (Repository.repo_url == clean_url)
                    | (Repository.repo_url == clean_url + ".git")
                )
                .first()
            )
            if repo and repo.jira_project_key and repo.jira_project_key.strip():
                return repo.jira_project_key.strip().upper()
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Failed to query repository jira_project_key: %s", exc)
    return None


def _extract_project_key(question: str, repository_url: str | None = None) -> str:
    """Determine target Jira project key following repository-aware priority."""
    # 1. Explicit project in query (e.g. "in project SCRUM", "project FRONT", "[FRONT]")
    match = re.search(r"\bproject\s+([A-Z0-9]{2,10})\b", question, re.IGNORECASE)
    if match:
        return match.group(1).upper()

    match_bracket = re.search(r"\[([A-Z0-9]{2,10})\]", question)
    if match_bracket:
        return match_bracket.group(1).upper()

    # 2. Selected repository's configured jira_project_key
    repo_jira_key = get_repository_jira_project_key(repository_url)
    if repo_jira_key:
        return repo_jira_key

    # 3. Global fallback from settings (e.g. JIRA_DEFAULT_PROJECT_KEY=SCRUM)
    if settings.jira_default_project_key and settings.jira_default_project_key.strip():
        return settings.jira_default_project_key.strip().upper()

    # 4. If neither exists, raise clear config error
    raise JiraConfigError(
        "No Jira project key is configured for the selected repository or globally in JIRA_DEFAULT_PROJECT_KEY."
    )


def process_jira_request(question: str, repository_url: str | None = None) -> str:
    """Process natural language request to create or search real Jira Cloud issues."""
    text_lower = question.casefold()
    project_key = _extract_project_key(question, repository_url)
    repo_name = repository_url.split("/")[-1].replace(".git", "") if repository_url else project_key

    # 1. Action: Search / List Sprint Tickets
    is_search = any(
        k in text_lower
        for k in [
            "sprint",
            "list",
            "show tickets",
            "show issues",
            "search tickets",
            "search issues",
            "open tickets",
            "open issues",
            "backlog",
            "status of tickets",
        ]
    ) and not any(k in text_lower for k in ["create", "generate", "draft", "open a ticket", "new ticket", "file"])

    if is_search:
        try:
            search_result = jira_service.search_jira_issues(project_key=project_key)
            issues = search_result.get("issues", [])
            total = search_result.get("total", len(issues))

            if not issues:
                return (
                    f"### Jira Project Issues ({project_key})\n\n"
                    f"No open issues found in Jira project **`{project_key}`**.\n\n"
                    f"> To create a new ticket, type: `Create a Jira bug ticket for [summary]`"
                )

            table_rows = []
            for issue in issues:
                key_link = f"[{issue['key']}]({issue['url']})"
                summary_safe = issue["summary"].replace("|", "\\|")
                table_rows.append(
                    f"| **{key_link}** | `{issue['type']}` | {summary_safe} | `{issue['priority']}` | `{issue['status']}` | {issue['assignee']} |"
                )

            rows_str = "\n".join(table_rows)
            return (
                f"### Active Jira Issues ({project_key})\n\n"
                f"Found **{total}** issues in Jira project **`{project_key}`**:\n\n"
                f"| Issue Key | Type | Summary | Priority | Status | Assignee |\n"
                f"| :--- | :--- | :--- | :--- | :--- | :--- |\n"
                f"{rows_str}\n\n"
                f"> Click on any issue key above to open it directly in Jira Cloud."
            )
        except JiraConfigError as exc:
            return _format_config_error(str(exc))
        except JiraAuthError as exc:
            return _format_auth_error(str(exc))
        except JiraPermissionError as exc:
            return _format_permission_error(str(exc))
        except JiraNotFoundError as exc:
            return _format_not_found_error(str(exc))
        except JiraNetworkError as exc:
            return _format_network_error(str(exc))
        except Exception as exc:
            logger.exception("Jira search failed")
            safe_msg = _sanitize_error(str(exc))
            return f"### ❌ Jira Search Failed\n\nUnable to retrieve issues from Jira Cloud: {safe_msg}"

    # 2. Action: Create Jira Issue
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

    # Clean extract summary using regex
    cleaned_summary = re.sub(
        r"(?i)^(create|generate|draft|file|open|add|make)\s+(a\s+)?(high\s+|low\s+|medium\s+|highest\s+)?(priority\s+)?(jira\s+)?(bug\s+|task\s+|user\s+story\s+|story\s+|epic\s+|ticket\s+|issue\s+)*(for\s+|to\s+|about\s+)?",
        "",
        question.strip(),
    ).strip()
    # Strip trailing project specifiers if present, e.g. "in project SCRUM." or "for project SCRUM"
    cleaned_summary = re.sub(r"(?i)\s+(in|for|under)\s+project\s+[A-Z0-9_-]+\.?$", "", cleaned_summary).strip()
    cleaned_summary = cleaned_summary.rstrip(". ")
    summary = cleaned_summary[:120].strip() if cleaned_summary else f"Engineering item for {repo_name}"

    # Generate tailored description based on issue type
    if issue_type == "Story":
        description_text = (
            f"User Story:\n"
            f"As a Developer / System User\n"
            f"I want to: {summary}\n"
            f"So that: The application maintains stability, performance, and user satisfaction.\n\n"
            f"Acceptance Criteria:\n"
            f"1. Implement required workflows and state management for {summary}.\n"
            f"2. Add automated unit and integration tests.\n"
            f"3. Verify zero regressions across dependent services."
        )
    elif issue_type == "Bug":
        description_text = (
            f"Bug Report:\n"
            f"Issue: {summary}\n"
            f"Context: Detected in repository {repo_name}.\n"
            f"Severity: {priority}\n\n"
            f"Steps to Reproduce & Resolve:\n"
            f"1. Reproduce regression failure using integration test suite.\n"
            f"2. Apply fix in target controllers/services.\n"
            f"3. Execute automated regression checks and verify fix.\n"
            f"4. Submit pull request linked to Jira issue."
        )
    else:
        description_text = (
            f"Task Description:\n"
            f"Objective: {summary}\n"
            f"Repository: {repo_name}\n\n"
            f"Acceptance Criteria:\n"
            f"1. Implement required architectural and logic changes.\n"
            f"2. Run automated test suite and AST impact validation."
        )

    # Call real Jira Cloud API service
    try:
        result = jira_service.create_jira_issue(
            project_key=project_key,
            summary=summary,
            description=description_text,
            issue_type=issue_type,
            priority=priority,
        )

        real_key = result["key"]
        real_url = result["url"]
        real_type = result["issue_type"]
        real_priority = result["priority"]
        res_note = result.get("resolution_note", "")

        type_display = f"`{real_type}`"
        if res_note:
            type_display += f" *{res_note}*"

        return (
            f"### Jira Issue Created Successfully\n\n"
            f"| Attribute | Details |\n"
            f"| :--- | :--- |\n"
            f"| **Issue Key** | **[{real_key}]({real_url})** |\n"
            f"| **Type** | {type_display} |\n"
            f"| **Priority** | `{real_priority}` |\n"
            f"| **Status** | `To Do` |\n"
            f"| **Project** | `{project_key}` |\n"
            f"| **Summary** | {summary} |\n"
            f"| **Jira URL** | [{real_url}]({real_url}) |\n\n"
            f"#### Issue Description & Acceptance Criteria\n"
            f"```text\n"
            f"{description_text}\n"
            f"```\n\n"
            f"> The issue has been created in your Jira Cloud instance. Click **[{real_key}]({real_url})** to view it."
        )

    except JiraConfigError as exc:
        return _format_config_error(str(exc))
    except JiraAuthError as exc:
        return _format_auth_error(str(exc))
    except JiraPermissionError as exc:
        return _format_permission_error(str(exc))
    except JiraNotFoundError as exc:
        return _format_not_found_error(str(exc))
    except JiraValidationError as exc:
        return _format_validation_error(str(exc))
    except JiraNetworkError as exc:
        return _format_network_error(str(exc))
    except Exception as exc:
        logger.exception("Jira issue creation failed")
        safe_msg = _sanitize_error(str(exc))
        return (
            f"### ❌ Jira Issue Creation Failed\n\n"
            f"An unexpected error occurred while communicating with Jira Cloud:\n"
            f"> {safe_msg}\n\n"
            f"Please verify your Jira Cloud configuration and network connectivity."
        )


def _sanitize_error(msg: str) -> str:
    cleaned = str(msg)
    token = settings.jira_api_token.strip() if hasattr(settings, "jira_api_token") else ""
    if token and len(token) > 4 and token in cleaned:
        cleaned = cleaned.replace(token, "[REDACTED]")
    return cleaned


def _format_config_error(message: str) -> str:
    return (
        f"### ⚠️ Jira Integration Not Configured\n\n"
        f"Relay requires Jira Cloud API credentials to create and manage real Jira issues.\n\n"
        f"**Setup Instructions**:\n"
        f"Add the following variables to your `backend/.env` file:\n\n"
        f"```env\n"
        f"JIRA_BASE_URL=https://your-domain.atlassian.net\n"
        f"JIRA_EMAIL=your-email@company.com\n"
        f"JIRA_API_TOKEN=your-atlassian-api-token\n"
        f"JIRA_DEFAULT_PROJECT_KEY=SMAR\n"
        f"```\n\n"
        f"1. Generate an API token at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).\n"
        f"2. Ensure your Jira user has permission to create issues in the target project.\n"
        f"3. Restart the Relay backend server after updating `.env`."
    )


def _format_auth_error(message: str) -> str:
    return (
        f"### ❌ Jira Authentication Failed (HTTP 401)\n\n"
        f"Relay could not authenticate with Jira Cloud.\n\n"
        f"**Troubleshooting Checklist**:\n"
        f"- Verify that `JIRA_EMAIL` in `backend/.env` matches your Atlassian account email.\n"
        f"- Verify that `JIRA_API_TOKEN` is a valid API token from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).\n"
        f"- Ensure `JIRA_BASE_URL` is in the format `https://<site-name>.atlassian.net` (without trailing path)."
    )


def _format_permission_error(message: str) -> str:
    return (
        f"### ❌ Jira Permission Denied (HTTP 403)\n\n"
        f"{message}\n\n"
        f"Please check that your Atlassian account has **Create Issues** and **Browse Project** permissions in the target Jira project."
    )


def _format_not_found_error(message: str) -> str:
    return (
        f"### ❌ Jira Project Not Found (HTTP 404)\n\n"
        f"{message}\n\n"
        f"Please check that the project key exists in your Jira Cloud instance and that `JIRA_BASE_URL` is correct."
    )


def _format_validation_error(message: str) -> str:
    return (
        f"### ❌ Jira Payload Rejected (HTTP 400)\n\n"
        f"{message}\n\n"
        f"Please check that the target project supports the requested issue type and fields."
    )


def _format_network_error(message: str) -> str:
    return (
        f"### ❌ Jira Connection Error\n\n"
        f"{message}\n\n"
        f"Unable to connect to Jira Cloud. Please check your internet connection and verify that your Jira site URL is reachable."
    )
