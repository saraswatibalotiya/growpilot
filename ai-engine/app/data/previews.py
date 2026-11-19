from datetime import UTC, datetime, timedelta
from typing import Literal

from app.repositories.base import Store
from app.schemas.analytics import PostIn
from app.schemas.audience import CommentIn
from app.schemas.profile import ProfileCreate

PreviewIndustry = Literal["fashion", "grooming", "beauty", "cafe"]

SCENARIOS = {
    "fashion": ("Fashion boutique", "fashion", ["styling", "festive wear", "new arrivals"], ["cotton shirts", "linen outfits"], ["What sizes are available?", "Please share styling tips", "What is the price?"], 48),
    "grooming": ("Grooming studio", "grooming", ["beard grooming", "haircut maintenance", "grooming tips"], ["beard trim", "haircuts"], ["How can I book an appointment?", "What is the price?", "Please show a beard tutorial"], 24),
    "beauty": ("Beauty salon", "beauty", ["skincare", "makeup tutorial", "product review"], ["makeup sessions", "shade matching"], ["Is this suitable for sensitive skin?", "Which shade is this?", "Tutorial for beginners please"], 36),
    "cafe": ("Cafe and bakery", "food", ["coffee", "recipes", "behind the scenes"], ["specialty coffee", "fresh pastries"], ["What are your opening hours?", "Do you have oat milk?", "Where is your cafe?"], 18),
}


def seed_preview(store: Store, profile_id: str, industry: PreviewIndustry) -> None:
    name, niche, topics, products, questions, count = SCENARIOS[industry]
    if store.get(profile_id) is None:
        store.create(ProfileCreate(
            profile_type="BUSINESS", name=f"{name} (fictional sample)", category=niche, niche=niche,
            description=f"Fictional {name.lower()} for a saved mock preview, not a real Instagram account.",
            target_audience=f"Local customers interested in {niche}", country="India", city="Mumbai",
            goals=["ENGAGEMENT", "PRODUCT_DISCOVERY"], products=products, preferred_topics=topics,
            preferred_formats=["REEL", "CAROUSEL"], posting_frequency_per_week=3,
        ), profile_id=profile_id)
    now = datetime.now(UTC)
    posts = []
    for index in range(count):
        recent = index < count // 2
        multiplier = (0.75 if recent else 1.0) if industry == "grooming" else (1.3 if recent else 1.0)
        posts.append(PostIn(
            media_id=f"sample-{industry}-{index}", caption=f"{topics[index % 3]}: {products[index % 2]} #local{industry}",
            media_type="CAROUSEL_ALBUM" if index % 3 == 1 else "VIDEO",
            media_product_type="FEED" if index % 3 == 1 else "REELS",
            posted_at=now - timedelta(days=1 + index * 2), reach=1000 + index * 25,
            likes=int((70 + index % 5 * 5) * multiplier), comments=12 + index % 8,
            saves=18 + index % 9, shares=8 + index % 6, follower_count=2400,
        ))
    if not store.get_posts(profile_id):
        store.set_posts(profile_id, posts, replace=True)
    if not store.get_comments(profile_id):
        store.set_comments(profile_id, [
            CommentIn(comment_id=f"sample-{industry}-comment-{index}", text=questions[index % 3], posted_at=now - timedelta(days=1 + index // 3))
            for index in range(60)
        ], None, replace=True)