from __future__ import annotations

import logging
from typing import Any
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class JiraError(Exception):
    """Base Jira integration error."""


class JiraConfigError(JiraError):
    """Raised when Jira configuration is missing or incomplete."""


class JiraAuthError(JiraError):
    """Raised when Jira authentication fails (HTTP 401)."""


class JiraPermissionError(JiraError):
    """Raised when Jira user lacks permissions (HTTP 403)."""


class JiraNotFoundError(JiraError):
    """Raised when Jira project or endpoint is not found (HTTP 404)."""


class JiraValidationError(JiraError):
    """Raised when Jira rejects the payload (HTTP 400)."""


class JiraNetworkError(JiraError):
    """Raised when network connectivity to Jira fails."""


# In-memory cache for project issue types to minimize Jira API round trips
_PROJECT_ISSUE_TYPES_CACHE: dict[str, list[dict[str, Any]]] = {}

_ISSUE_TYPE_SYNONYMS: dict[str, list[str]] = {
    "bug": ["bug", "defect", "problem", "incident", "issue", "fault", "flaw", "regression"],
    "story": ["story", "user story", "feature", "requirement", "enhancement"],
    "epic": ["epic", "initiative", "theme"],
    "task": ["task", "item", "work item", "action item", "chore"],
}


def _get_clean_base_url() -> str:
    base = settings.jira_base_url.strip()
    return base.rstrip("/")


def _get_auth() -> tuple[str, str]:
    if not settings.is_jira_configured:
        raise JiraConfigError(
            "Jira integration is not configured. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in backend/.env."
        )
    return (settings.jira_email.strip(), settings.jira_api_token.strip())


def _build_adf_description(description_text: str) -> dict[str, Any]:
    """Convert text into Jira Cloud Atlassian Document Format (ADF) for REST API v3."""
    paragraphs = []
    lines = [line for line in description_text.split("\n") if line.strip()]
    if not lines:
        lines = [description_text or "No description provided."]

    for line in lines:
        paragraphs.append({
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "text": line.strip(),
                }
            ],
        })

    return {
        "version": 1,
        "type": "doc",
        "content": paragraphs,
    }


def get_project_issue_types(project_key: str | None = None, force_refresh: bool = False) -> list[dict[str, Any]]:
    """
    Retrieve available issue types for a given Jira project.
    Uses createmeta endpoint first, falling back to project endpoint.
    """
    auth = _get_auth()
    base_url = _get_clean_base_url()
    clean_project = (project_key or settings.jira_default_project_key or "SMAR").strip().upper()

    if not force_refresh and clean_project in _PROJECT_ISSUE_TYPES_CACHE:
        return _PROJECT_ISSUE_TYPES_CACHE[clean_project]

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            # 1. Primary: createmeta issuetypes
            url = f"{base_url}/rest/api/3/issue/createmeta/{clean_project}/issuetypes"
            res = client.get(url, auth=auth, headers=headers)
            if res.status_code == 200:
                data = res.json()
                types = data.get("issueTypes", [])
                if types:
                    _PROJECT_ISSUE_TYPES_CACHE[clean_project] = types
                    return types

            # 2. Fallback: project details
            url_project = f"{base_url}/rest/api/3/project/{clean_project}"
            res_project = client.get(url_project, auth=auth, headers=headers)
            if res_project.status_code == 200:
                data_project = res_project.json()
                types = data_project.get("issueTypes", [])
                if types:
                    _PROJECT_ISSUE_TYPES_CACHE[clean_project] = types
                    return types
    except Exception as exc:
        logger.warning("Failed to fetch Jira issue types for project '%s': %s", clean_project, exc)

    return _PROJECT_ISSUE_TYPES_CACHE.get(clean_project, [])


def resolve_project_issue_type(
    project_key: str,
    requested_type: str = "Task",
) -> tuple[str, str, str]:
    """
    Resolve a user requested issue type against valid issue types in the target Jira project.
    Returns:
        (issue_type_id, issue_type_name, resolution_note)
        - issue_type_id: string ID if resolved from project createmeta, else empty string
        - issue_type_name: standard Jira issue type name
        - resolution_note: explanation if resolved via fallback
    """
    clean_project = (project_key or settings.jira_default_project_key or "SMAR").strip().upper()
    req_clean = requested_type.strip().lower()

    try:
        available_types = get_project_issue_types(clean_project)
    except Exception:
        available_types = []

    # Filter out subtasks unless subtask was specifically requested
    non_subtasks = [t for t in available_types if not t.get("subtask", False)]
    if not non_subtasks:
        non_subtasks = available_types

    if not non_subtasks:
        # Fallback when metadata cannot be retrieved
        norm_name = requested_type.capitalize()
        if norm_name not in ["Bug", "Task", "Story", "Epic"]:
            norm_name = "Task"
        return ("", norm_name, "")

    # 1. Exact match (case-insensitive name or untranslatedName)
    for t in non_subtasks:
        name = t.get("name", "").strip().lower()
        untranslated = t.get("untranslatedName", "").strip().lower()
        if req_clean in (name, untranslated):
            return (str(t.get("id", "")), t.get("name", ""), "")

    # 2. Synonym / Category match
    target_category = None
    for category, synonyms in _ISSUE_TYPE_SYNONYMS.items():
        if req_clean in synonyms:
            target_category = category
            break

    if target_category:
        cat_synonyms = _ISSUE_TYPE_SYNONYMS[target_category]
        for t in non_subtasks:
            name = t.get("name", "").strip().lower()
            untranslated = t.get("untranslatedName", "").strip().lower()
            if name in cat_synonyms or untranslated in cat_synonyms:
                return (str(t.get("id", "")), t.get("name", ""), "")

    # 3. Intelligent fallback to standard issue types in project
    # Priority: Task -> Story -> Epic -> First available non-subtask
    fallback_candidates = ["task", "story", "epic"]
    for candidate in fallback_candidates:
        candidate_type = next(
            (t for t in non_subtasks if t.get("name", "").strip().lower() == candidate),
            None,
        )
        if candidate_type:
            orig_name = requested_type.capitalize()
            res_name = candidate_type.get("name", "Task")
            note = f"(Requested as '{orig_name}', assigned to project standard type '{res_name}')"
            return (str(candidate_type.get("id", "")), res_name, note)

    first_type = non_subtasks[0]
    orig_name = requested_type.capitalize()
    res_name = first_type.get("name", "Task")
    note = f"(Requested as '{orig_name}', assigned to project standard type '{res_name}')"
    return (str(first_type.get("id", "")), res_name, note)


def verify_jira_connectivity(project_key: str | None = None) -> dict[str, Any]:
    """Verify connectivity and permissions against Jira Cloud without creating test issues."""
    auth = _get_auth()
    base_url = _get_clean_base_url()
    target_project = (project_key or settings.jira_default_project_key or "SMAR").strip().upper()

    url = f"{base_url}/rest/api/3/project/{target_project}"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(url, auth=auth, headers=headers)
            if res.status_code == 401:
                raise JiraAuthError("Jira authentication failed. Please verify your JIRA_EMAIL and JIRA_API_TOKEN.")
            elif res.status_code == 403:
                raise JiraPermissionError(f"Jira account does not have permission to access project '{target_project}'.")
            elif res.status_code == 404:
                raise JiraNotFoundError(f"Jira project '{target_project}' was not found at {base_url}.")
            res.raise_for_status()
            data = res.json()
            issue_types = [t.get("name") for t in data.get("issueTypes", []) if t.get("name")]
            return {
                "success": True,
                "project_key": data.get("key", target_project),
                "project_name": data.get("name", ""),
                "project_id": data.get("id", ""),
                "issue_types": issue_types,
            }
    except (JiraAuthError, JiraPermissionError, JiraNotFoundError):
        raise
    except httpx.HTTPStatusError as exc:
        raise JiraValidationError(f"Jira API returned HTTP {exc.response.status_code}")
    except (httpx.TimeoutException, httpx.ConnectError, httpx.RequestError) as exc:
        logger.warning("Failed to connect to Jira Cloud: %s", type(exc).__name__)
        raise JiraNetworkError(f"Unable to connect to Jira Cloud instance at '{base_url}'.")


def get_project_metadata(project_key: str | None = None) -> dict[str, Any]:
    """Retrieve issue types and metadata for a Jira project."""
    return verify_jira_connectivity(project_key)


def create_jira_issue(
    project_key: str,
    summary: str,
    description: str,
    issue_type: str = "Task",
    priority: str | None = None,
) -> dict[str, Any]:
    """
    Create an actual issue in Jira Cloud using REST API v3.
    Dynamically resolves the issue type against available project issue types.
    Returns dictionary with issue key, id, and direct browse URL.
    """
    auth = _get_auth()
    base_url = _get_clean_base_url()
    clean_project = (project_key or settings.jira_default_project_key or "SMAR").strip().upper()

    # Dynamically resolve issue type against target Jira project
    type_id, resolved_type, resolution_note = resolve_project_issue_type(clean_project, issue_type)

    issuetype_field: dict[str, str] = {}
    if type_id:
        issuetype_field["id"] = type_id
    else:
        issuetype_field["name"] = resolved_type

    fields: dict[str, Any] = {
        "project": {"key": clean_project},
        "summary": summary[:250].strip() or f"Engineering Task for {clean_project}",
        "description": _build_adf_description(description),
        "issuetype": issuetype_field,
    }

    if priority:
        fields["priority"] = {"name": priority.capitalize()}

    payload = {"fields": fields}
    url = f"{base_url}/rest/api/3/issue"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.post(url, json=payload, auth=auth, headers=headers)

            if res.status_code == 401:
                raise JiraAuthError("Jira authentication failed. Please verify your JIRA_EMAIL and JIRA_API_TOKEN.")
            elif res.status_code == 403:
                raise JiraPermissionError(f"Jira account does not have permission to create issues in project '{clean_project}'.")
            elif res.status_code == 404:
                raise JiraNotFoundError(f"Jira project '{clean_project}' or endpoint was not found at {base_url}.")
            elif res.status_code == 400:
                err_msg = "Invalid issue payload."
                try:
                    err_json = res.json()
                    errors = err_json.get("errorMessages", [])
                    field_errors = [f"{k}: {v}" for k, v in err_json.get("errors", {}).items()]
                    combined = errors + field_errors
                    if combined:
                        err_msg = "; ".join(combined)
                except Exception:
                    pass
                raise JiraValidationError(f"Jira rejected the issue payload: {err_msg}")

            res.raise_for_status()
            data = res.json()

            issue_key = data.get("key", "")
            issue_id = data.get("id", "")
            issue_url = f"{base_url}/browse/{issue_key}" if issue_key else base_url

            return {
                "success": True,
                "key": issue_key,
                "id": issue_id,
                "url": issue_url,
                "project_key": clean_project,
                "issue_type": resolved_type,
                "requested_type": issue_type,
                "resolution_note": resolution_note,
                "priority": priority or "Medium",
                "summary": summary,
            }
    except (JiraAuthError, JiraPermissionError, JiraNotFoundError, JiraValidationError):
        raise
    except httpx.HTTPStatusError as exc:
        raise JiraValidationError(f"Jira API request failed with status {exc.response.status_code}")
    except (httpx.TimeoutException, httpx.ConnectError, httpx.RequestError) as exc:
        logger.warning("Jira network error: %s", type(exc).__name__)
        raise JiraNetworkError(f"Unable to connect to Jira Cloud instance at '{base_url}'.")


def search_jira_issues(
    project_key: str | None = None,
    jql: str | None = None,
    max_results: int = 10,
) -> dict[str, Any]:
    """Search issues in Jira Cloud using JQL via REST API v3 search/jql endpoint."""
    auth = _get_auth()
    base_url = _get_clean_base_url()
    clean_project = (project_key or settings.jira_default_project_key or "SMAR").strip().upper()

    query_jql = jql or f"project = '{clean_project}' ORDER BY created DESC"
    url = f"{base_url}/rest/api/3/search/jql"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "jql": query_jql,
        "maxResults": max_results,
        "fields": ["summary", "status", "issuetype", "priority", "assignee", "created"],
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.post(url, json=payload, auth=auth, headers=headers)
            if res.status_code == 401:
                raise JiraAuthError("Jira authentication failed. Please verify your JIRA_EMAIL and JIRA_API_TOKEN.")
            elif res.status_code == 403:
                raise JiraPermissionError(f"Jira account does not have permission to view issues in project '{clean_project}'.")
            elif res.status_code == 404:
                raise JiraNotFoundError(f"Jira project '{clean_project}' was not found at {base_url}.")
            res.raise_for_status()
            data = res.json()

            issues = []
            for item in data.get("issues", []):
                fields = item.get("fields", {})
                issues.append({
                    "key": item.get("key", ""),
                    "summary": fields.get("summary", ""),
                    "status": fields.get("status", {}).get("name", "Unknown"),
                    "type": fields.get("issuetype", {}).get("name", "Task"),
                    "priority": fields.get("priority", {}).get("name", "Medium"),
                    "assignee": fields.get("assignee", {}).get("displayName", "Unassigned") if fields.get("assignee") else "Unassigned",
                    "url": f"{base_url}/browse/{item.get('key', '')}",
                })

            return {
                "success": True,
                "total": data.get("total", len(issues)),
                "issues": issues,
                "project_key": clean_project,
            }
    except (JiraAuthError, JiraPermissionError, JiraNotFoundError):
        raise
    except httpx.HTTPStatusError as exc:
        raise JiraValidationError(f"Jira search request failed with status {exc.response.status_code}")
    except (httpx.TimeoutException, httpx.ConnectError, httpx.RequestError) as exc:
        logger.warning("Jira network error: %s", type(exc).__name__)
        raise JiraNetworkError(f"Unable to connect to Jira Cloud instance at '{base_url}'.")
