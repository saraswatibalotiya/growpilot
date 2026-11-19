from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class ProfileType(str, Enum):
    BUSINESS = "BUSINESS"
    CREATOR = "CREATOR"


class ContentFormat(str, Enum):
    """What a recommended post is. Several map to the same Instagram media type (see intelligence.format_analyzer)."""

    REEL = "REEL"
    CAROUSEL = "CAROUSEL"
    SINGLE_IMAGE = "SINGLE_IMAGE"
    STORY = "STORY"
    EDUCATIONAL_POST = "EDUCATIONAL_POST"
    PRODUCT_SHOWCASE = "PRODUCT_SHOWCASE"
    BEHIND_THE_SCENES = "BEHIND_THE_SCENES"
    TUTORIAL = "TUTORIAL"
    PROMOTIONAL = "PROMOTIONAL"
    UGC_CONCEPT = "UGC_CONCEPT"


class Objective(str, Enum):
    REACH = "REACH"
    ENGAGEMENT = "ENGAGEMENT"
    SAVES = "SAVES"
    SHARES = "SHARES"
    PRODUCT_DISCOVERY = "PRODUCT_DISCOVERY"
    LEADS = "LEADS"
    SALES = "SALES"
    COMMUNITY_BUILDING = "COMMUNITY_BUILDING"
    AUDIENCE_EDUCATION = "AUDIENCE_EDUCATION"
    BRAND_AWARENESS = "BRAND_AWARENESS"


Short = Field(default=None, max_length=200)
Items = Field(default_factory=list, max_length=40)


class ProfileBase(BaseModel):
    profile_type: ProfileType
    name: str = Field(min_length=1, max_length=120)
    instagram_username: str | None = Field(default=None, max_length=30)
    category: str | None = Short
    niche: str | None = Short
    description: str | None = Field(default=None, max_length=1000)
    target_audience: str | None = Field(default=None, max_length=500)
    country: str = Field(default="India", max_length=60)
    region: str | None = Short
    city: str | None = Short
    primary_language: str = Field(default="en", max_length=10)
    brand_voice: str | None = Field(default=None, max_length=300)
    goals: list[Objective] = Field(default_factory=list, max_length=10)
    products: list[str] = Items
    services: list[str] = Items
    preferred_topics: list[str] = Items
    excluded_topics: list[str] = Items
    preferred_formats: list[ContentFormat] = Field(default_factory=list, max_length=10)
    posting_frequency_per_week: float | None = Field(default=None, ge=0, le=50)

    @field_validator("instagram_username")
    @classmethod
    def _username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lstrip("@").lower()
        if not value:
            return None
        if not all(c.isalnum() or c in "._" for c in value):
            raise ValueError("an Instagram username has only letters, numbers, dots and underscores")
        return value

    @field_validator("products", "services", "preferred_topics", "excluded_topics")
    @classmethod
    def _clean_list(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value if v and v.strip()]
        if any(len(v) > 120 for v in cleaned):
            raise ValueError("each item must be 120 characters or fewer")
        return cleaned


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    """Every field optional: only what is sent changes."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    instagram_username: str | None = Field(default=None, max_length=30)
    category: str | None = Short
    niche: str | None = Short
    description: str | None = Field(default=None, max_length=1000)
    target_audience: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=60)
    region: str | None = Short
    city: str | None = Short
    primary_language: str | None = Field(default=None, max_length=10)
    brand_voice: str | None = Field(default=None, max_length=300)
    goals: list[Objective] | None = Field(default=None, max_length=10)
    products: list[str] | None = Field(default=None, max_length=40)
    services: list[str] | None = Field(default=None, max_length=40)
    preferred_topics: list[str] | None = Field(default=None, max_length=40)
    excluded_topics: list[str] | None = Field(default=None, max_length=40)
    preferred_formats: list[ContentFormat] | None = Field(default=None, max_length=10)
    posting_frequency_per_week: float | None = Field(default=None, ge=0, le=50)

    _username = field_validator("instagram_username")(ProfileBase._username.__func__)  # type: ignore[attr-defined]


class Profile(ProfileBase):
    profile_id: str
    created_at: datetime
    updated_at: datetime
