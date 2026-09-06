from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.webhook import (
    BroadcastEventRequest,
    WebhookCreate,
    WebhookRead,
    WebhookTestRequest,
    WebhookTestResponse,
    WebhookUpdate,
)
from app.services.webhook_service import (
    broadcast_event_service,
    create_webhook_service,
    delete_webhook_service,
    list_webhooks_service,
    test_webhook_service,
    update_webhook_service,
)

router = APIRouter(prefix="/integrations", tags=["Slack, Discord & Webhook Integrations"])


@router.get(
    "/webhooks",
    response_model=list[WebhookRead],
    summary="List all configured Slack, Discord, and custom webhooks",
)
def list_webhooks_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_webhooks_service(db, current_user)


@router.post(
    "/webhooks",
    response_model=WebhookRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Slack, Discord, or custom webhook subscription",
)
def create_webhook_endpoint(
    payload: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_webhook_service(db, current_user, payload)


@router.put(
    "/webhooks/{webhook_id}",
    response_model=WebhookRead,
    summary="Update an existing webhook configuration",
)
def update_webhook_endpoint(
    webhook_id: int,
    payload: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_webhook_service(db, current_user, webhook_id, payload)


@router.delete(
    "/webhooks/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a webhook subscription",
)
def delete_webhook_endpoint(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_webhook_service(db, current_user, webhook_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/webhooks/test",
    response_model=WebhookTestResponse,
    summary="Send a live test alert to a Slack, Discord, or custom webhook URL",
)
def test_webhook_endpoint(
    payload: WebhookTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return test_webhook_service(db, current_user, payload)


@router.post(
    "/webhooks/broadcast",
    summary="Broadcast an event (PR Review, CI Failure, Security Alert) to configured webhooks",
)
def broadcast_event_endpoint(
    payload: BroadcastEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return broadcast_event_service(db, current_user, payload)
