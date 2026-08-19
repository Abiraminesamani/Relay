from datetime import datetime

from sqlalchemy import String, Text, DateTime, Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Commit(Base):
    __tablename__ = "commits"

    id: Mapped[int] = mapped_column(primary_key=True)
    sha: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    message: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String(255))
    pushed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    indexed: Mapped[bool] = mapped_column(Boolean, default=False)  # has RAG index been updated for this commit

    ci_runs: Mapped[list["CIRun"]] = relationship(back_populates="commit")


class CIRun(Base):
    __tablename__ = "ci_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # GitHub Actions run id
    commit_id: Mapped[int] = mapped_column(ForeignKey("commits.id"))
    workflow_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32))       # queued | in_progress | completed
    conclusion: Mapped[str | None] = mapped_column(String(32), nullable=True)  # success | failure | ...
    logs_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    commit: Mapped["Commit"] = relationship(back_populates="ci_runs")


class RawWebhookEvent(Base):
    """Audit log of every webhook received - useful for debugging during the build."""

    __tablename__ = "raw_webhook_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64))  # push | workflow_run | ...
    payload: Mapped[str] = mapped_column(Text)            # raw JSON, stored as text for simplicity
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
