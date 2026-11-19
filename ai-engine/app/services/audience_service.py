from datetime import date, datetime, time

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.intelligence.comment_analyzer import analyze_comments
from app.repositories.base import Store
from app.schemas.audience import AudienceAnalyzeRequest, AudienceInsights
from app.utils.dates import as_aware, tz_or_default


class AudienceService:
    def __init__(self, store: Store, settings: Settings):
        self.store = store
        self.settings = settings

    def _require_profile(self, profile_id: str) -> None:
        if self.store.get(profile_id) is None:
            raise NotFoundError("Profile not found.")

    def analyze(self, request: AudienceAnalyzeRequest) -> AudienceInsights:
        self._require_profile(request.profile_id)
        comments = self.store.set_comments(request.profile_id, request.comments, request.demographics, request.replace)
        result = analyze_comments(request.profile_id, comments, self.store.get_demographics(request.profile_id), detect_language=request.detect_language, minimum=self.settings.min_comments_for_audience)
        self.store.save_audience(request.profile_id, result)
        return result

    def insights(self, profile_id: str) -> AudienceInsights:
        self._require_profile(profile_id)
        cached = self.store.get_audience(profile_id)
        if cached is not None:
            return cached
        comments = self.store.get_comments(profile_id)
        if not comments:
            raise ConflictError("No comments have been supplied for this profile. Send them to POST /audience/analyze first.")
        result = analyze_comments(profile_id, comments, self.store.get_demographics(profile_id), detect_language=True, minimum=self.settings.min_comments_for_audience)
        self.store.save_audience(profile_id, result)
        return result

    def insights_as_of(self, profile_id: str, as_of: date) -> tuple[AudienceInsights | None, int]:
        """Audience insights using only comments dated on or before `as_of`. Undated comments are kept. Returns (insights, ignored)."""
        self._require_profile(profile_id)
        comments = self.store.get_comments(profile_id)
        if not comments:
            return None, 0
        cutoff = datetime.combine(as_of, time.max, tzinfo=tz_or_default(None, self.settings.default_timezone))
        kept = [c for c in comments if c.posted_at is None or as_aware(c.posted_at) <= cutoff]
        ignored = len(comments) - len(kept)
        if ignored == 0:
            return self.insights(profile_id), 0
        if not kept:
            return None, ignored
        return analyze_comments(profile_id, kept, self.store.get_demographics(profile_id), detect_language=True, minimum=self.settings.min_comments_for_audience), ignored
