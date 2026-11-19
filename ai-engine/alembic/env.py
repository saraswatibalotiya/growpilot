"""Alembic environment.

Safety rules:
* The database URL comes only from the DATABASE_URL environment variable (or a test harness). It is never printed.
* Only the `ai_engine` schema is managed. Nothing outside it is created, altered or dropped.
* `upgrade` is additive. Destructive steps (downgrades) are guarded inside the migration files themselves.
"""

import asyncio
import os

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.db.models import SCHEMA, Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    url = config.attributes.get("url") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set. Refusing to guess which database to migrate.")
    if not url.startswith("postgresql+asyncpg://"):
        raise SystemExit("DATABASE_URL must be a postgresql+asyncpg:// URL.")
    return url


def _include_object(obj, name, type_, reflected, compare_to):
    # Only the engine's own schema is ever compared or changed.
    if type_ == "table":
        return obj.schema == SCHEMA
    return True


def _configure(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        include_object=_include_object,
        version_table_schema=SCHEMA,
        compare_type=True,
    )


def _run(connection) -> None:
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    engine = create_async_engine(_url(), poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            # The version table lives in the schema, so the schema must exist before Alembic writes to it.
            await connection.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')
            await connection.commit()
            await connection.run_sync(_run)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) mode is not supported: run against a database so the safety checks can run.")
asyncio.run(_run_async())
