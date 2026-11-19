"""Opportunity and confidence scoring.

* Opportunity (0-100) is a ranking signal: the weighted support the evidence gives an idea. It is NOT a forecast of views or sales.
* Confidence (0-100) is separate: how well the supporting evidence is itself established (sample sizes, freshness, sourcing).
* A signal whose source does not exist is None and is left out; the remaining weights are renormalised. A missing source never
  counts as zero. A source that exists but does not support the idea does count (0.0).
"""

from __future__ import annotations

from app.recommendation.models import Candidate, Signals
from app.schemas.recommendation import SignalName

_SUPPORT_THRESHOLD = 0.15


def effective_weights(weights: dict[str, float], signals: dict[SignalName, float | None]) -> dict[str, float]:
    available = {name.value: weights.get(name.value, 0.0) for name, v in signals.items() if v is not None}
    total = sum(available.values())
    if total <= 0:
        return {}
    return {k: round(v / total, 4) for k, v in available.items()}


def score_candidate(c: Candidate, signals: Signals, weights: dict[str, float]) -> None:
    eff = effective_weights(weights, c.signals)
    base = 100 * sum(eff[n.value] * (v or 0.0) for n, v in c.signals.items() if v is not None and n.value in eff)
    adj, notes = (0.0, [])
    if signals.learning is not None:
        adj, notes = signals.learning.adjustment_for(c.format.value, c.objective.value, c.tags)
    c.opportunity = round(max(0.0, min(100.0, base + adj)), 1)
    c.learning_adjustment = adj
    factor, _ = data_sufficiency(signals)
    c.confidence = round(_confidence(c, eff) * factor, 1)
    available = [n.value for n, v in c.signals.items() if v is not None]
    missing = [n.value for n, v in c.signals.items() if v is None]
    c.breakdown = {"weights_used": eff, "signals": {n.value: v for n, v in c.signals.items()}, "available": available, "missing": missing, "base_score": round(base, 1), "learning_notes": notes}


def data_sufficiency(signals: Signals, min_posts_for_baseline: int = 5, min_comments: int = 10) -> tuple[float, list[str]]:
    """How much of the account's OWN data there is. Trends and festivals describe the market, not this account, so they can not
    make up for a missing history. Returns a 0-1 factor that scales confidence, and plain-language caveats."""
    factor, caveats = 1.0, []
    a = signals.analytics
    if a is None or a.posts_analyzed == 0:
        factor *= 0.65
        caveats.append("No post history was supplied, so nothing here is based on how your own content performed.")
    elif not a.baseline.get("baseline_reliable"):
        factor *= 0.7
        caveats.append(f"Only {a.posts_analyzed} posts are available (at least {min_posts_for_baseline} are needed for a baseline), so your own performance can not be compared yet.")
    if signals.audience is None:
        factor *= 0.85
        caveats.append(f"Fewer than {min_comments} audience comments were available, so what your audience wants is not known yet.")
    return round(factor, 2), caveats


def _confidence(c: Candidate, eff: dict[str, float]) -> float:
    supporting = [n for n, v in c.signals.items() if v is not None and v >= _SUPPORT_THRESHOLD and n != SignalName.GOAL and n in c.evidence_confidence]
    data_sources = [n for n, v in c.signals.items() if v is not None and n != SignalName.GOAL]
    if not supporting:
        # No data source backs this idea. It can still be a sound evergreen idea, but we say so with low confidence.
        return 20.0 if data_sources else 15.0
    weight_sum = sum(eff.get(n.value, 0.0) for n in supporting) or 1.0
    quality = sum(c.evidence_confidence[n] * eff.get(n.value, 0.0) for n in supporting) / weight_sum
    breadth = 0.7 + 0.3 * min(len(supporting), 3) / 3  # independent sources agreeing raises trust
    coverage = 0.6 + 0.4 * min(len(data_sources), 5) / 5  # having more data sources to compare against raises trust
    return max(0.0, min(95.0, 100 * quality * breadth * coverage))
