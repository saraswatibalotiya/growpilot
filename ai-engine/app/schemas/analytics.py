from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from app.core.constants import MAX_CAPTION_CHARS, MAX_POSTS_PER_REQUEST
from app.schemas.common import DataCoverage, Insight


class MediaFormat(str, Enum):
    REEL = "REEL"
    CAROUSEL = "CAROUSEL"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    STORY = "STORY"
    UNKNOWN = "UNKNOWN"


class PostIn(BaseModel):
    """One historical Instagram post. Every metric is optional: Instagram does not always provide them.

    `None` means "not available". It is never read as zero. A real zero must be sent as 0.
    """

    media_id: str = Field(min_length=1, max_length=64)
    caption: str | None = Field(default=None, max_length=MAX_CAPTION_CHARS)
    media_type: str | None = Field(default=None, max_length=30, description="IMAGE, VIDEO, CAROUSEL_ALBUM, REEL ...")
    media_product_type: str | None = Field(default=None, max_length=30, description="FEED, REELS, STORY")
    posted_at: datetime
    permalink: str | None = Field(default=None, max_length=500)
    views: int | None = Field(default=None, ge=0)
    reach: int | None = Field(default=None, ge=0)
    likes: int | None = Field(default=None, ge=0)
    comments: int | None = Field(default=None, ge=0)
    shares: int | None = Field(default=None, ge=0)
    saves: int | None = Field(default=None, ge=0)
    interactions: int | None = Field(default=None, ge=0)
    avg_watch_time_seconds: float | None = Field(default=None, ge=0)
    follower_count: int | None = Field(default=None, ge=0, description="Followers at the time, when known")


class AnalyzeRequest(BaseModel):
    profile_id: str
    posts: list[PostIn] = Field(max_length=MAX_POSTS_PER_REQUEST)
    min_posts_per_format: int | None = Field(default=None, ge=2, le=50, description="Overrides the server default")
    min_posts_for_timing: int | None = Field(default=None, ge=4, le=200)
    timezone: str | None = Field(default=None, max_length=60)
    replace: bool = Field(default=True, description="Replace the stored posts for this profile (true) or add to them")

    @model_validator(mode="after")
    def _unique_ids(self) -> "AnalyzeRequest":
        ids = [p.media_id for p in self.posts]
        if len(ids) != len(set(ids)):
            raise ValueError("media_id values must be unique")
        return self


class PostScore(BaseModel):
    media_id: str
    permalink: str | None
    posted_at: datetime
    format: MediaFormat
    topics: list[str]
    engagement_rate: float | None
    engagement_basis: str | None = Field(description="What the rate was divided by: reach, views, followers or none")
    performance_index: float | None = Field(description="Engagement vs the median post of the same format. 1.0 = typical")
    index_basis: str | None = Field(description="same_format, account_wide or unavailable")
    metrics_available: list[str]


class FormatBreakdown(BaseModel):
    format: MediaFormat
    posts: int
    posts_with_engagement: int
    median_engagement_rate: float | None
    mean_performance_index: float | None
    median_saves: float | None
    median_shares: float | None
    enough_data: bool


class TopicBreakdown(BaseModel):
    topic: str
    posts: int
    mean_performance_index: float | None
    enough_data: bool


class TimingBucket(BaseModel):
    label: str
    posts: int
    mean_performance_index: float | None


class AnalyticsReport(BaseModel):
    profile_id: str
    generated_at: datetime
    posts_analyzed: int
    date_range: tuple[datetime, datetime] | None
    methodology: list[str]
    baseline: dict[str, float | int | str | None]
    data_coverage: DataCoverage
    insights: list[Insight]
    top_posts: list[PostScore]
    lowest_posts: list[PostScore]
    formats: list[FormatBreakdown]
    topics: list[TopicBreakdown]
    best_days: list[TimingBucket]
    best_hours: list[TimingBucket]
    warnings: list[str]
