import hashlib
import hmac
import json

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.db.models import Commit, CIRun, RawWebhookEvent

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def verify_signature(raw_body: bytes, signature_header: str | None) -> None:
    """Verify the X-Hub-Signature-256 header GitHub sends with every webhook."""
    if not settings.github_webhook_secret:
        # No secret configured yet (early dev) - skip verification but warn via exception-free no-op.
        return
    if not signature_header:
        raise HTTPException(status_code=401, detail="Missing signature header")

    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(status_code=401, detail="Invalid signature")


@router.post("/github")
async def github_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    verify_signature(raw_body, request.headers.get("X-Hub-Signature-256"))

    event_type = request.headers.get("X-GitHub-Event", "unknown")
    payload = json.loads(raw_body)

    # Always log the raw event first - makes debugging webhook issues far easier.
    db.add(RawWebhookEvent(event_type=event_type, payload=json.dumps(payload)))
    db.commit()

    if event_type == "push":
        _handle_push(payload, db)
    elif event_type == "workflow_run":
        _handle_workflow_run(payload, db)
    # Other event types are logged above but not processed yet - extend here later.

    return {"status": "ok", "event": event_type}


def _handle_push(payload: dict, db: Session):
    changed_files: set[str] = set()
    latest_sha: str | None = payload.get("after")

    for commit_data in payload.get("commits", []):
        exists = db.query(Commit).filter_by(sha=commit_data["id"]).first()
        if not exists:
            db.add(
                Commit(
                    sha=commit_data["id"],
                    message=commit_data.get("message", ""),
                    author=commit_data.get("author", {}).get("name", "unknown"),
                )
            )
        for added_path in commit_data.get("added", []):
            changed_files.add(added_path)
        for modified_path in commit_data.get("modified", []):
            changed_files.add(modified_path)

    db.commit()

    if changed_files and latest_sha:
        try:
            from app.ingestion.index_repo import index_files

            repo_name = payload.get("repository", {}).get("full_name")
            index_files(list(changed_files), latest_sha, repo=repo_name)
        except Exception:
            pass


def _handle_workflow_run(payload: dict, db: Session):
    run = payload.get("workflow_run", {})
    head_sha = run.get("head_sha")

    commit = db.query(Commit).filter_by(sha=head_sha).first()
    if commit is None:
        # Workflow event can arrive before/without a matching push event in some setups.
        commit = Commit(sha=head_sha, message="(unknown - no push event seen)", author="unknown")
        db.add(commit)
        db.flush()

    existing_run = db.query(CIRun).filter_by(run_id=str(run.get("id"))).first()
    if existing_run:
        existing_run.status = run.get("status", existing_run.status)
        existing_run.conclusion = run.get("conclusion")
        existing_run.logs_url = run.get("logs_url")
    else:
        db.add(
            CIRun(
                run_id=str(run.get("id")),
                commit_id=commit.id,
                workflow_name=run.get("name", "unknown"),
                status=run.get("status", "unknown"),
                conclusion=run.get("conclusion"),
                logs_url=run.get("logs_url"),
            )
        )
    db.commit()
    # TODO (CI agent step): if conclusion == "failure", enqueue root-cause correlation.
