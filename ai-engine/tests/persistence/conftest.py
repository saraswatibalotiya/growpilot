"""PostgreSQL test harness.

Needs a TEST database: set TEST_DATABASE_URL (see README, `docker compose up -d` creates `growpilot_ai_test`). Without it every test
in this folder is skipped. Safety: the database name must contain "test", because the fixtures TRUNCATE the engine's tables.
This file never reads DATABASE_URL, so the tests can not be pointed at a development or production database by accident.
"""

import asyncio
import os
from urllib.parse import urlparse

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.api.dependencies import build_container
from app.main import create_app
from app.repositories.memory import InMemoryStore
from app.repositories.postgres import PostgresStore
from tests.conftest import make_settings


def _url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set (see README: docker compose up -d)", allow_module_level=False)
    name = urlparse(url.replace("+asyncpg", "")).path.lstrip("/")
    if "test" not in name:
        pytest.fail("Refusing to run: the test database name must contain 'test' (got a different name). The fixtures TRUNCATE tables.")
    return url


@pytest.fixture(scope="session")
def test_db_url() -> str:
    return _url()


def alembic_config(url: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = url
    return cfg


@pytest.fixture(scope="session")
def migrated(test_db_url) -> str:
    """The test database brought to the latest migration, the same way a real deployment would be."""
    command.upgrade(alembic_config(test_db_url), "head")
    return test_db_url


async def _truncate(url: str) -> None:
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            tables = (await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='ai_engine' AND tablename <> 'alembic_version'"))).scalars().all()
            if tables:
                await conn.execute(text("TRUNCATE " + ", ".join(f'ai_engine."{t}"' for t in tables) + " CASCADE"))
    finally:
        await engine.dispose()


def make_pg_store(url: str) -> PostgresStore:
    return PostgresStore(url, pool_size=2, max_overflow=2, connect_timeout=3, command_timeout=10)


@pytest.fixture
def clean_db(migrated) -> str:
    asyncio.run(_truncate(migrated))
    return migrated


@pytest.fixture
def pg(clean_db):
    store = make_pg_store(clean_db)
    yield store
    store.close()


@pytest.fixture(params=["memory", "postgres"])
def any_store(request, clean_db):
    """The same tests run against both implementations, which is what keeps them interchangeable."""
    if request.param == "memory":
        yield InMemoryStore()
        return
    store = make_pg_store(clean_db)
    yield store
    store.close()


def app_client(store) -> TestClient:
    settings = make_settings(load_mock_data=False)
    return TestClient(create_app(settings, build_container(settings, store)))
