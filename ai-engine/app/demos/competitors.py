"""FICTIONAL competitor sample data for the competitor-intelligence demos and tests.

Everything here is invented: the handles, captions and the like/comment counts. Nothing was observed on Instagram. The numbers
are shaped so that three Pune restaurants repeatedly post behind-the-scenes kitchen content while the demo restaurant barely does,
and a fourth competitor has gone quiet.
"""

from __future__ import annotations

import random
from datetime import UTC, date, datetime, timedelta, timezone
from uuid import uuid4

from app.api.dependencies import Container
from app.demos.datasets import EVAL_DATE
from app.schemas.competitor import ApprovalStatus, Competitor, CompetitorDataSource, CompetitorPost, CompetitorSource

IST = timezone(timedelta(hours=5, minutes=30))
LABEL = "FICTIONAL SAMPLE competitor data for testing. Not real accounts, not real posts."

# topic -> caption templates. The lexicon in app/intelligence/topic_extractor.py decides what topic a caption belongs to.
CAPTIONS = {
    "bts": ["Behind the kitchen: how our masala is ground fresh every morning #behindthekitchen #punefood", "A day at our kitchen, from the first chop to the last plate #bts #behindthescenes", "Behind the scenes: how our biryani handi is sealed #behindthescenes #biryani"],
    "festive": ["Festive family menu is live #festivemenu #pune", "Book your festive family table #festive #punefoodie"],
    "regional": ["Our Maharashtrian thali, made fresh #thali #regionalfood", "Misal pav at its best #misal #punefood"],
    "offers": ["Lunch combo deal this week #deal #offer", "20% off for office groups #offer"],
}

SPEC = [
    # username, niche, plan (topic -> posts), format weights (REEL, CAROUSEL, IMAGE), likes scale
    ("pune.plates.demo", "restaurant", {"bts": 5, "regional": 4, "festive": 2, "offers": 2}, (0.7, 0.2, 0.1), 900),
    ("spice.route.pune.demo", "restaurant", {"bts": 4, "festive": 4, "regional": 3, "offers": 2}, (0.6, 0.3, 0.1), 400),
    ("thali.house.demo", "restaurant", {"bts": 4, "regional": 5, "offers": 3, "festive": 1}, (0.5, 0.3, 0.2), 1500),
]
INACTIVE = ("old.kitchen.demo", "restaurant", {"bts": 6, "regional": 4}, (0.6, 0.3, 0.1), 300)  # last post long before the evaluation date


def make_posts(username: str, plan: dict[str, int], weights: tuple, scale: int, *, last_post: date) -> list[CompetitorPost]:
    rng = random.Random(f"competitor-{username}")
    topics = [t for t, n in plan.items() for _ in range(n)]
    rng.shuffle(topics)
    posts = []
    for i, topic in enumerate(topics):
        day = last_post - timedelta(days=int((len(topics) - 1 - i) * 3.5))
        fmt = rng.choices(["VIDEO", "CAROUSEL_ALBUM", "IMAGE"], weights=weights)[0]
        posts.append(CompetitorPost(media_id=f"{username}_{i}", caption=rng.choice(CAPTIONS[topic]), media_type=fmt, posted_at=datetime(day.year, day.month, day.day, rng.choice([12, 19, 20]), 0, tzinfo=IST), likes=int(scale * rng.uniform(0.5, 1.5)) if rng.random() > 0.1 else None, comments=int(scale * rng.uniform(0.02, 0.08))))
    return posts


def add_competitor(container: Container, profile_id: str, username: str, posts: list[CompetitorPost], *, approved: bool = True, source: CompetitorSource = CompetitorSource.MANUAL) -> Competitor:
    return container.store.add(Competitor(competitor_id=f"comp_{uuid4().hex[:12]}", profile_id=profile_id, username=username, niche="restaurant", description=f"{LABEL}", source=source, approval_status=ApprovalStatus.APPROVED if approved else ApprovalStatus.PENDING, suggestion_reason=None if approved else "Fictional sample suggestion", suggestion_confidence=None if approved else 0.6, verified=approved, public_posts=posts, data_source=CompetitorDataSource.SAMPLE_PROVIDER, posts_updated_at=datetime.now(UTC), created_at=datetime.now(UTC)))


def add_demo_competitors(container: Container, profile_id: str, *, as_of: date = EVAL_DATE, include_inactive: bool = False, include_pending: bool = False) -> list[Competitor]:
    out = [add_competitor(container, profile_id, u, make_posts(u, plan, w, scale, last_post=as_of - timedelta(days=3 + i * 2))) for i, (u, _, plan, w, scale) in enumerate(SPEC)]
    if include_inactive:
        u, _, plan, w, scale = INACTIVE
        out.append(add_competitor(container, profile_id, u, make_posts(u, plan, w, scale, last_post=as_of - timedelta(days=120))))
    if include_pending:
        out.append(add_competitor(container, profile_id, "pending.suggestion.demo", make_posts("pending.suggestion.demo", {"bts": 6, "regional": 3}, (0.6, 0.3, 0.1), 500, last_post=as_of - timedelta(days=2)), approved=False, source=CompetitorSource.AI_SUGGESTED))
    return out


def thin_out_kitchen_posts(container: Container, profile_id: str) -> int:
    """Leaves the restaurant demo with one behind-the-scenes post, so there is a real gap for the competitors to reveal. Returns how many were removed."""
    posts = container.store.get_posts(profile_id)
    kitchen = [p for p in posts if any(w in (p.caption or "").lower() for w in ("behind", "bts"))]
    container.store.set_posts(profile_id, [p for p in posts if p not in kitchen[1:]], True)
    return max(len(kitchen) - 1, 0)
