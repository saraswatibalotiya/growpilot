"""One set of tests, two implementations: memory and PostgreSQL must behave the same through the Store interface."""

import uuid
from datetime import UTC, date, datetime, timedelta

from app.schemas.analytics import PostIn
from app.schemas.audience import CommentIn, Demographics, LocationShare
from app.schemas.competitor import ApprovalStatus, Competitor, CompetitorPost, CompetitorSource
from app.schemas.learning import LearningAdjustment
from app.schemas.outcome import Outcome, OutcomeInterval, OutcomeMetrics
from app.schemas.profile import ContentFormat, Objective, ProfileCreate, ProfileType, ProfileUpdate
from app.schemas.recommendation import AIDiagnostics, Evidence, Feedback, FeedbackAction, Reasoning, Recommendation, ScoreBreakdown, SignalName, SourceReference

NOW = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)


def new_profile(store, pid="prof_a", **kw):
    data = dict(profile_type=ProfileType.BUSINESS, name="Shop A", niche="fashion", goals=[Objective.SALES], products=["kurti"], preferred_formats=[ContentFormat.REEL], city="Pune") | kw
    return store.create(ProfileCreate(**data), profile_id=pid)


def rec(profile_id="prof_a", **kw) -> Recommendation:
    data = dict(
        recommendation_id=str(uuid.uuid4()), profile_id=profile_id, created_at=NOW, title="T", content_idea="I", detailed_concept="C", format=ContentFormat.REEL, objective=Objective.SALES, target_audience="Everyone",
        suggested_publish_date=date(2026, 11, 20), publish_timing_note="soon", hook="H", caption_direction="D", call_to_action="CTA", hashtags=["#a"], opportunity_score=70, confidence_score=55,
        score_breakdown=ScoreBreakdown(weights_used={"goal": 1.0}, signals={"goal": 1.0, "trend": None}, signals_available=["goal"], signals_missing=["trend"], learning_adjustment=0.0, explanation="why"),
        reasoning=Reasoning(what_to_post="a", why_post_it="b", why_relevant_to_audience="c", supporting_evidence="d", why_now="e", what_it_looks_like="f", audience_action="g"),
        supporting_evidence=[Evidence(signal=SignalName.HISTORICAL, statement="first", metrics={"index": 1.2, "topic": "x", "none": None}), Evidence(signal=SignalName.GOAL, statement="second")],
        source_references=[SourceReference(type="analytics", name="n")], risks_and_caveats=["careful"], suggested_duration_seconds=15, idea_fingerprint="fp1", tags=["performance_driven"],
        generation=AIDiagnostics(provider="none", model="rule_engine", generation_method="rules"),
    )
    return Recommendation(**(data | kw))


def test_profile_roundtrip_update_and_list(any_store):
    p = new_profile(any_store)
    assert any_store.get("prof_a").model_dump() == p.model_dump()
    assert any_store.get("nope") is None
    u = any_store.update("prof_a", ProfileUpdate(city="Mumbai", goals=[Objective.REACH]))
    assert u.city == "Mumbai" and u.goals == [Objective.REACH] and u.name == "Shop A" and u.updated_at >= p.updated_at
    assert any_store.update("nope", ProfileUpdate(city="x")) is None
    new_profile(any_store, "prof_b", name="Shop B")
    assert {x.profile_id for x in any_store.list()} == {"prof_a", "prof_b"}


def test_missing_metrics_stay_missing_and_zero_stays_zero(any_store):
    new_profile(any_store)
    posts = [PostIn(media_id="m1", caption="c", media_type="VIDEO", media_product_type="REELS", posted_at=NOW, views=0, reach=None, likes=5, comments=0, shares=None, saves=None, avg_watch_time_seconds=3.5), PostIn(media_id="m2", posted_at=NOW + timedelta(days=1))]
    any_store.set_posts("prof_a", posts, replace=True)
    got = {p.media_id: p for p in any_store.get_posts("prof_a")}
    assert got["m1"].views == 0 and got["m1"].reach is None and got["m1"].comments == 0 and got["m1"].shares is None and got["m1"].avg_watch_time_seconds == 3.5
    assert got["m2"].likes is None and got["m2"].caption is None


def test_set_posts_replace_and_merge(any_store):
    new_profile(any_store)
    mk = lambda i: PostIn(media_id=f"m{i}", posted_at=NOW + timedelta(days=i), likes=i)  # noqa: E731
    any_store.set_posts("prof_a", [mk(1), mk(2)], replace=True)
    merged = any_store.set_posts("prof_a", [mk(3), PostIn(media_id="m1", posted_at=NOW, likes=99)], replace=False)
    assert {p.media_id: p.likes for p in merged} == {"m1": 99, "m2": 2, "m3": 3}
    replaced = any_store.set_posts("prof_a", [mk(4)], replace=True)
    assert [p.media_id for p in replaced] == ["m4"]


def test_comments_and_demographics(any_store):
    new_profile(any_store)
    demo = Demographics(top_locations=[LocationShare(name="Pune", share=0.5)], age_ranges={"18-24": 0.3})
    any_store.set_comments("prof_a", [CommentIn(comment_id="c1", text="Price?"), CommentIn(comment_id="c2", text="Love it", posted_at=NOW, like_count=0)], demo, replace=True)
    assert {c.comment_id: c.like_count for c in any_store.get_comments("prof_a")} == {"c1": None, "c2": 0}
    assert any_store.get_demographics("prof_a") == demo
    any_store.set_comments("prof_a", [CommentIn(comment_id="c3", text="x")], None, replace=True)
    assert [c.comment_id for c in any_store.get_comments("prof_a")] == ["c3"]
    assert any_store.get_demographics("prof_a") == demo  # not wiped by a call that supplied none


def competitor(pid="prof_a", cid="comp_1", username="rival", **kw):
    return Competitor(competitor_id=cid, profile_id=pid, username=username, niche="x", description=None, source=CompetitorSource.AI_SUGGESTED, approval_status=ApprovalStatus.PENDING, suggestion_reason="why", suggestion_confidence=0.7, verified=False, created_at=NOW, public_posts=[CompetitorPost(media_id="p1", caption="hi", media_type="IMAGE", posted_at=NOW, likes=3, comments=None)]) .model_copy(update=kw)


def test_competitor_lifecycle(any_store):
    new_profile(any_store)
    any_store.add(competitor())
    got = any_store.get_competitor("prof_a", "comp_1")
    assert got.username == "rival" and got.public_posts[0].comments is None and got.approval_status == ApprovalStatus.PENDING and not got.verified
    approved = any_store.set_status("prof_a", "comp_1", ApprovalStatus.APPROVED)
    assert approved.approval_status == ApprovalStatus.APPROVED and approved.verified
    assert [c.competitor_id for c in any_store.list_competitors("prof_a", ApprovalStatus.APPROVED)] == ["comp_1"]
    assert any_store.list_competitors("prof_a", ApprovalStatus.PENDING) == []
    assert any_store.delete_competitor("prof_a", "comp_1") is True and any_store.delete_competitor("prof_a", "comp_1") is False
    assert any_store.get_competitor("prof_a", "comp_1") is None


def test_recommendations_roundtrip_exactly(any_store):
    new_profile(any_store)
    a, b = rec(), rec(created_at=NOW + timedelta(minutes=1), title="newer", idea_fingerprint="fp2")
    any_store.add_many([a, b])
    got = any_store.get_recommendation("prof_a", a.recommendation_id)
    assert got.model_dump(mode="json") == a.model_dump(mode="json")
    assert [r.title for r in any_store.list_recommendations("prof_a")] == ["newer", "T"]  # newest first
    assert any_store.get_recommendation("prof_a", str(uuid.uuid4())) is None
    assert any_store.get_recommendation("prof_a", "not-a-uuid") is None


def test_feedback_outcomes_and_adjustments(any_store):
    new_profile(any_store)
    r = rec()
    any_store.add_many([r])
    adj = [LearningAdjustment(dimension="format", value="REEL", samples=3, mean_signal=1.0, adjustment=4.0, active=True, computed_at=NOW, trigger_type="feedback", trigger_id="x")]
    fb = Feedback(feedback_id=str(uuid.uuid4()), recommendation_id=r.recommendation_id, profile_id="prof_a", action=FeedbackAction.SAVED, comment="nice", created_at=NOW)
    any_store.add_feedback(fb, adj)
    assert [f.model_dump(mode="json") for f in any_store.feedback_for_profile("prof_a")] == [fb.model_dump(mode="json")]
    assert [a.adjustment for a in any_store.list_learning_adjustments("prof_a")] == [4.0]
    out = Outcome(outcome_id=str(uuid.uuid4()), recommendation_id=r.recommendation_id, profile_id="prof_a", interval=OutcomeInterval.H24, instagram_media_id="ig1", captured_at=NOW, metrics=OutcomeMetrics(reach=1000, likes=50, comments=None), metrics_available=["reach", "likes"], engagement_rate=0.05, performance_index=None)
    any_store.add_outcome(out)
    assert [o.model_dump(mode="json") for o in any_store.outcomes_for("prof_a", r.recommendation_id)] == [out.model_dump(mode="json")]
    assert len(any_store.outcomes_for_profile("prof_a")) == 1


def test_everything_is_scoped_to_the_profile(any_store):
    new_profile(any_store, "prof_a")
    new_profile(any_store, "prof_b", name="B")
    r = rec("prof_a")
    any_store.add_many([r])
    any_store.set_posts("prof_a", [PostIn(media_id="m", posted_at=NOW)], True)
    any_store.add(competitor("prof_a"))
    assert any_store.get_recommendation("prof_b", r.recommendation_id) is None
    assert any_store.list_recommendations("prof_b") == [] and any_store.get_posts("prof_b") == []
    assert any_store.get_competitor("prof_b", "comp_1") is None and any_store.list_competitors("prof_b") == []
    assert any_store.set_status("prof_b", "comp_1", ApprovalStatus.REJECTED) is None
    assert any_store.delete_competitor("prof_b", "comp_1") is False
    assert any_store.outcomes_for("prof_b", r.recommendation_id) == []


def test_trend_snapshots_and_festivals(any_store):
    new_profile(any_store)
    any_store.save_trend_snapshot("prof_a", date(2026, 11, 17), [])
    assert any_store.list_trend_snapshots("prof_a")[0][0] == date(2026, 11, 17)
    assert any_store.list_trend_snapshots("prof_b") == []


def test_competitor_posts_can_be_supplied_and_replaced(any_store):
    from app.schemas.competitor import CompetitorDataSource

    new_profile(any_store)
    new_profile(any_store, "prof_b", name="B")
    any_store.add(competitor())
    assert any_store.get_competitor("prof_a", "comp_1").data_source == CompetitorDataSource.USER_SUPPLIED  # the default
    mk = lambda i, likes=None: CompetitorPost(media_id=f"n{i}", caption=f"c{i}", media_type="VIDEO", posted_at=NOW + timedelta(days=i), likes=likes, comments=0)  # noqa: E731
    updated = any_store.set_competitor_posts("prof_a", "comp_1", [mk(1, 5), mk(2)], True, CompetitorDataSource.USER_SUPPLIED)
    assert [p.media_id for p in updated.public_posts] == ["n1", "n2"] and updated.posts_updated_at is not None
    assert updated.public_posts[1].likes is None and updated.public_posts[1].comments == 0  # missing stays missing, zero stays zero
    merged = any_store.set_competitor_posts("prof_a", "comp_1", [mk(3), mk(1, 50)], False, CompetitorDataSource.USER_SUPPLIED)
    assert {p.media_id: p.likes for p in merged.public_posts} == {"n1": 50, "n2": None, "n3": None}
    assert any_store.set_competitor_posts("prof_b", "comp_1", [mk(9)], True, CompetitorDataSource.USER_SUPPLIED) is None  # another profile's competitor
    assert [p.media_id for p in any_store.get_competitor("prof_a", "comp_1").public_posts] == ["n1", "n2", "n3"]
