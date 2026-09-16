from __future__ import annotations

import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def run_database_migrations(engine: Engine) -> None:
    """
    Ensure all tables and new columns exist in the database without dropping data.
    Automatically applies additive schema updates (e.g. jira_project_key, slack_webhook_url).
    """
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "repositories" in table_names:
        columns = {col["name"] for col in inspector.get_columns("repositories")}
        with engine.begin() as conn:
            if "jira_project_key" not in columns:
                logger.info("Migrating schema: adding column 'jira_project_key' to repositories table.")
                conn.execute(text("ALTER TABLE repositories ADD COLUMN jira_project_key VARCHAR(50)"))

            if "slack_webhook_url" not in columns:
                logger.info("Migrating schema: adding column 'slack_webhook_url' to repositories table.")
                conn.execute(text("ALTER TABLE repositories ADD COLUMN slack_webhook_url VARCHAR(1024)"))
