"""Small builders so tests say only what matters."""

from datetime import UTC, datetime, timedelta

from app.schemas.analytics import PostIn

BASE = datetime(2026, 9, 1, 14, 0, tzinfo=UTC)


def post(i: int = 0, **overrides) -> PostIn:
    data = dict(media_id=f"m{i}", caption=f"Caption {i}", media_type="IMAGE", media_product_type="FEED", posted_at=BASE + timedelta(days=i * 2), reach=1000, likes=60, comments=10)
    data.update(overrides)
    return PostIn(**data)


def reel(i: int = 0, **overrides) -> PostIn:
    return post(i, media_type="VIDEO", media_product_type="REELS", **overrides)
