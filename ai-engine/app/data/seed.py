"""Deterministic, explicitly FICTIONAL mock data for five profiles, plus a loader.

    python -m app.data.seed --write     # regenerate the JSON files in app/data/mock and app/data/festivals

Nothing here describes a real person or business. Handles, shops and sources are invented; URLs use example.com. The numbers
are shaped so the analytics have something to find (some topics and formats really do outperform), and some values are
deliberately missing, because Instagram does not always return every metric.

The reference date for all mock history is REFERENCE_DATE. Calls that evaluate trends or festivals should pass
`as_of=2026-10-05` for the demo data to read as current; on any later day the sample trends correctly show as stale.
"""

from __future__ import annotations

import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.repositories.base import Store
from app.schemas.analytics import PostIn
from app.schemas.audience import CommentIn, Demographics
from app.schemas.profile import ProfileCreate

HERE = Path(__file__).parent
MOCK_DIR = HERE / "mock"
FESTIVAL_DIR = HERE / "festivals"
REFERENCE_DATE = date(2026, 10, 5)
IST = timezone(timedelta(hours=5, minutes=30))

PROFILE_IDS = {
    "boutique": "prof_boutique_mumbai",
    "beauty": "prof_beauty_creator",
    "food": "prof_food_creator",
    "restaurant": "prof_restaurant_bengaluru",
    "travel": "prof_travel_creator",
}

PROFILES: dict[str, dict[str, Any]] = {
    "boutique": dict(profile_type="BUSINESS", name="Rangrez Ethnic Boutique (fictional)", instagram_username="rangrez.ethnic.demo", category="ethnic clothing", niche="fashion", description="A Mumbai boutique selling kurtis, sarees, lehengas and dupattas for festive and wedding wear.", target_audience="Women 22-40 in Mumbai shopping for festive and occasion wear", country="India", region="Maharashtra", city="Mumbai", primary_language="en", brand_voice="warm, elegant, festive", goals=["SALES", "PRODUCT_DISCOVERY"], products=["cotton kurtis", "silk sarees", "bridal lehengas", "dupattas"], services=["custom tailoring"], preferred_topics=["festive wear", "styling"], excluded_topics=["politics"], preferred_formats=["REEL", "CAROUSEL"], posting_frequency_per_week=4),
    "beauty": dict(profile_type="CREATOR", name="Meera Beauty Diaries (fictional)", instagram_username="meera.beauty.demo", category="beauty", niche="beauty", description="An Indian beauty creator sharing budget skincare, makeup tutorials and honest reviews.", target_audience="Indian women 18-30 who want affordable skincare and makeup", country="India", region="Delhi NCR", city="Delhi", primary_language="en", brand_voice="honest, friendly, practical", goals=["ENGAGEMENT", "REACH"], products=[], services=[], preferred_topics=["skincare", "makeup tutorial"], excluded_topics=["skin lightening"], preferred_formats=["REEL", "CAROUSEL"], posting_frequency_per_week=5),
    "food": dict(profile_type="CREATOR", name="Swad Safar Food Stories (fictional)", instagram_username="swad.safar.demo", category="food", niche="food", description="A Pune food creator covering street food, home recipes and regional dishes.", target_audience="Indian food lovers 20-40", country="India", region="Maharashtra", city="Pune", primary_language="en", brand_voice="enthusiastic, down-to-earth", goals=["REACH", "SHARES", "COMMUNITY_BUILDING"], products=[], services=[], preferred_topics=["street food", "recipes"], excluded_topics=[], preferred_formats=["REEL"], posting_frequency_per_week=5),
    "restaurant": dict(profile_type="BUSINESS", name="Masala Mile Kitchen (fictional)", instagram_username="masala.mile.demo", category="restaurant", niche="food", description="A Bengaluru restaurant serving regional Indian thalis, biryani and festive menus.", target_audience="Families and office groups in Bengaluru who dine out and order in", country="India", region="Karnataka", city="Bengaluru", primary_language="en", brand_voice="inviting, homely", goals=["LEADS", "SALES", "BRAND_AWARENESS"], products=["thali", "biryani", "festive menu"], services=["dine-in", "catering", "delivery"], preferred_topics=["menu", "festive menu"], excluded_topics=[], preferred_formats=["REEL", "SINGLE_IMAGE"], posting_frequency_per_week=4),
    "travel": dict(profile_type="CREATOR", name="Wanderlust With Anaya (fictional)", instagram_username="anaya.wanders.demo", category="travel", niche="travel", description="A Mumbai-based travel creator sharing budget itineraries and offbeat Indian destinations.", target_audience="Indian travellers 20-35 planning short trips", country="India", region="Maharashtra", city="Mumbai", primary_language="en", brand_voice="adventurous, practical", goals=["SAVES", "REACH", "COMMUNITY_BUILDING"], products=[], services=[], preferred_topics=["budget travel", "itineraries"], excluded_topics=[], preferred_formats=["REEL", "CAROUSEL"], posting_frequency_per_week=4),
}

# topic -> (caption phrases, performance multiplier, save multiplier, share multiplier, preferred formats)
TOPICS: dict[str, dict[str, tuple[list[str], float, float, float, list[str]]]] = {
    "boutique": {
        "festive wear": (["Festive kurti set for the season #festivewear #ethnicwear", "Our new festive collection is here #festive #kurti"], 1.8, 1.2, 1.4, ["REEL", "CAROUSEL"]),
        "styling": (["3 ways to style one dupatta #styling #ethnicwear", "Styling a silk saree for the evening #saree #styling"], 1.5, 1.8, 1.3, ["REEL", "CAROUSEL"]),
        "new arrivals": (["New cotton kurtis just landed #newarrivals #kurti", "Fresh arrivals this week #newarrivals"], 1.0, 0.8, 0.8, ["SINGLE_IMAGE", "CAROUSEL"]),
        "bridal": (["Bridal lehenga details we love #bridal #lehenga", "A wedding season lehenga walkthrough #bridal"], 1.3, 1.5, 1.1, ["REEL", "CAROUSEL"]),
        "behind the scenes": (["How our tailors finish a blouse #behindthescenes", "A day at the workshop #bts"], 0.8, 0.6, 0.7, ["REEL", "STORY"]),
    },
    "beauty": {
        "skincare": (["My budget skincare routine for oily skin #skincare #budgetbeauty", "5 ingredients worth your money #skincare"], 1.7, 2.0, 1.5, ["REEL", "CAROUSEL"]),
        "makeup tutorial": (["Soft glam in 10 minutes #makeuptutorial #grwm", "Everyday makeup under 500 rupees #makeup"], 1.5, 1.6, 1.3, ["REEL"]),
        "product review": (["Honest review after one month #review #beauty", "Is this serum worth it? #review"], 1.1, 1.0, 1.0, ["REEL", "CAROUSEL"]),
        "myths": (["Skincare myths I believed for years #skincare #myths", "Stop doing this to your face #skincaretips"], 1.4, 1.9, 1.8, ["CAROUSEL", "REEL"]),
        "lifestyle": (["Sunday reset vlog #lifestyle", "What I eat in a day #dayinmylife"], 0.7, 0.5, 0.7, ["REEL", "STORY"]),
    },
    "food": {
        "street food": (["Pune street food trail you must try #streetfood #punefood", "Best vada pav under 30 rupees #streetfood"], 1.8, 1.4, 1.9, ["REEL"]),
        "recipes": (["Easy poha in 10 minutes #recipe #homecooking", "Weeknight dal tadka #recipe #dal"], 1.4, 2.0, 1.2, ["REEL", "CAROUSEL"]),
        "regional": (["Misal pav the Kolhapuri way #regionalfood #misalpav", "Konkan fish thali #regionalfood"], 1.3, 1.3, 1.4, ["REEL", "CAROUSEL"]),
        "cafe reviews": (["New cafe in Koregaon Park #cafe #punefood", "Brunch spot worth the queue #cafe"], 1.0, 0.9, 1.0, ["REEL", "SINGLE_IMAGE"]),
        "food hacks": (["Kitchen hacks that save time #foodhacks", "Stop wasting coriander #kitchentips"], 1.2, 1.7, 1.5, ["REEL"]),
    },
    "restaurant": {
        "menu": (["Our weekend thali is back #thali #bengalurufood", "Biryani Friday special #biryani"], 1.3, 0.9, 1.0, ["SINGLE_IMAGE", "REEL"]),
        "festive menu": (["Festive special menu is live #festivemenu #bengaluru", "Book your festive family table #festive"], 1.7, 1.3, 1.5, ["REEL", "CAROUSEL"]),
        "behind the kitchen": (["How we slow cook our biryani #behindthekitchen", "Meet our head chef #chef"], 1.4, 1.0, 1.2, ["REEL", "STORY"]),
        "customer stories": (["A family birthday at Masala Mile #customerlove", "Office lunch group favourites #lunch"], 0.9, 0.7, 0.9, ["SINGLE_IMAGE", "CAROUSEL"]),
        "offers": (["Lunch combo at a special price #lunch #offer", "Weekday thali deal #offer"], 1.0, 0.8, 0.9, ["SINGLE_IMAGE"]),
    },
    "travel": {
        "budget travel": (["Goa in 8000 rupees: full breakdown #budgettravel #goa", "Weekend getaway under 5000 #budgettravel"], 1.8, 2.2, 1.7, ["REEL", "CAROUSEL"]),
        "itineraries": (["3 day Hampi itinerary #itinerary #hampi", "Kerala backwaters in 4 days #itinerary"], 1.6, 2.4, 1.5, ["CAROUSEL", "REEL"]),
        "offbeat places": (["Hidden waterfalls near Mumbai #offbeat #travel", "An unknown village in Spiti #offbeat"], 1.5, 1.4, 1.8, ["REEL"]),
        "travel tips": (["Packing mistakes to avoid #traveltips", "How I find cheap flights #traveltips"], 1.2, 1.8, 1.4, ["CAROUSEL", "REEL"]),
        "personal stories": (["What solo travel taught me #solotravel", "My worst trip and what I learned #travelstory"], 0.9, 0.7, 0.9, ["REEL", "SINGLE_IMAGE"]),
    },
}

BASE_FOLLOWERS = {"boutique": 8200, "beauty": 21500, "food": 34000, "restaurant": 6100, "travel": 17800}
FORMAT_REACH = {"REEL": 1.6, "CAROUSEL": 1.0, "SINGLE_IMAGE": 0.75, "STORY": 0.5}
HOUR_BOOST = {7: 0.9, 9: 0.95, 12: 1.0, 15: 0.95, 18: 1.1, 19: 1.25, 20: 1.3, 21: 1.2, 22: 1.0}
DAY_BOOST = {0: 0.95, 1: 1.0, 2: 1.0, 3: 1.05, 4: 1.1, 5: 1.2, 6: 1.15}  # Monday=0

COMMENTS = {
    "boutique": [
        "Where can I buy this?", "Do you have this in black?", "Please share the price.", "Can you make a styling video?", "Love this colour ❤️",
        "How much for the green one?", "Do you deliver to Pune?", "Beautiful collection!", "The last order arrived late and the stitching was loose.",
        "Can you show how to wear this dupatta?", "Size chart please", "इसका दाम क्या है?", "कहाँ से खरीद सकते हैं?", "हे कुठे मिळेल?", "किंमत काय आहे?",
        "Price?", "Is this available in XL?", "Stunning! Which fabric is this?", "I want this for Diwali, how do I order?", "Please make a video on blouse designs",
        "Quality was not good last time.", "Gorgeous 😍", "Do you take custom orders?", "kitna price hai ye?", "Love your styling ideas, please post more",
        "Shipping charges kitne hain?", "Can I see it in red?", "Wow, so elegant", "The colour looked different in person.", "Where is your store located?",
    ],
    "beauty": [
        "Which sunscreen is this?", "Please make a video for dry skin", "This routine changed my skin, thank you!", "Where can I buy that serum?", "Is this safe for sensitive skin?",
        "Can you review a budget foundation?", "I broke out after using this.", "Love your honest reviews ❤️", "Price of that lipstick?", "Tutorial for beginners please",
        "क्या ये ऑयली स्किन के लिए है?", "Shade name please", "Can you do a drugstore vs luxury comparison?", "Very helpful!", "This did not work for me.",
        "Link to the product?", "What is the price?", "Please make a video on acne marks", "Amazing tips", "Do you have a discount code?",
    ],
    "food": [
        "Where is this stall exactly?", "Please share the recipe", "Tried it today and it was perfect!", "Can you make a vegan version?", "What is the price here?",
        "Which area in Pune?", "Make a video on sabudana khichdi", "This looks so tasty 😍", "How long did it take?", "The queue was too long when I went.",
        "रेसिपी शेअर करा", "हे कुठे मिळतं?", "Can you share the measurements?", "Please do a Kolhapuri food trail", "Too oily for me honestly.",
        "Which cafe is this?", "Love your videos", "Opening hours?", "Tried the vada pav, best ever", "Please make a street food map",
    ],
    "restaurant": [
        "Do you take bookings for 10 people?", "What is the price of the festive thali?", "Is the biryani available for delivery?", "Loved the food, will come back ❤️", "Do you have a vegetarian menu?",
        "Where exactly are you located?", "The service was slow last Sunday.", "Can I order online?", "Please share the menu", "Do you cater for events?",
        "बुकिंग कैसे करें?", "थाली का रेट क्या है?", "Great ambience", "Is parking available?", "Delivery to HSR layout?",
        "The portion was small for the price.", "Fantastic biryani!", "Opening hours on Sunday?", "Can you do a corporate lunch?", "Price for the combo?",
    ],
    "travel": [
        "What was the total budget?", "Please share the itinerary", "Which month is best to go?", "Where did you stay?", "Amazing views 😍",
        "Is it safe for solo women?", "Can you make a packing list video?", "How did you reach there?", "This trip plan saved me, thank you!", "Cost of the homestay?",
        "कितना खर्चा आया?", "कुठे राहिलात?", "Please make a video on Kashmir", "How many days are enough?", "Hotel name please",
        "It was crowded and overpriced when we went.", "Beautiful!", "Train or flight?", "Share the route map", "Do you have a PDF of this itinerary?",
    ],
}

COMPETITOR_POOL = {
    "boutique": [
        ("silk.and.thread.demo", "ethnic clothing boutique", "Fictional Mumbai ethnic wear label posting festive collections.", "Same city and category, posts festive and bridal wear", 0.82),
        ("the.saree.studio.demo", "sarees", "Fictional saree studio with styling content.", "Overlaps on sarees and styling content", 0.74),
        ("desi.drape.demo", "ethnic fashion", "Fictional online ethnic wear brand.", "Similar audience, strong carousel content", 0.66),
    ],
    "beauty": [
        ("glow.with.nisha.demo", "beauty", "Fictional skincare creator.", "Same niche and audience", 0.8),
        ("budget.beauty.bae.demo", "beauty", "Fictional budget makeup creator.", "Overlaps on budget beauty", 0.72),
        ("skin.school.india.demo", "skincare education", "Fictional skincare education page.", "Strong educational carousels", 0.64),
    ],
    "food": [
        ("pune.plate.demo", "food", "Fictional Pune food page.", "Same city and street food focus", 0.81),
        ("ghar.ka.khana.demo", "recipes", "Fictional home-recipes creator.", "Overlaps on home recipes", 0.7),
        ("tadka.trails.demo", "regional food", "Fictional regional food explorer.", "Regional dishes audience overlap", 0.63),
    ],
    "restaurant": [
        ("thali.house.blr.demo", "restaurant", "Fictional Bengaluru thali restaurant.", "Same city and cuisine", 0.8),
        ("biryani.baithak.demo", "restaurant", "Fictional biryani restaurant.", "Overlaps on biryani", 0.71),
        ("south.spice.kitchen.demo", "restaurant", "Fictional regional restaurant.", "Regional menus audience", 0.62),
    ],
    "travel": [
        ("pack.and.go.india.demo", "travel", "Fictional budget travel creator.", "Same niche, budget itineraries", 0.8),
        ("offbeat.bharat.demo", "travel", "Fictional offbeat destinations page.", "Overlaps on offbeat places", 0.72),
        ("weekend.escapes.demo", "travel", "Fictional weekend trips page.", "Short trips audience", 0.65),
    ],
}

TRENDS = [
    dict(trend_id="trend_diwali_outfits", title="Festive outfit planning ahead of Diwali", description="Fictional sample: shoppers search for festive outfit ideas in the weeks before Diwali.", category="FASHION", region="India", language="en", kind="FACT", source_name="Sample Retail Pulse (fictional)", source_url="https://example.com/retail-pulse/diwali-outfits", published_date="2026-09-28", verified_date="2026-10-03", starts_on=None, expiry_date="2026-11-12", relevance_score=0.9, confidence_score=0.8, hashtags=["#diwalioutfit"]),
    dict(trend_id="trend_budget_skincare", title="Budget skincare routines", description="Fictional sample: creators and shoppers favour affordable skincare routines.", category="BEAUTY", region="India", language="en", kind="FACT", source_name="Sample Beauty Watch (fictional)", source_url="https://example.com/beauty-watch/budget-skincare", published_date="2026-09-25", verified_date="2026-10-02", starts_on=None, expiry_date="2026-12-31", relevance_score=0.8, confidence_score=0.75, hashtags=[]),
    dict(trend_id="trend_street_food_trails", title="City street-food trail videos", description="Fictional sample: short trail-style food videos are being widely shared.", category="FOOD", region="India", language="en", kind="FACT", source_name="Sample Food Signals (fictional)", source_url="https://example.com/food-signals/street-food-trails", published_date="2026-09-30", verified_date="2026-10-04", starts_on=None, expiry_date="2026-11-30", relevance_score=0.85, confidence_score=0.8, hashtags=["#streetfoodtrail"]),
    dict(trend_id="trend_festive_menus", title="Restaurants announcing festive menus", description="Fictional sample: restaurants publish limited festive menus and booking calls.", category="FOOD", region="India", language="en", kind="FACT", source_name="Sample Hospitality Brief (fictional)", source_url="https://example.com/hospitality/festive-menus", published_date="2026-09-29", verified_date="2026-10-03", starts_on=None, expiry_date="2026-11-12", relevance_score=0.8, confidence_score=0.7, hashtags=[]),
    dict(trend_id="trend_budget_itineraries", title="Cost-breakdown travel itineraries", description="Fictional sample: itineraries with a full cost breakdown are being saved widely.", category="TRAVEL", region="India", language="en", kind="FACT", source_name="Sample Travel Insights (fictional)", source_url="https://example.com/travel-insights/budget-itineraries", published_date="2026-09-27", verified_date="2026-10-01", starts_on=None, expiry_date="2026-12-31", relevance_score=0.85, confidence_score=0.78, hashtags=["#budgettravel"]),
    dict(trend_id="trend_winter_trips", title="Winter getaway planning", description="Fictional sample: interest in winter destinations rises from October.", category="TRAVEL", region="India", language="en", kind="FACT", source_name="Sample Travel Insights (fictional)", source_url="https://example.com/travel-insights/winter-trips", published_date="2026-09-20", verified_date="2026-10-01", starts_on="2026-10-15", expiry_date="2027-01-31", relevance_score=0.7, confidence_score=0.7, hashtags=[]),
    dict(trend_id="trend_wedding_season", title="Wedding-season shopping", description="Fictional sample: demand for wedding wear and gifting rises through the wedding season.", category="ECOMMERCE", region="India", language="en", kind="FACT", source_name="Sample Retail Pulse (fictional)", source_url="https://example.com/retail-pulse/wedding-season", published_date="2026-09-22", verified_date="2026-10-02", starts_on=None, expiry_date="2026-12-15", relevance_score=0.75, confidence_score=0.72, hashtags=[]),
    dict(trend_id="trend_old_audio", title="A viral audio from last spring", description="Fictional sample: this audio peaked months ago.", category="ENTERTAINMENT", region="India", language="en", kind="FACT", source_name="Sample Social Signals (fictional)", source_url="https://example.com/social-signals/old-audio", published_date="2026-04-02", verified_date="2026-04-10", starts_on=None, expiry_date="2026-05-01", relevance_score=0.6, confidence_score=0.6, hashtags=[]),
    dict(trend_id="trend_stale_makeup", title="A makeup challenge from August", description="Fictional sample: verified weeks ago, not rechecked.", category="BEAUTY", region="India", language="en", kind="FACT", source_name="Sample Beauty Watch (fictional)", source_url="https://example.com/beauty-watch/august-challenge", published_date="2026-08-05", verified_date="2026-08-10", starts_on=None, expiry_date="2026-12-31", relevance_score=0.7, confidence_score=0.6, hashtags=[]),
    dict(trend_id="trend_unsourced_ai_guess", title="Pastel kurti sets might trend", description="An AI-generated guess with no source. A hypothesis, not a trend.", category="FASHION", region="India", language="en", kind="HYPOTHESIS", source_name=None, source_url=None, published_date=None, verified_date=None, starts_on=None, expiry_date=None, relevance_score=0.6, confidence_score=0.3, hashtags=[]),
    dict(trend_id="trend_ai_tools_creators", title="AI tools for creators", description="Fictional sample: creators are sharing workflow tips using AI tools.", category="TECHNOLOGY", region="India", language="en", kind="FACT", source_name="Sample Creator Economy Brief (fictional)", source_url="https://example.com/creator-economy/ai-tools", published_date="2026-09-26", verified_date="2026-10-02", starts_on=None, expiry_date="2026-12-31", relevance_score=0.6, confidence_score=0.7, hashtags=[]),
    dict(trend_id="trend_global_event", title="A global sporting final", description="Fictional sample: a worldwide event, not specific to India.", category="ENTERTAINMENT", region="Global", language="en", kind="FACT", source_name="Sample World Desk (fictional)", source_url="https://example.com/world-desk/final", published_date="2026-09-30", verified_date="2026-10-04", starts_on=None, expiry_date="2026-10-20", relevance_score=0.5, confidence_score=0.7, hashtags=[]),
    dict(trend_id="trend_home_workouts", title="Short home workout routines", description="Fictional sample: 10-minute home workouts are popular with working professionals.", category="FITNESS", region="India", language="en", kind="FACT", source_name="Sample Fitness Pulse (fictional)", source_url="https://example.com/fitness-pulse/home-workouts", published_date="2026-09-24", verified_date="2026-10-01", starts_on=None, expiry_date="2026-12-31", relevance_score=0.6, confidence_score=0.7, hashtags=[]),
]

FESTIVALS = [
    ("fest_independence_day_2026", "Independence Day", "2026-08-15", "National holiday", "All India", "National holiday marked with patriotic and community content.", ["retail", "restaurant", "fashion", "travel"], ["patriotic themes", "community", "sale"], "2026-08-15 is fixed by law"),
    ("fest_onam_2026", "Onam", "2026-08-26", "Regional festival", "Kerala", "Harvest festival of Kerala.", ["food", "restaurant", "fashion"], ["sadya", "traditional wear", "flower decor"], "Approximate: check a Malayalam calendar"),
    ("fest_raksha_bandhan_2026", "Raksha Bandhan", "2026-08-28", "Major festival", "All India", "Festival celebrating siblings, with gifting.", ["fashion", "ecommerce", "jewellery", "food"], ["gifting", "sibling stories", "festive wear"], "Approximate: depends on the lunar calendar"),
    ("fest_ganesh_chaturthi_2026", "Ganesh Chaturthi", "2026-09-14", "Major festival", "Maharashtra", "Ten-day festival, especially in Maharashtra.", ["food", "restaurant", "fashion", "decor"], ["modak recipes", "festive wear", "decor"], "Approximate: depends on the lunar calendar"),
    ("fest_navratri_2026", "Navratri", "2026-10-11", "Major festival", "All India", "Nine nights of festivities; colour and garba themes.", ["fashion", "food", "beauty", "jewellery"], ["garba outfits", "nine colours", "festive makeup"], "Approximate start date: verify a regional calendar"),
    ("fest_durga_puja_2026", "Durga Puja", "2026-10-18", "Regional festival", "West Bengal", "Major festival in Bengal and across India.", ["food", "fashion", "travel"], ["pandal hopping", "traditional wear", "bengali food"], "Approximate: depends on the lunar calendar"),
    ("fest_dussehra_2026", "Dussehra", "2026-10-20", "Major festival", "All India", "Victory of good over evil.", ["retail", "food", "fashion"], ["traditions", "family gatherings"], "Approximate: depends on the lunar calendar"),
    ("fest_karwa_chauth_2026", "Karwa Chauth", "2026-10-29", "Cultural occasion", "North India", "Observed mainly in North India.", ["fashion", "beauty", "jewellery"], ["mehendi", "festive makeup", "traditional wear"], "Approximate: depends on the lunar calendar"),
    ("fest_dhanteras_2026", "Dhanteras", "2026-11-06", "Shopping season", "All India", "Considered auspicious for buying gold, silver and utensils.", ["jewellery", "ecommerce", "retail"], ["gold buying", "gifting"], "Approximate: depends on the lunar calendar"),
    ("fest_diwali_2026", "Diwali", "2026-11-08", "Major festival", "All India", "Festival of lights and the biggest shopping season of the year.", ["fashion", "food", "restaurant", "jewellery", "ecommerce", "beauty"], ["festive wear", "gifting", "home decor", "sweets", "festive menu"], "Approximate: verify against an official calendar"),
    ("fest_christmas_2026", "Christmas", "2026-12-25", "Major festival", "All India", "Celebrated widely with gifting and parties.", ["food", "restaurant", "retail", "travel"], ["gifting", "party outfits", "year-end trips"], "2026-12-25 is fixed"),
    ("fest_makar_sankranti_2027", "Makar Sankranti / Pongal", "2027-01-14", "Regional festival", "All India", "Harvest festival known as Pongal in Tamil Nadu.", ["food", "restaurant", "fashion"], ["traditional food", "kite flying", "harvest"], "Approximate: verify a regional calendar"),
    ("fest_republic_day_2027", "Republic Day", "2027-01-26", "National holiday", "All India", "National holiday.", ["retail", "restaurant", "travel"], ["patriotic themes", "long weekend trips"], "2027-01-26 is fixed by law"),
    ("fest_valentines_day_2027", "Valentine's Day", "2027-02-14", "Shopping season", "All India", "Gifting and date-night occasion.", ["restaurant", "jewellery", "ecommerce", "beauty", "fashion"], ["gifting", "couple dining", "date-night outfits"], "2027-02-14 is fixed"),
]


def _ist(day: date, hour: int, minute: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)


def _post_type(fmt: str) -> tuple[str, str]:
    return {"REEL": ("VIDEO", "REELS"), "CAROUSEL": ("CAROUSEL_ALBUM", "FEED"), "SINGLE_IMAGE": ("IMAGE", "FEED"), "STORY": ("IMAGE", "STORY")}[fmt]


def generate_posts(key: str, count: int = 36) -> list[dict[str, Any]]:
    rng = random.Random(f"posts-{key}")
    topics = TOPICS[key]
    names = list(topics)
    posts: list[dict[str, Any]] = []
    followers = BASE_FOLLOWERS[key]
    for i in range(count):
        days_ago = int((count - i) * 3.4) + rng.randint(0, 2)
        day = REFERENCE_DATE - timedelta(days=days_ago)
        topic = names[(i * 3 + rng.randint(0, 1)) % len(names)]
        phrases, perf, save_m, share_m, fmts = topics[topic]
        fmt = rng.choice(fmts)
        hour = rng.choice(list(HOUR_BOOST))
        posted = _ist(day, hour, rng.choice([0, 15, 30, 45]))
        media_type, product_type = _post_type(fmt)
        followers = int(followers * (1 + rng.uniform(0.0005, 0.004)))
        reach = int(followers * FORMAT_REACH[fmt] * perf * HOUR_BOOST[hour] * DAY_BOOST[posted.weekday()] * rng.uniform(0.7, 1.3))
        # Topics that resonate earn a higher engagement RATE, not just more reach.
        likes = int(reach * rng.uniform(0.035, 0.06) * perf**0.8)
        comments = int(likes * rng.uniform(0.04, 0.1))
        saves = int(reach * rng.uniform(0.008, 0.02) * save_m)
        shares = int(reach * rng.uniform(0.004, 0.012) * share_m)
        post: dict[str, Any] = dict(
            media_id=f"{key[:3]}_{i:03d}", caption=f"{rng.choice(phrases)}", media_type=media_type, media_product_type=product_type,
            posted_at=posted.isoformat(), permalink=f"https://example.com/p/{key}/{i:03d}", reach=reach, likes=likes, comments=comments,
            saves=saves, shares=shares, follower_count=followers,
        )
        if fmt == "REEL":
            post["views"] = int(reach * rng.uniform(1.1, 1.6))
            post["avg_watch_time_seconds"] = round(rng.uniform(3.2, 9.5), 1)
        # Real accounts lose metrics: simulate it. A missing value is None, not zero.
        if rng.random() < 0.18:
            post["shares"] = None
        if rng.random() < 0.12:
            post["saves"] = None
        if rng.random() < 0.08:
            post["reach"] = None
        if i < 3:  # the oldest posts predate the metrics the account can fetch
            for field in ("views", "reach", "saves", "shares"):
                post[field] = None
        posts.append(post)
    return posts


def generate_comments(key: str) -> list[dict[str, Any]]:
    rng = random.Random(f"comments-{key}")
    out = []
    for i, text in enumerate(COMMENTS[key]):
        day = REFERENCE_DATE - timedelta(days=rng.randint(1, 60))
        out.append(dict(comment_id=f"{key[:3]}_c{i:03d}", text=text, posted_at=_ist(day, rng.randint(8, 22), 0).isoformat(), like_count=rng.choice([None, 0, 1, 2, 5]), post_media_id=f"{key[:3]}_{rng.randint(0, 30):03d}"))
    return out


def _competitor_posts(key: str, username: str) -> list[dict[str, Any]]:
    rng = random.Random(f"comp-{username}")
    topics = TOPICS[key]
    names = list(topics)
    out = []
    for i in range(14):
        topic = names[rng.randint(0, len(names) - 1)]
        phrases, _, _, _, fmts = topics[topic]
        fmt = rng.choice(fmts)
        media_type, _ = _post_type(fmt)
        day = REFERENCE_DATE - timedelta(days=int((14 - i) * rng.uniform(3, 5)))
        out.append(dict(media_id=f"{username}_{i}", caption=rng.choice(phrases), media_type=media_type, posted_at=_ist(day, rng.choice([12, 19, 20]), 0).isoformat(), likes=rng.randint(80, 2400) if rng.random() > 0.1 else None, comments=rng.randint(2, 90) if rng.random() > 0.15 else None))
    return out


def generate_competitors() -> dict[str, list[dict[str, Any]]]:
    return {
        PROFILE_IDS[key]: [dict(username=u, niche=n, description=d, reason=r, confidence=c, public_posts=_competitor_posts(key, u)) for (u, n, d, r, c) in pool]
        for key, pool in COMPETITOR_POOL.items()
    }


def generate_demographics(key: str) -> dict[str, Any]:
    city = PROFILES[key]["city"]
    return dict(top_locations=[dict(name=city, share=0.46), dict(name="Other Indian cities", share=0.38)], age_ranges={"18-24": 0.28, "25-34": 0.44, "35-44": 0.2, "45+": 0.08})


def festivals_json() -> list[dict[str, Any]]:
    return [
        dict(festival_id=fid, name=name, date=d, year=int(d[:4]), region=region, category=cat, description=desc, relevant_industries=inds, relevant_content_themes=themes, source="Bundled SAMPLE dataset: not an official calendar", verification_status="SAMPLE_UNVERIFIED", date_note=note)
        for (fid, name, d, cat, region, desc, inds, themes, note) in FESTIVALS
    ]


def write_all() -> None:
    MOCK_DIR.mkdir(parents=True, exist_ok=True)
    FESTIVAL_DIR.mkdir(parents=True, exist_ok=True)

    def dump(path: Path, data: Any) -> None:
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    dump(MOCK_DIR / "profiles.json", {PROFILE_IDS[k]: v for k, v in PROFILES.items()})
    for key, pid in PROFILE_IDS.items():
        dump(MOCK_DIR / f"posts_{pid}.json", generate_posts(key))
        dump(MOCK_DIR / f"comments_{pid}.json", {"comments": generate_comments(key), "demographics": generate_demographics(key)})
    dump(MOCK_DIR / "competitors.json", generate_competitors())
    dump(MOCK_DIR / "trends.json", TRENDS)
    dump(FESTIVAL_DIR / "festivals_sample.json", festivals_json())


# ---------------------------------------------------------------- loading

def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_mock_data(store: Store) -> list[str]:
    """Loads the bundled profiles, posts and comments into a store. Returns the profile ids."""
    loaded = []
    for pid, raw in _read(MOCK_DIR / "profiles.json").items():
        store.create(ProfileCreate.model_validate(raw), profile_id=pid)
        store.set_posts(pid, [PostIn.model_validate(p) for p in _read(MOCK_DIR / f"posts_{pid}.json")], replace=True)
        c = _read(MOCK_DIR / f"comments_{pid}.json")
        store.set_comments(pid, [CommentIn.model_validate(x) for x in c["comments"]], Demographics.model_validate(c["demographics"]), replace=True)
        loaded.append(pid)
    return loaded


if __name__ == "__main__":
    if "--write" in sys.argv:
        write_all()
        print(f"wrote mock data to {MOCK_DIR} and {FESTIVAL_DIR}")
    else:
        print(__doc__)
