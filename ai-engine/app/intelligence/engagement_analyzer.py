from datetime import datetime
from statistics import mean

from app.utils.dates import as_aware
from app.utils.metrics import clean


def halves_trend(index_series: list[float | None]) -> dict[str, float] | None:
    """Mean index of the older half against the recent half, using only posts that have an index."""
    values = clean(index_series)
    if len(values) < 6:
        return None
    mid = len(values) // 2
    first, second = mean(values[:mid]), mean(values[mid:])
    if first <= 0:
        return None
    return {"first": round(first, 3), "second": round(second, 3), "change": (second - first) / first}


def consistency_stats(dates: list[datetime]) -> dict[str, float] | None:
    if len(dates) < 3:
        return None
    ordered = sorted(as_aware(d) for d in dates)
    span_days = max((ordered[-1] - ordered[0]).days, 1)
    gaps = [(b - a).days for a, b in zip(ordered, ordered[1:], strict=False)]
    weeks = span_days / 7
    return {"posts_per_week": round(len(dates) / weeks, 2), "longest_gap_days": max(gaps), "span_weeks": round(weeks, 1)}
