from datetime import date, datetime, time

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.intelligence.content_analyzer import analyze_posts
from app.repositories.base import Store
from app.schemas.analytics import AnalyticsReport, AnalyzeRequest
from app.utils.dates import as_aware, tz_or_default


class AnalyticsService:
    def __init__(self, store: Store, settings: Settings):
        self.store = store
        self.settings = settings

    def _profile(self, profile_id: str):
        profile = self.store.get(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        return profile

    def analyze(self, request: AnalyzeRequest) -> AnalyticsReport:
        self._profile(request.profile_id)
        posts = self.store.set_posts(request.profile_id, request.posts, request.replace)
        s = self.settings
        report = analyze_posts(
            request.profile_id,
            posts,
            min_posts_per_format=request.min_posts_per_format or s.min_posts_per_format,
            min_posts_for_timing=request.min_posts_for_timing or s.min_posts_for_timing,
            min_posts_for_baseline=s.min_posts_for_baseline,
            tz=tz_or_default(request.timezone, s.default_timezone),
        )
        self.store.save_analytics(request.profile_id, report)
        return report

    def report(self, profile_id: str) -> AnalyticsReport:
        """The latest analysis. If posts were stored but never analysed (for example the bundled mock data), analyse them now."""
        self._profile(profile_id)
        cached = self.store.get_analytics(profile_id)
        if cached is not None:
            return cached
        posts = self.store.get_posts(profile_id)
        if not posts:
            raise ConflictError("No posts have been supplied for this profile. Send them to POST /analytics/analyze first.")
        s = self.settings
        report = analyze_posts(profile_id, posts, min_posts_per_format=s.min_posts_per_format, min_posts_for_timing=s.min_posts_for_timing, min_posts_for_baseline=s.min_posts_for_baseline, tz=tz_or_default(None, s.default_timezone))
        self.store.save_analytics(profile_id, report)
        return report

    def report_as_of(self, profile_id: str, as_of: date) -> tuple[AnalyticsReport | None, int]:
        """The analysis as it would have looked at the end of `as_of`: posts dated later are ignored, so evaluating a past day does
        not use the future. Returns the report (None if there is no usable history) and how many posts were ignored."""
        self._profile(profile_id)
        posts = self.store.get_posts(profile_id)
        if not posts:
            return None, 0
        tz = tz_or_default(None, self.settings.default_timezone)
        cutoff = datetime.combine(as_of, time.max, tzinfo=tz)
        kept = [p for p in posts if as_aware(p.posted_at) <= cutoff]
        ignored = len(posts) - len(kept)
        if ignored == 0:
            return self.report(profile_id), 0
        if not kept:
            return None, ignored
        s = self.settings
        return analyze_posts(profile_id, kept, min_posts_per_format=s.min_posts_per_format, min_posts_for_timing=s.min_posts_for_timing, min_posts_for_baseline=s.min_posts_for_baseline, tz=tz), ignored
