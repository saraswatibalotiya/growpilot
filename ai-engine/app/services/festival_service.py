"""Festivals and occasions from structured records. Dates are data, not code: update festivals_sample.json (or swap the loader)
without touching any logic. The bundled file is a SAMPLE and its dates are approximate; see each record's `date_note`."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from app.integrations.festivals.calendar import RANK, RULE_FIXED, SAMPLE, VERIFIED, fixed_date_festivals, load_verified_file
from app.intelligence.trend_analyzer import profile_industries, profile_places
from app.schemas.profile import Profile
from app.schemas.trend import FestivalRecord, UpcomingFestival
from app.utils.dates import today

_DIR = Path(__file__).resolve().parents[1] / "data" / "festivals"
_FILE = _DIR / "festivals_sample.json"
BUNDLED_VERIFIED = sorted(_DIR.glob("festivals_verified_*.json"))  # official calendars shipped with the engine (see docs/REAL_DATA_SOURCES.md)


class FestivalService:
    """Festivals from three kinds of source, merged by name and year with the most trustworthy record winning:
    a verified file (operator supplied) > rule-based fixed dates > the bundled approximate sample."""

    def __init__(self, source: Path = _FILE, *, verified_file: str | None = None, include_sample: bool = True, rule_dates: bool = False, bundled_verified: bool = False):
        self._sample = [FestivalRecord.model_validate(r) for r in json.loads(source.read_text(encoding="utf-8"))] if (include_sample and source.exists()) else []
        # The operator's file comes first so it wins over a bundled record for the same festival and year.
        sources = [*([verified_file] if verified_file else []), *(BUNDLED_VERIFIED if bundled_verified else [])]
        self._verified, self._rejected = [], []
        for path in sources:
            ok, bad = load_verified_file(path)
            self._verified += ok
            self._rejected += bad
        self._include_sample = include_sample
        self._rule_dates = rule_dates  # fixed-date occasions computed for any year; the application turns this on
        self._years = {f.year for f in [*self._sample, *self._verified]} | {today().year, today().year + 1}
        self._records: list[FestivalRecord] = self._merge()

    @classmethod
    def from_settings(cls, settings) -> FestivalService:
        return cls(verified_file=settings.festival_data_file, include_sample=settings.festival_include_sample, rule_dates=True, bundled_verified=settings.festival_include_bundled_verified)

    def _merge(self) -> list[FestivalRecord]:
        best: dict[tuple[str, int], FestivalRecord] = {}
        rules = (r for y in sorted(self._years) for r in fixed_date_festivals(y)) if self._rule_dates else ()
        for f in [*self._sample, *rules, *self._verified]:
            key = (f.name.lower(), f.year)
            if key not in best or RANK.get(f.verification_status, 0) > RANK.get(best[key].verification_status, 0):
                best[key] = f
        return list(best.values())

    def with_years(self, years: set[int]) -> None:
        """Makes sure rule-based dates exist for these years (they are computed, so any year works)."""
        if not years <= self._years:
            self._years |= years
            self._records = self._merge()

    def coverage(self, year: int) -> dict:
        """What is and is not known for a year, so a missing festival is never mistaken for 'no festival'."""
        self.with_years({year})
        recs = [f for f in self._records if f.year == year]
        by_status: dict[str, int] = {}
        for f in recs:
            by_status[f.verification_status] = by_status.get(f.verification_status, 0) + 1
        notes = [f"{by_status.get(RULE_FIXED, 0)} fixed-date occasions are computed and confirmed."]
        if by_status.get(VERIFIED, 0):
            notes.append(f"{by_status[VERIFIED]} festival dates come from a verified source you supplied.")
        if by_status.get(SAMPLE, 0):
            notes.append(f"{by_status[SAMPLE]} festival dates are bundled APPROXIMATE sample data and are NOT confirmed.")
        if not by_status.get(VERIFIED, 0):
            notes.append(f"Lunar-calendar festivals (Diwali, Holi, Eid, Navratri, ...) for {year} are {'only approximate samples' if by_status.get(SAMPLE, 0) else 'not available'}: supply a verified calendar with FESTIVAL_DATA_FILE.")
        return {"year": year, "records": len(recs), "by_status": by_status, "verified_moving_festivals": by_status.get(VERIFIED, 0), "notes": notes, "rejected_records": self._rejected}

    def list(self, *, year: int | None = None, region: str | None = None, industry: str | None = None) -> list[FestivalRecord]:
        if year is not None:
            self.with_years({year})
        out = self._records
        if year is not None:
            out = [f for f in out if f.year == year]
        if region:
            out = [f for f in out if f.region.lower() in {region.lower(), "all india"}]
        if industry:
            out = [f for f in out if industry.lower() in {i.lower() for i in f.relevant_industries}]
        return sorted(out, key=lambda f: f.date)

    def upcoming(self, *, as_of: date | None = None, days: int = 60, region: str | None = None, industry: str | None = None, profile: Profile | None = None) -> list[UpcomingFestival]:
        day = as_of or today()
        self.with_years({day.year, (day + timedelta(days=days)).year})
        found = [f for f in self.list(region=region, industry=industry) if 0 <= (f.date - day).days <= days]
        return sorted((self._score(f, day, profile) for f in found), key=lambda u: (u.days_until, -u.relevance))

    def _score(self, f: FestivalRecord, day: date, profile: Profile | None) -> UpcomingFestival:
        reasons = [f"{f.name} is on {f.date} ({f.verification_status.replace('_', ' ').lower()})."]
        if profile is None:
            return UpcomingFestival(festival=f, days_until=(f.date - day).days, relevance=0.5, reasons=reasons)
        mine = profile_industries(profile)
        wanted = {i.lower() for i in f.relevant_industries}
        overlap = mine & wanted
        industry = 1.0 if overlap else 0.15 if mine else 0.5
        reasons.append(f"Relevant to your {', '.join(sorted(overlap))} focus." if overlap else "Not closely tied to your industry.")
        places = profile_places(profile)
        place = 1.0 if f.region.lower() == "all india" or f.region.lower() in places else 0.4
        if place < 1.0:
            reasons.append(f"Mainly observed in {f.region}, not your location.")
        # Closer festivals matter more, but not those too close to prepare for.
        days_until = (f.date - day).days
        timing = 1.0 if 7 <= days_until <= 30 else 0.8 if days_until < 7 else 0.65
        return UpcomingFestival(festival=f, days_until=days_until, relevance=round(industry * place * timing, 2), reasons=reasons)
