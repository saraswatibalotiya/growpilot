from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator

from app.core.constants import MAX_CAPTION_CHARS, MAX_COMPETITOR_POSTS
from app.schemas.analytics import MediaFormat


class CompetitorSource(str, Enum):
    MANUAL = "MANUAL"
    AI_SUGGESTED = "AI_SUGGESTED"


class CompetitorDataSource(str, Enum):
    """Where a competitor's public posts came from. Never mixed up with how the competitor was found (CompetitorSource)."""

    USER_SUPPLIED = "USER_SUPPLIED"  # the owner entered or imported public information
    SAMPLE_PROVIDER = "SAMPLE_PROVIDER"  # the bundled FICTIONAL sample provider: not real accounts
    OFFICIAL_API = "OFFICIAL_API"  # a permitted official API (not implemented yet)


class Activity(str, Enum):
    ACTIVE = "ACTIVE"
    SLOWING = "SLOWING"
    INACTIVE = "INACTIVE"
    UNKNOWN = "UNKNOWN"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CompetitorPost(BaseModel):
    """Only what is publicly visible. Views, reach, saves and demographics are not accessible for other accounts."""

    media_id: str = Field(max_length=64)
    caption: str | None = Field(default=None, max_length=MAX_CAPTION_CHARS)
    media_type: str | None = Field(default=None, max_length=30)
    posted_at: datetime
    likes: int | None = Field(default=None, ge=0)
    comments: int | None = Field(default=None, ge=0)


def _clean_username(value: str) -> str:
    value = value.strip().lstrip("@").lower()
    if not value or not all(c.isalnum() or c in "._" for c in value):
        raise ValueError("an Instagram username has only letters, numbers, dots and underscores")
    return value


class CompetitorCreate(BaseModel):
    profile_id: str
    username: str = Field(min_length=1, max_length=30)
    niche: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    public_posts: list[CompetitorPost] = Field(default_factory=list, max_length=MAX_COMPETITOR_POSTS)

    _username = field_validator("username")(_clean_username)


class CompetitorSuggestRequest(BaseModel):
    profile_id: str
    max_suggestions: int = Field(default=5, ge=1, le=10)
    query: str | None = Field(default=None, max_length=100, description="A business name, handle or keyword to search for")
    category: str | None = Field(default=None, max_length=100, description="Narrow the search to a category, for example 'restaurant'")


class CompetitorPostsUpdate(BaseModel):
    """Public information about a competitor's recent posts, supplied by the owner."""

    profile_id: str
    posts: list[CompetitorPost] = Field(max_length=MAX_COMPETITOR_POSTS)
    replace: bool = Field(default=True, description="Replace the stored posts (true) or add to them")


class ApprovalUpdate(BaseModel):
    profile_id: str
    status: ApprovalStatus

    @field_validator("status")
    @classmethod
    def _decision(cls, value: ApprovalStatus) -> ApprovalStatus:
        if value == ApprovalStatus.PENDING:
            raise ValueError("a competitor can only be moved to APPROVED or REJECTED")
        return value


class Competitor(BaseModel):
    competitor_id: str
    profile_id: str
    username: str
    niche: str | None
    description: str | None
    source: CompetitorSource
    approval_status: ApprovalStatus
    suggestion_reason: str | None = None
    suggestion_confidence: float | None = None
    verified: bool = Field(description="False for AI suggestions: they are hypotheses until the owner approves them")
    public_posts: list[CompetitorPost] = Field(default_factory=list)
    data_source: CompetitorDataSource = CompetitorDataSource.USER_SUPPLIED
    posts_updated_at: datetime | None = None
    created_at: datetime


class CompetitorObservation(BaseModel):
    observation: str
    evidence: list[str]
    opportunity: str | None
    confidence: float = Field(ge=0, le=1)


class FormatEngagement(BaseModel):
    """Visible public engagement by format, within ONE account. Depends on that account's audience size: never compare with yours."""

    format: MediaFormat
    posts: int
    posts_with_public_metrics: int
    median_public_interactions: float | None = Field(description="Median of public likes + comments. None when not visible")


class ThemeCoverage(BaseModel):
    topic: str
    competitor_posts: int
    competitor_share: float = Field(ge=0, le=1)
    your_posts: int
    your_share: float | None = Field(description="None when you have no posts at all (unknown, not zero)")


class CompetitorInsights(BaseModel):
    competitor_id: str
    username: str
    data_source: CompetitorDataSource = CompetitorDataSource.USER_SUPPLIED
    as_of: date | None = None
    last_post_at: datetime | None = None
    activity: Activity = Activity.UNKNOWN
    top_hashtags: list[str] = Field(default_factory=list)
    format_engagement: list[FormatEngagement] = Field(default_factory=list)
    themes: list[ThemeCoverage] = Field(default_factory=list)
    low_coverage_topics: list[str] = Field(default_factory=list, description="Topics they cover repeatedly and you cover little or not at all")
    posts_analyzed: int
    posts_per_week: float | None
    format_mix: dict[MediaFormat, int]
    top_topics: list[str]
    avg_public_likes: float | None
    avg_public_comments: float | None
    metrics_not_available: list[str]
    observations: list[CompetitorObservation]
    uncovered_by_you: list[str]
    differentiation_opportunities: list[str]
    caveats: list[str]


class CompetitorSummary(BaseModel):
    competitor_id: str
    username: str
    data_source: CompetitorDataSource
    activity: Activity
    posts_analyzed: int
    posts_per_week: float | None
    last_post_at: datetime | None
    top_topics: list[str]


class LandscapeTopic(BaseModel):
    topic: str
    competitors_covering: int
    competitors_total: int
    competitor_posts: int
    your_posts: int
    your_share: float | None
    is_gap: bool = Field(description="Covered repeatedly by competitors and little or not at all by you")


class CompetitorLandscape(BaseModel):
    """All approved competitors together: who is active, what they publish, and where you are missing."""

    profile_id: str
    as_of: date
    competitors_analyzed: int
    competitors_without_posts: int
    competitors: list[CompetitorSummary]
    topics: list[LandscapeTopic]
    format_mix: dict[MediaFormat, int]
    your_format_mix: dict[MediaFormat, int]
    common_hashtags: list[str]
    gaps: list[str]
    caveats: list[str]
