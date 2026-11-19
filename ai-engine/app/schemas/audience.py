from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.core.constants import MAX_COMMENT_CHARS, MAX_COMMENTS_PER_REQUEST
from app.schemas.common import DataCoverage, Insight


class CommentIn(BaseModel):
    comment_id: str = Field(min_length=1, max_length=64)
    text: str = Field(max_length=MAX_COMMENT_CHARS)
    posted_at: datetime | None = None
    like_count: int | None = Field(default=None, ge=0)
    post_media_id: str | None = Field(default=None, max_length=64)


class LocationShare(BaseModel):
    name: str = Field(max_length=80)
    share: float = Field(ge=0, le=1)


class Demographics(BaseModel):
    """Aggregates the platform supplied. The engine never infers age, gender, religion or other personal traits from comments."""

    top_locations: list[LocationShare] = Field(default_factory=list, max_length=20)
    age_ranges: dict[str, float] = Field(default_factory=dict)


class AudienceAnalyzeRequest(BaseModel):
    profile_id: str
    comments: list[CommentIn] = Field(max_length=MAX_COMMENTS_PER_REQUEST)
    demographics: Demographics | None = None
    detect_language: bool = True
    replace: bool = True


class CommentSignal(str, Enum):
    PURCHASE_INTENT = "PURCHASE_INTENT"
    PRICE_QUESTION = "PRICE_QUESTION"
    VARIANT_REQUEST = "VARIANT_REQUEST"
    CONTENT_REQUEST = "CONTENT_REQUEST"
    PAIN_POINT = "PAIN_POINT"
    POSITIVE_FEEDBACK = "POSITIVE_FEEDBACK"
    NEGATIVE_FEEDBACK = "NEGATIVE_FEEDBACK"
    QUESTION = "QUESTION"
    UNCLASSIFIED = "UNCLASSIFIED"


class ClassifiedComment(BaseModel):
    comment_id: str
    signals: list[CommentSignal]
    topics: list[str]
    language: str | None
    confidence: float = Field(ge=0, le=1)


class QuestionGroup(BaseModel):
    theme: str
    count: int
    examples: list[str]
    comment_ids: list[str]


class InterestCount(BaseModel):
    topic: str
    mentions: int


class AudienceInsights(BaseModel):
    profile_id: str
    generated_at: datetime
    comments_analyzed: int
    languages: dict[str, int]
    signal_counts: dict[str, int]
    interests: list[InterestCount]
    frequent_questions: list[QuestionGroup]
    insights: list[Insight]
    data_coverage: DataCoverage
    representativeness: str
    caveats: list[str]
    demographics: Demographics | None
