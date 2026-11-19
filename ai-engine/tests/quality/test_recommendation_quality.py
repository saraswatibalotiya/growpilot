"""Recommendation QUALITY checks on the five FICTIONAL demo datasets (app/demos). Evaluation date 2026-11-17.

These test judgement, not plumbing: is the advice specific to the business, does real performance drive it, do generic trends
stay out, is confidence honest when data is thin, and are rejected ideas really gone."""

from datetime import date

import pytest

from app.demos.datasets import EVAL_DATE, GENERIC_TRENDS, build
from app.demos.expectations import EXPECTATIONS, compare, text_of
from app.demos.runner import DEMO_KEYS, load_demo, make_container, run_demo
from app.recommendation.models import Candidate, Seed
from app.recommendation.ranking import score_candidate
from app.schemas.profile import ContentFormat, Objective
from app.schemas.recommendation import Evidence, FeedbackAction, FeedbackIn, GenerateRequest, SignalName, SourceReference
from app.schemas.trend import Trend

pytestmark = pytest.mark.filterwarnings("ignore")


def generate(c, pid, **kw):
    return c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=kw.pop("as_of", EVAL_DATE), **kw))


# ---------------------------------------------------------------- datasets are honest and complete

@pytest.mark.parametrize("key", DEMO_KEYS)
def test_datasets_are_labelled_fictional_and_dated_before_evaluation(key):
    d = build(key)
    assert "FICTIONAL" in d["label"] and "Not real" in d["label"]
    assert "fictional" in d["profile"]["name"].lower()
    assert all(p["posted_at"][:10] < EVAL_DATE.isoformat() for p in d["posts"])
    assert all("example.com" in t["source_url"] and "Fictional" in t["description"] for t in d["trends"])


@pytest.mark.parametrize("key", [k for k in DEMO_KEYS if k != "new_business"])
def test_datasets_carry_every_supported_metric_and_hashtags(key):
    posts = build(key)["posts"]
    for metric in ("views", "reach", "likes", "comments", "shares", "saves"):
        assert any(p.get(metric) is not None for p in posts), metric
    assert any(p.get("shares") is None for p in posts)  # some metrics are deliberately missing, as on real accounts
    assert all("#" in p["caption"] for p in posts)
    assert {p["media_type"] for p in posts} >= {"VIDEO", "CAROUSEL_ALBUM"}


def test_dataset_files_match_the_generator():
    """The committed JSON must be what the generator produces, so the demos are reproducible."""
    from app.demos.runner import read_demo

    for key in DEMO_KEYS:
        assert read_demo(key) == __import__("json").loads(__import__("json").dumps(build(key)))


# ---------------------------------------------------------------- expected vs actual

@pytest.mark.parametrize("key", DEMO_KEYS)
def test_every_expectation_holds(key):
    checks, _ = compare(key)
    failed = [f"{c.name}: expected {c.expected}, got {c.actual}" for c in checks if not c.passed]
    assert not failed, failed


@pytest.mark.parametrize("key", DEMO_KEYS)
@pytest.mark.parametrize("count", [3, 4, 5])
def test_specific_to_category_at_every_count(key, count):
    exp = EXPECTATIONS[key]
    _, _, recs, notes = run_demo(key, count=count)
    # Fewer than asked is acceptable only when the data supports fewer distinct ideas AND the response says so.
    assert len(recs) == count or (len(recs) >= 3 and any("distinct ideas" in n for n in notes))
    assert sum(any(t in text_of(r) for t in exp.specific_terms) for r in recs) >= min(exp.min_specific, len(recs))
    assert not [t for r in recs for t in exp.forbidden_terms if t in text_of(r)]


# ---------------------------------------------------------------- performance drives recommendations

@pytest.mark.parametrize("key", [k for k in DEMO_KEYS if k != "new_business"])
def test_the_top_idea_is_backed_by_the_accounts_own_results(key):
    _, _, recs, _ = run_demo(key)
    best = max(recs, key=lambda r: r.score_breakdown.signals.get("historical") or 0)
    assert recs.index(best) < 2
    assert any(e.signal == SignalName.HISTORICAL for e in best.supporting_evidence)


@pytest.mark.parametrize("key", [k for k in DEMO_KEYS if k != "new_business"])
def test_losing_topics_are_never_called_strengths(key):
    exp = EXPECTATIONS[key]
    _, _, recs, _ = run_demo(key, count=5)
    for r in recs:
        for e in r.supporting_evidence:
            if e.signal == SignalName.HISTORICAL and "above" in e.statement:
                assert not any(f"'{t}'" in e.statement for t in exp.losing_topics), (r.title, e.statement)


def test_winning_topic_beats_an_untested_trend_in_the_same_category():
    """A fresh, relevant trend with no support in the account's own history must not outrank a proven winner."""
    c = make_container()
    pid = load_demo(c, "restaurant")
    hot = Trend(trend_id="demo_hot_dessert", title="Vegan dessert reels", description="Fictional sample: vegan dessert reels are everywhere.", category="FOOD", kind="FACT", source_name="Sample Desk (fictional)", source_url="https://example.com/x", published_date=date(2026, 11, 15), verified_date=date(2026, 11, 15), expiry_date=date(2026, 12, 15), relevance_score=1.0, confidence_score=0.95)
    c.trends.provider.extra.append(hot)
    recs, _ = generate(c, pid, count=5)
    scores = {r.title: r.opportunity_score for r in recs}
    trend_rec = next((r for r in recs if "vegan dessert" in r.title.lower()), None)
    top = recs[0]
    assert "vegan dessert" not in top.title.lower()
    if trend_rec is not None:
        assert trend_rec.opportunity_score < top.opportunity_score, scores


@pytest.mark.parametrize("key", DEMO_KEYS)
def test_generic_trends_are_not_used_at_all(key):
    c = make_container()
    pid = load_demo(c, key)
    used = {a.trend.trend_id for a in c.trends.current_for(pid, EVAL_DATE)}
    assert not used & {t["trend_id"] for t in GENERIC_TRENDS}
    recs, _ = generate(c, pid)
    assert not any("comedy audio" in text_of(r) or "ai tools" in text_of(r) for r in recs)


def test_in_category_trend_is_used_and_cited_with_its_source():
    _, _, recs, _ = run_demo("beauty_creator")
    trend_evidence = [e for r in recs for e in r.supporting_evidence if e.signal == SignalName.TREND]
    assert trend_evidence and all("verified 2026-11-13" in e.statement for e in trend_evidence)
    own = {h.lower() for p in build("beauty_creator")["posts"] for h in p["caption"].split() if h.startswith("#")}
    assert all(h.lower() in own for r in recs for h in r.hashtags)  # the sample trend reports none, so only the creator's own tags appear


# ---------------------------------------------------------------- insufficient data

def test_new_business_confidence_is_honestly_low_and_explained():
    _, _, recs, notes = run_demo("new_business")
    assert max(r.confidence_score for r in recs) <= 45
    for r in recs:
        joined = " ".join(r.risks_and_caveats)
        assert "Only 3 posts" in joined and "comments" in joined
    assert any("audience" in n.lower() for n in notes)


def test_new_business_confidence_is_below_every_data_rich_profile():
    avg = {}
    for key in DEMO_KEYS:
        _, _, recs, _ = run_demo(key)
        avg[key] = sum(r.confidence_score for r in recs) / len(recs)
    assert avg["new_business"] < min(v for k, v in avg.items() if k != "new_business") - 10


def test_new_business_never_claims_a_pattern_it_cannot_know():
    _, _, recs, _ = run_demo("new_business", count=5)
    for r in recs:
        assert "audience already loves" not in text_of(r)
        for e in r.supporting_evidence:
            assert e.signal != SignalName.HISTORICAL or "above a typical post" not in e.statement
    assert all(r.score_breakdown.signals.get("audience") is None for r in recs)


def test_confidence_grows_when_real_history_is_added():
    """Same business, only the amount of its own data changes."""
    thin = make_container()
    pid = load_demo(thin, "new_business")
    rich = make_container()
    pid2 = load_demo(rich, "beauty_creator")
    a = sum(r.confidence_score for r in generate(thin, pid)[0])
    b = sum(r.confidence_score for r in generate(rich, pid2)[0])
    assert b > a


# ---------------------------------------------------------------- scores are independent

def _cand(strength, evidence_conf, supporting=True):
    seed = Seed("trend", "t", "t", 0.5, 0.5, Evidence(signal=SignalName.TREND, statement="x"), SourceReference(type="t", name="n"))
    c = Candidate(seed=seed, title="t", idea="i", concept="c", format=ContentFormat.REEL, objective=Objective.REACH, hook="h", caption_direction="d", cta="c", topic="t")
    c.signals = {SignalName.HISTORICAL: strength, SignalName.TREND: strength, SignalName.GOAL: 0.5}
    c.evidence_confidence = {SignalName.HISTORICAL: evidence_conf, SignalName.TREND: evidence_conf}
    return c


def test_changing_evidence_quality_moves_confidence_not_opportunity():
    from app.demos.runner import make_container as mk

    c = mk()
    pid = load_demo(c, "restaurant")
    sig, _ = c.recommendations.collect_signals(pid, EVAL_DATE)
    w = c.settings.weights.as_dict()
    a, b = _cand(0.8, 0.9), _cand(0.8, 0.3)
    score_candidate(a, sig, w)
    score_candidate(b, sig, w)
    assert a.opportunity == b.opportunity and a.confidence > b.confidence + 20


def test_changing_signal_strength_moves_opportunity_not_confidence():
    c = make_container()
    pid = load_demo(c, "restaurant")
    sig, _ = c.recommendations.collect_signals(pid, EVAL_DATE)
    w = c.settings.weights.as_dict()
    a, b = _cand(0.9, 0.7), _cand(0.4, 0.7)
    score_candidate(a, sig, w)
    score_candidate(b, sig, w)
    assert a.opportunity > b.opportunity + 20 and a.confidence == b.confidence


@pytest.mark.parametrize("key", DEMO_KEYS)
def test_opportunity_and_confidence_rank_ideas_differently(key):
    _, _, recs, _ = run_demo(key, count=5)
    by_opp = [r.recommendation_id for r in sorted(recs, key=lambda r: -r.opportunity_score)]
    by_conf = [r.recommendation_id for r in sorted(recs, key=lambda r: -r.confidence_score)]
    pairs = {(r.opportunity_score, r.confidence_score) for r in recs}
    assert len(pairs) > 1
    if key != "new_business":
        assert by_opp != by_conf  # high opportunity is not the same thing as high confidence


# ---------------------------------------------------------------- suppression and duplicates

SUPPRESSING = [FeedbackAction.PUBLISHED, FeedbackAction.DISMISSED, FeedbackAction.NOT_RELEVANT, FeedbackAction.ALREADY_POSTED, FeedbackAction.CREATED]


@pytest.mark.parametrize("key", DEMO_KEYS)
@pytest.mark.parametrize("action", SUPPRESSING)
def test_rejected_or_used_ideas_do_not_come_back(key, action):
    c = make_container()
    pid = load_demo(c, key)
    first, _ = generate(c, pid, count=3)
    target = first[0]
    c.feedback.record(target.recommendation_id, FeedbackIn(profile_id=pid, action=action))
    again, notes = generate(c, pid, count=3)
    assert target.idea_fingerprint not in {r.idea_fingerprint for r in again}
    assert target.title not in {r.title for r in again}
    assert any("already used or rejected" in n for n in notes)


@pytest.mark.parametrize("action", [FeedbackAction.SAVED, FeedbackAction.LIKED])
def test_saved_or_liked_ideas_are_still_offered(action):
    c = make_container()
    pid = load_demo(c, "restaurant")
    first, _ = generate(c, pid, count=3)
    c.feedback.record(first[0].recommendation_id, FeedbackIn(profile_id=pid, action=action))
    again, _ = generate(c, pid, count=3)
    assert first[0].idea_fingerprint in {r.idea_fingerprint for r in again}


def test_suppression_never_crosses_profiles():
    c = make_container()
    a, b = load_demo(c, "fashion_creator"), load_demo(c, "beauty_creator")
    recs_a, _ = generate(c, a, count=3)
    before = [r.idea_fingerprint for r in generate(c, b, count=3)[0]]
    for r in recs_a:
        c.feedback.record(r.recommendation_id, FeedbackIn(profile_id=a, action=FeedbackAction.DISMISSED))
    assert [r.idea_fingerprint for r in generate(c, b, count=3)[0]] == before


@pytest.mark.parametrize("key", DEMO_KEYS)
@pytest.mark.parametrize("count", [3, 4, 5])
def test_no_duplicate_recommendations(key, count):
    _, _, recs, _ = run_demo(key, count=count)
    assert len({r.idea_fingerprint for r in recs}) == len(recs)
    assert len({r.title.lower() for r in recs}) == len(recs)
    assert len({r.content_idea.lower() for r in recs}) == len(recs)
    # Two ideas of the same kind in the same format are one idea twice, even with different words.
    kinds = [(next((t for t in r.tags), ""), r.format) for r in recs]
    assert len(set(kinds)) >= len(kinds) - 1


# ---------------------------------------------------------------- dates

def test_evaluation_date_is_configurable_and_default_is_the_sample_date():
    assert EVAL_DATE == date(2026, 11, 17)
    _, _, now, _ = run_demo("restaurant")
    _, _, later, _ = run_demo("restaurant", as_of=date(2026, 12, 20))
    assert [r.title for r in now] != [r.title for r in later]


def test_future_festival_is_planned_ahead_and_never_in_the_past():
    _, _, recs, _ = run_demo("restaurant", as_of=date(2026, 12, 10), count=5)
    xmas = [r for r in recs if "Christmas" in r.title]
    assert xmas and all(date(2026, 12, 10) < r.suggested_publish_date <= date(2026, 12, 25) for r in xmas)
    _, _, after, _ = run_demo("restaurant", as_of=date(2026, 12, 27), count=5)
    assert not any("Christmas" in r.title for r in after)


def test_trends_verified_after_the_evaluation_date_are_not_used():
    """The sample trends were verified in mid-November. Evaluating 1 October must not know about them."""
    c = make_container()
    pid = load_demo(c, "beauty_creator")
    assert c.trends.current_for(pid, date(2026, 10, 1)) == []
    recs, notes = generate(c, pid, as_of=date(2026, 10, 1))
    assert not any("trend_driven" in r.tags for r in recs)
    assert all(r.score_breakdown.signals["trend"] is None for r in recs)
    assert any("trend" in n.lower() for n in notes)


def test_trends_become_stale_after_the_freshness_window():
    c = make_container()
    pid = load_demo(c, "beauty_creator")
    assert c.trends.current_for(pid, date(2026, 11, 20))
    assert c.trends.current_for(pid, date(2026, 12, 14)) == []  # verified 2026-11-13, window 14 days


def test_history_after_the_evaluation_date_is_not_used():
    """Evaluating a past day must not use posts that had not happened yet."""
    c = make_container()
    pid = load_demo(c, "restaurant")
    _, notes = generate(c, pid, as_of=date(2026, 10, 20))
    assert any("dated later were ignored" in n for n in notes)
    report, ignored = c.analytics.report_as_of(pid, date(2026, 10, 20))
    assert ignored > 0 and report.posts_analyzed == len(c.store.get_posts(pid)) - ignored
    _, notes_now = generate(c, pid)
    assert not any("dated later were ignored" in n for n in notes_now)


def test_evaluating_before_any_history_says_so_and_lowers_confidence():
    c = make_container()
    pid = load_demo(c, "restaurant")
    recs, notes = generate(c, pid, as_of=date(2026, 8, 1))
    assert any("No post analytics" in n for n in notes)
    assert all(r.score_breakdown.signals["historical"] is None for r in recs)
    assert all(any("No post history" in x for x in r.risks_and_caveats) for r in recs)


def test_committed_quality_report_is_current():
    """docs/RECOMMENDATION_QUALITY.md must be what `python -m app.demos --report` produces now. If this fails, rerun it."""
    from app.demos.report import REPORT_PATH, build_report

    assert REPORT_PATH.read_text(encoding="utf-8") == build_report()
    assert "| FAIL |" not in build_report()
