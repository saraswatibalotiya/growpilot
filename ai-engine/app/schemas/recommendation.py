from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.profile import ContentFormat, Objective


class SignalName(str, Enum):
    HISTORICAL = "historical"
    AUDIENCE = "audience"
    TREND = "trend"
    FESTIVAL = "festival"
    COMPETITOR = "competitor"
    GOAL = "goal"


class Evidence(BaseModel):
    signal: SignalName
    statement: str
    metrics: dict[str, float | int | str | None] = Field(default_factory=dict)


class SourceReference(BaseModel):
    type: str
    name: str
    reference: str | None = None


class Reasoning(BaseModel):
    """The seven questions every recommendation must answer."""

    what_to_post: str
    why_post_it: str
    why_relevant_to_audience: str
    supporting_evidence: str
    why_now: str
    what_it_looks_like: str
    audience_action: str


class ScoreBreakdown(BaseModel):
    weights_used: dict[str, float]
    signals: dict[str, float | None]
    signals_available: list[str]
    signals_missing: list[str]
    learning_adjustment: float
    explanation: str


class AIDiagnostics(BaseModel):
    provider: str
    model: str
    generation_method: str
    latency_ms: int | None = None
    attempts: int = 1


class Recommendation(BaseModel):
    recommendation_id: str
    profile_id: str
    created_at: datetime
    title: str
    content_idea: str
    detailed_concept: str
    format: ContentFormat
    objective: Objective
    target_audience: str
    suggested_publish_date: date | None
    publish_timing_note: str | None
    hook: str
    caption_direction: str
    call_to_action: str
    hashtags: list[str]
    opportunity_score: int = Field(ge=0, le=100, description="A ranking signal. NOT a prediction of views, reach or sales.")
    confidence_score: int = Field(ge=0, le=100, description="How well the evidence supports the idea. Separate from opportunity.")
    score_breakdown: ScoreBreakdown
    reasoning: Reasoning
    supporting_evidence: list[Evidence]
    source_references: list[SourceReference]
    risks_and_caveats: list[str]
    suggested_duration_seconds: int | None = None
    idea_fingerprint: str
    tags: list[str] = Field(default_factory=list, description="evergreen, audience_driven, trend_driven, festival_driven, promotional ...")
    generation: AIDiagnostics | None = None


class GenerateRequest(BaseModel):
    profile_id: str
    count: int = Field(default=4, ge=3, le=5)
    goal: Objective | None = Field(default=None, description="Overrides the profile goals for this request")
    as_of: date | None = Field(default=None, description="Treat this as today (default: today). Makes runs repeatable.")
    use_ai: bool = Field(default=False, description="Let the configured AI provider polish the wording. Scores and evidence stay rule-based.")


class FeedbackAction(str, Enum):
    SAVED = "SAVED"
    DISMISSED = "DISMISSED"
    LIKED = "LIKED"
    NOT_RELEVANT = "NOT_RELEVANT"
    ALREADY_POSTED = "ALREADY_POSTED"
    CREATED = "CREATED"
    PUBLISHED = "PUBLISHED"


class FeedbackIn(BaseModel):
    profile_id: str
    action: FeedbackAction
    comment: str | None = Field(default=None, max_length=500)


class Feedback(BaseModel):
    feedback_id: str
    recommendation_id: str
    profile_id: str
    action: FeedbackAction
    comment: str | None
    created_at: datetime
