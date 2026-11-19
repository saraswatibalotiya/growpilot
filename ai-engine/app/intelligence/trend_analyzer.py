"""Decides whether a trend can be called current, and how relevant it is to one profile.

A trend is usable as "current" only when ALL of these hold: it names a source, it was verified within the allowed age, it has
not expired and it has already started. Anything else is labelled (stale, expired, upcoming, unverified) and kept out of the
current list. A hypothesis, such as an unsourced AI guess, is never presented as a trend.
"""

from datetime import date

from app.schemas.profile import Profile
from app.schemas.trend import Freshness, Trend, TrendAssessment, TrendCategory, TrendKind

# Words in a profile's category, niche, products and services that point at an industry.
INDUSTRY_WORDS: dict[str, str] = {
    "ethnic": "fashion", "clothing": "fashion", "boutique": "fashion", "fashion": "fashion", "saree": "fashion", "kurti": "fashion", "lehenga": "fashion", "apparel": "fashion",
    "restaurant": "restaurant", "cafe": "restaurant", "thali": "restaurant", "biryani": "restaurant", "catering": "restaurant",
    "food": "food", "recipe": "food", "street food": "food",
    "beauty": "beauty", "skincare": "beauty", "makeup": "beauty", "salon": "beauty",
    "travel": "travel", "tourism": "travel", "itinerar": "travel",
    "jewellery": "jewellery", "jewelry": "jewellery",
    "fitness": "fitness", "gym": "fitness", "yoga": "fitness",
    "ecommerce": "ecommerce", "online store": "ecommerce", "retail": "retail", "store": "retail",
    "tech": "technology", "education": "education",
}
INDUSTRY_TO_TREND: dict[str, set[TrendCategory]] = {
    "fashion": {TrendCategory.FASHION, TrendCategory.ECOMMERCE},
    "restaurant": {TrendCategory.FOOD},
    "food": {TrendCategory.FOOD},
    "beauty": {TrendCategory.BEAUTY},
    "travel": {TrendCategory.TRAVEL},
    "jewellery": {TrendCategory.FASHION, TrendCategory.ECOMMERCE},
    "fitness": {TrendCategory.FITNESS},
    "ecommerce": {TrendCategory.ECOMMERCE, TrendCategory.BUSINESS},
    "retail": {TrendCategory.ECOMMERCE, TrendCategory.BUSINESS},
    "technology": {TrendCategory.TECHNOLOGY},
    "education": {TrendCategory.EDUCATION},
}


def profile_industries(profile: Profile) -> set[str]:
    text = " ".join(filter(None, [profile.category, profile.niche, *profile.products, *profile.services])).lower()
    return {industry for word, industry in INDUSTRY_WORDS.items() if word in text}


def profile_places(profile: Profile) -> set[str]:
    return {p.lower() for p in (profile.country, profile.region, profile.city) if p}


def assess_trend(trend: Trend, profile: Profile | None, as_of: date, max_age_days: int) -> TrendAssessment:
    reasons: list[str] = []
    freshness = Freshness.FRESH
    if trend.kind == TrendKind.HYPOTHESIS:
        freshness = Freshness.UNVERIFIED
        reasons.append("This is a hypothesis, not a verified trend.")
    elif not (trend.source_name and trend.source_url):
        freshness = Freshness.UNVERIFIED
        reasons.append("It does not name a source, so it can not be called a trend.")
    elif trend.verified_date is None:
        freshness = Freshness.UNVERIFIED
        reasons.append("It has no verification date.")
    elif trend.verified_date > as_of:
        freshness = Freshness.UNVERIFIED
        reasons.append("It was verified after the date being evaluated, so it was not known then.")
    elif trend.expiry_date is not None and trend.expiry_date < as_of:
        freshness = Freshness.EXPIRED
        reasons.append(f"It expired on {trend.expiry_date}.")
    elif trend.starts_on is not None and trend.starts_on > as_of:
        freshness = Freshness.UPCOMING
        reasons.append(f"It starts on {trend.starts_on}, so it is not current yet.")
    elif (as_of - trend.verified_date).days > max_age_days:
        freshness = Freshness.STALE
        reasons.append(f"It was last verified {(as_of - trend.verified_date).days} days ago (limit {max_age_days}).")
    else:
        reasons.append(f"Sourced from {trend.source_name}, verified {trend.verified_date}.")

    relevance = _relevance(trend, profile, reasons)
    return TrendAssessment(trend=trend, freshness=freshness, usable_as_current=freshness == Freshness.FRESH, profile_relevance=relevance, reasons=reasons)


def _relevance(trend: Trend, profile: Profile | None, reasons: list[str]) -> float:
    base = trend.relevance_score
    if profile is None:
        return round(base, 2)
    industries = profile_industries(profile)
    wanted: set[TrendCategory] = set().union(*(INDUSTRY_TO_TREND.get(i, set()) for i in industries)) if industries else set()
    if trend.category in wanted:
        category = 1.0
        reasons.append(f"Matches your {trend.category.value.lower()} focus.")
    elif wanted:
        category = 0.2
        reasons.append(f"{trend.category.value.title()} is not your focus.")
    else:
        category = 0.5
    places = profile_places(profile)
    region = trend.region.lower()
    if region in places or region in {"india", "all india"} and "india" in places:
        place = 1.0
    elif region == "global":
        place = 0.5
        reasons.append("A global trend, not specific to India.")
    else:
        place = 0.3
        reasons.append(f"Specific to {trend.region}, not your location.")
    language = 1.0 if trend.language == profile.primary_language or trend.language == "en" else 0.8
    return round(max(0.0, min(1.0, base * category * place * language)), 2)
