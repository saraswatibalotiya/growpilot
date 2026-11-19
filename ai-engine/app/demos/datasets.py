"""Five reusable demo datasets for judging recommendation quality.

    python -m app.demos.datasets --write      # regenerate app/demos/data/*.json

EVERYTHING HERE IS FICTIONAL SAMPLE DATA. The businesses, creators, handles, captions, engagement numbers, comments and trend
records are invented for testing. None of it was observed on Instagram or anywhere else, and none of it should be read as a
real-world benchmark. Trend sources are invented and use example.com URLs.

Each dataset has deliberately different performance patterns (which topics and formats win, which lose, which metrics are
missing) so the engine's output can be checked against an expectation. The evaluation date is EVAL_DATE; every dataset's posts
end before it and its sample trends are fresh on it.
"""

from __future__ import annotations

import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
EVAL_DATE = date(2026, 11, 17)
IST = timezone(timedelta(hours=5, minutes=30))
LABEL = "FICTIONAL SAMPLE DATA for testing. Not real Instagram data. Not a real-world benchmark."

FORMATS = {"REEL": ("VIDEO", "REELS"), "CAROUSEL": ("CAROUSEL_ALBUM", "FEED"), "SINGLE_IMAGE": ("IMAGE", "FEED")}
FORMAT_REACH = {"REEL": 1.6, "CAROUSEL": 1.0, "SINGLE_IMAGE": 0.75}


def _trend(tid: str, title: str, desc: str, category: str, *, relevance: float, confidence: float, verified: str, region: str = "India", hashtags: list[str] | None = None, source: str = "Sample Trend Desk (fictional)") -> dict[str, Any]:
    return dict(trend_id=tid, title=title, description=f"Fictional sample: {desc}", category=category, region=region, language="en", kind="FACT", source_name=source, source_url=f"https://example.com/sample-trends/{tid}", published_date=verified, verified_date=verified, starts_on=None, expiry_date="2026-12-15", relevance_score=relevance, confidence_score=confidence, hashtags=hashtags or [], source_type="SAMPLE", is_sample=True, first_observed_date=verified, direction="UNKNOWN", evidence=[])


#: A generic trend with a high relevance score that has nothing to do with any of the five. It must never beat profile evidence.
GENERIC_TRENDS = [
    _trend("demo_trend_viral_audio", "A viral comedy audio everyone is using", "a comedy audio clip used across all niches", "ENTERTAINMENT", relevance=0.95, confidence=0.9, verified="2026-11-14", region="Global", source="Sample World Desk (fictional)"),
    _trend("demo_trend_ai_tools", "AI tools for creators", "creators share workflow tips using AI tools", "TECHNOLOGY", relevance=0.9, confidence=0.85, verified="2026-11-12"),
]

# topic -> (captions, performance multiplier, save multiplier, share multiplier, formats, how many posts)
Pattern = dict[str, tuple[list[str], float, float, float, list[str], int]]

DEMOS: dict[str, dict[str, Any]] = {
    "restaurant": dict(
        profile_id="demo_restaurant",
        profile=dict(profile_type="BUSINESS", name="Tadka Terrace (fictional demo)", instagram_username="tadka.terrace.demo", category="restaurant", niche="food", description="A fictional Pune restaurant serving thalis, biryani and festive menus.", target_audience="Families and office groups in Pune who dine out and order in", country="India", region="Maharashtra", city="Pune", primary_language="en", brand_voice="homely, inviting", goals=["LEADS", "SALES"], products=["thali", "biryani", "festive menu"], services=["dine-in", "delivery", "catering"], preferred_topics=["menu"], excluded_topics=[], preferred_formats=["REEL"], posting_frequency_per_week=4),
        followers=7400,
        pattern={
            "regional food": (["Our full Maharashtrian thali, made fresh #thali #punefood", "Sunday thali special #thali #regionalfood", "Kolhapuri thali is back #thali #punefood"], 1.7, 1.4, 1.4, ["REEL", "CAROUSEL"], 7),
            "biryani": (["Dum biryani, sealed and slow cooked #biryani #punefoodie", "Biryani Friday #biryani #dumbiryani", "Chicken biryani behind the lid #biryani"], 1.5, 2.2, 1.3, ["REEL", "CAROUSEL"], 5),
            "festive menu": (["Festive family menu is live #festivemenu #pune", "Book your festive family table #festive"], 1.1, 1.0, 1.1, ["CAROUSEL", "SINGLE_IMAGE"], 3),
            "offers": (["20% off lunch combos this week #offer #punefood", "Weekday deal: lunch plus a sweet #deal"], 0.65, 0.5, 0.5, ["SINGLE_IMAGE"], 5),
            "behind the scenes": (["Behind the kitchen: how our masala is ground #behindthekitchen", "A day at the restaurant, start to finish #bts"], 0.95, 1.0, 0.9, ["REEL"], 4),
            "customer stories": (["Our guests celebrate a family birthday #customerlove"], 0.7, 0.5, 0.6, ["SINGLE_IMAGE"], 3),
        },
        comments=["Do you take bookings for 12 people?", "What is the price of the thali?", "Is biryani available for delivery?", "Where exactly are you located?", "Loved the food, will come back", "Opening hours on Sunday?", "Please share the menu", "Price for the combo?", "बुकिंग कैसे करें?", "थाली का रेट क्या है?", "Do you cater for events?", "Can I order online?", "Great ambience", "Is there parking?", "The service was slow last Sunday.", "Fantastic biryani!", "Do you have a vegetarian menu?", "Delivery to Baner?", "What is the price of the festive menu?", "Table for four on Saturday, how to book?"],
        trends=[_trend("demo_trend_festive_menus", "Restaurants announcing festive menus", "restaurants publish limited festive menus and booking calls", "FOOD", relevance=0.85, confidence=0.75, verified="2026-11-11"), *GENERIC_TRENDS],
    ),
    "fashion_creator": dict(
        profile_id="demo_fashion_creator",
        profile=dict(profile_type="CREATOR", name="Isha Styles (fictional demo)", instagram_username="isha.styles.demo", category="fashion", niche="fashion", description="A fictional Delhi fashion creator who styles ethnic and western outfits on a budget.", target_audience="Women 20-32 who want affordable outfit ideas", country="India", region="Delhi", city="New Delhi", primary_language="en", brand_voice="friendly, practical", goals=["SAVES", "REACH"], products=[], services=[], preferred_topics=["styling"], excluded_topics=[], preferred_formats=["REEL", "CAROUSEL"], posting_frequency_per_week=4),
        followers=26000,
        pattern={
            "styling": (["5 ways to style one kurta #styling #ootd", "Styling a saree three ways #styling #saree", "How to wear a dupatta differently #waystostyle"], 1.8, 1.9, 1.6, ["REEL", "CAROUSEL"], 8),
            "ethnic wear": (["Kurti haul under 1500 #ethnic #kurti", "My favourite sarees for work #saree #ethnic"], 1.3, 1.6, 1.3, ["CAROUSEL", "REEL"], 5),
            "new arrivals": (["Just landed: winter jackets I picked #newarrivals"], 0.9, 0.8, 0.8, ["SINGLE_IMAGE", "CAROUSEL"], 4),
            "product review": (["Honest review of an online fashion order #review #unboxing", "Worth it? Unboxing a haul #unboxing"], 0.75, 0.7, 0.8, ["REEL"], 4),
            "lifestyle": (["Sunday reset vlog #vlog #lifestyle"], 0.7, 0.5, 0.6, ["REEL", "SINGLE_IMAGE"], 4),
            "bridal": (["Wedding guest outfit ideas #wedding #lehenga"], 1.15, 1.7, 1.4, ["CAROUSEL"], 3),
        },
        comments=["Where can I buy this kurta?", "Please make a styling video for short heights", "Love this colour", "Price of that jacket?", "Can you show how to wear a dupatta?", "Which brand is this?", "Do you have a link to the saree?", "Please make a video on wedding guest outfits", "Very helpful tips!", "What size are you wearing?", "Budget version please", "कहाँ से खरीद सकते हैं?", "Love your styling ideas, post more", "Can you style this with sneakers?", "The colour looked different when I ordered it.", "Is this available in plus size?", "Winter outfit ideas please", "Amazing! Saved this", "Tutorial for draping a saree?", "Gorgeous 😍"],
        trends=[_trend("demo_trend_wedding_season", "Wedding-season outfit planning", "searches for wedding-guest outfits rise through the wedding season", "FASHION", relevance=0.85, confidence=0.75, verified="2026-11-12", hashtags=["#weddingguest"]), *GENERIC_TRENDS],
    ),
    "travel_creator": dict(
        profile_id="demo_travel_creator",
        profile=dict(profile_type="CREATOR", name="Rohan Roams (fictional demo)", instagram_username="rohan.roams.demo", category="travel", niche="travel", description="A fictional Bengaluru travel creator who shares budget itineraries and offbeat places.", target_audience="Young professionals planning budget trips from South India", country="India", region="Karnataka", city="Bengaluru", primary_language="en", brand_voice="curious, honest", goals=["SAVES", "SHARES"], products=[], services=[], preferred_topics=["itineraries"], excluded_topics=[], preferred_formats=["CAROUSEL", "REEL"], posting_frequency_per_week=3),
        followers=18500,
        pattern={
            "itineraries": (["3 day Coorg itinerary with costs #itinerary #coorg", "Kerala backwaters in 4 days #itinerary", "2 day Gokarna route #itinerary #gokarna"], 1.9, 2.4, 1.8, ["CAROUSEL", "REEL"], 5),
            "budget travel": (["Goa in 8000 rupees: full breakdown #budgettravel", "Weekend getaway under 5000 #budgettravel #costbreakdown"], 1.7, 2.1, 1.6, ["CAROUSEL", "REEL"], 4),
            "offbeat places": (["Hidden waterfalls near Bengaluru #offbeat #hidden", "An unknown village in Chikmagalur #offbeat"], 1.1, 1.3, 1.7, ["REEL"], 4),
            "travel tips": (["Packing mistakes to avoid #traveltips #packing", "How I plan trip logistics #traveltips"], 0.8, 1.2, 1.0, ["CAROUSEL"], 5),
            "solo travel": (["What solo travel taught me #solotravel", "My first solo trip #solo"], 0.75, 0.8, 0.9, ["REEL", "SINGLE_IMAGE"], 4),
            "lifestyle": (["A slow Sunday vlog #vlog #lifestyle"], 0.6, 0.4, 0.5, ["SINGLE_IMAGE"], 5),
        },
        comments=["What was the total budget?", "Please share the itinerary", "Which month is best to go?", "Where did you stay?", "Is it safe for solo women?", "How did you reach there?", "Cost of the homestay?", "कितना खर्चा आया?", "How many days are enough?", "Do you have a PDF of this itinerary?", "Train or flight?", "Hotel name please", "Please make a packing list video", "This plan saved me, thank you!", "Share the route map", "It was crowded and overpriced when we went.", "Winter trip ideas please", "Amazing views", "Cost breakdown for 2 people?", "Please make a video on Hampi"],
        trends=[_trend("demo_trend_winter_trips", "Winter getaway planning", "interest in winter destinations rises from October", "TRAVEL", relevance=0.85, confidence=0.75, verified="2026-11-10"), *GENERIC_TRENDS],
    ),
    "beauty_creator": dict(
        profile_id="demo_beauty_creator",
        profile=dict(profile_type="CREATOR", name="Kavya Glow (fictional demo)", instagram_username="kavya.glow.demo", category="beauty", niche="beauty", description="A fictional Hyderabad beauty creator focused on skincare for Indian skin and honest reviews.", target_audience="Women 18-30 building a simple skincare routine", country="India", region="Telangana", city="Hyderabad", primary_language="en", brand_voice="honest, warm", goals=["SHARES", "COMMUNITY_BUILDING"], products=[], services=[], preferred_topics=["skincare"], excluded_topics=[], preferred_formats=["REEL"], posting_frequency_per_week=4),
        followers=21000,
        pattern={
            "skincare": (["A simple AM routine for oily skin #skincare #routine", "Sunscreen mistakes you are making #sunscreen #skincare", "Night routine for dry skin #skincare"], 1.5, 1.7, 1.3, ["REEL", "CAROUSEL"], 7),
            "myths": (["5 myths to stop believing about your face #myths", "Stop doing this to your face #stopdoing #myths"], 1.9, 1.5, 2.6, ["CAROUSEL", "REEL"], 4),
            "makeup": (["Everyday makeup in 5 minutes #makeup #grwm", "Festive glam look #makeup #glam"], 0.85, 0.8, 0.8, ["REEL"], 5),
            "product review": (["Honest review of a budget serum #review #serum", "Worth it? A drugstore foundation #review"], 0.8, 1.9, 0.9, ["REEL", "CAROUSEL"], 4),
            "lifestyle": (["What I eat in a day #whatieat #lifestyle", "Sunday reset #sundayreset"], 0.6, 0.5, 0.6, ["SINGLE_IMAGE", "REEL"], 5),
            "giveaway": (["Giveaway! Win a skincare hamper #giveaway"], 0.8, 0.3, 0.8, ["SINGLE_IMAGE"], 2),
        },
        comments=["Which sunscreen is this?", "Please make a video for dry skin", "This routine changed my skin, thank you!", "Where can I buy that serum?", "Is this safe for sensitive skin?", "Can you review a budget foundation?", "I broke out after using this.", "Price of that lipstick?", "Tutorial for beginners please", "क्या ये ऑयली स्किन के लिए है?", "Shade name please", "Link to the product?", "Please make a video on acne marks", "Very helpful!", "This did not work for me.", "Do you have a discount code?", "Can you do a drugstore vs luxury comparison?", "Winter skincare routine please", "Amazing tips", "What is the price?"],
        trends=[_trend("demo_trend_budget_skincare", "Budget skincare routines", "creators and shoppers favour affordable skincare routines", "BEAUTY", relevance=0.85, confidence=0.75, verified="2026-11-13"), *GENERIC_TRENDS],
    ),
    "new_business": dict(
        profile_id="demo_new_business",
        profile=dict(profile_type="BUSINESS", name="Neem & Co (fictional demo)", instagram_username="neemandco.demo", category="handmade soaps", niche="beauty", description="A fictional brand-new Jaipur business selling handmade soaps. The account was created weeks ago.", target_audience="Shoppers looking for natural, handmade skincare", country="India", region="Rajasthan", city="Jaipur", primary_language="en", brand_voice="simple, natural", goals=["BRAND_AWARENESS", "SALES"], products=["neem soap", "rose soap"], services=[], preferred_topics=[], excluded_topics=[], preferred_formats=[], posting_frequency_per_week=2),
        followers=240,
        pattern={"lifestyle": (["Our first batch of handmade soap #handmade #soap", "Meet the neem soap #neem"], 1.0, 1.0, 1.0, ["SINGLE_IMAGE", "REEL"], 3)},
        comments=["Where can I buy?", "Price?"],
        trends=[_trend("demo_trend_budget_skincare", "Budget skincare routines", "creators and shoppers favour affordable skincare routines", "BEAUTY", relevance=0.85, confidence=0.75, verified="2026-11-13"), *GENERIC_TRENDS],
    ),
}


def _posts(key: str) -> list[dict[str, Any]]:
    spec = DEMOS[key]
    rng = random.Random(f"demo-posts-{key}")
    plan = [t for t, (*_, n) in spec["pattern"].items() for _ in range(n)]
    rng.shuffle(plan)
    total = len(plan)
    spacing = 2.2 if total > 6 else 5
    followers = spec["followers"]
    out = []
    for i, topic in enumerate(plan):
        captions, perf, save_m, share_m, fmts, _ = spec["pattern"][topic]
        fmt = rng.choice(fmts)
        day = EVAL_DATE - timedelta(days=int((total - i) * spacing) + 2)
        posted = datetime(day.year, day.month, day.day, rng.choice([9, 12, 18, 19, 20, 21]), rng.choice([0, 30]), tzinfo=IST)
        media_type, product_type = FORMATS[fmt]
        followers = int(followers * (1 + rng.uniform(0.001, 0.004)))
        reach = int(followers * FORMAT_REACH[fmt] * perf * rng.uniform(0.75, 1.25))
        likes = int(reach * rng.uniform(0.035, 0.06) * perf**0.8)
        comments = int(likes * rng.uniform(0.04, 0.1))
        post: dict[str, Any] = dict(media_id=f"{key[:4]}_{i:03d}", caption=rng.choice(captions), media_type=media_type, media_product_type=product_type, posted_at=posted.isoformat(), permalink=f"https://example.com/sample/{key}/{i:03d}", reach=reach, likes=likes, comments=comments, saves=int(reach * rng.uniform(0.008, 0.02) * save_m), shares=int(reach * rng.uniform(0.004, 0.012) * share_m), follower_count=followers)
        if fmt == "REEL":
            post["views"] = int(reach * rng.uniform(1.1, 1.6))
            post["avg_watch_time_seconds"] = round(rng.uniform(3.2, 9.5), 1)
        if key != "new_business":  # real accounts lose some metrics: a missing value is None, never zero
            if rng.random() < 0.15:
                post["shares"] = None
            if rng.random() < 0.1:
                post["saves"] = None
        out.append(post)
    return sorted(out, key=lambda p: p["posted_at"])


def build(key: str) -> dict[str, Any]:
    spec = DEMOS[key]
    rng = random.Random(f"demo-comments-{key}")
    comments = [dict(comment_id=f"{key[:4]}_c{i:03d}", text=t, posted_at=datetime(2026, 11, rng.randint(1, 15), rng.randint(8, 22), 0, tzinfo=IST).isoformat(), like_count=rng.choice([None, 0, 1, 3])) for i, t in enumerate(spec["comments"])]
    return dict(label=LABEL, demo=key, eval_date=EVAL_DATE.isoformat(), profile_id=spec["profile_id"], profile=spec["profile"], posts=_posts(key), comments=comments, trends=spec["trends"])


def write_all() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for key in DEMOS:
        (DATA_DIR / f"{key}.json").write_text(json.dumps(build(key), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if "--write" in sys.argv:
        write_all()
        print(f"wrote {len(DEMOS)} demo datasets to {DATA_DIR}")
    else:
        print(__doc__)
