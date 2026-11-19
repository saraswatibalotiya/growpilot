from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class TrendCategory(str, Enum):
    FASHION = "FASHION"
    BEAUTY = "BEAUTY"
    FOOD = "FOOD"
    TRAVEL = "TRAVEL"
    TECHNOLOGY = "TECHNOLOGY"
    LIFESTYLE = "LIFESTYLE"
    EDUCATION = "EDUCATION"
    ENTERTAINMENT = "ENTERTAINMENT"
    BUSINESS = "BUSINESS"
    FITNESS = "FITNESS"
    ECOMMERCE = "ECOMMERCE"


class TrendKind(str, Enum):
    FACT = "FACT"  # backed by a named source
    HYPOTHESIS = "HYPOTHESIS"  # AI-generated or unsourced: never presented as a current trend


class Freshness(str, Enum):
    FRESH = "FRESH"
    STALE = "STALE"
    EXPIRED = "EXPIRED"
    UPCOMING = "UPCOMING"
    UNVERIFIED = "UNVERIFIED"


class TrendDirection(str, Enum):
    RISING = "RISING"
    STABLE = "STABLE"
    FALLING = "FALLING"
    UNKNOWN = "UNKNOWN"


class TrendSourceType(str, Enum):
    SEARCH_INTEREST = "SEARCH_INTEREST"  # for example a licensed search-interest dataset
    SOCIAL_PLATFORM = "SOCIAL_PLATFORM"  # permitted platform data or a trend provider
    EDITORIAL = "EDITORIAL"  # a named publication or report
    SAMPLE = "SAMPLE"  # bundled FICTIONAL data
    UNSPECIFIED = "UNSPECIFIED"


class Trend(BaseModel):
    trend_id: str
    title: str = Field(max_length=200)
    description: str = Field(max_length=1000)
    category: TrendCategory
    region: str = Field(default="India", max_length=60)
    language: str = Field(default="en", max_length=10)
    kind: TrendKind = TrendKind.FACT
    source_name: str | None = Field(default=None, max_length=120)
    source_url: str | None = Field(default=None, max_length=500)
    published_date: date | None = None
    verified_date: date | None = None
    starts_on: date | None = Field(default=None, description="For seasonal trends that have not started yet")
    expiry_date: date | None = None
    relevance_score: float = Field(default=0.5, ge=0, le=1)
    confidence_score: float = Field(default=0.5, ge=0, le=1)
    hashtags: list[str] = Field(default_factory=list, max_length=10, description="Only hashtags the source itself reports")
    # Provenance. `verified_date` is the last day the source was checked (the last observation).
    topic: str | None = Field(default=None, max_length=120, description="The subject in a few words, apart from the headline")
    source_type: TrendSourceType = TrendSourceType.UNSPECIFIED
    first_observed_date: date | None = None
    direction: TrendDirection = TrendDirection.UNKNOWN
    evidence: list[str] = Field(default_factory=list, max_length=10, description="What the source actually showed, in its own terms")
    is_sample: bool = Field(default=False, description="True for bundled FICTIONAL data. Never real-world observations")


class TrendAssessment(BaseModel):
    """A trend as it stands on a given day, for one profile."""

    trend: Trend
    freshness: Freshness
    usable_as_current: bool
    profile_relevance: float = Field(ge=0, le=1)
    reasons: list[str]


class TrendAnalyzeRequest(BaseModel):
    profile_id: str
    as_of: date | None = Field(default=None, description="Evaluate freshness on this day (default: today)")
    include_stale: bool = False


class TrendAnalysis(BaseModel):
    profile_id: str
    as_of: date
    generated_at: datetime
    current: list[TrendAssessment]
    excluded: list[TrendAssessment]
    notes: list[str]


class FestivalRecord(BaseModel):
    festival_id: str
    name: str
    date: date
    year: int
    region: str
    category: str
    description: str
    relevant_industries: list[str]
    relevant_content_themes: list[str]
    source: str
    verification_status: str = Field(description="SAMPLE_UNVERIFIED for the bundled sample data")
    date_note: str | None = None


class UpcomingFestival(BaseModel):
    festival: FestivalRecord
    days_until: int
    relevance: float = Field(ge=0, le=1)
    reasons: list[str]
