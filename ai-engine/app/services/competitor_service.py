from __future__ import annotations

import re
from collections import Counter
from datetime import UTC, date, datetime, time
from uuid import uuid4

from app.core.exceptions import ConflictError, NotFoundError
from app.integrations.competitors.provider_interface import CompetitorSuggestionProvider
from app.intelligence.competitor_analyzer import analyze_competitor
from app.intelligence.format_analyzer import media_format
from app.intelligence.topic_extractor import extract_topics
from app.repositories.base import Store
from app.schemas.competitor import (
    Activity,
    ApprovalStatus,
    Competitor,
    CompetitorCreate,
    CompetitorDataSource,
    CompetitorInsights,
    CompetitorLandscape,
    CompetitorPostsUpdate,
    CompetitorSource,
    CompetitorSummary,
    LandscapeTopic,
)
from app.utils.dates import as_aware, today, tz_or_default


class CompetitorService:
    def __init__(self, store: Store, provider: CompetitorSuggestionProvider):
        self.store = store
        self.provider = provider

    def _profile(self, profile_id: str):
        profile = self.store.get(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        return profile

    async def suggest(self, profile_id: str, limit: int, query: str | None = None, category: str | None = None) -> list[Competitor]:
        """Suggestions are saved as PENDING hypotheses. Nothing is activated until the owner approves it, and a competitor
        the owner already added, or rejected, is never suggested again."""
        profile = self._profile(profile_id)
        known = {c.username for c in self.store.list_competitors(profile_id)}
        created: list[Competitor] = []
        for s in self._filter(await self.provider.suggest(profile, 50), query, category):
            if s.username in known or len(created) >= limit:
                continue
            created.append(self.store.add(Competitor(competitor_id=f"comp_{uuid4().hex[:12]}", profile_id=profile_id, username=s.username, niche=s.niche, description=s.description, source=CompetitorSource.AI_SUGGESTED, approval_status=ApprovalStatus.PENDING, suggestion_reason=s.reason, suggestion_confidence=s.confidence, verified=False, public_posts=s.public_posts, data_source=CompetitorDataSource.SAMPLE_PROVIDER, posts_updated_at=None, created_at=datetime.now(UTC))))
        return created

    @staticmethod
    def _filter(found, query: str | None, category: str | None):
        """Narrows suggestions by a business name/handle/keyword and a category, best match first. No filter keeps the provider's order."""
        def text(s) -> str:
            return f"{s.username} {s.niche or ''} {s.description or ''}".lower()

        words = [w for w in re.split(r"\W+", (query or "").lower().lstrip("@")) if len(w) >= 2]
        cats = [w for w in re.split(r"\W+", (category or "").lower()) if len(w) >= 2]
        if not words and not cats:
            return list(found)
        scored = []
        for s in found:
            t = text(s)
            if cats and not any(c in t for c in cats):
                continue
            hits = sum(w in t for w in words)
            if words and hits == 0:
                continue
            scored.append((hits, s.confidence, s))
        return [s for _, _, s in sorted(scored, key=lambda r: (-r[0], -r[1]))]

    def add_manual(self, data: CompetitorCreate) -> Competitor:
        self._profile(data.profile_id)
        existing = next((c for c in self.store.list_competitors(data.profile_id) if c.username == data.username), None)
        if existing is not None:
            raise ConflictError(f"@{data.username} is already in your competitor list ({existing.approval_status.value}).")
        return self.store.add(Competitor(competitor_id=f"comp_{uuid4().hex[:12]}", profile_id=data.profile_id, username=data.username, niche=data.niche, description=data.description, source=CompetitorSource.MANUAL, approval_status=ApprovalStatus.APPROVED, verified=True, public_posts=data.public_posts, data_source=CompetitorDataSource.USER_SUPPLIED, posts_updated_at=datetime.now(UTC) if data.public_posts else None, created_at=datetime.now(UTC)))

    def list(self, profile_id: str, status: ApprovalStatus | None) -> list[Competitor]:
        self._profile(profile_id)
        return self.store.list_competitors(profile_id, status)

    def set_approval(self, profile_id: str, competitor_id: str, status: ApprovalStatus) -> Competitor:
        self._profile(profile_id)
        updated = self.store.set_status(profile_id, competitor_id, status)
        if updated is None:
            raise NotFoundError("Competitor not found.")
        return updated

    def delete(self, profile_id: str, competitor_id: str) -> None:
        self._profile(profile_id)
        if not self.store.delete_competitor(profile_id, competitor_id):
            raise NotFoundError("Competitor not found.")

    def insights(self, profile_id: str, competitor_id: str, as_of: date | None = None) -> CompetitorInsights:
        self._profile(profile_id)
        competitor = self.store.get_competitor(profile_id, competitor_id)
        if competitor is None:
            raise NotFoundError("Competitor not found.")
        if competitor.approval_status != ApprovalStatus.APPROVED:
            raise ConflictError("Only approved competitors can be analysed. Approve this competitor first.")
        posts = self.store.get_posts(profile_id)
        my_topics: Counter[str] = Counter(t for p in posts for t in extract_topics(p.caption))
        my_formats = Counter(media_format(p) for p in posts)
        dates = sorted(as_aware(p.posted_at) for p in posts)
        mine_per_week = round(len(posts) / (max((dates[-1] - dates[0]).days, 1) / 7), 2) if len(posts) >= 3 else None
        day = as_of or today()
        # Evaluating a past day must not use competitor posts that had not been published yet.
        cutoff = datetime.combine(day, time.max, tzinfo=tz_or_default(None, "Asia/Kolkata"))
        known = [p for p in competitor.public_posts if as_aware(p.posted_at) <= cutoff]
        result = analyze_competitor(competitor.model_copy(update={"public_posts": known}), my_topics=my_topics, my_formats=my_formats, my_posts_per_week=mine_per_week, as_of=day, my_total_posts=len(posts))
        if len(known) < len(competitor.public_posts):
            result.caveats.append(f"{len(competitor.public_posts) - len(known)} public post(s) dated after {day} were ignored, so the future is not used.")
        return result

    def approved(self, profile_id: str) -> list[Competitor]:
        return self.store.list_competitors(profile_id, ApprovalStatus.APPROVED)

    def set_posts(self, data: CompetitorPostsUpdate, competitor_id: str) -> Competitor:
        """The owner supplies public information about a competitor's recent posts. Allowed for any status, but only approved
        competitors are analysed. Supplying posts marks the competitor's data as user-supplied."""
        self._profile(data.profile_id)
        updated = self.store.set_competitor_posts(data.profile_id, competitor_id, data.posts, data.replace, CompetitorDataSource.USER_SUPPLIED)
        if updated is None:
            raise NotFoundError("Competitor not found.")
        return updated

    def landscape(self, profile_id: str, as_of: date | None = None) -> CompetitorLandscape:
        """Every approved competitor with posts, side by side, and the topics they cover that you do not."""
        self._profile(profile_id)
        day = as_of or today()
        approved = self.approved(profile_id)
        every = [self.insights(profile_id, c.competitor_id, day) for c in approved if c.public_posts]
        analysed = [i for i in every if i.activity != Activity.INACTIVE]  # a quiet competitor's old topics say little about now
        inactive = len(every) - len(analysed)
        mine = self.store.get_posts(profile_id)
        my_topics: Counter[str] = Counter(t for p in mine for t in extract_topics(p.caption))
        my_total = len(mine)
        by_topic: dict[str, list] = {}
        for ins in analysed:
            for th in ins.themes:
                by_topic.setdefault(th.topic, []).append((ins, th))
        topics = []
        for topic, rows in by_topic.items():
            gap = any(topic in ins.low_coverage_topics for ins, _ in rows)
            topics.append(LandscapeTopic(topic=topic, competitors_covering=len(rows), competitors_total=len(analysed), competitor_posts=sum(th.competitor_posts for _, th in rows), your_posts=my_topics.get(topic, 0), your_share=round(my_topics.get(topic, 0) / my_total, 3) if my_total else None, is_gap=gap))
        topics.sort(key=lambda t: (-t.competitors_covering, -t.competitor_posts, t.topic))
        gaps = [f"{t.competitors_covering} of {t.competitors_total} approved competitors repeatedly post about '{t.topic}' ({t.competitor_posts} public posts). You have {t.your_posts} of your {my_total} posts on it." for t in topics if t.is_gap]
        pooled: Counter = Counter()
        for ins in analysed:
            pooled.update(ins.format_mix)
        tags: Counter[str] = Counter(h for ins in analysed for h in ins.top_hashtags)
        caveats = ["Based only on public posts the owner supplied. Competitors' private insights (reach, saves, demographics) are not available to anyone else."]
        if len(analysed) < 3:
            caveats.append(f"Only {len(analysed)} competitor(s) with posts. Patterns across competitors are tentative.")
        if inactive:
            caveats.append(f"{inactive} competitor(s) have not posted for over 60 days and are left out of the topic and gap analysis.")
        if any(i.data_source == CompetitorDataSource.SAMPLE_PROVIDER for i in analysed):
            caveats.append("Some competitors come from the bundled FICTIONAL sample provider. They are not real accounts.")
        return CompetitorLandscape(
            profile_id=profile_id, as_of=day, competitors_analyzed=len(analysed), competitors_without_posts=len(approved) - len(every),
            competitors=[CompetitorSummary(competitor_id=i.competitor_id, username=i.username, data_source=i.data_source, activity=i.activity, posts_analyzed=i.posts_analyzed, posts_per_week=i.posts_per_week, last_post_at=i.last_post_at, top_topics=i.top_topics) for i in every],
            topics=topics[:15], format_mix=dict(pooled), your_format_mix=dict(Counter(media_format(p) for p in mine)), common_hashtags=[h for h, c in tags.most_common(8) if c >= 2], gaps=gaps, caveats=caveats,
        )
