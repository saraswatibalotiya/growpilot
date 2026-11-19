"""What the NestJS backend relies on: idempotent profile sync, service auth, correlation ids and the rate limit."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import API, make_settings

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
