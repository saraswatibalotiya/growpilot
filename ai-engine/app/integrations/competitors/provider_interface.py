"""Where competitor suggestions come from. Only publicly available or explicitly authorised information may be used.

The engine never scrapes Instagram, bypasses a login, or works around a rate limit. A real provider would use an official
API or data the owner supplied. The bundled provider reads fictional fixtures.
"""

import json
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from app.schemas.competitor import CompetitorPost
from app.schemas.profile import Profile

_FIXTURE = Path(__file__).resolve().parents[2] / "data" / "mock" / "competitors.json"


class SuggestedCompetitor(BaseModel):
    username: str
    niche: str | None = None
    description: str | None = None
    reason: str
    confidence: float
    public_posts: list[CompetitorPost] = []


class CompetitorSuggestionProvider(Protocol):
    name: str

    async def suggest(self, profile: Profile, limit: int) -> list[SuggestedCompetitor]: ...


# For profiles created after start-up, borrow the fixtures of the closest bundled niche.
_NICHE_FALLBACK = {"fashion": "prof_boutique_mumbai", "beauty": "prof_beauty_creator", "food": "prof_food_creator", "travel": "prof_travel_creator"}


class MockCompetitorProvider:
    name = "mock"

    def __init__(self, fixture: Path = _FIXTURE):
        self._data: dict = json.loads(fixture.read_text(encoding="utf-8")) if fixture.exists() else {}

    async def suggest(self, profile: Profile, limit: int) -> list[SuggestedCompetitor]:
        key = profile.profile_id if profile.profile_id in self._data else _NICHE_FALLBACK.get((profile.niche or "").lower())
        pool = self._data.get(key or "", [])
        return [SuggestedCompetitor.model_validate(item) for item in pool[:limit]]
