"""Chooses the final 3-5 from the ranked candidates so they are not five versions of one idea."""

from __future__ import annotations

import math

from app.recommendation.models import Candidate


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


_GENERIC = {"food", "travel", "tips", "and", "the", "for", "your", "wear", "post", "video", "ideas"}


def _topic_key(topic: str) -> set[str]:
    return {w[:5] for w in topic.lower().split() if w not in _GENERIC}


def _same_topic(a: str, b: str) -> bool:
    return a.lower() == b.lower() or bool(_topic_key(a) & _topic_key(b))


URGENT_STRENGTH = 0.8  # festival relevance at or above this, with the date close, is time-critical
URGENT_DAYS = 30
GAP_STRENGTH = 0.6


def _urgent(c: Candidate) -> bool:
    return c.seed.kind == "festival" and c.seed.strength >= URGENT_STRENGTH and c.seed.extra.get("days_until", 999) <= URGENT_DAYS


def _competitor_gap(c: Candidate) -> bool:
    """Several active competitors cover this repeatedly and the account barely does."""
    return c.seed.kind == "competitor" and c.seed.extra.get("k", 0) >= 2 and c.seed.strength >= GAP_STRENGTH


def select_diverse(ranked: list[Candidate], count: int) -> tuple[list[Candidate], list[str]]:
    """Picks `count` ideas.

    Two kinds of idea are guaranteed a place when 4 or more ideas are asked for, because the opportunity is easy to miss and the
    scores alone would bury it (each is only one signal among six):
    * a relevant festival close by: an evergreen idea can run any week, a festival post can not;
    * a topic several active competitors cover repeatedly while the account barely does.
    Each guarantee is announced in the notes, and the idea keeps its honest, lower score."""
    notes: list[str] = []
    front: list[Candidate] = []
    urgent = next((c for c in ranked if _urgent(c)), None)
    gap = next((c for c in ranked if _competitor_gap(c)), None)
    if count >= 4:
        if urgent is not None:
            front.append(urgent)
            notes.append(f"'{urgent.festival_name}' is close and relevant, and its window is short, so an idea for it was kept even though it scores below some evergreen ideas.")
        if gap is not None:
            front.append(gap)
            notes.append(f"{gap.seed.extra['k']} of {gap.seed.extra['n']} active competitors cover '{gap.topic}' repeatedly and you barely do, so an idea for it was kept even though its score is modest.")
        ranked = [*front, *(c for c in ranked if c not in front)]
    cap = max(1, math.ceil(count / 2))
    for relax in range(3):
        chosen: list[Candidate] = []
        for c in ranked:
            if len(chosen) == count:
                break
            if any(c.fingerprint == x.fingerprint or _norm(c.title) == _norm(x.title) for x in chosen):
                continue
            if any(_same_topic(c.topic, x.topic) for x in chosen):
                continue  # one idea per topic, always
            same_format = sum(x.format == c.format for x in chosen)
            same_kind = sum(x.seed.kind == c.seed.kind for x in chosen)
            same_shape = sum(x.seed.kind == c.seed.kind and x.format == c.format for x in chosen)
            festival = sum(x.festival_name is not None for x in chosen)
            if relax < 2 and same_shape >= 1:
                continue  # the same kind of idea in the same format is a duplicate in form
            if relax == 0 and (same_format >= cap or same_kind >= cap or (c.festival_name and festival >= 1 and count < 5)):
                continue
            if relax == 1 and same_format >= cap + 1:
                continue
            chosen.append(c)
        if len(chosen) == count or relax == 2:
            if relax:
                notes.append("Not enough distinct strong ideas to apply every variety rule, so one was relaxed.")
            if len(chosen) < count:
                notes.append(f"Only {len(chosen)} distinct ideas were supported by the available data.")
            return sorted(chosen, key=lambda c: -c.opportunity), notes
    return [], notes
