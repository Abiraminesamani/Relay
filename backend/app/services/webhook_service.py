from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import User, WebhookSubscription
from app.schemas.webhook import (
    BroadcastEventRequest,
    WebhookCreate,
    WebhookRead,
    WebhookTestRequest,
    WebhookTestResponse,
    WebhookUpdate,
)

logger = logging.getLogger(__name__)


def list_webhooks_service(db: Session, current_user: User) -> list[WebhookSubscription]:
    return (
        db.query(WebhookSubscription)
        .filter(WebhookSubscription.user_id == current_user.id)
        .order_by(WebhookSubscription.created_at.desc())
        .all()
    )


def create_webhook_service(
    db: Session, current_user: User, payload: WebhookCreate
) -> WebhookSubscription:
    sub = WebhookSubscription(
        user_id=current_user.id,
        repository_id=payload.repository_id,
        name=payload.name.strip(),
        service_type=payload.service_type.lower().strip(),
        webhook_url=payload.webhook_url.strip(),
        events=payload.events or "pr_review,ci_failure,security_alert",
        is_active=payload.is_active,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def update_webhook_service(
    db: Session, current_user: User, webhook_id: int, payload: WebhookUpdate
) -> WebhookSubscription:
    sub = (
        db.query(WebhookSubscription)
        .filter(WebhookSubscription.id == webhook_id, WebhookSubscription.user_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    if payload.name is not None:
        sub.name = payload.name.strip()
    if payload.service_type is not None:
        sub.service_type = payload.service_type.lower().strip()
    if payload.webhook_url is not None:
        sub.webhook_url = payload.webhook_url.strip()
    if payload.repository_id is not None:
        sub.repository_id = payload.repository_id
    if payload.events is not None:
        sub.events = payload.events
    if payload.is_active is not None:
        sub.is_active = payload.is_active

    db.commit()
    db.refresh(sub)
    return sub


def delete_webhook_service(db: Session, current_user: User, webhook_id: int) -> None:
    sub = (
        db.query(WebhookSubscription)
        .filter(WebhookSubscription.id == webhook_id, WebhookSubscription.user_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    db.delete(sub)
    db.commit()


def send_slack_notification(
    webhook_url: str,
    title: str,
    summary: str,
    details: str | None = None,
    agent_name: str = "Relay AI Copilot",
    url: str | None = None,
) -> tuple[bool, int, str]:
    payload: dict[str, Any] = {
        "text": f"*{title}* - {summary}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": title[:150]},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Agent:*\n{agent_name}"},
                    {"type": "mrkdwn", "text": f"*Platform:*\nRelay AI Intelligence"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": summary},
            },
        ],
    }
    if details:
        payload["blocks"].append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"```{details[:1000]}```"},
        })
    if url:
        payload["blocks"].append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View in Relay"},
                    "url": url,
                    "style": "primary",
                }
            ],
        })

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(webhook_url, json=payload)
            return (res.status_code == 200, res.status_code, res.text)
    except Exception as exc:
        logger.exception("Failed to send Slack webhook: %s", exc)
        return (False, 500, str(exc))


def send_discord_notification(
    webhook_url: str,
    title: str,
    summary: str,
    details: str | None = None,
    agent_name: str = "Relay AI Copilot",
    url: str | None = None,
) -> tuple[bool, int, str]:
    color_code = 0x6366F1  # Indigo
    if "fail" in title.lower() or "error" in title.lower() or "security" in title.lower():
        color_code = 0xEF4444  # Red
    elif "pass" in title.lower() or "success" in title.lower() or "merged" in title.lower():
        color_code = 0x10B981  # Emerald

    embed: dict[str, Any] = {
        "title": title[:256],
        "description": summary[:2048],
        "color": color_code,
        "fields": [
            {"name": "Agent", "value": agent_name, "inline": True},
            {"name": "Status", "value": "Delivered", "inline": True},
        ],
        "footer": {"text": "Relay AI Engineering Platform"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        embed["fields"].append({"name": "Details", "value": f"```{details[:900]}```", "inline": False})
    if url:
        embed["url"] = url

    payload = {
        "username": "Relay AI Copilot",
        "embeds": [embed],
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(webhook_url, json=payload)
            # Discord returns 204 No Content on success
            return (res.status_code in {200, 204}, res.status_code, res.text or "Delivered")
    except Exception as exc:
        logger.exception("Failed to send Discord webhook: %s", exc)
        return (False, 500, str(exc))


def send_custom_webhook_notification(
    webhook_url: str,
    title: str,
    summary: str,
    details: str | None = None,
    agent_name: str = "Relay AI Copilot",
    url: str | None = None,
) -> tuple[bool, int, str]:
    payload = {
        "event": "relay_notification",
        "title": title,
        "summary": summary,
        "details": details,
        "agent": agent_name,
        "url": url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(webhook_url, json=payload)
            return (res.status_code in {200, 201, 202, 204}, res.status_code, res.text)
    except Exception as exc:
        logger.exception("Failed to send custom webhook: %s", exc)
        return (False, 500, str(exc))


def test_webhook_service(
    db: Session, current_user: User, payload: WebhookTestRequest
) -> WebhookTestResponse:
    url = payload.webhook_url
    svc_type = payload.service_type or "slack"

    if payload.webhook_id:
        sub = (
            db.query(WebhookSubscription)
            .filter(
                WebhookSubscription.id == payload.webhook_id,
                WebhookSubscription.user_id == current_user.id,
            )
            .first()
        )
        if sub:
            url = sub.webhook_url
            svc_type = sub.service_type

    if not url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook URL is required"
        )

    title = payload.title or "Relay Engineering Copilot Integration Alert"
    summary = payload.message or "Relay AI is successfully connected to your notification channel!"

    if svc_type.lower() == "discord":
        success, code, msg = send_discord_notification(url, title, summary)
    elif svc_type.lower() == "slack":
        success, code, msg = send_slack_notification(url, title, summary)
    else:
        success, code, msg = send_custom_webhook_notification(url, title, summary)

    # Update last triggered
    if payload.webhook_id:
        sub = (
            db.query(WebhookSubscription)
            .filter(WebhookSubscription.id == payload.webhook_id)
            .first()
        )
        if sub:
            sub.last_triggered_at = datetime.utcnow()
            db.commit()

    return WebhookTestResponse(
        success=success,
        status_code=code,
        message=msg or ("Alert dispatched successfully" if success else "Failed to deliver"),
        service_type=svc_type,
    )


def broadcast_event_service(
    db: Session, current_user: User, payload: BroadcastEventRequest
) -> dict[str, Any]:
    query = db.query(WebhookSubscription).filter(
        WebhookSubscription.user_id == current_user.id,
        WebhookSubscription.is_active == True,
    )
    if payload.repository_id:
        query = query.filter(
            (WebhookSubscription.repository_id == payload.repository_id)
            | (WebhookSubscription.repository_id == None)
        )

    subscriptions = query.all()
    results = []

    for sub in subscriptions:
        if sub.service_type == "discord":
            success, code, _ = send_discord_notification(
                sub.webhook_url,
                payload.title,
                payload.summary,
                payload.details,
                payload.agent_name or "Relay AI Copilot",
                payload.url,
            )
        elif sub.service_type == "slack":
            success, code, _ = send_slack_notification(
                sub.webhook_url,
                payload.title,
                payload.summary,
                payload.details,
                payload.agent_name or "Relay AI Copilot",
                payload.url,
            )
        else:
            success, code, _ = send_custom_webhook_notification(
                sub.webhook_url,
                payload.title,
                payload.summary,
                payload.details,
                payload.agent_name or "Relay AI Copilot",
                payload.url,
            )

        if success:
            sub.last_triggered_at = datetime.utcnow()

        results.append({
            "webhook_id": sub.id,
            "name": sub.name,
            "service_type": sub.service_type,
            "success": success,
            "status_code": code,
        })

    db.commit()
    return {"dispatched_count": len(results), "results": results}
