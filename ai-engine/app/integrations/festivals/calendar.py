"""Festival and occasion dates, with an honest verification status on every record.

* RULE_FIXED_DATE: the date is fixed by definition (Republic Day is 26 January every year). Computed, correct for any year.
* VERIFIED_SOURCE: the date comes from an official calendar the operator supplied (FESTIVAL_DATA_FILE) and names that source.
* SAMPLE_UNVERIFIED: the bundled approximate dates. Never described as confirmed.

Festivals that follow a lunar calendar (Diwali, Holi, Eid, Navratri, ...) have no fixed date, and this engine does NOT compute
them. They appear only from a supplied verified file or from the bundled sample. For a year with neither, they are absent and
the coverage report (GET /festivals/coverage) says so, instead of guessing.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from app.schemas.trend import FestivalRecord

RULE_FIXED = "RULE_FIXED_DATE"
VERIFIED = "VERIFIED_SOURCE"
SAMPLE = "SAMPLE_UNVERIFIED"
CONFIRMED_STATUSES = {RULE_FIXED, VERIFIED}  # the only statuses that may be called confirmed
RANK = {VERIFIED: 3, RULE_FIXED: 2, SAMPLE: 1}

#: name, month, day, category, region, industries, themes, description
_FIXED = [
    ("Republic Day", 1, 26, "National holiday", "All India", ["retail", "restaurant", "travel"], ["patriotic themes", "long weekend trips"], "National holiday."),
    ("Women's Day", 3, 8, "Occasion", "All India", ["fashion", "beauty", "jewellery", "retail"], ["gifting", "celebrating women"], "International Women's Day."),
    ("Labour Day", 5, 1, "Occasion", "All India", ["retail", "restaurant", "travel"], ["long weekend trips"], "International Workers' Day."),
    ("Teachers' Day", 9, 5, "Occasion", "All India", ["retail", "ecommerce"], ["gifting", "thank you"], "Observed in India on 5 September."),
    ("Independence Day", 8, 15, "National holiday", "All India", ["retail", "restaurant", "fashion", "travel"], ["patriotic themes", "community", "sale"], "National holiday."),
    ("Gandhi Jayanti", 10, 2, "National holiday", "All India", ["retail", "travel"], ["long weekend trips"], "National holiday."),
    ("Children's Day", 11, 14, "Occasion", "All India", ["retail", "ecommerce", "restaurant"], ["kids", "family"], "Observed in India on 14 November."),
    ("Christmas", 12, 25, "Major festival", "All India", ["food", "restaurant", "retail", "travel"], ["gifting", "party outfits", "year-end trips"], "Celebrated widely with gifting and parties."),
    ("Valentine's Day", 2, 14, "Shopping season", "All India", ["restaurant", "jewellery", "ecommerce", "beauty", "fashion"], ["gifting", "couple dining", "date-night outfits"], "Gifting and date-night occasion."),
]


def fixed_date_festivals(year: int) -> list[FestivalRecord]:
    return [
        FestivalRecord(festival_id=f"rule_{name.lower().replace(' ', '_').replace(chr(39), '')}_{year}", name=name, date=date(year, m, d), year=year, region=region, category=cat, description=desc, relevant_industries=inds, relevant_content_themes=themes,
                       source="Fixed calendar date by definition (computed, not looked up)", verification_status=RULE_FIXED, date_note=None)
        for name, m, d, cat, region, inds, themes, desc in _FIXED
    ]


def check_verified_record(f: FestivalRecord) -> str | None:
    if f.verification_status != VERIFIED:
        return f"verification_status must be {VERIFIED} in a verified file"
    if not f.source.strip() or "sample" in f.source.lower() or "approximate" in f.source.lower():
        return "a verified record must name a real source (not a sample or an approximation)"
    if f.date.year != f.year:
        return "year does not match the date"
    return None


def load_verified_file(path: str | Path) -> tuple[list[FestivalRecord], list[dict]]:
    """(accepted records, rejected records with reasons). A bad record is reported, never silently kept."""
    p = Path(path)
    if not p.exists():
        return [], [{"record": p.name, "reason": "the festival data file does not exist"}]
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return [], [{"record": p.name, "reason": "the file is not valid JSON"}]
    if not isinstance(raw, list):
        return [], [{"record": p.name, "reason": "the file must contain a JSON list of records"}]
    ok, bad = [], []
    for i, item in enumerate(raw):
        label = str(item.get("festival_id", f"#{i}")) if isinstance(item, dict) else f"#{i}"
        try:
            f = FestivalRecord.model_validate(item)
        except ValidationError as exc:
            bad.append({"record": label, "reason": "invalid record (" + ", ".join(sorted({'.'.join(map(str, e['loc'])) for e in exc.errors()})) + ")"})
            continue
        problem = check_verified_record(f)
        (bad.append({"record": label, "reason": problem}) if problem else ok.append(f))
    return ok, bad
