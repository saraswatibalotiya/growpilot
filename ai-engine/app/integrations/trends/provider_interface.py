"""Where trends come from. A real provider must return records that name their source; the engine rejects the rest.

The bundled provider reads FICTIONAL sample records. It does not scrape social media.
"""

import json
from pathlib import Path
from typing import Protocol

from app.schemas.trend import Trend, TrendSourceType

_FIXTURE = Path(__file__).resolve().parents[2] / "data" / "mock" / "trends.json"


class TrendProvider(Protocol):
    name: str

    def list_trends(self) -> list[Trend]: ...


class MockTrendProvider:
    name = "sample"

    def __init__(self, fixture: Path = _FIXTURE):
        self._fixture = fixture

    def list_trends(self) -> list[Trend]:
        """The bundled records, always marked as FICTIONAL SAMPLE data whatever the file says."""
        out = []
        for raw in json.loads(self._fixture.read_text(encoding="utf-8")):
            t = Trend.model_validate(raw)
            out.append(t.model_copy(update={"is_sample": True, "source_type": TrendSourceType.SAMPLE, "first_observed_date": t.first_observed_date or t.published_date}))
        return out

    def describe(self) -> dict:
        return {"provider": self.name, "records": len(self.list_trends()), "rejected": [], "note": "FICTIONAL sample trends. Not real-world observations."}


class EmptyTrendProvider:
    """No trend source at all. The engine then says honestly that no current trend was found."""

    name = "none"

    def list_trends(self) -> list[Trend]:
        return []

    def describe(self) -> dict:
        return {"provider": self.name, "records": 0, "rejected": [], "note": "No trend source is configured, so no trend is ever claimed."}
