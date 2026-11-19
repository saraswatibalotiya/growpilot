"""PostgreSQL-specific behaviour: persistence across restarts, transactions, database-level isolation, failures, migrations."""

import asyncio
import logging
import os
import subprocess
import sys
import uuid

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.api.dependencies import build_container
from app.core.config import Settings
from app.core.exceptions import ConflictError, DatabaseUnavailableError
from app.db.models import Base
from app.demos.datasets import EVAL_DATE
from app.demos.runner import load_demo
from app.main import create_app
from app.repositories.postgres import PostgresStore
from app.schemas.learning import LearningAdjustment
from app.schemas.profile import ProfileCreate, ProfileType
from app.schemas.recommendation import FeedbackAction, FeedbackIn, GenerateRequest
from tests.conftest import API, make_settings
from tests.persistence.conftest import alembic_config, app_client, make_pg_store
from tests.persistence.test_store_contract import NOW, new_profile, rec

pytestmark = pytest.mark.filterwarnings("ignore")


def container_on(store):
    return build_container(make_settings(load_mock_data=False), store)


def restart(url, old):
    """A new store on the same database: nothing is carried over in memory, as after a process restart."""
    old.close()
    return make_pg_store(url)


# ---------------------------------------------------------------- empty database

def test_empty_database_behaves_sensibly(pg):
    assert pg.list() == [] and pg.get("x") is None
    assert pg.list_recommendations("x") == [] and pg.feedback_for_profile("x") == [] and pg.outcomes_for_profile("x") == []
    assert pg.get_posts("x") == [] and pg.get_comments("x") == [] and pg.get_audience("x") is None and pg.list_learning_adjustments("x") == []
    c = app_client(pg)
    assert c.get(f"{API}/health").json()["data"]["storage"] == "postgres"
    assert c.get(f"{API}/profiles/ghost").status_code == 404
    assert c.get(f"{API}/recommendations", params={"profile_id": "ghost"}).status_code == 404
    assert c.post(f"{API}/recommendations/generate", json={"profile_id": "ghost"}).status_code == 404
    assert c.get(f"{API}/analytics/overview", params={"profile_id": "ghost"}).status_code == 404


def test_profile_without_data_gives_a_clear_conflict_not_a_crash(pg):
    c = app_client(pg)
    pid = c.post(f"{API}/profiles", json={"profile_type": "CREATOR", "name": "New", "niche": "travel"}).json()["data"]["profile_id"]
    assert c.get(f"{API}/analytics/overview", params={"profile_id": pid}).status_code == 409
    assert c.get(f"{API}/audience/insights", params={"profile_id": pid}).status_code == 409
    assert c.get(f"{API}/recommendations", params={"profile_id": pid}).json()["data"]["total"] == 0


def test_bundled_demo_profiles_are_not_loaded_into_a_database_by_default(clean_db):
    settings = Settings(environment="test", storage_backend="postgres", database_url=clean_db)  # load_mock_data left at its default
    app = create_app(settings)
    try:
        assert app.state.container.store.list() == []
    finally:
        app.state.container.store.close()


# ---------------------------------------------------------------- the user-visible milestone

@pytest.mark.parametrize("industry", ["fashion", "grooming", "beauty", "cafe"])
def test_mock_preview_recommendations_and_feedback_survive_restart(clean_db, industry):
    store = make_pg_store(clean_db)
    api = app_client(store)
    profile_id = f"mock_owner_{industry}"
    path = f"{API}/profiles/{profile_id}/preview"
    response = api.post(path, json={"industry": industry})
    assert response.status_code == 200, response.text
    first = response.json()["data"]
    ids = {rec["recommendation_id"] for rec in first["recommendations"]}
    selected = first["recommendations"][0]["recommendation_id"]
    assert len(ids) == 4
    assert api.post(f"{API}/recommendations/{selected}/feedback", json={"profile_id": profile_id, "action": "SAVED"}).status_code == 201
    store = restart(clean_db, store)
    try:
        api = app_client(store)
        loaded = api.post(path, json={"industry": industry}).json()["data"]
        assert {rec["recommendation_id"] for rec in loaded["recommendations"]} == ids
        assert loaded["acted"][selected] == "SAVED"
        assert len(store.get_posts(profile_id)) == first["analysis"]["posts_analyzed"]
        assert len(store.get_comments(profile_id)) == 60
        assert store.list_recommendations("biz_owner") == []
        assert api.post(f"{API}/recommendations/{selected}/feedback", json={"profile_id": "mock_other_owner", "action": "SAVED"}).status_code == 404
        assert api.post(path, json={"industry": industry, "regenerate": True}).status_code == 200
        assert len(store.list_recommendations(profile_id)) == 8
    finally:
        store.close()


def test_create_generate_restart_fetch_feedback_restart_fetch(clean_db):
    store = make_pg_store(clean_db)
    c = TestClient(create_app(make_settings(load_mock_data=False), build_container(make_settings(load_mock_data=False), store)))
    pid = load_demo(c.app.state.container, "restaurant")
    generated = c.post(f"{API}/recommendations/generate", json={"profile_id": pid, "as_of": str(EVAL_DATE), "count": 4}).json()["data"]["recommendations"]
    assert len(generated) == 4

    store = restart(clean_db, store)  # restart 1
    c = TestClient(create_app(make_settings(load_mock_data=False), build_container(make_settings(load_mock_data=False), store)))
    again = c.get(f"{API}/recommendations", params={"profile_id": pid}).json()["data"]
    assert again["total"] == 4
    assert {r["recommendation_id"] for r in again["items"]} == {r["recommendation_id"] for r in generated}
    by_id = {r["recommendation_id"]: r for r in again["items"]}
    for r in generated:
        assert by_id[r["recommendation_id"]] == r  # the API response is identical after a restart
    for r in generated[:3]:
        assert c.post(f"{API}/recommendations/{r['recommendation_id']}/feedback", json={"profile_id": pid, "action": "LIKED"}).status_code == 201
    live = c.get(f"{API}/learning", params={"profile_id": pid}).json()["data"]

    store = restart(clean_db, store)  # restart 2
    c = TestClient(create_app(make_settings(load_mock_data=False), build_container(make_settings(load_mock_data=False), store)))
    assert len(c.get(f"{API}/feedback", params={"profile_id": pid}).json()["data"]) == 3
    assert c.get(f"{API}/learning", params={"profile_id": pid}).json()["data"] == live
    history = c.get(f"{API}/learning/history", params={"profile_id": pid}).json()["data"]
    assert history and any(h["trigger_type"] == "feedback" for h in history)
    current = store.list_learning_adjustments(pid)
    assert {(a.dimension, a.value) for a in current} == {(h["dimension"], h["value"]) for h in live["adjustments"]} | {(a.dimension, a.value) for a in current if not a.active}
    store.close()


def test_learning_survives_restart_and_still_changes_ranking(clean_db):
    """3+ reactions on a format activate an adjustment; after a restart it is still applied and recorded."""
    store = make_pg_store(clean_db)
    c = container_on(store)
    pid = load_demo(c, "restaurant")
    first, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=EVAL_DATE, count=5))
    for r in first[:4]:
        c.feedback.record(r.recommendation_id, FeedbackIn(profile_id=pid, action=FeedbackAction.LIKED))
    before = {(a.dimension, a.value): a.adjustment for a in store.list_learning_adjustments(pid) if a.active}
    assert before, "three or more reactions on one dimension should activate an adjustment"
    store = restart(clean_db, store)
    after = {(a.dimension, a.value): a.adjustment for a in store.list_learning_adjustments(pid) if a.active}
    assert after == before
    c2 = container_on(store)
    sig, _ = c2.recommendations.collect_signals(pid, EVAL_DATE)
    assert sig.learning is not None and sig.learning.active
    store.close()


def test_outcomes_survive_restart(clean_db):
    store = make_pg_store(clean_db)
    c = container_on(store)
    pid = load_demo(c, "fashion_creator")
    r = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=EVAL_DATE))[0][0]
    api = TestClient(create_app(make_settings(load_mock_data=False), c))
    body = {"profile_id": pid, "interval": "H24", "metrics": {"reach": 2000, "likes": 100, "comments": 20}}
    saved = api.post(f"{API}/recommendations/{r.recommendation_id}/outcomes", json=body).json()["data"]
    store = restart(clean_db, store)
    api2 = TestClient(create_app(make_settings(load_mock_data=False), container_on(store)))
    got = api2.get(f"{API}/recommendations/{r.recommendation_id}/outcomes", params={"profile_id": pid}).json()["data"]
    assert got == [saved] and got[0]["engagement_rate"] == 0.06
    assert api2.post(f"{API}/recommendations/{r.recommendation_id}/outcomes", json=body).status_code == 409  # still one per interval
    store.close()


def test_a_real_process_restart(clean_db, tmp_path):
    """Two separate Python processes, one database: what the first stores, the second reads."""
    script = (
        "import sys\nfrom datetime import date\nfrom app.api.dependencies import build_container\nfrom app.core.config import Settings\n"
        "from app.demos.runner import load_demo\nfrom app.schemas.recommendation import GenerateRequest\n"
        "c = build_container(Settings(environment='test', load_mock_data=False))\n"
        "if sys.argv[1] == 'write':\n    pid = load_demo(c, 'beauty_creator')\n    recs, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=date(2026, 11, 17)))\n    print(len(recs))\n"
        "else:\n    print(len(c.store.list_recommendations('demo_beauty_creator')))\nc.store.close()\n"
    )
    env = {**os.environ, "STORAGE_BACKEND": "postgres", "DATABASE_URL": clean_db}
    run = lambda mode: subprocess.run([sys.executable, "-I", "-c", f"import sys; sys.path.insert(0, '.'); sys.argv=['x','{mode}']\n{script}"], env=env, capture_output=True, text=True, timeout=120)  # noqa: E731
    first, second = run("write"), run("read")
    assert first.returncode == 0, first.stderr[-500:]
    assert second.returncode == 0, second.stderr[-500:]
    assert first.stdout.strip() == second.stdout.strip() == "4"


# ---------------------------------------------------------------- isolation

def test_one_profile_cannot_reach_anothers_records(pg):
    c = container_on(pg)
    a, b = load_demo(c, "restaurant"), load_demo(c, "travel_creator")
    ra = c.recommendations.generate(GenerateRequest(profile_id=a, as_of=EVAL_DATE))[0][0]
    c.feedback.record(ra.recommendation_id, FeedbackIn(profile_id=a, action=FeedbackAction.SAVED))
    assert pg.get_recommendation(b, ra.recommendation_id) is None
    assert pg.list_recommendations(b) == [] and pg.feedback_for_profile(b) == []
    assert not {x.recommendation_id for x in pg.list_recommendations(a)} & {x.recommendation_id for x in pg.list_recommendations(b)}
    api = TestClient(create_app(make_settings(load_mock_data=False), c))
    assert api.get(f"{API}/recommendations/{ra.recommendation_id}", params={"profile_id": b}).status_code == 404
    assert api.post(f"{API}/recommendations/{ra.recommendation_id}/feedback", json={"profile_id": b, "action": "LIKED"}).status_code == 404
    assert pg.get_posts(a) and pg.get_posts(b) and {p.media_id for p in pg.get_posts(a)}.isdisjoint({p.media_id for p in pg.get_posts(b)})


def test_the_same_media_id_can_exist_in_two_profiles_without_mixing(pg):
    from app.schemas.analytics import PostIn

    new_profile(pg, "prof_a")
    new_profile(pg, "prof_b", name="B")
    pg.set_posts("prof_a", [PostIn(media_id="shared", posted_at=NOW, likes=1)], True)
    pg.set_posts("prof_b", [PostIn(media_id="shared", posted_at=NOW, likes=2)], True)
    assert pg.get_posts("prof_a")[0].likes == 1 and pg.get_posts("prof_b")[0].likes == 2


def _raw(url, sql, **params):
    async def go():
        engine = create_async_engine(url)
        try:
            async with engine.begin() as conn:
                await conn.execute(text(sql), params)
        finally:
            await engine.dispose()

    asyncio.run(go())


def test_the_database_itself_rejects_a_child_row_under_the_wrong_profile(pg, clean_db):
    """Not just the API: even raw SQL can not file feedback for A's recommendation under B."""
    new_profile(pg, "prof_a")
    new_profile(pg, "prof_b", name="B")
    r = rec("prof_a")
    pg.add_many([r])
    b_id = asyncio.run(_scalar(clean_db, "select id from ai_engine.ai_profiles where public_id='prof_b'"))
    with pytest.raises(IntegrityError):
        _raw(clean_db, "insert into ai_engine.recommendation_feedback (id, recommendation_id, profile_id, action, created_at) values (:i, :r, :p, 'SAVED', now())", i=uuid.uuid4(), r=r.recommendation_id, p=b_id)
    with pytest.raises(IntegrityError):
        _raw(clean_db, "insert into ai_engine.recommendation_outcomes (id, recommendation_id, profile_id, interval, captured_at, metrics) values (:i, :r, :p, 'H24', now(), '{}'::jsonb)", i=uuid.uuid4(), r=r.recommendation_id, p=b_id)
    with pytest.raises(IntegrityError):
        _raw(clean_db, "insert into ai_engine.recommendation_evidence (id, recommendation_id, profile_id, position, signal, statement) values (:i, :r, :p, 9, 'goal', 'x')", i=uuid.uuid4(), r=r.recommendation_id, p=b_id)
    assert pg.feedback_for_profile("prof_a") == [] and pg.feedback_for_profile("prof_b") == []


async def _scalar(url, sql):
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            return (await conn.execute(text(sql))).scalar_one()
    finally:
        await engine.dispose()


def test_database_constraints_reject_bad_values(pg, clean_db):
    new_profile(pg)
    pid = asyncio.run(_scalar(clean_db, "select id from ai_engine.ai_profiles"))
    with pytest.raises(IntegrityError):
        _raw(clean_db, "insert into ai_engine.competitors (id, profile_id, public_id, username, source, approval_status, verified, created_at) values (gen_random_uuid(), :p, 'c', 'u', 'MANUAL', 'MAYBE', false, now())", p=pid)
    r = rec()
    pg.add_many([r])
    with pytest.raises(IntegrityError):
        _raw(clean_db, "insert into ai_engine.recommendation_feedback (id, recommendation_id, profile_id, action, created_at) values (gen_random_uuid(), :r, :p, 'EXPLODED', now())", r=r.recommendation_id, p=pid)
    with pytest.raises(IntegrityError):
        _raw(clean_db, "update ai_engine.recommendations set opportunity_score = 101")


# ---------------------------------------------------------------- transactions

def test_a_failed_batch_stores_nothing(pg):
    new_profile(pg)
    first, dup_id = rec(), str(uuid.uuid4())
    clash_a, clash_b = rec(recommendation_id=dup_id, title="x"), rec(recommendation_id=dup_id, title="y")
    with pytest.raises(ConflictError):
        pg.add_many([first, clash_a, clash_b])  # the third repeats the second's id
    assert pg.list_recommendations("prof_a") == []  # the first one was rolled back with the rest


def test_feedback_and_its_learning_adjustments_are_all_or_nothing(pg):
    new_profile(pg)
    r = rec()
    pg.add_many([r])
    good = LearningAdjustment(dimension="format", value="REEL", samples=3, mean_signal=1.0, adjustment=4.0, active=True, computed_at=NOW)
    from app.schemas.recommendation import Feedback

    def fb(action):
        return Feedback(feedback_id=str(uuid.uuid4()), recommendation_id=r.recommendation_id, profile_id="prof_a", action=action, comment=None, created_at=NOW)

    pg.add_feedback(fb(FeedbackAction.LIKED), [good])
    dup = [good.model_copy(update={"adjustment": 5.0}), good.model_copy(update={"adjustment": 6.0})]  # two "current" rows for one key: rejected by the database
    with pytest.raises(ConflictError):
        pg.add_feedback(fb(FeedbackAction.DISMISSED), dup)
    assert [f.action for f in pg.feedback_for_profile("prof_a")] == [FeedbackAction.LIKED]  # the failed feedback is not there
    assert [a.adjustment for a in pg.list_learning_adjustments("prof_a")] == [4.0]  # and the previous adjustments are untouched


def test_replacing_posts_is_atomic(pg):
    from app.schemas.analytics import PostIn

    new_profile(pg)
    pg.set_posts("prof_a", [PostIn(media_id="keep", posted_at=NOW, likes=1)], True)
    bad = PostIn.model_construct(media_id="bad", posted_at=NOW, likes=-5, caption=None, media_type=None, media_product_type=None, permalink=None, views=None, reach=None, comments=None, shares=None, saves=None, interactions=None, avg_watch_time_seconds=None, follower_count=None)
    with pytest.raises(ConflictError):
        pg.set_posts("prof_a", [PostIn(media_id="new", posted_at=NOW), bad], True)  # the database's non-negative check fails
    assert [p.media_id for p in pg.get_posts("prof_a")] == ["keep"]  # the delete of "keep" was rolled back too


def test_duplicate_profile_id_is_a_conflict_and_changes_nothing(pg):
    new_profile(pg)
    with pytest.raises(ConflictError):
        pg.create(ProfileCreate(profile_type=ProfileType.CREATOR, name="Other"), profile_id="prof_a")
    assert pg.get("prof_a").name == "Shop A"


# ---------------------------------------------------------------- connection failures and secrets

BAD_URL = "postgresql+asyncpg://leaky_user:SuperSecret123@127.0.0.1:1/nowhere_test"


def test_database_down_is_a_safe_503_that_leaks_nothing(caplog):
    store = PostgresStore(BAD_URL, pool_size=1, max_overflow=0, connect_timeout=1, command_timeout=2)
    try:
        with caplog.at_level(logging.DEBUG):
            with pytest.raises(DatabaseUnavailableError) as e:
                store.get("x")
            c = TestClient(create_app(make_settings(load_mock_data=False), build_container(make_settings(load_mock_data=False), store)))
            health = c.get(f"{API}/health")
            profile = c.get(f"{API}/profiles/x")
        for text_ in (str(e.value), health.text, profile.text, caplog.text):
            assert "SuperSecret123" not in text_ and "leaky_user" not in text_ and "127.0.0.1" not in text_
        assert health.status_code == 503 and health.json()["error"]["code"] == "database_unavailable"
        assert profile.status_code == 503
    finally:
        store.close()


def test_settings_never_reveal_the_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)  # the developer's shell must not leak into the test
    s = Settings(environment="test", storage_backend="postgres", database_url=BAD_URL)
    for shown in (repr(s), str(s), s.model_dump_json(), str(s.model_dump())):
        assert "SuperSecret123" not in shown
    with pytest.raises(ValueError) as e:
        Settings(environment="test", storage_backend="postgres", database_url="postgres://u:TopSecret@h/db")
    assert "TopSecret" not in str(e.value)
    with pytest.raises(ValueError):
        Settings(environment="test", storage_backend="postgres")


def test_log_redaction_masks_database_urls():
    from app.core.logging import redact

    assert "SuperSecret123" not in redact(f"could not connect to {BAD_URL}") and "SuperSecret123" not in redact("password=SuperSecret123 failed")


def test_startup_survives_a_down_database():
    store = PostgresStore(BAD_URL, pool_size=1, max_overflow=0, connect_timeout=1, command_timeout=2)
    settings = make_settings(load_mock_data=True)
    try:
        app = create_app(settings, build_container(settings, store))  # must not raise
        assert TestClient(app).get(f"{API}/health").status_code == 503
    finally:
        store.close()


# ---------------------------------------------------------------- migrations

def test_migration_matches_the_models(migrated):
    async def diff():
        engine = create_async_engine(migrated)
        try:
            async with engine.connect() as conn:
                def run(sync_conn):
                    ctx = MigrationContext.configure(sync_conn, opts={"include_schemas": True, "compare_type": True, "include_object": lambda o, n, t, r, c: (o.schema == "ai_engine") if t == "table" else True, "version_table_schema": "ai_engine"})
                    return compare_metadata(ctx, Base.metadata)

                return await conn.run_sync(run)
        finally:
            await engine.dispose()

    assert asyncio.run(diff()) == []


def test_upgrade_is_repeatable_and_creates_only_the_engine_schema(migrated):
    command.upgrade(alembic_config(migrated), "head")  # a second run is a no-op
    tables = asyncio.run(_scalar(migrated, "select count(*) from information_schema.tables where table_schema='ai_engine' and table_name <> 'alembic_version'"))
    assert tables == 14
    assert asyncio.run(_scalar(migrated, "select count(*) from information_schema.tables where table_schema='public'")) == 0  # nothing outside ai_engine


def test_downgrade_refuses_without_explicit_confirmation_and_keeps_the_data(pg, clean_db, monkeypatch):
    new_profile(pg)
    monkeypatch.delenv("AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION", raising=False)
    monkeypatch.delenv("AI_ENGINE_CONFIRM_DATABASE", raising=False)
    with pytest.raises(RuntimeError, match="Refusing to downgrade"):
        command.downgrade(alembic_config(clean_db), "base")
    monkeypatch.setenv("AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION", "yes")
    monkeypatch.setenv("AI_ENGINE_CONFIRM_DATABASE", "some_other_database")
    with pytest.raises(RuntimeError, match="does not match"):
        command.downgrade(alembic_config(clean_db), "base")
    assert pg.get("prof_a") is not None  # still there


def test_schema_has_the_expected_foreign_keys_and_indexes(migrated):
    fks = asyncio.run(_scalar(migrated, "select count(*) from information_schema.table_constraints where constraint_schema='ai_engine' and constraint_type='FOREIGN KEY'"))
    assert fks >= 11
    composite = asyncio.run(_scalar(migrated, "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='ai_engine' and c.contype='f' and array_length(c.conkey,1)=2"))
    assert composite >= 5  # post_analytics, competitor_posts, evidence, feedback, outcomes
    idx = asyncio.run(_scalar(migrated, "select count(*) from pg_indexes where schemaname='ai_engine' and indexname like 'ix_%'"))
    assert idx >= 12


def test_migration_0002_keeps_existing_rows_and_labels_suggestions_as_sample_data(pg, clean_db, monkeypatch):
    """Downgrade the TEST database to 0001, put rows in the old shape, upgrade, and check nothing was lost."""
    new_profile(pg)
    monkeypatch.setenv("AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION", "yes")
    monkeypatch.setenv("AI_ENGINE_CONFIRM_DATABASE", "growpilot_ai_test")
    cfg = alembic_config(clean_db)
    try:
        command.downgrade(cfg, "0001")
        pid = asyncio.run(_scalar(clean_db, "select id from ai_engine.ai_profiles"))
        for public_id, username, source in (("comp_m", "mine", "MANUAL"), ("comp_s", "suggested", "AI_SUGGESTED")):
            _raw(clean_db, "insert into ai_engine.competitors (id, profile_id, public_id, username, source, approval_status, verified, created_at) values (gen_random_uuid(), :p, :i, :u, :s, 'PENDING', false, now())", p=pid, i=public_id, u=username, s=source)
        command.upgrade(cfg, "head")
        rows = asyncio.run(_scalar(clean_db, "select string_agg(public_id || '=' || data_source, ',' order by public_id) from ai_engine.competitors"))
        assert rows == "comp_m=USER_SUPPLIED,comp_s=SAMPLE_PROVIDER"
        assert asyncio.run(_scalar(clean_db, "select count(*) from ai_engine.ai_profiles")) == 1  # the profile is still there
    finally:
        command.upgrade(cfg, "head")
