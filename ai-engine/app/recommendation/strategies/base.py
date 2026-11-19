"""A strategy turns a Seed into a concrete content idea for one kind of profile. Business and creator ideas differ in what
they aim for, which formats they favour and what they ask the audience to do."""

from __future__ import annotations

from typing import Protocol

from app.recommendation.models import Candidate, Seed, Signals
from app.schemas.profile import Profile


class Strategy(Protocol):
    name: str

    def build(self, seed: Seed, signals: Signals) -> Candidate | None: ...


def family(profile: Profile) -> str:
    """The industry family used to choose vocabulary: fashion, beauty, food, restaurant, travel, fitness, jewellery or general."""
    from app.intelligence.trend_analyzer import profile_industries

    found = profile_industries(profile)
    for name in ("restaurant", "fashion", "jewellery", "beauty", "food", "travel", "fitness"):
        if name in found:
            return name
    return "general"


#: What the account's own numbers actually showed, so an idea never claims more than the evidence does.
_METRIC_CLAIM = {
    "index": "it earns more engagement than your typical post for its format",
    "saves": "it is saved more often than your typical post",
    "shares": "it is shared more often than your typical post",
}


def metric_claim(metric: str | None) -> str:
    return _METRIC_CLAIM.get(metric or "index", _METRIC_CLAIM["index"])


def festival_risks(fe) -> list[str]:
    """A date is only called confirmed when its status says so. Approximate sample dates carry an explicit warning."""
    if fe.verification_status == "SAMPLE_UNVERIFIED":
        return [f"The {fe.name} date comes from bundled sample data and is approximate. It is NOT confirmed: check it before scheduling."]
    return []
