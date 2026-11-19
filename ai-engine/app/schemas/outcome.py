from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class OutcomeInterval(str, Enum):
    INITIAL = "INITIAL"
    H24 = "H24"
    H72 = "H72"
    D7 = "D7"


class OutcomeMetrics(BaseModel):
    """Only metrics that were actually available. None is not zero."""

    views: int | None = Field(default=None, ge=0)
    reach: int | None = Field(default=None, ge=0)
    likes: int | None = Field(default=None, ge=0)
    comments: int | None = Field(default=None, ge=0)
    shares: int | None = Field(default=None, ge=0)
    saves: int | None = Field(default=None, ge=0)


class OutcomeIn(BaseModel):
    profile_id: str
    interval: OutcomeInterval
    instagram_media_id: str | None = Field(default=None, max_length=64)
    captured_at: datetime | None = None
    metrics: OutcomeMetrics


class Outcome(BaseModel):
    outcome_id: str
    recommendation_id: str
    profile_id: str
    interval: OutcomeInterval
    instagram_media_id: str | None
    captured_at: datetime
    metrics: OutcomeMetrics
    metrics_available: list[str]
    engagement_rate: float | None
    performance_index: float | None = Field(description="Engagement vs the account baseline for the format. 1.0 = typical. None when no baseline")
