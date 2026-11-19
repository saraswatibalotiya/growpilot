import re
from collections import Counter, defaultdict
from datetime import date

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.intelligence.topic_extractor import extract_topics
from app.recommendation.engine import RecommendationEngine
from app.recommendation.learning import build_learning_model
from app.recommendation.models import Signals
from app.repositories.base import Store
from app.schemas.analytics import PostIn
from app.schemas.common import Page
from app.schemas.recommendation import GenerateRequest, Recommendation
from app.services.analytics_service import AnalyticsService
from app.services.audience_service import AudienceService
from app.services.competitor_service import CompetitorService
from app.services.festival_service import FestivalService
from app.services.trend_service import TrendService
from app.utils.dates import today

_HASHTAG = re.compile(r"#(\w{2,40})", re.UNICODE)
_MIN_REUSE = 2  # a hashtag is suggested only if the owner has already used it on this topic at least this often


def own_hashtags_by_topic(posts: list[PostIn]) -> dict[str, list[str]]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    for p in posts:
        tags = {t.lower() for t in _HASHTAG.findall(p.caption or "")}
        for topic in extract_topics(p.caption or ""):
            counts[topic].update(tags)
    return {topic: [f"#{t}" for t, n in c.most_common(5) if n >= _MIN_REUSE] for topic, c in counts.items() if any(n >= _MIN_REUSE for n in c.values())}


class RecommendationService:
    def __init__(self, store: Store, settings: Settings, analytics: AnalyticsService, audience: AudienceService, competitors: CompetitorService, trends: TrendService, festivals: FestivalService):
        self.store, self.settings = store, settings
        self.analytics, self.audience, self.competitors, self.trends, self.festivals = analytics, audience, competitors, trends, festivals
        self.engine = RecommendationEngine(settings.weights.as_dict())

    def collect_signals(self, profile_id: str, as_of: date, goal=None) -> tuple[Signals, list[str]]:
        profile = self.store.get(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        notes: list[str] = []

        analytics, ignored_posts = self.analytics.report_as_of(profile_id, as_of)
        if analytics is None:
            notes.append("No post analytics data has been supplied" + (f" dated on or before {as_of}" if ignored_posts else "") + ", so it was not used (it is not treated as zero).")
        audience, ignored_comments = self.audience.insights_as_of(profile_id, as_of)
        if audience is None:
            notes.append("No audience comment data has been supplied" + (f" dated on or before {as_of}" if ignored_comments else "") + ", so it was not used (it is not treated as zero).")
        if ignored_posts or ignored_comments:
            notes.append(f"Evaluating {as_of}: {ignored_posts} post(s) and {ignored_comments} comment(s) dated later were ignored, so the future is not used.")
        if audience is not None and audience.comments_analyzed < self.settings.min_comments_for_audience:
            notes.append("Too few comments to describe the audience reliably; audience signals were not used.")
            audience = None
        competitors = []
        for c in self.competitors.approved(profile_id):
            try:
                competitors.append(self.competitors.insights(profile_id, c.competitor_id, as_of))
            except ConflictError:
                continue
        if not competitors:
            notes.append("No approved competitors, so competitor signals were not used.")
        trends = self.trends.current_for(profile_id, as_of)
        self.store.save_trend_snapshot(profile_id, as_of, trends)  # the trends this run relied on, kept for the record
        if not trends:
            notes.append("No current, relevant trend was found. Nothing is described as trending.")
        festivals = self.festivals.upcoming(as_of=as_of, days=45, region=profile.region or profile.country, industry=None, profile=profile)
        learning = build_learning_model(self.store.list_recommendations(profile_id), self.store.feedback_for_profile(profile_id), self.store.outcomes_for_profile(profile_id), min_samples=self.settings.min_learning_samples)
        signals = Signals(profile=profile, as_of=as_of, analytics=analytics, audience=audience, competitors=competitors, trends=trends, festivals=festivals, own_hashtags_by_topic=own_hashtags_by_topic(self.store.get_posts(profile_id)), learning=learning if learning.active or learning.suppressed else None, goals=[goal] if goal else [])
        return signals, notes

    def build(self, request: GenerateRequest) -> tuple[list[Recommendation], list[str]]:
        """Rule-based recommendations, not yet stored."""
        signals, notes = self.collect_signals(request.profile_id, request.as_of or today(), request.goal)
        recs, engine_notes = self.engine.generate(signals, request.count)
        if not recs:
            raise ConflictError("Not enough information to recommend anything yet. Complete the profile or supply post history.")
        return recs, [*notes, *engine_notes]

    def save(self, recs: list[Recommendation]) -> None:
        self.store.add_many(recs)

    def generate(self, request: GenerateRequest) -> tuple[list[Recommendation], list[str]]:
        recs, notes = self.build(request)
        self.save(recs)
        return recs, notes

    def list(self, profile_id: str, *, page: int, page_size: int) -> Page[Recommendation]:
        if self.store.get(profile_id) is None:
            raise NotFoundError("Profile not found.")
        items = self.store.list_recommendations(profile_id)
        start = (page - 1) * page_size
        return Page(items=items[start : start + page_size], total=len(items), page=page, page_size=page_size)

    def get(self, profile_id: str, recommendation_id: str) -> Recommendation:
        rec = self.store.get_recommendation(profile_id, recommendation_id)
        if rec is None:
            raise NotFoundError("Recommendation not found.")
        return rec
