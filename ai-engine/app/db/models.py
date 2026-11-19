"""PostgreSQL tables, all in the dedicated `ai_engine` schema so nothing can collide with another application's tables.

Rules the schema enforces, so correctness does not depend on the API layer alone:

* Every profile-owned row carries `profile_id` and references `ai_profiles`.
* Child rows reference their parent through a COMPOSITE key `(parent_id, profile_id)`. A feedback row for a recommendation that
  belongs to profile A can therefore never be stored with profile B's id: the database rejects it.
* Ids are UUIDs. The API-facing string ids that already exist in the contract (`prof_...`, `comp_...`, an Instagram media id)
  are kept in their own `public_id` / `media_id` columns, unique per profile.
* Times are timestamptz (UTC). Missing metrics are NULL, never 0.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, ForeignKeyConstraint, Index, Integer, MetaData, SmallInteger, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "ai_engine"
NAMING = {"ix": "ix_%(column_0_label)s", "uq": "uq_%(table_name)s_%(column_0_name)s", "ck": "ck_%(table_name)s_%(constraint_name)s", "fk": "fk_%(table_name)s_%(column_0_name)s", "pk": "pk_%(table_name)s"}


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA, naming_convention=NAMING)


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _profile_fk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.ai_profiles.id", ondelete="CASCADE"), nullable=False)


def _jsonb(default: str = "[]") -> Mapped[list | dict]:
    return mapped_column(JSONB, nullable=False, server_default=text(f"'{default}'::jsonb"))


class AIProfile(Base):
    __tablename__ = "ai_profiles"
    __table_args__ = (UniqueConstraint("public_id", name="uq_ai_profiles_public_id"), CheckConstraint("profile_type IN ('BUSINESS','CREATOR')", name="profile_type"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    public_id: Mapped[str] = mapped_column(String(64), nullable=False)
    profile_type: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    instagram_username: Mapped[str | None] = mapped_column(String(30))
    category: Mapped[str | None] = mapped_column(String(200))
    niche: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    target_audience: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str] = mapped_column(String(60), nullable=False, server_default="India")
    region: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(200))
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    brand_voice: Mapped[str | None] = mapped_column(String(300))
    goals: Mapped[list] = _jsonb()
    products: Mapped[list] = _jsonb()
    services: Mapped[list] = _jsonb()
    preferred_topics: Mapped[list] = _jsonb()
    excluded_topics: Mapped[list] = _jsonb()
    preferred_formats: Mapped[list] = _jsonb()
    posting_frequency_per_week: Mapped[float | None] = mapped_column(Float)
    demographics: Mapped[dict | None] = mapped_column(JSONB)  # aggregates the platform supplied; nothing inferred
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class InstagramPost(Base):
    __tablename__ = "instagram_posts"
    __table_args__ = (UniqueConstraint("profile_id", "media_id", name="uq_instagram_posts_profile_media"), UniqueConstraint("id", "profile_id", name="uq_instagram_posts_id_profile"), Index("ix_instagram_posts_profile_posted", "profile_id", "posted_at"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    media_id: Mapped[str] = mapped_column(String(64), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    media_type: Mapped[str | None] = mapped_column(String(30))
    media_product_type: Mapped[str | None] = mapped_column(String(30))
    permalink: Mapped[str | None] = mapped_column(String(500))
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = _now()


class PostAnalytics(Base):
    """The metrics Instagram reported for a post. NULL means not reported: it is never read as zero."""

    __tablename__ = "post_analytics"
    __table_args__ = (
        ForeignKeyConstraint(["post_id", "profile_id"], [f"{SCHEMA}.instagram_posts.id", f"{SCHEMA}.instagram_posts.profile_id"], ondelete="CASCADE", name="fk_post_analytics_post_profile"),
        UniqueConstraint("post_id", name="uq_post_analytics_post_id"),
        CheckConstraint("coalesce(views,0) >= 0 AND coalesce(reach,0) >= 0 AND coalesce(likes,0) >= 0 AND coalesce(comments,0) >= 0 AND coalesce(shares,0) >= 0 AND coalesce(saves,0) >= 0", name="metrics_non_negative"),
        Index("ix_post_analytics_profile", "profile_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    views: Mapped[int | None] = mapped_column(BigInteger)
    reach: Mapped[int | None] = mapped_column(BigInteger)
    likes: Mapped[int | None] = mapped_column(BigInteger)
    comments: Mapped[int | None] = mapped_column(BigInteger)
    shares: Mapped[int | None] = mapped_column(BigInteger)
    saves: Mapped[int | None] = mapped_column(BigInteger)
    interactions: Mapped[int | None] = mapped_column(BigInteger)
    avg_watch_time_seconds: Mapped[float | None] = mapped_column(Float)
    follower_count: Mapped[int | None] = mapped_column(BigInteger)
    captured_at: Mapped[datetime] = _now()


class AudienceComment(Base):
    """Raw comments, kept so audience analysis can be repeated (for example for an earlier date) after a restart."""

    __tablename__ = "audience_comments"
    __table_args__ = (UniqueConstraint("profile_id", "comment_id", name="uq_audience_comments_profile_comment"), Index("ix_audience_comments_profile_posted", "profile_id", "posted_at"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    comment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    like_count: Mapped[int | None] = mapped_column(Integer)
    post_media_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _now()


class AudienceInsight(Base):
    __tablename__ = "audience_insights"
    __table_args__ = (Index("ix_audience_insights_profile_generated", "profile_id", "generated_at"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    comments_analyzed: Mapped[int] = mapped_column(Integer, nullable=False)
    insights: Mapped[dict] = mapped_column(JSONB, nullable=False)  # the full AudienceInsights document
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Competitor(Base):
    __tablename__ = "competitors"
    __table_args__ = (
        UniqueConstraint("profile_id", "public_id", name="uq_competitors_profile_public"),
        UniqueConstraint("profile_id", "username", name="uq_competitors_profile_username"),
        UniqueConstraint("id", "profile_id", name="uq_competitors_id_profile"),
        CheckConstraint("source IN ('MANUAL','AI_SUGGESTED')", name="source"),
        CheckConstraint("approval_status IN ('PENDING','APPROVED','REJECTED')", name="approval_status"),
        CheckConstraint("data_source IN ('USER_SUPPLIED','SAMPLE_PROVIDER','OFFICIAL_API')", name="data_source"),
        Index("ix_competitors_profile_status", "profile_id", "approval_status"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    public_id: Mapped[str] = mapped_column(String(64), nullable=False)
    username: Mapped[str] = mapped_column(String(30), nullable=False)
    niche: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(16), nullable=False)
    suggestion_reason: Mapped[str | None] = mapped_column(Text)
    suggestion_confidence: Mapped[float | None] = mapped_column(Float)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False)
    data_source: Mapped[str] = mapped_column(String(20), nullable=False, server_default="USER_SUPPLIED")  # where the public posts came from
    posts_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CompetitorPost(Base):
    """Public information only."""

    __tablename__ = "competitor_posts"
    __table_args__ = (
        ForeignKeyConstraint(["competitor_id", "profile_id"], [f"{SCHEMA}.competitors.id", f"{SCHEMA}.competitors.profile_id"], ondelete="CASCADE", name="fk_competitor_posts_competitor_profile"),
        UniqueConstraint("competitor_id", "media_id", name="uq_competitor_posts_competitor_media"),
        Index("ix_competitor_posts_profile", "profile_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    competitor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    media_id: Mapped[str] = mapped_column(String(64), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    media_type: Mapped[str | None] = mapped_column(String(30))
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    likes: Mapped[int | None] = mapped_column(BigInteger)
    comments: Mapped[int | None] = mapped_column(BigInteger)


class TrendSnapshot(Base):
    """The trends a recommendation run relied on, with their freshness, for one profile on one evaluation day."""

    __tablename__ = "trend_snapshots"
    __table_args__ = (Index("ix_trend_snapshots_profile_asof", "profile_id", "as_of", "captured_at"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    trend_count: Mapped[int] = mapped_column(Integer, nullable=False)
    trends: Mapped[list] = mapped_column(JSONB, nullable=False)
    captured_at: Mapped[datetime] = _now()


class FestivalEvent(Base):
    """Reference data shared by every profile (not profile-owned)."""

    __tablename__ = "festival_events"
    __table_args__ = (UniqueConstraint("public_id", name="uq_festival_events_public_id"), Index("ix_festival_events_date", "date"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    public_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    region: Mapped[str] = mapped_column(String(60), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    relevant_industries: Mapped[list] = _jsonb()
    relevant_content_themes: Mapped[list] = _jsonb()
    source: Mapped[str] = mapped_column(Text, nullable=False)
    verification_status: Mapped[str] = mapped_column(String(40), nullable=False)
    date_note: Mapped[str | None] = mapped_column(Text)


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint("id", "profile_id", name="uq_recommendations_id_profile"),
        CheckConstraint("opportunity_score BETWEEN 0 AND 100 AND confidence_score BETWEEN 0 AND 100", name="scores_in_range"),
        Index("ix_recommendations_profile_created", "profile_id", "created_at"),
        Index("ix_recommendations_profile_fingerprint", "profile_id", "idea_fingerprint"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)  # the API's recommendation_id
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_idea: Mapped[str] = mapped_column(Text, nullable=False)
    detailed_concept: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(String(30), nullable=False)
    objective: Mapped[str] = mapped_column(String(30), nullable=False)
    target_audience: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_publish_date: Mapped[date | None] = mapped_column(Date)
    publish_timing_note: Mapped[str | None] = mapped_column(Text)
    hook: Mapped[str] = mapped_column(Text, nullable=False)
    caption_direction: Mapped[str] = mapped_column(Text, nullable=False)
    call_to_action: Mapped[str] = mapped_column(Text, nullable=False)
    hashtags: Mapped[list] = _jsonb()
    opportunity_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    confidence_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    score_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reasoning: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_references: Mapped[list] = _jsonb()
    risks_and_caveats: Mapped[list] = _jsonb()
    suggested_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    idea_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    tags: Mapped[list] = _jsonb()
    generation: Mapped[dict | None] = mapped_column(JSONB)  # provider, model, method, latency, attempts


class RecommendationEvidence(Base):
    __tablename__ = "recommendation_evidence"
    __table_args__ = (
        ForeignKeyConstraint(["recommendation_id", "profile_id"], [f"{SCHEMA}.recommendations.id", f"{SCHEMA}.recommendations.profile_id"], ondelete="CASCADE", name="fk_recommendation_evidence_recommendation_profile"),
        UniqueConstraint("recommendation_id", "position", name="uq_recommendation_evidence_position"),
        Index("ix_recommendation_evidence_profile", "profile_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    recommendation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    signal: Mapped[str] = mapped_column(String(20), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    metrics: Mapped[dict] = _jsonb("{}")


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"
    __table_args__ = (
        ForeignKeyConstraint(["recommendation_id", "profile_id"], [f"{SCHEMA}.recommendations.id", f"{SCHEMA}.recommendations.profile_id"], ondelete="CASCADE", name="fk_recommendation_feedback_recommendation_profile"),
        CheckConstraint("action IN ('SAVED','DISMISSED','LIKED','NOT_RELEVANT','ALREADY_POSTED','CREATED','PUBLISHED')", name="action"),
        Index("ix_recommendation_feedback_profile_created", "profile_id", "created_at"),
        Index("ix_recommendation_feedback_recommendation", "recommendation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)  # the API's feedback_id
    recommendation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RecommendationOutcome(Base):
    __tablename__ = "recommendation_outcomes"
    __table_args__ = (
        ForeignKeyConstraint(["recommendation_id", "profile_id"], [f"{SCHEMA}.recommendations.id", f"{SCHEMA}.recommendations.profile_id"], ondelete="CASCADE", name="fk_recommendation_outcomes_recommendation_profile"),
        UniqueConstraint("recommendation_id", "interval", name="uq_recommendation_outcomes_interval"),
        CheckConstraint("interval IN ('INITIAL','H24','H72','D7')", name="interval"),
        Index("ix_recommendation_outcomes_profile_captured", "profile_id", "captured_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)  # the API's outcome_id
    recommendation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    interval: Mapped[str] = mapped_column(String(10), nullable=False)
    instagram_media_id: Mapped[str | None] = mapped_column(String(64))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    metrics_available: Mapped[list] = _jsonb()
    engagement_rate: Mapped[float | None] = mapped_column(Float)
    performance_index: Mapped[float | None] = mapped_column(Float)


class LearningAdjustment(Base):
    """History of the rule-based adjustments. Exactly one row per (profile, dimension, value) is current."""

    __tablename__ = "learning_adjustments"
    __table_args__ = (
        Index("uq_learning_adjustments_current", "profile_id", "dimension", "value", unique=True, postgresql_where=text("is_current")),
        Index("ix_learning_adjustments_profile_computed", "profile_id", "computed_at"),
        CheckConstraint("samples >= 0", name="samples_non_negative"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = _profile_fk()
    dimension: Mapped[str] = mapped_column(String(20), nullable=False)
    value: Mapped[str] = mapped_column(String(120), nullable=False)
    samples: Mapped[int] = mapped_column(Integer, nullable=False)
    mean_signal: Mapped[float] = mapped_column(Float, nullable=False)
    adjustment: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    trigger_type: Mapped[str | None] = mapped_column(String(10))
    trigger_id: Mapped[str | None] = mapped_column(String(64))
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
