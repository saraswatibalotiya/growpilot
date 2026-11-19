"""In-memory repositories. Fast, dependency-free and deterministic for tests. Data is lost when the process stops."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from uuid import uuid4

from app.schemas.analytics import AnalyticsReport, PostIn
from app.schemas.audience import AudienceInsights, CommentIn, Demographics
from app.schemas.competitor import ApprovalStatus, Competitor, CompetitorDataSource, CompetitorPost
from app.schemas.learning import LearningAdjustment
from app.schemas.outcome import Outcome
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate
from app.schemas.recommendation import Feedback, Recommendation
from app.schemas.trend import FestivalRecord, TrendAssessment


def _now() -> datetime:
    return datetime.now(UTC)


class InMemoryStore:
    backend = "in-memory"

    def __init__(self) -> None:
        self._profiles: dict[str, Profile] = {}
        self._posts: dict[str, list[PostIn]] = defaultdict(list)
        self._comments: dict[str, list[CommentIn]] = defaultdict(list)
        self._demographics: dict[str, Demographics | None] = {}
        self._analytics: dict[str, AnalyticsReport] = {}
        self._audience: dict[str, AudienceInsights] = {}
        self._competitors: dict[str, Competitor] = {}
        self._recommendations: dict[str, Recommendation] = {}
        self._feedback: list[Feedback] = []
        self._outcomes: list[Outcome] = []
        self._adjustments: dict[str, list[LearningAdjustment]] = defaultdict(list)
        self._trend_snapshots: dict[str, list[tuple[date, list[TrendAssessment]]]] = defaultdict(list)
        self._festivals: dict[str, FestivalRecord] = {}

    # profiles
    def create(self, data: ProfileCreate, profile_id: str | None = None) -> Profile:
        now = _now()
        profile = Profile(profile_id=profile_id or f"prof_{uuid4().hex[:12]}", created_at=now, updated_at=now, **data.model_dump())
        self._profiles[profile.profile_id] = profile
        return profile

    def get(self, profile_id: str) -> Profile | None:
        return self._profiles.get(profile_id)

    def update(self, profile_id: str, patch: ProfileUpdate) -> Profile | None:
        current = self._profiles.get(profile_id)
        if current is None:
            return None
        changes = patch.model_dump(exclude_unset=True)
        updated = Profile.model_validate({**current.model_dump(), **changes, "updated_at": _now()})
        self._profiles[profile_id] = updated
        return updated

    def list(self) -> list[Profile]:
        return list(self._profiles.values())

    # posts, comments and cached analyses
    def set_posts(self, profile_id: str, posts: list[PostIn], replace: bool) -> list[PostIn]:
        if replace:
            self._posts[profile_id] = list(posts)
        else:
            merged = {p.media_id: p for p in self._posts[profile_id]}
            merged.update({p.media_id: p for p in posts})
            self._posts[profile_id] = list(merged.values())
        return list(self._posts[profile_id])

    def get_posts(self, profile_id: str) -> list[PostIn]:
        return list(self._posts.get(profile_id, []))

    def set_comments(self, profile_id: str, comments: list[CommentIn], demographics: Demographics | None, replace: bool) -> list[CommentIn]:
        if replace:
            self._comments[profile_id] = list(comments)
        else:
            merged = {c.comment_id: c for c in self._comments[profile_id]}
            merged.update({c.comment_id: c for c in comments})
            self._comments[profile_id] = list(merged.values())
        if demographics is not None:
            self._demographics[profile_id] = demographics
        return list(self._comments[profile_id])

    def get_comments(self, profile_id: str) -> list[CommentIn]:
        return list(self._comments.get(profile_id, []))

    def get_demographics(self, profile_id: str) -> Demographics | None:
        return self._demographics.get(profile_id)

    def save_analytics(self, profile_id: str, report: AnalyticsReport) -> None:
        self._analytics[profile_id] = report

    def get_analytics(self, profile_id: str) -> AnalyticsReport | None:
        return self._analytics.get(profile_id)

    def save_audience(self, profile_id: str, insights: AudienceInsights) -> None:
        self._audience[profile_id] = insights

    def get_audience(self, profile_id: str) -> AudienceInsights | None:
        return self._audience.get(profile_id)

    # competitors
    def add(self, competitor: Competitor) -> Competitor:
        self._competitors[competitor.competitor_id] = competitor
        return competitor

    def _own_competitor(self, profile_id: str, competitor_id: str) -> Competitor | None:
        found = self._competitors.get(competitor_id)
        return found if found is not None and found.profile_id == profile_id else None

    def get_competitor(self, profile_id: str, competitor_id: str) -> Competitor | None:
        return self._own_competitor(profile_id, competitor_id)

    def list_competitors(self, profile_id: str, status: ApprovalStatus | None = None) -> list[Competitor]:
        items = [c for c in self._competitors.values() if c.profile_id == profile_id]
        return [c for c in items if status is None or c.approval_status == status]

    def set_status(self, profile_id: str, competitor_id: str, status: ApprovalStatus) -> Competitor | None:
        found = self._own_competitor(profile_id, competitor_id)
        if found is None:
            return None
        updated = found.model_copy(update={"approval_status": status, "verified": status == ApprovalStatus.APPROVED or found.verified})
        self._competitors[competitor_id] = updated
        return updated

    def delete_competitor(self, profile_id: str, competitor_id: str) -> bool:
        if self._own_competitor(profile_id, competitor_id) is None:
            return False
        del self._competitors[competitor_id]
        return True

    def set_competitor_posts(self, profile_id: str, competitor_id: str, posts: list[CompetitorPost], replace: bool, data_source: CompetitorDataSource) -> Competitor | None:
        found = self._own_competitor(profile_id, competitor_id)
        if found is None:
            return None
        merged = list(posts) if replace else list({p.media_id: p for p in [*found.public_posts, *posts]}.values())
        updated = found.model_copy(update={"public_posts": merged, "data_source": data_source, "posts_updated_at": _now()})
        self._competitors[competitor_id] = updated
        return updated

    # recommendations, feedback, outcomes
    def add_many(self, recommendations: list[Recommendation]) -> None:
        for r in recommendations:
            self._recommendations[r.recommendation_id] = r

    def get_recommendation(self, profile_id: str, recommendation_id: str) -> Recommendation | None:
        found = self._recommendations.get(recommendation_id)
        return found if found is not None and found.profile_id == profile_id else None

    def list_recommendations(self, profile_id: str) -> list[Recommendation]:
        items = [r for r in self._recommendations.values() if r.profile_id == profile_id]
        return sorted(items, key=lambda r: r.created_at, reverse=True)

    def add_feedback(self, feedback: Feedback, adjustments: list[LearningAdjustment] | None = None) -> Feedback:
        self._feedback.append(feedback)
        if adjustments is not None:
            self._adjustments[feedback.profile_id] = list(adjustments)
        return feedback

    def feedback_for_profile(self, profile_id: str) -> list[Feedback]:
        return [f for f in self._feedback if f.profile_id == profile_id]

    def add_outcome(self, outcome: Outcome, adjustments: list[LearningAdjustment] | None = None) -> Outcome:
        self._outcomes.append(outcome)
        if adjustments is not None:
            self._adjustments[outcome.profile_id] = list(adjustments)
        return outcome

    def outcomes_for(self, profile_id: str, recommendation_id: str) -> list[Outcome]:
        return [o for o in self._outcomes if o.profile_id == profile_id and o.recommendation_id == recommendation_id]

    def outcomes_for_profile(self, profile_id: str) -> list[Outcome]:
        return [o for o in self._outcomes if o.profile_id == profile_id]

    # insights history
    def save_trend_snapshot(self, profile_id: str, as_of: date, assessments: list[TrendAssessment]) -> None:
        self._trend_snapshots[profile_id].append((as_of, list(assessments)))

    def list_trend_snapshots(self, profile_id: str, limit: int = 30) -> list[tuple[date, list[TrendAssessment]]]:
        return list(reversed(self._trend_snapshots.get(profile_id, [])))[:limit]

    def list_learning_adjustments(self, profile_id: str, current_only: bool = True) -> list[LearningAdjustment]:
        return list(self._adjustments.get(profile_id, []))

    def sync_festivals(self, festivals: list[FestivalRecord]) -> int:
        self._festivals.update({f.festival_id: f for f in festivals})
        return len(festivals)

    # lifecycle
    def ping(self) -> bool:
        return True

    def close(self) -> None:
        return None
