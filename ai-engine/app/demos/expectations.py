"""What a good set of recommendations looks like for each demo, written BEFORE looking at the output, and the checks that compare
the engine's actual output with it. FICTIONAL SAMPLE DATA: the expectations describe the invented patterns in
app/demos/datasets.py, not the real world.

`compare()` is used by the quality tests and by `python -m app.demos --report`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.demos.datasets import EVAL_DATE
from app.demos.runner import load_demo, make_container
from app.schemas.recommendation import GenerateRequest, Recommendation

# Words from the OTHER demos' businesses. None may appear in a profile's recommendations.
ALL_TERMS = {
    "restaurant": ["thali", "biryani", "menu", "dish", "table", "book", "order", "delivery"],
    "fashion_creator": ["styl", "outfit", "kurta", "saree", "dupatta", "wear", "ethnic", "fashion"],
    "travel_creator": ["itinerar", "trip", "travel", "getaway", "destination", "budget"],
    "beauty_creator": ["skin", "makeup", "serum", "sunscreen", "beauty", "routine", "myth"],
    "new_business": ["soap", "neem", "rose"],
}


@dataclass
class Expectation:
    description: str
    #: Topics the invented history makes the clear winners. At least one must drive a recommendation.
    winning_topics: list[str]
    #: Topics the invented history makes clear losers. None may be recommended as "build on what works".
    losing_topics: list[str]
    #: Words that show a recommendation is about THIS business. At least `min_specific` recommendations must contain one.
    specific_terms: list[str]
    min_specific: int
    #: Other businesses' words that must NOT appear.
    forbidden_terms: list[str]
    #: Sample trends that are generic (relevant to nobody here). They must not be used.
    ignored_trend_ids: list[str] = field(default_factory=lambda: ["demo_trend_viral_audio", "demo_trend_ai_tools"])
    confidence_ceiling: int | None = None  # every confidence score must be at most this
    expect_data_caveats: bool = False


_OTHER = lambda key: [t for k, terms in ALL_TERMS.items() if k != key for t in terms]  # noqa: E731

EXPECTATIONS: dict[str, Expectation] = {
    "restaurant": Expectation("Thali and biryani are the strong earners; offers and behind-the-scenes underperform. Comments ask about booking, price and delivery.", ["regional food", "biryani", "festive menu", "menu"], ["offers", "behind the scenes", "customer stories"], ["thali", "biryani", "menu", "dish", "regional food", "order", "book"], 3, ["saree", "kurta", "skincare", "itinerary", "makeup", "outfit"]),
    "fashion_creator": Expectation("Styling and ethnic wear win; product reviews, lifestyle vlogs and new arrivals lag.", ["styling", "ethnic wear"], ["product review", "lifestyle", "new arrivals"], ["styl", "outfit", "kurta", "saree", "dupatta", "ethnic", "wear", "fashion", "look"], 3, ["biryani", "thali", "itinerary", "skincare", "makeup"]),
    "travel_creator": Expectation("Itineraries and budget travel win; solo travel, tips and vlogs lag. Comments ask about budget and stays.", ["itineraries", "budget travel"], ["solo travel", "lifestyle", "travel tips"], ["itinerar", "trip", "travel", "getaway", "stay", "budget", "destination"], 3, ["biryani", "thali", "kurta", "skincare", "makeup", "saree"]),
    "beauty_creator": Expectation("Skincare and myths win; product reviews, makeup and vlogs lag. Comments ask about skin types and products.", ["skincare", "myths"], ["product review", "lifestyle", "makeup"], ["skin", "makeup", "serum", "sunscreen", "beauty", "routine", "myth", "acne"], 3, ["biryani", "thali", "itinerary", "kurta", "saree"]),
    "new_business": Expectation("Only 3 posts and 2 comments: there is almost nothing to learn from. Confidence must stay low and the output must say why.", [], [], ["soap", "neem", "rose", "beauty", "skincare", "natural"], 1, ["biryani", "thali", "itinerary", "kurta", "saree", "outfit"], confidence_ceiling=45, expect_data_caveats=True),
}


@dataclass
class Check:
    name: str
    expected: str
    actual: str
    passed: bool


def text_of(r: Recommendation) -> str:
    return f"{r.title} {r.content_idea} {r.detailed_concept} {r.hook} {r.caption_direction}".lower()


def compare(key: str, *, as_of: date = EVAL_DATE, count: int = 4) -> tuple[list[Check], list[Recommendation]]:
    exp = EXPECTATIONS[key]
    c = make_container()
    pid = load_demo(c, key)
    recs, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=as_of, count=count))
    report = c.analytics.report(pid)
    checks: list[Check] = []

    specific = [r for r in recs if any(t in text_of(r) for t in exp.specific_terms)]
    checks.append(Check("specific to the business", f">= {exp.min_specific} of {len(recs)} mention its own category terms", f"{len(specific)} of {len(recs)}", len(specific) >= exp.min_specific))
    leaks = sorted({t for r in recs for t in exp.forbidden_terms if t in text_of(r)})
    checks.append(Check("no other business's vocabulary", "none", ", ".join(leaks) or "none", not leaks))

    if exp.winning_topics:
        strong = [t.topic for t in report.topics if t.enough_data and (t.mean_performance_index or 0) >= 1.1]
        ok_topics = [t for t in strong if t in exp.winning_topics]
        checks.append(Check("analytics finds the designed winners", f"one of {exp.winning_topics} has index >= 1.10", ", ".join(f"{t.topic} {t.mean_performance_index}" for t in report.topics if t.topic in exp.winning_topics) or "none", bool(ok_topics)))
        driven = [r for r in recs if any(e.signal.value == "historical" for e in r.supporting_evidence) and any(w in text_of(r) or w in " ".join(e.statement.lower() for e in r.supporting_evidence) for w in exp.winning_topics)]
        checks.append(Check("a winning topic drives a recommendation", ">= 1 recommendation cites historical evidence on a winning topic", f"{len(driven)}", len(driven) >= 1))
        top_hist = max(recs, key=lambda r: r.score_breakdown.signals.get("historical") or 0)
        checks.append(Check("winners rank near the top", "the recommendation with the strongest historical signal is in the top 2", f"rank {recs.index(top_hist) + 1}", recs.index(top_hist) < 2))
    if exp.losing_topics:
        bad = [r.title for r in recs if r.tags and "performance_driven" in r.tags and any(f"'{t}'" in " ".join(e.statement.lower() for e in r.supporting_evidence) and "above" in " ".join(e.statement for e in r.supporting_evidence) for t in exp.losing_topics)]
        checks.append(Check("losing topics are not promoted as strengths", "none", ", ".join(bad) or "none", not bad))

    used_trends = sorted({e.statement for r in recs for e in r.supporting_evidence if e.signal.value == "trend"})
    generic = [t for t in exp.ignored_trend_ids if any(t_title in " ".join(used_trends).lower() for t_title in ("comedy audio", "ai tools"))]
    checks.append(Check("generic trends are not used", "none", ", ".join(generic) or "none", not generic))

    spread = max((r.opportunity_score for r in recs), default=0) - min((r.opportunity_score for r in recs), default=0)
    checks.append(Check("opportunity and confidence are separate", "scores are not identical across ideas", f"opportunity {[r.opportunity_score for r in recs]} confidence {[r.confidence_score for r in recs]}", spread > 0 and [r.opportunity_score for r in recs] != [r.confidence_score for r in recs]))

    if exp.confidence_ceiling is not None:
        top = max(r.confidence_score for r in recs)
        checks.append(Check("confidence is honest for thin data", f"<= {exp.confidence_ceiling}", str(top), top <= exp.confidence_ceiling))
    if exp.expect_data_caveats:
        missing = [r.title for r in recs if not any("posts are available" in c or "post history" in c for c in r.risks_and_caveats)]
        checks.append(Check("thin data is explained in every recommendation", "every recommendation has a data caveat", f"{len(recs) - len(missing)} of {len(recs)}", not missing))
    else:
        loud = [r.title for r in recs if any("posts are available" in c for c in r.risks_and_caveats)]
        checks.append(Check("no thin-data caveat when data is sufficient", "none", ", ".join(loud) or "none", not loud))
    return checks, recs
