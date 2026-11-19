"""Internal working types for the recommendation engine. The public output is `schemas.recommendation.Recommendation`."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING

from app.schemas.analytics import AnalyticsReport
from app.schemas.audience import AudienceInsights
from app.schemas.competitor import CompetitorInsights
from app.schemas.profile import ContentFormat, Objective, Profile
from app.schemas.recommendation import Evidence, SignalName, SourceReference
from app.schemas.trend import TrendAssessment, UpcomingFestival

if TYPE_CHECKING:
    from app.recommendation.learning import LearningModel


@dataclass
class Signals:
    """Everything known about a profile on one day. A source that is not available is None or empty, never a fake zero."""

    profile: Profile
    as_of: date
    analytics: AnalyticsReport | None = None
    audience: AudienceInsights | None = None
    competitors: list[CompetitorInsights] = field(default_factory=list)
    trends: list[TrendAssessment] = field(default_factory=list)
    festivals: list[UpcomingFestival] = field(default_factory=list)
    own_hashtags_by_topic: dict[str, list[str]] = field(default_factory=dict)
    learning: LearningModel | None = None
    goals: list[Objective] = field(default_factory=list)


@dataclass
class Seed:
    """A reason to make content: something one of the data sources actually shows."""

    kind: str  # historical | audience_question | audience_request | audience_pain | trend | festival | competitor | evergreen
    topic: str
    label: str
    strength: float  # 0..1: how strong this one observation is
    confidence: float  # 0..1: how much to trust it
    evidence: Evidence
    source: SourceReference
    extra: dict = field(default_factory=dict)


@dataclass
class Candidate:
    seed: Seed
    title: str
    idea: str
    concept: str
    format: ContentFormat
    objective: Objective
    hook: str
    caption_direction: str
    cta: str
    topic: str
    tags: list[str] = field(default_factory=list)
    duration: int | None = None
    publish_on: date | None = None
    timing_note: str | None = None
    hashtags: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    signals: dict[SignalName, float | None] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    sources: list[SourceReference] = field(default_factory=list)
    evidence_confidence: dict[SignalName, float] = field(default_factory=dict)
    festival_name: str | None = None
    opportunity: float = 0.0
    confidence: float = 0.0
    learning_adjustment: float = 0.0
    breakdown: dict = field(default_factory=dict)
    fingerprint: str = ""
