from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.github import (
    GitHubCommit,
    GitHubPullRequest,
    GitHubRepoMetadata,
    GitHubRepositoryOverview,
)


GITHUB_API_URL = "https://api.github.com"


@dataclass(slots=True)
class GitHubRepoCoordinates:
    owner: str
    repo: str


def get_repository_overview() -> GitHubRepositoryOverview:
    coordinates = _parse_repository_name()
    with _client() as client:
        repo_response = client.get(f"/repos/{coordinates.owner}/{coordinates.repo}")
        _raise_for_status(repo_response)

        branches_response = client.get(f"/repos/{coordinates.owner}/{coordinates.repo}/branches?per_page=10")
        _raise_for_status(branches_response)

        commits_response = client.get(f"/repos/{coordinates.owner}/{coordinates.repo}/commits?per_page=5")
        _raise_for_status(commits_response)

        pulls_response = client.get(f"/repos/{coordinates.owner}/{coordinates.repo}/pulls?state=all&per_page=5")
        _raise_for_status(pulls_response)

    repo_data = repo_response.json()
    return GitHubRepositoryOverview(
        repository=GitHubRepoMetadata(
            full_name=repo_data["full_name"],
            description=repo_data.get("description"),
            default_branch=repo_data.get("default_branch", "main"),
            html_url=repo_data["html_url"],
        ),
        branches=[branch["name"] for branch in branches_response.json()],
        recent_commits=[
            GitHubCommit(
                sha=commit["sha"],
                message=commit["commit"]["message"],
                author=commit["commit"]["author"]["name"],
            )
            for commit in commits_response.json()
        ],
        pull_requests=[
            GitHubPullRequest(
                number=pull["number"],
                title=pull["title"],
                state=pull["state"],
                html_url=pull["html_url"],
            )
            for pull in pulls_response.json()
        ],
    )


def _client() -> httpx.Client:
    if not settings.github_token.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub integration is not configured. Set GITHUB_TOKEN to enable it.",
        )

    return httpx.Client(
        base_url=GITHUB_API_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {settings.github_token}",
            "User-Agent": "Relay",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=20.0,
        follow_redirects=True,
    )


def _parse_repository_name() -> GitHubRepoCoordinates:
    if "/" not in settings.github_repo:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub integration is not configured. Set GITHUB_REPO as owner/repo.",
        )

    owner, repo = settings.github_repo.split("/", 1)
    if not owner or not repo:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub integration is not configured. Set GITHUB_REPO as owner/repo.",
        )
    return GitHubRepoCoordinates(owner=owner, repo=repo)


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code in {401, 403}:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GitHub authentication failed")
    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configured GitHub repository was not found")
    response.raise_for_status()
