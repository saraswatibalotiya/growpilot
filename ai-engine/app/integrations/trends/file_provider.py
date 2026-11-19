"""Trends from a dataset the operator supplies (a JSON file), for REAL, sourced trend data.

The engine does not fetch trends from the internet itself: search-interest and social-platform data come with licences, quotas and
terms that belong to whoever runs it (Google Trends has no official public API; platform data needs permitted access). Export the
data you are licensed to use into the JSON format below and point TREND_DATA_FILE at it.

Every record is checked. A record is REJECTED, not silently fixed, if it:
* claims to be sample data (`is_sample` true),
* lacks a source name or a source URL,
* lacks an observation date (`verified_date`, the last day the source was checked),
* has an observation date in the future, or
* is not a valid trend record.
Rejected records and the reasons are reported by GET /api/v1/trends/sources, never hidden.

Format: a JSON list of objects with the fields of `Trend` (app/schemas/trend.py), for example
  {"trend_id": "t1", "title": "...", "topic": "...", "description": "...", "category": "FOOD", "region": "India",
   "source_name": "...", "source_url": "https://...", "source_type": "SEARCH_INTEREST",
   "first_observed_date": "2026-10-20", "verified_date": "2026-11-10", "expiry_date": "2026-12-10",
   "direction": "RISING", "evidence": ["what the source showed"], "relevance_score": 0.7, "confidence_score": 0.8}
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from app.schemas.trend import Trend, TrendSourceType


def check_real_trend(t: Trend, today: date) -> str | None:
    """Why a record can not be treated as a real, sourced trend. None if it is fine."""
    if t.is_sample or t.source_type == TrendSourceType.SAMPLE:
        return "marked as sample data"
    if not (t.source_name and t.source_name.strip()):
        return "no source name"
    if not (t.source_url and t.source_url.strip().lower().startswith(("http://", "https://"))):
        return "no source URL"
    if t.verified_date is None:
        return "no observation date (verified_date)"
    if t.verified_date > today:
        return "observation date is in the future"
    if t.first_observed_date and t.first_observed_date > t.verified_date:
        return "first observed after it was last observed"
    return None


class FileTrendProvider:
    name = "file"

    def __init__(self, path: str | Path, *, today: date | None = None):
        self._path = Path(path)
        self._today = today or date.today()
        self._records: list[Trend] = []
        self._rejected: list[dict] = []
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            self._rejected.append({"record": str(self._path.name), "reason": "the trend data file does not exist"})
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self._rejected.append({"record": str(self._path.name), "reason": "the file is not valid JSON"})
            return
        if not isinstance(raw, list):
            self._rejected.append({"record": str(self._path.name), "reason": "the file must contain a JSON list of records"})
            return
        for i, item in enumerate(raw):
            label = str(item.get("trend_id", f"#{i}")) if isinstance(item, dict) else f"#{i}"
            try:
                t = Trend.model_validate(item)
            except ValidationError as exc:
                self._rejected.append({"record": label, "reason": "invalid record (" + ", ".join(sorted({'.'.join(map(str, e['loc'])) for e in exc.errors()})) + ")"})
                continue
            problem = check_real_trend(t, self._today)
            if problem:
                self._rejected.append({"record": label, "reason": problem})
            else:
                self._records.append(t)

    def list_trends(self) -> list[Trend]:
        return list(self._records)

    def describe(self) -> dict:
        return {"provider": self.name, "records": len(self._records), "rejected": self._rejected, "note": "Trends from the operator-supplied dataset. Only records with a source, a source URL and an observation date are used."}
