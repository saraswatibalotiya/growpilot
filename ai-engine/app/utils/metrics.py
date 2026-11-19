"""Metric helpers. The one rule: `None` means "not available" and is never treated as zero."""

from collections import Counter
from statistics import mean, median

from app.schemas.analytics import PostIn


def present(value: object) -> bool:
    return value is not None


def clean(values: list[float | None]) -> list[float]:
    """Drops unavailable values. A real zero is kept."""
    return [float(v) for v in values if v is not None]


def safe_median(values: list[float | None]) -> float | None:
    data = clean(values)
    return round(median(data), 4) if data else None


def safe_mean(values: list[float | None]) -> float | None:
    data = clean(values)
    return round(mean(data), 4) if data else None


def sample_confidence(n: int, minimum: int) -> float:
    """0 below the minimum sample; 0.35 at it, rising towards 0.95 as the sample grows to three times the minimum."""
    if n < minimum:
        return 0.0
    return round(0.35 + 0.6 * min(1.0, (n - minimum) / (2 * minimum)), 3)


def core_interactions(post: PostIn) -> tuple[int | None, str | None]:
    """Likes + comments: the two interaction counts that are comparable between posts. Falls back to Instagram's own
    `interactions` total when they are missing, and says so."""
    if post.likes is not None and post.comments is not None:
        return post.likes + post.comments, "likes+comments"
    if post.interactions is not None:
        return post.interactions, "interactions_total"
    return None, None


_DENOMINATORS = ("reach", "views", "followers")


def denominator(post: PostIn, basis: str) -> int | None:
    value = {"reach": post.reach, "views": post.views, "followers": post.follower_count}[basis]
    return value if value and value > 0 else None


def choose_denominator(posts: list[PostIn]) -> str | None:
    """One denominator for the whole account, so every rate means the same thing. Reach is preferred, then views, then
    followers: the first one available for at least 60% of posts, otherwise whichever covers the most posts."""
    if not posts:
        return None
    coverage = {b: sum(1 for p in posts if denominator(p, b) is not None) / len(posts) for b in _DENOMINATORS}
    for basis in _DENOMINATORS:
        if coverage[basis] >= 0.6:
            return basis
    best = max(_DENOMINATORS, key=lambda b: coverage[b])
    return best if coverage[best] > 0 else None


def engagement_rate(post: PostIn, basis: str | None) -> float | None:
    if basis is None:
        return None
    total, _ = core_interactions(post)
    d = denominator(post, basis)
    if total is None or d is None:
        return None
    return round(total / d, 5)


def rate_of(numerator: int | None, post: PostIn, basis: str | None) -> float | None:
    """A save or share rate on the account's basis. Unavailable numerator or denominator gives None."""
    if numerator is None or basis is None:
        return None
    d = denominator(post, basis)
    return round(numerator / d, 5) if d else None


def available_metrics(post: PostIn) -> list[str]:
    names = ("views", "reach", "likes", "comments", "shares", "saves", "interactions", "avg_watch_time_seconds", "follower_count")
    return [n for n in names if getattr(post, n) is not None]


def top_counts(items: list[str], limit: int) -> list[tuple[str, int]]:
    return Counter(items).most_common(limit)
