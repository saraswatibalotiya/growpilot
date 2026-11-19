from datetime import UTC, date, datetime

from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.integrations.trends.provider_interface import TrendProvider
from app.intelligence.trend_analyzer import assess_trend
from app.repositories.base import Store
from app.schemas.trend import Freshness, TrendAnalysis, TrendAnalyzeRequest, TrendAssessment, TrendCategory
from app.utils.dates import today

#: A trend must be at least this relevant to a profile to be listed as current for it.
MIN_PROFILE_RELEVANCE = 0.25


class TrendService:
    def __init__(self, store: Store, provider: TrendProvider, settings: Settings):
        self.store = store
        self.provider = provider
        self.settings = settings

    def analyze(self, request: TrendAnalyzeRequest) -> TrendAnalysis:
        profile = self.store.get(request.profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        as_of = request.as_of or today()
        assessed = [assess_trend(t, profile, as_of, self.settings.trend_max_age_days) for t in self.provider.list_trends()]
        current = sorted((a for a in assessed if a.usable_as_current and a.profile_relevance >= MIN_PROFILE_RELEVANCE), key=lambda a: -a.profile_relevance)
        rest = [a for a in assessed if a not in current]
        reasons = {f.value.lower(): sum(1 for a in rest if a.freshness == f and not a.usable_as_current) for f in Freshness}
        parts = [f"{n} {name}" for name, n in reasons.items() if n]
        irrelevant = sum(1 for a in rest if a.usable_as_current)
        if irrelevant:
            parts.append(f"{irrelevant} current but not relevant to this profile")
        notes = [f"{len(current)} current trends for this profile." + (f" Not used: {', '.join(parts)}." if parts else "")]
        if not current:
            notes.append("No current, relevant trend was found. Recommendations will not claim anything is trending.")
        return TrendAnalysis(profile_id=request.profile_id, as_of=as_of, generated_at=datetime.now(UTC), current=current, excluded=rest if request.include_stale else [], notes=notes)

    def current_for(self, profile_id: str, as_of: date) -> list[TrendAssessment]:
        profile = self.store.get(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        assessed = [assess_trend(t, profile, as_of, self.settings.trend_max_age_days) for t in self.provider.list_trends()]
        return sorted((a for a in assessed if a.usable_as_current and a.profile_relevance >= MIN_PROFILE_RELEVANCE), key=lambda a: -a.profile_relevance)

    def list(self, *, category: TrendCategory | None, region: str | None, as_of: date | None, include_stale: bool) -> list[TrendAssessment]:
        day = as_of or today()
        out = [assess_trend(t, None, day, self.settings.trend_max_age_days) for t in self.provider.list_trends()]
        out = [a for a in out if (category is None or a.trend.category == category) and (region is None or a.trend.region.lower() == region.lower())]
        if not include_stale:
            out = [a for a in out if a.usable_as_current]
        return sorted(out, key=lambda a: -a.trend.relevance_score)

    def upcoming(self, *, as_of: date | None, days: int, category: TrendCategory | None) -> list[TrendAssessment]:
        day = as_of or today()
        found = [assess_trend(t, None, day, self.settings.trend_max_age_days) for t in self.provider.list_trends()]
        out = [a for a in found if a.freshness == Freshness.UPCOMING and a.trend.starts_on and (a.trend.starts_on - day).days <= days and (category is None or a.trend.category == category)]
        return sorted(out, key=lambda a: a.trend.starts_on or day)
