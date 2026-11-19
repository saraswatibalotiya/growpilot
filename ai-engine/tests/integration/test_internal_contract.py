"""Internal engine contracts, persisted previews, authentication, and request tracing."""

import importlib
from typing import get_origin, get_type_hints

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from tests.conftest import API, make_settings


@pytest.mark.parametrize("module_name,class_name,method_name", [
    ("app.repositories.memory", "InMemoryStore", "set_posts"),
    ("app.services.competitor_service", "CompetitorService", "approved"),
    ("app.services.festival_service", "FestivalService", "upcoming"),
    ("app.services.trend_service", "TrendService", "upcoming"),
])
def test_list_method_does_not_eagerly_evaluate_collection_annotations(module_name, class_name, method_name):
    module = importlib.import_module(module_name)
    method = getattr(getattr(module, class_name), method_name)
    assert isinstance(method.__annotations__["return"], str)
    assert get_origin(get_type_hints(method)["return"]) is list


def test_application_requires_postgres_and_memory_is_test_only():
    settings = Settings(_env_file=None, environment="development", STORAGE_BACKEND="postgres", DATABASE_URL="postgresql+asyncpg://test:test@localhost/growpilot_db")
    assert settings.storage_backend == "postgres"
    with pytest.raises(ValidationError, match="In-memory storage"):
        Settings(_env_file=None, environment="development", STORAGE_BACKEND="memory")
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None, environment="development", STORAGE_BACKEND="postgres", DATABASE_URL=None)


def test_mock_previews_save_recommendations_and_reload_feedback(empty_client):
    for industry in ("fashion", "grooming", "beauty", "cafe"):
        profile_id = f"mock_owner_{industry}"
        path = f"/api/v1/profiles/{profile_id}/preview"
        response = empty_client.post(path, json={"industry": industry})
        assert response.status_code == 200, response.text
        first = response.json()["data"]
        assert first["analysis"]["posts_analyzed"] >= 18
        assert first["audience"]["comments_analyzed"] == 60
        assert len(first["recommendations"]) == 4
        ids = [rec["recommendation_id"] for rec in first["recommendations"]]
        assert all("sample" in rec["tags"] for rec in first["recommendations"])
        feedback = empty_client.post(f"/api/v1/recommendations/{ids[0]}/feedback", json={"profile_id": profile_id, "action": "SAVED"})
        assert feedback.status_code == 201
        loaded = empty_client.post(path, json={"industry": industry}).json()["data"]
        assert {rec["recommendation_id"] for rec in loaded["recommendations"]} == set(ids)
        assert loaded["acted"][ids[0]] == "SAVED"
        regenerated = empty_client.post(path, json={"industry": industry, "regenerate": True})
        assert regenerated.status_code == 200, regenerated.text
        history = empty_client.get("/api/v1/recommendations", params={"profile_id": profile_id}).json()["data"]
        assert history["total"] == 8


def test_mock_preview_rejects_live_profiles_and_unknown_industries(empty_client):
    assert empty_client.post("/api/v1/profiles/biz_owner/preview", json={"industry": "fashion"}).status_code == 422
    assert empty_client.post("/api/v1/profiles/mock_owner/preview", json={"industry": "unknown"}).status_code == 422

def test_mock_preview_recovers_a_partially_initialized_profile(empty_client):
    profile_id = "mock_partial_fashion"
    created = empty_client.put(f"{API}/profiles/{profile_id}", json={"profile_type": "BUSINESS", "name": "Fashion sample", "niche": "fashion", "products": ["linen shirts"], "goals": ["ENGAGEMENT"]})
    assert created.status_code == 201
    preview = empty_client.post(f"{API}/profiles/{profile_id}/preview", json={"industry": "fashion"})
    assert preview.status_code == 200, preview.text
    assert preview.json()["data"]["analysis"]["posts_analyzed"] == 48
    assert len(preview.json()["data"]["recommendations"]) == 4

BIZ = "biz_3f2c9a54-77a1-4d0e-9a52-1b6f0c1d2e3f"
BODY = {"profile_type": "BUSINESS", "name": "Rang Boutique", "category": "fashion", "city": "Mumbai", "goals": ["SALES"], "products": ["sarees"]}


@pytest.fixture
def api() -> TestClient:
    return TestClient(create_app(make_settings(load_mock_data=False)))


def test_put_profile_creates_then_updates_and_is_safe_to_repeat(api):
    first = api.put(f"{API}/profiles/{BIZ}", json=BODY)
    assert first.status_code == 201 and first.json()["data"]["profile_id"] == BIZ
    again = api.put(f"{API}/profiles/{BIZ}", json=BODY)
    assert again.status_code == 200 and again.json()["data"]["created_at"] == first.json()["data"]["created_at"]
    changed = api.put(f"{API}/profiles/{BIZ}", json={**BODY, "city": None, "products": []})
    assert changed.status_code == 200 and changed.json()["data"]["city"] is None and changed.json()["data"]["products"] == []
    assert api.get(f"{API}/profiles/{BIZ}").json()["data"]["name"] == "Rang Boutique"


def test_put_profile_cannot_change_the_type_or_use_an_unsafe_id(api):
    api.put(f"{API}/profiles/{BIZ}", json=BODY)
    assert api.put(f"{API}/profiles/{BIZ}", json={**BODY, "profile_type": "CREATOR"}).status_code == 409
    for bad in ("a b", "x" * 65, "../etc", "a;b"):
        assert api.put(f"{API}/profiles/{bad}", json=BODY).status_code in (404, 405, 422)


def test_service_token_is_required_when_configured():
    c = TestClient(create_app(make_settings(load_mock_data=False, service_token="s3cret-token")))
    assert c.put(f"{API}/profiles/{BIZ}", json=BODY).status_code == 401
    assert c.put(f"{API}/profiles/{BIZ}", json=BODY, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert c.put(f"{API}/profiles/{BIZ}", json=BODY, headers={"Authorization": "Bearer s3cret-token"}).status_code == 201
    assert c.get(f"{API}/health").status_code == 200  # health stays open for orchestrators


@pytest.mark.parametrize("header", ["x-request-id", "x-correlation-id"])
def test_the_callers_correlation_id_is_kept_and_returned(api, header):
    r = api.get(f"{API}/profiles/ghost", headers={header: "nest-1234-abcd"})
    assert r.headers["x-request-id"] == "nest-1234-abcd" and r.json()["meta"]["request_id"] == "nest-1234-abcd"
    assert api.get(f"{API}/profiles/ghost", headers={header: "bad id with spaces"}).headers["x-request-id"] != "bad id with spaces"


def test_rate_limit_returns_429_with_retry_after_and_leaves_health_alone():
    c = TestClient(create_app(make_settings(load_mock_data=False, rate_limit_per_minute=3)))
    assert [c.get(f"{API}/profiles/ghost").status_code for _ in range(3)] == [404, 404, 404]
    limited = c.get(f"{API}/profiles/ghost")
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "rate_limited" and int(limited.headers["retry-after"]) >= 1
    assert c.get(f"{API}/health").status_code == 200


def test_rate_limit_zero_means_off():
    c = TestClient(create_app(make_settings(load_mock_data=False, rate_limit_per_minute=0)))
    assert all(c.get(f"{API}/profiles/ghost").status_code == 404 for _ in range(20))
