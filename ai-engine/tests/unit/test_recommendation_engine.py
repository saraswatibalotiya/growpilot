from datetime import date

import pytest

from app.api.dependencies import build_container
from app.core.config import Settings
from app.core.exceptions import ConflictError
from app.data.seed import load_mock_data
from app.recommendation.diversity import select_diverse
from app.recommendation.models import Candidate, Seed
from app.recommendation.ranking import effective_weights
from app.recommendation.strategies.business import BusinessStrategy
from app.recommendation.strategies.creator import CreatorStrategy
from app.schemas.profile import ContentFormat, Objective, ProfileCreate, ProfileType
from app.schemas.recommendation import Evidence, GenerateRequest, SignalName, SourceReference
from app.services.recommendation_service import RecommendationService
from tests.conftest import BEAUTY, BOUTIQUE, RESTAURANT

DAY = date(2026, 10, 5)


@pytest.fixture
def world():
    c = build_container(Settings(environment="test"))
    load_mock_data(c.store)
    svc = RecommendationService(c.store, c.settings, c.analytics, c.audience, c.competitors, c.trends, c.festivals)
    return c, svc


def gen(svc, pid, **kw):
    return svc.generate(GenerateRequest(profile_id=pid, as_of=DAY, **kw))


def test_three_to_five_ranked_with_separate_scores(world):
    _, svc = world
    for n in (3, 4, 5):
        recs, _ = gen(svc, BOUTIQUE, count=n)
        assert len(recs) == n
        assert [r.opportunity_score for r in recs] == sorted((r.opportunity_score for r in recs), reverse=True)
        assert all(0 <= r.opportunity_score <= 100 and 0 <= r.confidence_score <= 100 for r in recs)
    assert len({(r.opportunity_score, r.confidence_score) for r in recs}) > 1  # not the same number twice


def test_every_recommendation_answers_the_seven_questions_with_evidence(world):
    _, svc = world
    recs, _ = gen(svc, BOUTIQUE)
    for r in recs:
        assert all(getattr(r.reasoning, f) for f in r.reasoning.model_fields)
        assert r.score_breakdown.explanation and r.risks_and_caveats is not None
        non_evergreen = [t for t in r.tags if t != "evergreen"]
        if non_evergreen:
            assert r.supporting_evidence


def test_business_and_creator_differ(world):
    _, svc = world
    biz, _ = gen(svc, RESTAURANT)
    cre, _ = gen(svc, BEAUTY)
    assert {r.objective for r in biz} != {r.objective for r in cre} or {r.title for r in biz} != {r.title for r in cre}
    assert any(o in {Objective.SALES, Objective.LEADS, Objective.PRODUCT_DISCOVERY, Objective.BRAND_AWARENESS} for o in (r.objective for r in biz))


def test_goal_override_changes_goal_alignment(world):
    _, svc = world
    sales, _ = gen(svc, BOUTIQUE, goal=Objective.SALES)
    saves, _ = gen(svc, BOUTIQUE, goal=Objective.SAVES)
    assert [r.score_breakdown.signals["goal"] for r in sales] != [r.score_breakdown.signals["goal"] for r in saves] or {r.title for r in sales} != {r.title for r in saves}


def test_diversity_no_duplicates_and_format_mix(world):
    _, svc = world
    for pid in (BOUTIQUE, BEAUTY, RESTAURANT):
        recs, _ = gen(svc, pid, count=5)
        assert len({r.idea_fingerprint for r in recs}) == len(recs)
        assert len({r.title for r in recs}) == len(recs)
        formats = [r.format for r in recs]
        assert max(formats.count(f) for f in set(formats)) <= 3


def test_missing_sources_are_excluded_not_zero(world):
    c, svc = world
    pid = c.profiles.create(ProfileCreate(profile_type=ProfileType.CREATOR, name="Blank", niche="fashion", goals=[Objective.REACH])).profile_id
    recs, notes = gen(svc, pid, count=3)
    assert any("post analytics" in n for n in notes)
    for r in recs:
        assert "historical" in r.score_breakdown.signals_missing
        assert r.score_breakdown.signals["historical"] is None
        assert "historical" not in r.score_breakdown.weights_used
        assert abs(sum(r.score_breakdown.weights_used.values()) - 1) < 0.01


def test_effective_weights_renormalise():
    w = {"historical": 0.25, "audience": 0.2, "trend": 0.2, "festival": 0.15, "competitor": 0.1, "goal": 0.1}
    eff = effective_weights(w, {SignalName.HISTORICAL: 0.5, SignalName.TREND: None, SignalName.GOAL: 0.0})
    assert set(eff) == {"historical", "goal"} and abs(sum(eff.values()) - 1) < 1e-3
    assert effective_weights(w, {SignalName.TREND: None}) == {}


def test_no_trends_means_no_trend_claims():
    c = build_container(Settings(environment="test"))
    load_mock_data(c.store)
    svc = RecommendationService(c.store, c.settings, c.analytics, c.audience, c.competitors, c.trends, c.festivals)
    recs, notes = svc.generate(GenerateRequest(profile_id=BOUTIQUE, as_of=date(2027, 3, 1)))  # every sample trend is stale by then
    assert any("trending" in n or "trend" in n for n in notes)
    assert not any("trend_driven" in r.tags for r in recs)
    assert all(r.score_breakdown.signals["trend"] is None for r in recs)


def test_stale_festival_is_not_used_after_it_passes():
    c = build_container(Settings(environment="test"))
    load_mock_data(c.store)
    svc = RecommendationService(c.store, c.settings, c.analytics, c.audience, c.competitors, c.trends, c.festivals)
    recs, _ = svc.generate(GenerateRequest(profile_id=BOUTIQUE, as_of=date(2026, 12, 20)))
    past = ("Dussehra", "Navratri", "Diwali", "Raksha Bandhan", "Ganesh Chaturthi")
    assert not any(name in r.title for r in recs for name in past)  # festivals that already happened are never recommended
    for r in recs:
        if r.suggested_publish_date:
            assert r.suggested_publish_date > date(2026, 12, 20)


def test_excluded_topics_never_recommended(world):
    c, svc = world
    from app.schemas.profile import ProfileUpdate

    c.store.update(BOUTIQUE, ProfileUpdate(excluded_topics=["styling", "festive", "kurti"]))
    recs, _ = gen(svc, BOUTIQUE, count=3)
    for r in recs:
        text = f"{r.title} {r.content_idea} {r.detailed_concept}".lower()
        assert "styling" not in text and "festive" not in text and "kurti" not in text


def test_hashtags_are_never_invented(world):
    _, svc = world
    recs, _ = gen(svc, BOUTIQUE, count=5)
    trend_tags = {h.lower() for a in svc.trends.current_for(BOUTIQUE, DAY) for h in a.trend.hashtags}
    posts_blob = " ".join((p.caption or "").lower() for p in svc.store.get_posts(BOUTIQUE))
    for r in recs:
        for h in r.hashtags:
            assert h.lower() in trend_tags or h.lower() in posts_blob


def test_deterministic_ranking(world):
    _, svc = world
    a, _ = gen(svc, BOUTIQUE)
    b, _ = gen(svc, BOUTIQUE)
    assert [r.idea_fingerprint for r in a] == [r.idea_fingerprint for r in b]


def test_festival_publish_date_leads_the_festival_and_is_future(world):
    _, svc = world
    recs, _ = gen(svc, BOUTIQUE, count=5)
    fest = [r for r in recs if "festival_driven" in r.tags]
    assert fest and all(r.suggested_publish_date and r.suggested_publish_date > DAY for r in fest)


def _cand(title, topic, fmt, kind, opp):
    seed = Seed(kind, topic, title, 0.5, 0.5, Evidence(signal=SignalName.GOAL, statement="x"), SourceReference(type="t", name="n"))
    c = Candidate(seed=seed, title=title, idea="i", concept="c", format=fmt, objective=Objective.REACH, hook="h", caption_direction="d", cta="c", topic=topic)
    c.opportunity, c.fingerprint = opp, title
    return c


def test_diversity_selection_rules():
    names = ["alpha", "bravo", "charlie", "delta", "echo"]
    kinds = ["trend", "festival", "historical", "audience_question", "competitor"]
    ranked = [_cand(f"t{i}", names[i], ContentFormat.REEL, kinds[i], 90 - i) for i in range(5)]
    ranked += [_cand("c1", "caro one", ContentFormat.CAROUSEL, "audience_question", 40), _cand("dup", "alpha", ContentFormat.CAROUSEL, "evergreen", 39), _cand("c2", "other", ContentFormat.SINGLE_IMAGE, "evergreen", 38)]
    chosen, _ = select_diverse(ranked, 4)
    assert len(chosen) == 4 and len({c.topic for c in chosen}) == 4
    assert sum(c.format == ContentFormat.REEL for c in chosen) <= 2


def test_learning_never_overrides_evidence_beyond_cap(world):
    c, svc = world
    recs, _ = gen(svc, BOUTIQUE)
    assert all(abs(r.score_breakdown.learning_adjustment) <= 8 for r in recs)


def test_strategies_are_distinct_objects():
    assert BusinessStrategy().name == "business" and CreatorStrategy().name == "creator"


def test_nothing_to_recommend_is_an_error_not_a_fake_success():
    c = build_container(Settings(environment="test"))
    svc = RecommendationService(c.store, c.settings, c.analytics, c.audience, c.competitors, c.trends, c.festivals)
    pid = c.profiles.create(ProfileCreate(profile_type=ProfileType.CREATOR, name="Empty")).profile_id
    try:
        recs, _ = svc.generate(GenerateRequest(profile_id=pid, as_of=DAY))
    except ConflictError:
        return
    assert len(recs) >= 3  # evergreen ideas are acceptable, an empty "success" is not
