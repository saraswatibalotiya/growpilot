"""Rule-based topic extraction. Small on purpose: a transparent lexicon and the post's own hashtags, no model, no guessing.

Keywords cover English, common Hinglish spellings and Devanagari (Hindi and Marathi). A topic is only reported when its
keywords actually appear in the text.
"""

import re

# label -> keywords (lowercase). Matched as whole words or as hashtag stems.
LEXICON: dict[str, tuple[str, ...]] = {
    "festive wear": ("festive kurti", "festive collection", "festive outfit", "festive look", "festivewear", "festival outfit", "diwali outfit", "navratri outfit", "त्योहार", "दिवाळी", "दिवाली"),
    "festive menu": ("festive menu", "festivemenu", "festive special", "festive thali", "festive family"),
    "styling": ("styling", "style a", "ways to style", "how to wear", "lookbook", "स्टाइल"),
    "new arrivals": ("new arrival", "newarrivals", "just landed", "fresh arrivals", "new collection", "नया कलेक्शन"),
    "bridal": ("bridal", "lehenga", "wedding", "शादी", "लग्न"),
    "ethnic wear": ("kurti", "kurta", "saree", "sari", "dupatta", "ethnic", "कुर्ती", "साड़ी", "साडी"),
    "skincare": ("skincare", "serum", "sunscreen", "moisturi", "routine", "acne", "स्किन"),
    "makeup": ("makeup", "makeuptutorial", "grwm", "lipstick", "foundation", "glam"),
    "product review": ("review", "honest review", "worth it", "unboxing"),
    "myths": ("myth", "myths", "stop doing", "stop believing"),
    "street food": ("street food", "streetfood", "vada pav", "chaat", "stall", "trail"),
    "recipes": ("recipe", "easy poha", "tadka", "homecooking", "how to make", "रेसिपी"),
    "regional food": ("regional", "misal", "konkan", "thali", "kolhapuri", "थाली"),
    "biryani": ("biryani", "बिरयानी"),
    "menu": ("menu", "combo", "tasting"),
    "cafe": ("cafe", "brunch", "coffee"),
    "food hacks": ("hack", "kitchen tips", "kitchentips", "foodhacks", "save time"),
    "budget travel": ("budget travel", "budgettravel", "budget trip", "under 5000", "cheap flights", "rupees:", "cost breakdown", "costbreakdown"),
    "itineraries": ("itinerary", "day trip", "3 day", "4 days", "route"),
    "offbeat places": ("offbeat", "hidden", "unknown village", "waterfalls", "hidden gems"),
    "travel tips": ("traveltips", "packing", "travel tips", "how i find"),
    "solo travel": ("solo", "solotravel"),
    "behind the scenes": ("behind the scenes", "behindthescenes", "behindthekitchen", "bts", "workshop", "how our", "day at"),
    "customer stories": ("customer", "customerlove", "family birthday", "our guests"),
    "offers": ("offer", "deal", "discount", "% off", "sale", "special price"),
    "giveaway": ("giveaway", "contest", "win a"),
    "lifestyle": ("lifestyle", "vlog", "dayinmylife", "what i eat", "sunday reset"),
}

_HASHTAG = re.compile(r"#([\wऀ-ॿ]+)", re.UNICODE)


def hashtags(text: str | None) -> list[str]:
    return [h.lower() for h in _HASHTAG.findall(text or "")]


def extract_topics(text: str | None, max_topics: int = 3) -> list[str]:
    """Topics in order of how many of their keywords match. Empty when nothing matches."""
    if not text:
        return []
    haystack = text.lower()
    scored: list[tuple[int, str]] = []
    for label, keywords in LEXICON.items():
        hits = sum(1 for k in keywords if k in haystack)
        if hits:
            scored.append((hits, label))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [label for _, label in scored[:max_topics]]
