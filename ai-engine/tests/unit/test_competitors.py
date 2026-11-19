from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.integrations.competitors.provider_interface import MockCompetitorProvider
from app.intelligence.competitor_analyzer import analyze_competitor
from app.repositories.memory import InMemoryStore
from app.schemas.analytics import MediaFormat
from app.schemas.competitor import ApprovalStatus, Competitor, CompetitorCreate, CompetitorPost, CompetitorSource
from app.schemas.profile import ProfileCreate
from app.services.competitor_service import CompetitorService

BASE = datetime(2026, 9, 1, tzinfo=UTC)


def comp(posts: list[CompetitorPost]) -> Competitor:
    return Competitor(competitor_id="c1", profile_id="p1", username="rival", niche=None, description=None, source=CompetitorSource.MANUAL, approval_status=ApprovalStatus.APPROVED, verified=True, public_posts=posts, created_at=BASE)


def cp(i: int, caption: str, media_type="IMAGE", likes: int | None = 100, comments: int | None = 5) -> CompetitorPost:
    return CompetitorPost(media_id=f"x{i}", caption=caption, media_type=media_type, posted_at=BASE + timedelta(days=i * 3), likes=likes, comments=comments)


@pytest.fixture
def service() -> CompetitorService:
    store = InMemoryStore()
    store.create(ProfileCreate(profile_type="BUSINESS", name="Shop", niche="fashion", category="ethnic clothing"), profile_id="p1")
    store.create(ProfileCreate(profile_type="CREATOR", name="Other"), profile_id="p2")
    return CompetitorService(store, MockCompetitorProvider())


class TestSuggestionsNeedApproval:
    async def test_suggestions_are_pending_unverified_and_ai_sourced(self, service):
        # the bundled provider matches fashion profiles to its fashion fixtures
        out = await service.suggest("p1", 3)
        assert out and all(c.approval_status == ApprovalStatus.PENDING and not c.verified and c.source == CompetitorSource.AI_SUGGESTED for c in out)
        assert all(c.suggestion_reason for c in out)

    async def test_nothing_can_be_analysed_until_approved(self, service):
        c = (await service.suggest("p1", 1))[0]
        with pytest.raises(ConflictError):
            service.insights("p1", c.competitor_id)
        service.set_approval("p1", c.competitor_id, ApprovalStatus.APPROVED)
        assert service.insights("p1", c.competitor_id).username == c.username

    async def test_a_rejected_competitor_is_never_suggested_again(self, service):
        first = await service.suggest("p1", 2)
        service.set_approval("p1", first[0].competitor_id, ApprovalStatus.REJECTED)
        again = await service.suggest("p1", 5)
        assert first[0].username not in {c.username for c in again}
        assert first[1].username not in {c.username for c in again}  # already on the list, pending

    async def test_pending_competitors_do_not_count_as_approved(self, service):
        await service.suggest("p1", 2)
        assert service.approved("p1") == []


class TestManualCompetitors:
    def test_a_manual_competitor_is_approved_at_once_and_verified(self, service):
        c = service.add_manual(CompetitorCreate(profile_id="p1", username="@The.Rival"))
        assert c.username == "the.rival" and c.approval_status == ApprovalStatus.APPROVED and c.source == CompetitorSource.MANUAL and c.verified

    def test_the_same_username_twice_is_refused(self, service):
        service.add_manual(CompetitorCreate(profile_id="p1", username="rival"))
        with pytest.raises(ConflictError):
            service.add_manual(CompetitorCreate(profile_id="p1", username="Rival"))

    def test_an_unknown_profile_is_refused(self, service):
        with pytest.raises(NotFoundError):
            service.add_manual(CompetitorCreate(profile_id="nope", username="rival"))

    def test_competitors_of_one_profile_are_invisible_to_another(self, service):
        c = service.add_manual(CompetitorCreate(profile_id="p1", username="rival"))
        assert service.list("p2", None) == []
        with pytest.raises(NotFoundError):
            service.insights("p2", c.competitor_id)
        with pytest.raises(NotFoundError):
            service.set_approval("p2", c.competitor_id, ApprovalStatus.REJECTED)
        with pytest.raises(NotFoundError):
            service.delete("p2", c.competitor_id)
        assert len(service.list("p1", None)) == 1

    def test_delete(self, service):
        c = service.add_manual(CompetitorCreate(profile_id="p1", username="rival"))
        service.delete("p1", c.competitor_id)
        assert service.list("p1", None) == []


class TestAnalysis:
    def test_missing_public_metrics_are_reported_not_invented(self):
        posts = [cp(i, "Styling a saree for the evening #styling", likes=None, comments=None) for i in range(6)]
        out = analyze_competitor(comp(posts), my_topics=Counter(), my_formats=Counter())
        assert out.avg_public_likes is None and out.avg_public_comments is None
        assert any("likes (hidden or missing)" in m for m in out.metrics_not_available)
        assert {"views", "reach", "saves", "shares"} <= set(out.metrics_not_available)

    def test_no_public_posts(self):
        out = analyze_competitor(comp([]), my_topics=Counter(), my_formats=Counter())
        assert out.observations == [] and any("No public posts" in c for c in out.caveats)

    def test_a_small_sample_is_called_tentative(self):
        out = analyze_competitor(comp([cp(i, "Festive kurti #festivewear") for i in range(3)]), my_topics=Counter(), my_formats=Counter())
        assert any("Only 3 public posts" in c for c in out.caveats)

    def test_topics_the_user_has_not_covered_are_flagged_as_opportunities(self):
        posts = [cp(i, "How to style a dupatta #styling") for i in range(6)]
        out = analyze_competitor(comp(posts), my_topics=Counter({"festive wear": 4}), my_formats=Counter({MediaFormat.IMAGE: 5}))
        assert "styling" in out.uncovered_by_you
        assert any("styling" in d for d in out.differentiation_opportunities)

    def test_the_users_own_strengths_are_called_out(self):
        posts = [cp(i, "Styling a saree #styling") for i in range(6)]
        out = analyze_competitor(comp(posts), my_topics=Counter({"biryani": 4}), my_formats=Counter())
        assert any("biryani" in d for d in out.differentiation_opportunities)

    def test_video_is_compared_with_the_users_reels(self):
        posts = [cp(i, "Festive kurti", media_type="VIDEO") for i in range(6)]
        out = analyze_competitor(comp(posts), my_topics=Counter(), my_formats=Counter({MediaFormat.REEL: 8, MediaFormat.IMAGE: 2}))
        assert not any("of yours" in (o.opportunity or "") and "0% of yours" in (o.opportunity or "") for o in out.observations)

    def test_public_likes_are_never_compared_in_absolute_terms(self):
        posts = [cp(i, "Festive kurti #festivewear" if i % 2 else "Styling a saree #styling", likes=100 + i * 40) for i in range(8)]
        out = analyze_competitor(comp(posts), my_topics=Counter(), my_formats=Counter())
        assert any("never their likes against yours" in c for c in out.caveats)

    def test_every_observation_carries_evidence_and_confidence(self):
        out = analyze_competitor(comp([cp(i, "Festive kurti #festivewear") for i in range(8)]), my_topics=Counter(), my_formats=Counter())
        assert out.observations and all(o.evidence and 0 <= o.confidence <= 1 for o in out.observations)
