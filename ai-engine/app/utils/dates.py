from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TIME_BANDS = [(5, 11, "morning (5-11)"), (11, 16, "afternoon (11-16)"), (16, 20, "evening (16-20)"), (20, 24, "night (20-24)"), (0, 5, "late night (0-5)")]


def tz_or_default(name: str | None, default: str) -> ZoneInfo:
    for candidate in (name, default, "UTC"):
        if not candidate:
            continue
        try:
            return ZoneInfo(candidate)
        except ZoneInfoNotFoundError:
            continue
    return ZoneInfo("UTC")


def as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def time_band(hour: int) -> str:
    for start, end, label in TIME_BANDS:
        if start <= hour < end:
            return label
    return "night (20-24)"


def today() -> date:
    return datetime.now(UTC).date()
