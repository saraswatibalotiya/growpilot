"""PostgreSQL-backed Store: the same interface as the in-memory store, so no service had to change.

How sync services use an async driver
-------------------------------------
The services are synchronous. SQLAlchemy's async engine (asyncpg) is used on one dedicated event-loop thread owned by this
object, and each store method hands a coroutine to that thread and waits for the result. Every method is ONE transaction
(`session.begin()`): either all of its writes happen or none do. That includes multi-table operations, such as saving a
recommendation with its evidence, or feedback together with the learning adjustments it caused.

Trade-off: a call blocks its caller while the database works. That is fine for this service's load. The clean long-term fix is
async services; see docs/POSTGRES_PERSISTENCE.md.

Isolation
---------
Every method takes the profile's public id and scopes its queries by the resolved profile row. Cross-profile ids simply do not
match. On top of that, the schema's composite foreign keys make it impossible to store a child row under a different profile than
its parent (see app/db/models.py).

Failures
--------
Database errors are translated to AppErrors (503 database_unavailable, 409 conflict, 500 database_error) whose messages never
contain the URL, host, user, password or SQL. Only the exception TYPE is logged.
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime
from typing import Any, TypeVar

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DBAPIError, IntegrityError, InterfaceError, OperationalError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import AppError, ConflictError, DatabaseError, DatabaseUnavailableError, NotFoundError
from app.core.logging import logger
from app.db import models as m
from app.schemas.analytics import AnalyticsReport, PostIn
from app.schemas.audience import AudienceInsights, CommentIn, Demographics
from app.schemas.competitor import ApprovalStatus, Competitor, CompetitorDataSource, CompetitorPost
from app.schemas.learning import LearningAdjustment
from app.schemas.outcome import Outcome
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate
from app.schemas.recommendation import Evidence, Feedback, Recommendation
from app.schemas.trend import FestivalRecord, TrendAssessment
from app.utils.dates import as_aware

T = TypeVar("T")
_KEEP_AUDIENCE_ROWS = 20
_KEEP_TREND_SNAPSHOTS = 100
_PROFILE_LISTS = ("goals", "products", "services", "preferred_topics", "excluded_topics", "preferred_formats")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid_or_none(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _translate(exc: Exception) -> AppError:
    """Turns a driver error into a safe AppError. Nothing from the original message is kept."""
    if isinstance(exc, AppError):
        return exc
    logger.error("database_error", extra={"error_type": type(exc).__name__})
    if isinstance(exc, IntegrityError):
        return ConflictError("The change conflicts with data that already exists.")
    unreachable = isinstance(exc, (OperationalError, InterfaceError, OSError, TimeoutError, asyncio.TimeoutError)) or (isinstance(exc, DBAPIError) and exc.connection_invalidated)
    if unreachable:
        return DatabaseUnavailableError("The database is unavailable. Try again shortly.")
    return DatabaseError("A database error occurred.")


class _LoopThread:
    """One event loop on a background thread. All asyncpg connections live on it."""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._serve, name="ai-engine-db", daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro: Awaitable[T], timeout: float) -> T:
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)  # type: ignore[arg-type]

    def stop(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=5)
        if not self.loop.is_running():
            self.loop.close()


class PostgresStore:
    backend = "postgres"

    def __init__(self, url: str, *, pool_size: int = 5, max_overflow: int = 5, connect_timeout: float = 5.0, command_timeout: float = 30.0):
        self._timeout = command_timeout + connect_timeout + 5
        self._loop = _LoopThread()
        self._engine = create_async_engine(url, pool_size=pool_size, max_overflow=max_overflow, pool_pre_ping=True, echo=False, connect_args={"timeout": connect_timeout, "command_timeout": command_timeout})
        self._sessions = async_sessionmaker(self._engine, expire_on_commit=False)
        self._closed = False

    # ------------------------------------------------------------------ plumbing

    def _tx(self, fn: Callable[[AsyncSession], Awaitable[T]]) -> T:
        """Runs `fn` as one transaction. Commits when it returns, rolls everything back if it raises."""

        async def runner() -> T:
            async with self._sessions() as session, session.begin():
                return await fn(session)

        try:
            return self._loop.run(runner(), self._timeout)
        except (SQLAlchemyError, OSError, TimeoutError, AppError) as exc:
            raise _translate(exc) from None

    def ping(self) -> bool:
        async def go(s: AsyncSession) -> bool:
            await s.execute(select(1))
            return True

        return self._tx(go)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._loop.run(self._engine.dispose(), 10)
        finally:
            self._loop.stop()

    @staticmethod
    async def _pid(s: AsyncSession, public_id: str) -> uuid.UUID | None:
        return (await s.execute(select(m.AIProfile.id).where(m.AIProfile.public_id == public_id))).scalar_one_or_none()

    @staticmethod
    async def _require_pid(s: AsyncSession, public_id: str) -> uuid.UUID:
        pid = await PostgresStore._pid(s, public_id)
        if pid is None:
            raise NotFoundError("Profile not found.")
        return pid

    # ------------------------------------------------------------------ profiles

    @staticmethod
    def _profile(row: m.AIProfile) -> Profile:
        data = {c: getattr(row, c) for c in ("profile_type", "name", "instagram_username", "category", "niche", "description", "target_audience", "country", "region", "city", "primary_language", "brand_voice", "posting_frequency_per_week", "created_at", "updated_at", *_PROFILE_LISTS)}
        return Profile.model_validate({**data, "profile_id": row.public_id})

    @staticmethod
    def _profile_columns(p: Profile | ProfileCreate) -> dict[str, Any]:
        d = p.model_dump(mode="json", exclude={"profile_id", "created_at", "updated_at"})
        return {k: (d[k] if k in d else None) for k in d}

    def create(self, data: ProfileCreate, profile_id: str | None = None) -> Profile:
        public_id = profile_id or f"prof_{uuid.uuid4().hex[:12]}"

        async def go(s: AsyncSession) -> Profile:
            row = m.AIProfile(public_id=public_id, **self._profile_columns(data))
            s.add(row)
            try:
                await s.flush()
            except IntegrityError:
                raise ConflictError("A profile with this id already exists.") from None
            return self._profile(row)

        return self._tx(go)

    def get(self, profile_id: str) -> Profile | None:
        async def go(s: AsyncSession) -> Profile | None:
            row = (await s.execute(select(m.AIProfile).where(m.AIProfile.public_id == profile_id))).scalar_one_or_none()
            return self._profile(row) if row else None

        return self._tx(go)

    def update(self, profile_id: str, patch: ProfileUpdate) -> Profile | None:
        async def go(s: AsyncSession) -> Profile | None:
            row = (await s.execute(select(m.AIProfile).where(m.AIProfile.public_id == profile_id).with_for_update())).scalar_one_or_none()
            if row is None:
                return None
            merged = Profile.model_validate({**self._profile(row).model_dump(), **patch.model_dump(exclude_unset=True), "updated_at": _utcnow()})
            for key, value in self._profile_columns(merged).items():
                setattr(row, key, value)
            row.updated_at = merged.updated_at
            await s.flush()
            return self._profile(row)

        return self._tx(go)

    def list(self) -> list[Profile]:
        async def go(s: AsyncSession) -> list[Profile]:
            return [self._profile(r) for r in (await s.execute(select(m.AIProfile).order_by(m.AIProfile.created_at, m.AIProfile.public_id))).scalars()]

        return self._tx(go)

    # ------------------------------------------------------------------ posts, comments, analyses

    @staticmethod
    async def _posts(s: AsyncSession, pid: uuid.UUID) -> list[PostIn]:
        q = select(m.InstagramPost, m.PostAnalytics).outerjoin(m.PostAnalytics, m.PostAnalytics.post_id == m.InstagramPost.id).where(m.InstagramPost.profile_id == pid).order_by(m.InstagramPost.posted_at, m.InstagramPost.media_id)
        out = []
        for post, a in (await s.execute(q)).all():
            metrics = {k: getattr(a, k) for k in ("views", "reach", "likes", "comments", "shares", "saves", "interactions", "avg_watch_time_seconds", "follower_count")} if a else {}
            out.append(PostIn(media_id=post.media_id, caption=post.caption, media_type=post.media_type, media_product_type=post.media_product_type, posted_at=post.posted_at, permalink=post.permalink, **metrics))
        return out

    def set_posts(self, profile_id: str, posts: list[PostIn], replace: bool) -> list[PostIn]:
        async def go(s: AsyncSession) -> list[PostIn]:
            pid = await self._require_pid(s, profile_id)
            if replace:
                keep = [p.media_id for p in posts]
                await s.execute(delete(m.InstagramPost).where(m.InstagramPost.profile_id == pid, m.InstagramPost.media_id.not_in(keep) if keep else True))
            if posts:
                rows = [dict(profile_id=pid, media_id=p.media_id, caption=p.caption, media_type=p.media_type, media_product_type=p.media_product_type, permalink=p.permalink, posted_at=as_aware(p.posted_at)) for p in posts]
                stmt = pg_insert(m.InstagramPost).values(rows)
                stmt = stmt.on_conflict_do_update(constraint="uq_instagram_posts_profile_media", set_={c: stmt.excluded[c] for c in ("caption", "media_type", "media_product_type", "permalink", "posted_at")}).returning(m.InstagramPost.id, m.InstagramPost.media_id)
                ids = {media: row_id for row_id, media in (await s.execute(stmt)).all()}
                metric_rows = [dict(post_id=ids[p.media_id], profile_id=pid, views=p.views, reach=p.reach, likes=p.likes, comments=p.comments, shares=p.shares, saves=p.saves, interactions=p.interactions, avg_watch_time_seconds=p.avg_watch_time_seconds, follower_count=p.follower_count) for p in posts]
                a = pg_insert(m.PostAnalytics).values(metric_rows)
                await s.execute(a.on_conflict_do_update(index_elements=["post_id"], set_={c: a.excluded[c] for c in ("views", "reach", "likes", "comments", "shares", "saves", "interactions", "avg_watch_time_seconds", "follower_count")} | {"captured_at": _utcnow()}))
            return await self._posts(s, pid)

        return self._tx(go)

    def get_posts(self, profile_id: str) -> list[PostIn]:
        async def go(s: AsyncSession) -> list[PostIn]:
            pid = await self._pid(s, profile_id)
            return [] if pid is None else await self._posts(s, pid)

        return self._tx(go)

    @staticmethod
    async def _comments(s: AsyncSession, pid: uuid.UUID) -> list[CommentIn]:
        rows = (await s.execute(select(m.AudienceComment).where(m.AudienceComment.profile_id == pid).order_by(m.AudienceComment.created_at, m.AudienceComment.comment_id))).scalars()
        return [CommentIn(comment_id=r.comment_id, text=r.text, posted_at=r.posted_at, like_count=r.like_count, post_media_id=r.post_media_id) for r in rows]

    def set_comments(self, profile_id: str, comments: list[CommentIn], demographics: Demographics | None, replace: bool) -> list[CommentIn]:
        async def go(s: AsyncSession) -> list[CommentIn]:
            pid = await self._require_pid(s, profile_id)
            if replace:
                keep = [c.comment_id for c in comments]
                await s.execute(delete(m.AudienceComment).where(m.AudienceComment.profile_id == pid, m.AudienceComment.comment_id.not_in(keep) if keep else True))
            if comments:
                stmt = pg_insert(m.AudienceComment).values([dict(profile_id=pid, comment_id=c.comment_id, text=c.text, posted_at=as_aware(c.posted_at) if c.posted_at else None, like_count=c.like_count, post_media_id=c.post_media_id) for c in comments])
                await s.execute(stmt.on_conflict_do_update(constraint="uq_audience_comments_profile_comment", set_={c: stmt.excluded[c] for c in ("text", "posted_at", "like_count", "post_media_id")}))
            if demographics is not None:
                await s.execute(update(m.AIProfile).where(m.AIProfile.id == pid).values(demographics=demographics.model_dump(mode="json")))
            return await self._comments(s, pid)

        return self._tx(go)

    def get_comments(self, profile_id: str) -> list[CommentIn]:
        async def go(s: AsyncSession) -> list[CommentIn]:
            pid = await self._pid(s, profile_id)
            return [] if pid is None else await self._comments(s, pid)

        return self._tx(go)

    def get_demographics(self, profile_id: str) -> Demographics | None:
        async def go(s: AsyncSession) -> Demographics | None:
            value = (await s.execute(select(m.AIProfile.demographics).where(m.AIProfile.public_id == profile_id))).scalar_one_or_none()
            return Demographics.model_validate(value) if value else None

        return self._tx(go)

    def save_analytics(self, profile_id: str, report: AnalyticsReport) -> None:
        """Not stored: the report is derived from the stored posts and is cheap to recompute, so it can never go stale."""
        return None

    def get_analytics(self, profile_id: str) -> AnalyticsReport | None:
        return None

    def save_audience(self, profile_id: str, insights: AudienceInsights) -> None:
        async def go(s: AsyncSession) -> None:
            pid = await self._require_pid(s, profile_id)
            s.add(m.AudienceInsight(profile_id=pid, comments_analyzed=insights.comments_analyzed, insights=insights.model_dump(mode="json"), generated_at=as_aware(insights.generated_at)))
            await s.flush()
            old = select(m.AudienceInsight.id).where(m.AudienceInsight.profile_id == pid).order_by(m.AudienceInsight.generated_at.desc()).offset(_KEEP_AUDIENCE_ROWS)
            await s.execute(delete(m.AudienceInsight).where(m.AudienceInsight.id.in_(old)))

        self._tx(go)

    def get_audience(self, profile_id: str) -> AudienceInsights | None:
        async def go(s: AsyncSession) -> AudienceInsights | None:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return None
            doc = (await s.execute(select(m.AudienceInsight.insights).where(m.AudienceInsight.profile_id == pid).order_by(m.AudienceInsight.generated_at.desc()).limit(1))).scalar_one_or_none()
            return AudienceInsights.model_validate(doc) if doc else None

        return self._tx(go)

    # ------------------------------------------------------------------ competitors

    @staticmethod
    def _competitor(row: m.Competitor, profile_public_id: str, posts: list[m.CompetitorPost]) -> Competitor:
        return Competitor(competitor_id=row.public_id, profile_id=profile_public_id, username=row.username, niche=row.niche, description=row.description, source=row.source, approval_status=row.approval_status, suggestion_reason=row.suggestion_reason, suggestion_confidence=row.suggestion_confidence, verified=row.verified, data_source=row.data_source, posts_updated_at=row.posts_updated_at, created_at=row.created_at, public_posts=[CompetitorPost(media_id=p.media_id, caption=p.caption, media_type=p.media_type, posted_at=p.posted_at, likes=p.likes, comments=p.comments) for p in sorted(posts, key=lambda p: (p.posted_at, p.media_id))])

    @staticmethod
    async def _competitors(s: AsyncSession, pid: uuid.UUID, public_profile_id: str, where: list | None = None) -> list[Competitor]:
        rows = (await s.execute(select(m.Competitor).where(m.Competitor.profile_id == pid, *(where or [])).order_by(m.Competitor.created_at, m.Competitor.public_id))).scalars().all()
        posts: dict[uuid.UUID, list[m.CompetitorPost]] = defaultdict(list)
        if rows:
            for p in (await s.execute(select(m.CompetitorPost).where(m.CompetitorPost.profile_id == pid, m.CompetitorPost.competitor_id.in_([r.id for r in rows])))).scalars():
                posts[p.competitor_id].append(p)
        return [PostgresStore._competitor(r, public_profile_id, posts[r.id]) for r in rows]

    def add(self, competitor: Competitor) -> Competitor:
        async def go(s: AsyncSession) -> Competitor:
            pid = await self._require_pid(s, competitor.profile_id)
            row = m.Competitor(profile_id=pid, public_id=competitor.competitor_id, username=competitor.username, niche=competitor.niche, description=competitor.description, source=competitor.source.value, approval_status=competitor.approval_status.value, suggestion_reason=competitor.suggestion_reason, suggestion_confidence=competitor.suggestion_confidence, verified=competitor.verified, data_source=competitor.data_source.value, posts_updated_at=as_aware(competitor.posts_updated_at) if competitor.posts_updated_at else None, created_at=as_aware(competitor.created_at))
            s.add(row)
            try:
                await s.flush()
                s.add_all([m.CompetitorPost(competitor_id=row.id, profile_id=pid, media_id=p.media_id, caption=p.caption, media_type=p.media_type, posted_at=as_aware(p.posted_at), likes=p.likes, comments=p.comments) for p in competitor.public_posts])
                await s.flush()
            except IntegrityError:
                raise ConflictError("This competitor already exists for the profile.") from None
            return competitor

        return self._tx(go)

    def get_competitor(self, profile_id: str, competitor_id: str) -> Competitor | None:
        async def go(s: AsyncSession) -> Competitor | None:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return None
            found = await self._competitors(s, pid, profile_id, [m.Competitor.public_id == competitor_id])
            return found[0] if found else None

        return self._tx(go)

    def list_competitors(self, profile_id: str, status: ApprovalStatus | None = None) -> list[Competitor]:
        async def go(s: AsyncSession) -> list[Competitor]:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return []
            return await self._competitors(s, pid, profile_id, [m.Competitor.approval_status == status.value] if status else None)

        return self._tx(go)

    def set_status(self, profile_id: str, competitor_id: str, status: ApprovalStatus) -> Competitor | None:
        async def go(s: AsyncSession) -> Competitor | None:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return None
            row = (await s.execute(select(m.Competitor).where(m.Competitor.profile_id == pid, m.Competitor.public_id == competitor_id).with_for_update())).scalar_one_or_none()
            if row is None:
                return None
            row.approval_status = status.value
            row.verified = status == ApprovalStatus.APPROVED or row.verified
            await s.flush()
            return (await self._competitors(s, pid, profile_id, [m.Competitor.public_id == competitor_id]))[0]

        return self._tx(go)

    def set_competitor_posts(self, profile_id: str, competitor_id: str, posts: list[CompetitorPost], replace: bool, data_source: CompetitorDataSource) -> Competitor | None:
        async def go(s: AsyncSession) -> Competitor | None:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return None
            row = (await s.execute(select(m.Competitor).where(m.Competitor.profile_id == pid, m.Competitor.public_id == competitor_id).with_for_update())).scalar_one_or_none()
            if row is None:
                return None
            if replace:
                keep = [p.media_id for p in posts]
                await s.execute(delete(m.CompetitorPost).where(m.CompetitorPost.competitor_id == row.id, m.CompetitorPost.media_id.not_in(keep) if keep else True))
            if posts:
                stmt = pg_insert(m.CompetitorPost).values([dict(competitor_id=row.id, profile_id=pid, media_id=p.media_id, caption=p.caption, media_type=p.media_type, posted_at=as_aware(p.posted_at), likes=p.likes, comments=p.comments) for p in posts])
                await s.execute(stmt.on_conflict_do_update(constraint="uq_competitor_posts_competitor_media", set_={c: stmt.excluded[c] for c in ("caption", "media_type", "posted_at", "likes", "comments")}))
            row.data_source = data_source.value
            row.posts_updated_at = _utcnow()
            await s.flush()
            return (await self._competitors(s, pid, profile_id, [m.Competitor.public_id == competitor_id]))[0]

        return self._tx(go)

    def delete_competitor(self, profile_id: str, competitor_id: str) -> bool:
        async def go(s: AsyncSession) -> bool:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return False
            result = await s.execute(delete(m.Competitor).where(m.Competitor.profile_id == pid, m.Competitor.public_id == competitor_id))
            return result.rowcount > 0

        return self._tx(go)

    # ------------------------------------------------------------------ recommendations

    @staticmethod
    def _recommendation(row: m.Recommendation, profile_public_id: str, evidence: list[m.RecommendationEvidence]) -> Recommendation:
        data = {c: getattr(row, c) for c in ("created_at", "title", "content_idea", "detailed_concept", "format", "objective", "target_audience", "suggested_publish_date", "publish_timing_note", "hook", "caption_direction", "call_to_action", "hashtags", "opportunity_score", "confidence_score", "score_breakdown", "reasoning", "source_references", "risks_and_caveats", "suggested_duration_seconds", "idea_fingerprint", "tags", "generation")}
        supporting = [Evidence(signal=e.signal, statement=e.statement, metrics=e.metrics) for e in sorted(evidence, key=lambda e: e.position)]
        return Recommendation.model_validate({**data, "recommendation_id": str(row.id), "profile_id": profile_public_id, "supporting_evidence": supporting})

    @staticmethod
    async def _recommendations(s: AsyncSession, pid: uuid.UUID, public_profile_id: str, where: list | None = None) -> list[Recommendation]:
        rows = (await s.execute(select(m.Recommendation).where(m.Recommendation.profile_id == pid, *(where or [])).order_by(m.Recommendation.created_at.desc(), m.Recommendation.id))).scalars().all()
        evidence: dict[uuid.UUID, list[m.RecommendationEvidence]] = defaultdict(list)
        if rows:
            for e in (await s.execute(select(m.RecommendationEvidence).where(m.RecommendationEvidence.profile_id == pid, m.RecommendationEvidence.recommendation_id.in_([r.id for r in rows])))).scalars():
                evidence[e.recommendation_id].append(e)
        return [PostgresStore._recommendation(r, public_profile_id, evidence[r.id]) for r in rows]

    def add_many(self, recommendations: list[Recommendation]) -> None:
        """All recommendations and all their evidence are stored together, or none are."""

        async def go(s: AsyncSession) -> None:
            pids: dict[str, uuid.UUID] = {}
            for r in recommendations:
                if r.profile_id not in pids:
                    pids[r.profile_id] = await self._require_pid(s, r.profile_id)
                dump = r.model_dump(mode="json")
                s.add(m.Recommendation(id=uuid.UUID(r.recommendation_id), profile_id=pids[r.profile_id], created_at=as_aware(r.created_at), title=r.title, content_idea=r.content_idea, detailed_concept=r.detailed_concept, format=r.format.value, objective=r.objective.value, target_audience=r.target_audience, suggested_publish_date=r.suggested_publish_date, publish_timing_note=r.publish_timing_note, hook=r.hook, caption_direction=r.caption_direction, call_to_action=r.call_to_action, hashtags=dump["hashtags"], opportunity_score=r.opportunity_score, confidence_score=r.confidence_score, score_breakdown=dump["score_breakdown"], reasoning=dump["reasoning"], source_references=dump["source_references"], risks_and_caveats=dump["risks_and_caveats"], suggested_duration_seconds=r.suggested_duration_seconds, idea_fingerprint=r.idea_fingerprint, tags=dump["tags"], generation=dump["generation"]))
            await s.flush()
            for r in recommendations:
                s.add_all([m.RecommendationEvidence(recommendation_id=uuid.UUID(r.recommendation_id), profile_id=pids[r.profile_id], position=i, signal=e.signal.value, statement=e.statement, metrics=e.model_dump(mode="json")["metrics"]) for i, e in enumerate(r.supporting_evidence)])
            await s.flush()

        self._tx(go)

    def get_recommendation(self, profile_id: str, recommendation_id: str) -> Recommendation | None:
        rid = _uuid_or_none(recommendation_id)
        if rid is None:
            return None

        async def go(s: AsyncSession) -> Recommendation | None:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return None
            found = await self._recommendations(s, pid, profile_id, [m.Recommendation.id == rid])
            return found[0] if found else None

        return self._tx(go)

    def list_recommendations(self, profile_id: str) -> list[Recommendation]:
        async def go(s: AsyncSession) -> list[Recommendation]:
            pid = await self._pid(s, profile_id)
            return [] if pid is None else await self._recommendations(s, pid, profile_id)

        return self._tx(go)

    # ------------------------------------------------------------------ feedback, outcomes, learning

    @staticmethod
    async def _replace_adjustments(s: AsyncSession, pid: uuid.UUID, adjustments: list[LearningAdjustment]) -> None:
        await s.execute(update(m.LearningAdjustment).where(m.LearningAdjustment.profile_id == pid, m.LearningAdjustment.is_current).values(is_current=False))
        s.add_all([m.LearningAdjustment(profile_id=pid, dimension=a.dimension, value=a.value, samples=a.samples, mean_signal=a.mean_signal, adjustment=a.adjustment, active=a.active, is_current=True, trigger_type=a.trigger_type, trigger_id=a.trigger_id, computed_at=as_aware(a.computed_at)) for a in adjustments])
        await s.flush()

    def add_feedback(self, feedback: Feedback, adjustments: list[LearningAdjustment] | None = None) -> Feedback:
        async def go(s: AsyncSession) -> Feedback:
            pid = await self._require_pid(s, feedback.profile_id)
            s.add(m.RecommendationFeedback(id=uuid.UUID(feedback.feedback_id), recommendation_id=uuid.UUID(feedback.recommendation_id), profile_id=pid, action=feedback.action.value, comment=feedback.comment, created_at=as_aware(feedback.created_at)))
            await s.flush()
            if adjustments is not None:
                await self._replace_adjustments(s, pid, adjustments)
            return feedback

        return self._tx(go)

    def feedback_for_profile(self, profile_id: str) -> list[Feedback]:
        async def go(s: AsyncSession) -> list[Feedback]:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return []
            rows = (await s.execute(select(m.RecommendationFeedback).where(m.RecommendationFeedback.profile_id == pid).order_by(m.RecommendationFeedback.created_at, m.RecommendationFeedback.id))).scalars()
            return [Feedback(feedback_id=str(r.id), recommendation_id=str(r.recommendation_id), profile_id=profile_id, action=r.action, comment=r.comment, created_at=r.created_at) for r in rows]

        return self._tx(go)

    @staticmethod
    def _outcome(r: m.RecommendationOutcome, profile_public_id: str) -> Outcome:
        return Outcome(outcome_id=str(r.id), recommendation_id=str(r.recommendation_id), profile_id=profile_public_id, interval=r.interval, instagram_media_id=r.instagram_media_id, captured_at=r.captured_at, metrics=r.metrics, metrics_available=r.metrics_available, engagement_rate=r.engagement_rate, performance_index=r.performance_index)

    def add_outcome(self, outcome: Outcome, adjustments: list[LearningAdjustment] | None = None) -> Outcome:
        async def go(s: AsyncSession) -> Outcome:
            pid = await self._require_pid(s, outcome.profile_id)
            s.add(m.RecommendationOutcome(id=uuid.UUID(outcome.outcome_id), recommendation_id=uuid.UUID(outcome.recommendation_id), profile_id=pid, interval=outcome.interval.value, instagram_media_id=outcome.instagram_media_id, captured_at=as_aware(outcome.captured_at), metrics=outcome.metrics.model_dump(mode="json"), metrics_available=list(outcome.metrics_available), engagement_rate=outcome.engagement_rate, performance_index=outcome.performance_index))
            await s.flush()
            if adjustments is not None:
                await self._replace_adjustments(s, pid, adjustments)
            return outcome

        return self._tx(go)

    def outcomes_for(self, profile_id: str, recommendation_id: str) -> list[Outcome]:
        rid = _uuid_or_none(recommendation_id)

        async def go(s: AsyncSession) -> list[Outcome]:
            pid = await self._pid(s, profile_id)
            if pid is None or rid is None:
                return []
            rows = (await s.execute(select(m.RecommendationOutcome).where(m.RecommendationOutcome.profile_id == pid, m.RecommendationOutcome.recommendation_id == rid).order_by(m.RecommendationOutcome.captured_at))).scalars()
            return [self._outcome(r, profile_id) for r in rows]

        return self._tx(go)

    def outcomes_for_profile(self, profile_id: str) -> list[Outcome]:
        async def go(s: AsyncSession) -> list[Outcome]:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return []
            rows = (await s.execute(select(m.RecommendationOutcome).where(m.RecommendationOutcome.profile_id == pid).order_by(m.RecommendationOutcome.captured_at))).scalars()
            return [self._outcome(r, profile_id) for r in rows]

        return self._tx(go)

    def list_learning_adjustments(self, profile_id: str, current_only: bool = True) -> list[LearningAdjustment]:
        async def go(s: AsyncSession) -> list[LearningAdjustment]:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return []
            q = select(m.LearningAdjustment).where(m.LearningAdjustment.profile_id == pid)
            if current_only:
                q = q.where(m.LearningAdjustment.is_current)
            rows = (await s.execute(q.order_by(m.LearningAdjustment.computed_at.desc(), m.LearningAdjustment.dimension, m.LearningAdjustment.value))).scalars()
            return [LearningAdjustment(dimension=r.dimension, value=r.value, samples=r.samples, mean_signal=r.mean_signal, adjustment=r.adjustment, active=r.active, computed_at=r.computed_at, trigger_type=r.trigger_type, trigger_id=r.trigger_id) for r in rows]

        return self._tx(go)

    # ------------------------------------------------------------------ trend snapshots and festivals

    def save_trend_snapshot(self, profile_id: str, as_of: date, assessments: list[TrendAssessment]) -> None:
        async def go(s: AsyncSession) -> None:
            pid = await self._require_pid(s, profile_id)
            s.add(m.TrendSnapshot(profile_id=pid, as_of=as_of, trend_count=len(assessments), trends=[a.model_dump(mode="json") for a in assessments]))
            await s.flush()
            old = select(m.TrendSnapshot.id).where(m.TrendSnapshot.profile_id == pid).order_by(m.TrendSnapshot.captured_at.desc()).offset(_KEEP_TREND_SNAPSHOTS)
            await s.execute(delete(m.TrendSnapshot).where(m.TrendSnapshot.id.in_(old)))

        self._tx(go)

    def list_trend_snapshots(self, profile_id: str, limit: int = 30) -> list[tuple[date, list[TrendAssessment]]]:
        async def go(s: AsyncSession) -> list[tuple[date, list[TrendAssessment]]]:
            pid = await self._pid(s, profile_id)
            if pid is None:
                return []
            rows = (await s.execute(select(m.TrendSnapshot).where(m.TrendSnapshot.profile_id == pid).order_by(m.TrendSnapshot.captured_at.desc()).limit(limit))).scalars()
            return [(r.as_of, [TrendAssessment.model_validate(t) for t in r.trends]) for r in rows]

        return self._tx(go)

    def sync_festivals(self, festivals: list[FestivalRecord]) -> int:
        """Inserts or updates reference festival rows by their id. Never deletes."""

        async def go(s: AsyncSession) -> int:
            if not festivals:
                return 0
            stmt = pg_insert(m.FestivalEvent).values([dict(public_id=f.festival_id, name=f.name, date=f.date, year=f.year, region=f.region, category=f.category, description=f.description, relevant_industries=f.relevant_industries, relevant_content_themes=f.relevant_content_themes, source=f.source, verification_status=f.verification_status, date_note=f.date_note) for f in festivals])
            await s.execute(stmt.on_conflict_do_update(constraint="uq_festival_events_public_id", set_={c: stmt.excluded[c] for c in ("name", "date", "year", "region", "category", "description", "relevant_industries", "relevant_content_themes", "source", "verification_status", "date_note")}))
            return len(festivals)

        return self._tx(go)
