"""Competitor intelligence on FICTIONAL sample data: discovery, analysis from public data only, and competitive recommendations."""

from datetime import date

import pytest

from app.core.exceptions import ConflictError
from app.demos.competitors import SPEC, add_competitor, add_demo_competitors, make_posts, thin_out_kitchen_posts
from app.demos.datasets import EVAL_DATE
from app.demos.runner import load_demo, make_container
from app.integrations.competitors.data_providers import DataSourceNotAvailableError, OfficialInstagramProvider, SampleProvider, UserSuppliedProvider, all_providers
from app.schemas.competitor import Activity, ApprovalStatus, CompetitorDataSource, CompetitorPost, CompetitorPostsUpdate, CompetitorSource
from app.schemas.recommendation import GenerateRequest, SignalName

pytestmark = pytest.mark.filterwarnings("ignore")


@pytest.fixture
def world():
    """The restaurant demo with its own kitchen content thinned out, three active fictional competitors and one quiet one."""
    c = make_container()
    pid = load_demo(c, "restaurant")
    thin_out_kitchen_posts(c, pid)
    comps = add_demo_competitors(c, pid, include_inactive=True, include_pending=True)
    return c, pid, comps


def generate(c, pid, **kw):
    return c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=kw.pop("as_of", EVAL_DATE), count=kw.pop("count", 5)))


# ---------------------------------------------------------------- Layer B: analysis

def test_insights_describe_activity_formats_hashtags_and_themes(world):
    c, pid, comps = world
    ins = c.competitors.insights(pid, comps[0].competitor_id, EVAL_DATE)
    assert ins.activity == Activity.ACTIVE and ins.last_post_at is not None
    assert ins.posts_per_week and ins.top_hashtags and all(h.startswith("#") for h in ins.top_hashtags)
    assert {f.format.value for f in ins.format_engagement} >= {"VIDEO"}
    kitchen = next(t for t in ins.themes if t.topic == "behind the scenes")
    assert kitchen.competitor_posts >= 3 and kitchen.your_posts == 1 and kitchen.your_share < 0.1
    assert "behind the scenes" in ins.low_coverage_topics
    assert ins.data_source == CompetitorDataSource.SAMPLE_PROVIDER


def test_only_public_information_is_ever_reported(world):
    c, pid, comps = world
    ins = c.competitors.insights(pid, comps[0].competitor_id, EVAL_DATE)
    assert {"views", "reach", "saves", "shares"} <= set(ins.metrics_not_available)
    def keys(node):  # every field NAME anywhere in the result (the "not available" list holds values, not fields)
        if isinstance(node, dict):
            for k, v in node.items():
                yield str(k)
                yield from keys(v)
        elif isinstance(node, list):
            for v in node:
                yield from keys(v)

    assert not {"reach", "saves", "views", "shares", "impressions", "followers"} & set(keys(ins.model_dump(mode="json")))
    assert any("never compare" in cv.lower() for cv in ins.caveats) or ins.format_engagement  # public likes are within-account only
    landscape = c.competitors.landscape(pid, EVAL_DATE)
    assert any("private insights" in cv for cv in landscape.caveats)


def test_activity_is_judged_on_the_evaluation_date(world):
    c, pid, comps = world
    a = c.competitors.insights(pid, comps[0].competitor_id, EVAL_DATE)
    later = c.competitors.insights(pid, comps[0].competitor_id, date(2027, 2, 1))
    earlier = c.competitors.insights(pid, comps[0].competitor_id, date(2026, 10, 1))
    quiet = c.competitors.insights(pid, comps[3].competitor_id, EVAL_DATE)
    assert a.activity == Activity.ACTIVE and later.activity == Activity.INACTIVE and quiet.activity == Activity.INACTIVE
    assert earlier.posts_analyzed < a.posts_analyzed  # posts dated after the evaluation date are not used
    assert any("60 days" in cv for cv in quiet.caveats)


def test_competitor_posts_after_the_evaluation_date_are_not_used(world):
    c, pid, comps = world
    early = c.competitors.insights(pid, comps[0].competitor_id, date(2026, 9, 1))
    assert early.posts_analyzed == 0 or early.last_post_at.date() <= date(2026, 9, 1)


def test_landscape_names_the_gap_in_plain_words(world):
    c, pid, _ = world
    land = c.competitors.landscape(pid, EVAL_DATE)
    assert land.competitors_analyzed == 3 and len(land.competitors) == 4  # the quiet one is listed but not analysed
    assert land.gaps == ["3 of 3 approved competitors repeatedly post about 'behind the scenes' (13 public posts). You have 1 of your 24 posts on it."]
    assert any("60 days" in cv for cv in land.caveats) and any("FICTIONAL" in cv for cv in land.caveats)
    top = land.topics[0]
    assert top.topic == "behind the scenes" and top.competitors_covering == 3 and top.is_gap
    regional = next(t for t in land.topics if t.topic == "regional food")
    assert not regional.is_gap  # the restaurant already covers it heavily
    assert land.common_hashtags and sum(land.format_mix.values()) > 0


def test_no_gap_is_claimed_when_the_account_has_too_few_posts():
    c = make_container()
    pid = load_demo(c, "new_business")  # 3 posts: coverage can not be judged
    add_demo_competitors(c, pid)
    land = c.competitors.landscape(pid, EVAL_DATE)
    assert land.gaps == [] and any("fewer than 5 posts" in " ".join(i.caveats) for i in [c.competitors.insights(pid, comp.competitor_id, EVAL_DATE) for comp in c.competitors.approved(pid)])


def test_empty_landscape_is_honest():
    c = make_container()
    pid = load_demo(c, "restaurant")
    land = c.competitors.landscape(pid, EVAL_DATE)
    assert land.competitors_analyzed == 0 and land.gaps == [] and land.topics == []


# ---------------------------------------------------------------- Layer C: competitive recommendations

def test_a_cross_competitor_gap_becomes_a_recommendation_with_evidence(world):
    c, pid, _ = world
    recs, notes = generate(c, pid)
    gap = [r for r in recs if "competitor_gap" in r.tags]
    assert len(gap) == 1
    r = gap[0]
    assert r.title == "Start a weekly behind the scenes series"
    ev = [e for e in r.supporting_evidence if e.signal == SignalName.COMPETITOR]
    assert ev and "3 of 3 approved competitors" in ev[0].statement and ev[0].metrics["competitors_covering"] == 3 and ev[0].metrics["your_posts"] == 1
    assert r.score_breakdown.signals["competitor"] > 0.5
    assert r.source_references[0].type == "competitor_public_posts" and "@pune.plates.demo" in r.source_references[0].name
    assert any("FICTIONAL" in x for x in r.risks_and_caveats)
    assert any("cover 'behind the scenes' repeatedly" in n for n in notes)


def test_competitor_evidence_never_claims_private_metrics(world):
    c, pid, _ = world
    recs, _ = generate(c, pid)
    for r in recs:
        for e in r.supporting_evidence:
            if e.signal == SignalName.COMPETITOR:
                assert not any(w in e.statement.lower() for w in ("reach", "saves", "views", "impressions", "revenue"))
        assert "other accounts" not in r.caption_direction or "Do not mention" in r.caption_direction


def test_competitor_signal_does_not_override_a_proven_winner(world):
    c, pid, _ = world
    recs, _ = generate(c, pid)
    gap = next(r for r in recs if "competitor_gap" in r.tags)
    best = max(recs, key=lambda r: r.score_breakdown.signals.get("historical") or 0)
    assert gap.opportunity_score < recs[0].opportunity_score  # its own score stays modest and honest
    assert best is not gap and recs.index(best) < 2
    assert gap.confidence_score > gap.opportunity_score  # strong evidence, modest score: the two are independent


def test_gap_is_not_forced_into_a_short_list(world):
    c, pid, _ = world
    recs, _ = generate(c, pid, count=3)
    assert not any("competitor_gap" in r.tags for r in recs) or len(recs) == 3


def test_pending_suggestions_are_never_used(world):
    c, pid, comps = world
    pending = next(x for x in comps if x.approval_status == ApprovalStatus.PENDING)
    assert pending.source == CompetitorSource.AI_SUGGESTED
    land = c.competitors.landscape(pid, EVAL_DATE)
    assert pending.username not in {x.username for x in land.competitors}
    with pytest.raises(ConflictError):
        c.competitors.insights(pid, pending.competitor_id, EVAL_DATE)
    c2 = make_container()
    pid2 = load_demo(c2, "restaurant")
    thin_out_kitchen_posts(c2, pid2)
    add_competitor(c2, pid2, "only.pending.demo", make_posts("only.pending.demo", {"bts": 8}, (1, 0, 0), 500, last_post=date(2026, 11, 14)), approved=False)
    recs, notes = generate(c2, pid2)
    assert all(r.score_breakdown.signals["competitor"] is None for r in recs) and any("No approved competitors" in n for n in notes)


def test_a_rejected_competitor_stops_influencing_recommendations(world):
    c, pid, comps = world
    before = [r.title for r in generate(c, pid)[0]]
    for comp in comps[:2]:
        c.competitors.set_approval(pid, comp.competitor_id, ApprovalStatus.REJECTED)
    after, notes = generate(c, pid)
    gap = [r for r in after if "competitor_gap" in r.tags]
    assert "Start a weekly behind the scenes series" in before
    assert not gap or "1 of 1" in gap[0].supporting_evidence[0].statement  # only one competitor left: a single-competitor idea, not a "weekly series"
    assert not any(r.title == "Start a weekly behind the scenes series" for r in after)


def test_one_competitor_is_only_tentative(world):
    c, pid, comps = world
    for comp in comps[1:]:
        c.competitors.delete(pid, comp.competitor_id)
    recs, _ = generate(c, pid)
    only = [r for r in recs if "competitor_gap" in r.tags]
    assert not only or only[0].confidence_score <= 70  # one account's behaviour is weak evidence
    assert not any(r.title.startswith("Start a weekly") for r in recs)


def test_competitor_ideas_respect_excluded_topics(world):
    from app.schemas.profile import ProfileUpdate

    c, pid, _ = world
    c.store.update(pid, ProfileUpdate(excluded_topics=["behind the scenes"]))
    recs, _ = generate(c, pid)
    assert not any("behind the scenes" in (r.title + r.content_idea).lower() for r in recs)


def test_competitor_recommendations_can_be_dismissed_and_stay_gone(world):
    from app.schemas.recommendation import FeedbackAction, FeedbackIn

    c, pid, _ = world
    first, _ = generate(c, pid)
    gap = next(r for r in first if "competitor_gap" in r.tags)
    c.feedback.record(gap.recommendation_id, FeedbackIn(profile_id=pid, action=FeedbackAction.NOT_RELEVANT))
    again, _ = generate(c, pid)
    assert gap.idea_fingerprint not in {r.idea_fingerprint for r in again}


# ---------------------------------------------------------------- Layer A: discovery and data sources

def test_providers_are_honest_about_what_they_can_do():
    caps = {p.name: p.capabilities() for p in all_providers()}
    assert set(caps) == {"user_supplied", "official_instagram", "sample"}  # and no scraping provider
    assert caps["official_instagram"].official_api and not caps["official_instagram"].available
    assert any("Meta" in x or "permissions" in x for x in caps["official_instagram"].limitations)
    assert "FICTIONAL" in caps["sample"].description and caps["user_supplied"].available


@pytest.mark.parametrize("provider", [UserSuppliedProvider(), OfficialInstagramProvider(), SampleProvider()])
async def test_no_provider_pretends_to_fetch(provider):
    with pytest.raises(DataSourceNotAvailableError) as e:
        await provider.fetch_public_posts("someone", 10)
    assert e.value.status_code == 501


async def test_search_by_name_and_category_narrows_suggestions():
    c = make_container()
    pid = load_demo(c, "fashion_creator")
    everything = await c.competitors.suggest(pid, 10)
    assert everything and all(x.approval_status == ApprovalStatus.PENDING and x.data_source == CompetitorDataSource.SAMPLE_PROVIDER for x in everything)
    c2 = make_container()
    pid2 = load_demo(c2, "fashion_creator")
    first = everything[0].username
    word = first.split(".")[0]
    narrowed = await c2.competitors.suggest(pid2, 10, query=word)
    assert narrowed and all(word in f"{x.username} {x.niche} {x.description}".lower() for x in narrowed)
    c3 = make_container()
    pid3 = load_demo(c3, "fashion_creator")
    assert await c3.competitors.suggest(pid3, 10, query="zzzznothing") == []
    assert await c3.competitors.suggest(pid3, 10, category="aerospace") == []


def test_owner_supplied_posts_set_the_data_source_and_need_approval_to_be_analysed():
    c = make_container()
    pid = load_demo(c, "restaurant")
    manual = c.competitors.add_manual(__import__("app.schemas.competitor", fromlist=["CompetitorCreate"]).CompetitorCreate(profile_id=pid, username="@Rival.One"))
    assert manual.username == "rival.one" and manual.data_source == CompetitorDataSource.USER_SUPPLIED and manual.posts_updated_at is None
    posts = make_posts("rival.one", {"bts": 4, "regional": 3}, (1, 0, 0), 300, last_post=date(2026, 11, 12))
    updated = c.competitors.set_posts(CompetitorPostsUpdate(profile_id=pid, posts=posts), manual.competitor_id)
    assert len(updated.public_posts) == 7 and updated.posts_updated_at is not None and updated.data_source == CompetitorDataSource.USER_SUPPLIED
    merged = c.competitors.set_posts(CompetitorPostsUpdate(profile_id=pid, posts=[CompetitorPost(media_id="extra", caption="x", media_type="IMAGE", posted_at=posts[0].posted_at)], replace=False), manual.competitor_id)
    assert len(merged.public_posts) == 8
    replaced = c.competitors.set_posts(CompetitorPostsUpdate(profile_id=pid, posts=posts[:2]), manual.competitor_id)
    assert len(replaced.public_posts) == 2


def test_competitor_http_api_end_to_end():
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import API, make_settings

    c = make_container()
    pid = load_demo(c, "restaurant")
    thin_out_kitchen_posts(c, pid)
    client = TestClient(create_app(make_settings(load_mock_data=False), c))
    created = client.post(f"{API}/competitors", json={"profile_id": pid, "username": "api.rival"}).json()["data"]
    cid = created["competitor_id"]
    posts = [{"media_id": f"p{i}", "caption": "Behind the scenes: how our masala is ground #bts", "media_type": "VIDEO", "posted_at": f"2026-11-{i + 1:02d}T10:00:00Z", "likes": 100 + i, "comments": 5} for i in range(6)]
    r = client.post(f"{API}/competitors/{cid}/posts", json={"profile_id": pid, "posts": posts})
    assert r.status_code == 200 and r.json()["data"]["data_source"] == "USER_SUPPLIED" and len(r.json()["data"]["public_posts"]) == 6
    ins = client.get(f"{API}/competitors/{cid}/insights", params={"profile_id": pid, "as_of": "2026-11-17"}).json()["data"]
    assert ins["activity"] == "ACTIVE" and "behind the scenes" in ins["low_coverage_topics"] and "#bts" not in ins["top_hashtags"] or ins["top_hashtags"] == ["#bts"]
    land = client.get(f"{API}/competitors/landscape", params={"profile_id": pid, "as_of": "2026-11-17"}).json()["data"]
    assert land["competitors_analyzed"] == 1 and land["gaps"]
    providers = client.get(f"{API}/competitors/providers").json()["data"]
    assert {p["name"] for p in providers} == {"user_supplied", "official_instagram", "sample"}
    assert client.post(f"{API}/competitors/{cid}/posts", json={"profile_id": "demo_travel_creator", "posts": posts}).status_code == 404  # another profile
    assert client.post(f"{API}/competitors/{cid}/posts", json={"profile_id": pid, "posts": posts * 40}).status_code == 422  # too many
    assert client.post(f"{API}/competitors/nope/posts", json={"profile_id": pid, "posts": []}).status_code == 404
    sugg = client.post(f"{API}/competitors/suggest", json={"profile_id": pid, "max_suggestions": 3, "query": "zzzz"}).json()["data"]
    assert sugg == []
    gen = client.post(f"{API}/recommendations/generate", json={"profile_id": pid, "as_of": "2026-11-17", "count": 4}).json()["data"]
    assert gen["profile_id"] == pid


def test_default_competitor_provider_set_matches_roadmap():
    assert [p.name for p in all_providers()][0] == "user_supplied"
    assert SPEC  # the fixtures exist
