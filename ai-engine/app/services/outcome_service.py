import uuid
from datetime import UTC, datetime

from app.core.exceptions import ConflictError, NotFoundError
from app.intelligence.format_analyzer import media_format_of_content
from app.repositories.base import Store
from app.schemas.analytics import AnalyticsReport
from app.schemas.outcome import Outcome, OutcomeIn
from app.services.analytics_service import AnalyticsService
from app.services.learning_adjustments import adjustments_after


class OutcomeService:
    def __init__(self, store: Store, analytics: AnalyticsService, min_learning_samples: int = 3):
        self.store = store
        self.analytics = analytics
        self.min_samples = min_learning_samples

    def record(self, recommendation_id: str, data: OutcomeIn) -> Outcome:
        rec = self.store.get_recommendation(data.profile_id, recommendation_id)
        if rec is None:
            raise NotFoundError("Recommendation not found.")
        if any(o.interval == data.interval for o in self.store.outcomes_for(data.profile_id, recommendation_id)):
            raise ConflictError(f"A {data.interval.value} outcome is already recorded for this recommendation.")
        m = data.metrics
        available = [k for k, v in m.model_dump().items() if v is not None]
        report: AnalyticsReport | None
        try:
            report = self.analytics.report(data.profile_id)
        except ConflictError:
            report = None
        rate, index = self._rate_and_index(report, m, media_format_of_content(rec.format))
        outcome = Outcome(outcome_id=str(uuid.uuid4()), recommendation_id=recommendation_id, profile_id=data.profile_id, interval=data.interval, instagram_media_id=data.instagram_media_id, captured_at=data.captured_at or datetime.now(UTC), metrics=m, metrics_available=available, engagement_rate=rate, performance_index=index)
        return self.store.add_outcome(outcome, adjustments_after(self.store, data.profile_id, self.min_samples, outcome=outcome))

    def list(self, profile_id: str, recommendation_id: str) -> list[Outcome]:
        if self.store.get_recommendation(profile_id, recommendation_id) is None:
            raise NotFoundError("Recommendation not found.")
        return sorted(self.store.outcomes_for(profile_id, recommendation_id), key=lambda o: o.captured_at)

    @staticmethod
    def _rate_and_index(report, m, fmt) -> tuple[float | None, float | None]:
        """Engagement uses the account's own denominator and the same likes+comments definition as the analytics, so the
        number is comparable with the baseline. Anything not measurable stays None."""
        if report is None or not report.baseline:
            return None, None
        basis = report.baseline.get("engagement_basis")
        denominator = {"reach": m.reach, "views": m.views}.get(str(basis))
        if m.likes is None or m.comments is None or not denominator:
            return None, None
        rate = round((m.likes + m.comments) / denominator, 5)
        if not report.baseline.get("baseline_reliable"):
            return rate, None
        fb = next((f for f in report.formats if f.format == fmt and f.enough_data and f.median_engagement_rate), None)
        reference = fb.median_engagement_rate if fb else report.baseline.get("median_engagement_rate")
        if not reference:
            return rate, None
        return rate, round(rate / float(reference), 3)
