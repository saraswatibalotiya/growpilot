"""End-to-end through the HTTP layer: every endpoint, the envelope, validation, pagination, isolation and security."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import API, BEAUTY, BOUTIQUE, DEMO_DAY, RESTAURANT, make_settings


def data(r, status=200):
    assert r.status_code == status, r.text
    body = r.json()
    assert "meta" in body and body["meta"]["request_id"]
    return body["data"]


def generate(client, pid=BOUTIQUE, **kw):
    return data(client.post(f"{API}/recommendations/generate", json={"profile_id": pid, "as_of": DEMO_DAY, **kw}))


def test_health_and_docs(client):
    assert data(client.get(f"{API}/health"))["status"] == "ok"
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").json()["info"]["title"]


def test_request_id_is_echoed_and_unsafe_ones_replaced(client):
    assert client.get(f"{API}/health", headers={"x-request-id": "abc12345-good"}).headers["x-request-id"] == "abc12345-good"
    assert client.get(f"{API}/health", headers={"x-request-id": "bad id\twith spaces"}).headers["x-request-id"] != "bad id\twith spaces"


def test_profiles_crud_and_validation(empty_client):
    body = {"profile_type": "BUSINESS", "name": "Test Shop", "goals": ["SALES"], "instagram_username": "@Test.Shop"}
    p = data(empty_client.post(f"{API}/profiles", json=body), 201)
    assert p["instagram_username"] == "test.shop"
    assert data(empty_client.get(f"{API}/profiles/{p['profile_id']}"))["name"] == "Test Shop"
    assert data(empty_client.patch(f"{API}/profiles/{p['profile_id']}", json={"city": "Pune"}))["city"] == "Pune"
    assert empty_client.get(f"{API}/profiles/nope").status_code == 404
    assert empty_client.post(f"{API}/profiles", json={"profile_type": "WRONG", "name": "x"}).status_code == 422
    assert empty_client.post(f"{API}/profiles", json={**body, "instagram_username": "bad name!"}).status_code == 422


def test_validation_errors_do_not_echo_input(client):
    r = client.post(f"{API}/profiles", json={"profile_type": "BUSINESS", "name": "", "description": "S3CR3T-VALUE" * 200})
    assert r.status_code == 422 and "S3CR3T-VALUE" not in r.text


def test_analytics_endpoints(client):
    for path in ("overview", "top-content", "content-breakdown"):
        assert data(client.get(f"{API}/analytics/{path}", params={"profile_id": BOUTIQUE}))
    page = data(client.get(f"{API}/analytics/top-content", params={"profile_id": BOUTIQUE, "page_size": 2}))
    assert len(page["items"]) == 2 and page["page_size"] == 2 and page["total"] >= 2
    assert client.get(f"{API}/analytics/top-content", params={"profile_id": BOUTIQUE, "page_size": 10000}).status_code == 422
    posts = [{"media_id": f"p{i}", "posted_at": f"2026-09-{i + 1:02d}T10:00:00Z", "media_type": "IMAGE", "reach": 100, "likes": 5, "comments": 1} for i in range(6)]
    rep = data(client.post(f"{API}/analytics/analyze", json={"profile_id": BEAUTY, "posts": posts}))
    assert rep["posts_analyzed"] == 6
    dup = client.post(f"{API}/analytics/analyze", json={"profile_id": BEAUTY, "posts": posts + posts[:1]})
    assert dup.status_code == 422


def test_missing_metrics_are_not_zero_over_http(client):
    posts = [{"media_id": f"p{i}", "posted_at": f"2026-09-{i + 1:02d}T10:00:00Z", "media_type": "IMAGE"} for i in range(6)]
    rep = data(client.post(f"{API}/analytics/analyze", json={"profile_id": BEAUTY, "posts": posts}))
    assert all(p["engagement_rate"] is None for p in rep["top_posts"])
    assert rep["baseline"]["median_engagement_rate"] is None


def test_audience_endpoints(client):
    ins = data(client.get(f"{API}/audience/insights", params={"profile_id": BOUTIQUE}))
    assert ins["comments_analyzed"] > 0 and ins["caveats"]
    comments = [{"comment_id": f"c{i}", "text": "What is the price? Call me on 9876543210" if i == 0 else "Love it"} for i in range(12)]
    out = data(client.post(f"{API}/audience/analyze", json={"profile_id": BEAUTY, "comments": comments}))
    assert "9876543210" not in str(out)


def test_competitor_flow_pending_until_approved(client):
    sugg = data(client.post(f"{API}/competitors/suggest", json={"profile_id": BOUTIQUE, "max_suggestions": 2}), 201)
    assert sugg and all(c["approval_status"] == "PENDING" and c["source"] == "AI_SUGGESTED" for c in sugg)
    cid = sugg[0]["competitor_id"]
    assert client.get(f"{API}/competitors/{cid}/insights", params={"profile_id": BOUTIQUE}).status_code == 409
    assert data(client.patch(f"{API}/competitors/{cid}/approval", json={"profile_id": BOUTIQUE, "status": "APPROVED"}))["approval_status"] == "APPROVED"
    assert data(client.get(f"{API}/competitors/{cid}/insights", params={"profile_id": BOUTIQUE}))
    manual = data(client.post(f"{API}/competitors", json={"profile_id": BOUTIQUE, "username": "@my.rival"}), 201)
    assert manual["approval_status"] == "APPROVED" and manual["source"] == "MANUAL"
    assert client.delete(f"{API}/competitors/{manual['competitor_id']}", params={"profile_id": BOUTIQUE}).status_code == 204
    assert data(client.get(f"{API}/competitors", params={"profile_id": BOUTIQUE, "status": "PENDING"}))["total"] >= 0


def test_competitors_isolated_between_profiles(client):
    cid = data(client.post(f"{API}/competitors", json={"profile_id": BOUTIQUE, "username": "isolated.one"}), 201)["competitor_id"]
    assert client.get(f"{API}/competitors/{cid}/insights", params={"profile_id": BEAUTY}).status_code == 404
    assert client.delete(f"{API}/competitors/{cid}", params={"profile_id": BEAUTY}).status_code == 404
    assert client.patch(f"{API}/competitors/{cid}/approval", json={"profile_id": BEAUTY, "status": "REJECTED"}).status_code == 404


def test_trends_and_festivals(client):
    cur = data(client.post(f"{API}/trends/analyze", json={"profile_id": BOUTIQUE, "as_of": DEMO_DAY}))
    assert cur["current"] and all(t["usable_as_current"] for t in cur["current"])
    later = data(client.post(f"{API}/trends/analyze", json={"profile_id": BOUTIQUE, "as_of": "2027-06-01"}))
    assert later["current"] == [] and any("No current" in n for n in later["notes"])
    assert data(client.get(f"{API}/trends", params={"as_of": DEMO_DAY}))
    assert isinstance(data(client.get(f"{API}/trends/upcoming", params={"as_of": DEMO_DAY})), list)
    fests = data(client.get(f"{API}/festivals", params={"year": 2026}))
    assert fests and all(f["verification_status"] for f in fests)
    up = data(client.get(f"{API}/festivals/upcoming", params={"as_of": DEMO_DAY, "profile_id": BOUTIQUE}))
    assert up and all(u["days_until"] >= 0 for u in up)


def test_recommendation_flow(client):
    out = generate(client, count=4)
    recs = out["recommendations"]
    assert len(recs) == 4
    rid = recs[0]["recommendation_id"]
    assert data(client.get(f"{API}/recommendations/{rid}", params={"profile_id": BOUTIQUE}))["recommendation_id"] == rid
    assert data(client.get(f"{API}/recommendations", params={"profile_id": BOUTIQUE}))["total"] == 4
    assert client.get(f"{API}/recommendations/{rid}", params={"profile_id": BEAUTY}).status_code == 404  # another profile cannot read it
    assert data(client.get(f"{API}/recommendations", params={"profile_id": BEAUTY}))["total"] == 0
    for bad in ({"profile_id": BOUTIQUE, "count": 2}, {"profile_id": BOUTIQUE, "count": 6}, {"profile_id": BOUTIQUE, "goal": "WORLD_PEACE"}):
        assert client.post(f"{API}/recommendations/generate", json=bad).status_code == 422
    assert client.post(f"{API}/recommendations/generate", json={"profile_id": "ghost"}).status_code == 404


def test_use_ai_mock_and_failure_modes(client):
    out = generate(client, use_ai=True)
    assert all(r["generation"]["generation_method"] == "rules_plus_ai_wording" for r in out["recommendations"])
    broken = TestClient(create_app(make_settings(load_mock_data=True, ai_provider="gemini")))
    r = broken.post(f"{API}/recommendations/generate", json={"profile_id": BOUTIQUE, "use_ai": True})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_not_configured"
    assert data(broken.get(f"{API}/recommendations", params={"profile_id": BOUTIQUE}))["total"] == 0  # nothing half-saved


def test_feedback_and_outcomes(client):
    rid = generate(client)["recommendations"][0]["recommendation_id"]
    fb = data(client.post(f"{API}/recommendations/{rid}/feedback", json={"profile_id": BOUTIQUE, "action": "SAVED", "comment": "good"}), 201)
    assert fb["action"] == "SAVED"
    assert client.post(f"{API}/recommendations/{rid}/feedback", json={"profile_id": BEAUTY, "action": "SAVED"}).status_code == 404
    assert client.post(f"{API}/recommendations/{rid}/feedback", json={"profile_id": BOUTIQUE, "action": "EXPLODED"}).status_code == 422
    assert len(data(client.get(f"{API}/feedback", params={"profile_id": BOUTIQUE}))) == 1
    assert data(client.get(f"{API}/feedback", params={"profile_id": BEAUTY})) == []

    body = {"profile_id": BOUTIQUE, "interval": "H24", "metrics": {"reach": 2000, "likes": 150, "comments": 20}}
    o = data(client.post(f"{API}/recommendations/{rid}/outcomes", json=body), 201)
    assert o["engagement_rate"] == 0.085 and o["performance_index"] is not None
    assert client.post(f"{API}/recommendations/{rid}/outcomes", json=body).status_code == 409  # same interval twice
    thin = data(client.post(f"{API}/recommendations/{rid}/outcomes", json={"profile_id": BOUTIQUE, "interval": "D7", "metrics": {"saves": 3}}), 201)
    assert thin["engagement_rate"] is None and thin["performance_index"] is None and thin["metrics_available"] == ["saves"]
    assert len(data(client.get(f"{API}/recommendations/{rid}/outcomes", params={"profile_id": BOUTIQUE}))) == 2
    assert client.get(f"{API}/recommendations/{rid}/outcomes", params={"profile_id": BEAUTY}).status_code == 404
    assert client.post(f"{API}/recommendations/{rid}/outcomes", json={**body, "interval": "D7", "metrics": {"likes": -1}}).status_code == 422


def test_feedback_changes_future_recommendations(client):
    first = generate(client, count=5)["recommendations"]
    target = first[0]
    for rec in first[:3]:
        client.post(f"{API}/recommendations/{rec['recommendation_id']}/feedback", json={"profile_id": BOUTIQUE, "action": "NOT_RELEVANT"})
    second = generate(client, count=5)
    assert target["idea_fingerprint"] not in {r["idea_fingerprint"] for r in second["recommendations"]}  # rejected ideas are not offered again
    assert any("already used or rejected" in n for n in second["notes"])


def test_learning_is_bounded_and_explained(client):
    for _ in range(4):
        recs = generate(client, count=5)["recommendations"]
        for r in recs:
            client.post(f"{API}/recommendations/{r['recommendation_id']}/feedback", json={"profile_id": BOUTIQUE, "action": "LIKED" if r["format"] == "REEL" else "DISMISSED"})
    info = data(client.get(f"{API}/learning", params={"profile_id": BOUTIQUE}))
    assert "Not a trained model" in info["method"]
    assert all(abs(a["adjustment"]) <= info["max_adjustment"] for a in info["adjustments"])
    for r in generate(client)["recommendations"]:
        assert abs(r["score_breakdown"]["learning_adjustment"]) <= 8


def test_learning_needs_minimum_samples(client):
    rid = generate(client)["recommendations"][0]["recommendation_id"]
    client.post(f"{API}/recommendations/{rid}/feedback", json={"profile_id": BOUTIQUE, "action": "LIKED"})
    assert data(client.get(f"{API}/learning", params={"profile_id": BOUTIQUE}))["adjustments"] == []


def test_two_businesses_do_not_leak_into_each_other(client):
    a = generate(client, BOUTIQUE)
    b = generate(client, RESTAURANT)
    blob_a = str(a).lower()
    assert "thali" not in blob_a and "biryani" not in blob_a
    assert "kurti" not in str(b).lower()


def test_oversized_body_rejected(client):
    r = client.post(f"{API}/profiles", content=b"x" * 3_000_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_production_requires_service_token():
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(environment="production", service_token=None)
    secured = TestClient(create_app(make_settings(service_token="s3cret-token", load_mock_data=True)))
    assert secured.get(f"{API}/health").status_code == 200
    assert secured.get(f"{API}/profiles/{BOUTIQUE}").status_code == 401
    assert secured.get(f"{API}/profiles/{BOUTIQUE}", headers={"authorization": "Bearer wrong"}).status_code == 401
    assert secured.get(f"{API}/profiles/{BOUTIQUE}", headers={"authorization": "Bearer s3cret-token"}).status_code == 200
    assert secured.post(f"{API}/recommendations/generate", json={"profile_id": BOUTIQUE}).status_code == 401


def test_secrets_never_appear_in_responses_or_errors():
    c = TestClient(create_app(make_settings(load_mock_data=True, ai_provider="mock", anthropic_api_key="sk-ant-SECRETKEY", gemini_api_key="AIza-SECRETKEY")))
    texts = [c.get(f"{API}/health").text, c.post(f"{API}/recommendations/generate", json={"profile_id": BOUTIQUE, "use_ai": True}).text, c.get(f"{API}/profiles/ghost").text]
    assert not any("SECRETKEY" in t for t in texts)
