"""Transparent, rule-based learning from feedback and measured outcomes. This is not a trained model.

For every "dimension value" (for example format=REEL or tag=trend_driven) the engine looks at how the owner reacted to earlier
recommendations. Once there are at least `min_samples` reactions the score of matching new ideas moves by at most
MAX_ADJUSTMENT points, shrunk toward zero while samples are few. Every adjustment carries a plain-language note.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from app.schemas.outcome import Outcome
from app.schemas.recommendation import Feedback, FeedbackAction, Recommendation

MAX_ADJUSTMENT = 8.0
SHRINKAGE = 3.0  # a value with n samples is trusted n / (n + SHRINKAGE)

_POSITIVE = {FeedbackAction.SAVED: 1.0, FeedbackAction.LIKED: 1.0, FeedbackAction.CREATED: 1.0, FeedbackAction.PUBLISHED: 1.0}
_NEGATIVE = {FeedbackAction.DISMISSED: -1.0, FeedbackAction.NOT_RELEVANT: -1.0}
#: These mean the idea was used or already exists, so the same idea is not offered again.
_SUPPRESS = {FeedbackAction.DISMISSED, FeedbackAction.NOT_RELEVANT, FeedbackAction.ALREADY_POSTED, FeedbackAction.CREATED, FeedbackAction.PUBLISHED}
_IGNORED_TAGS = {"evergreen", "promotional"}


def dimensions(format_: str, objective: str, tags: list[str]) -> list[tuple[str, str]]:
    return [("format", format_), ("objective", objective), *[("tag", t) for t in tags if t not in _IGNORED_TAGS]]


@dataclass
class DimensionStat:
    samples: int = 0
    total: float = 0.0

    @property
    def mean(self) -> float:
        return self.total / self.samples if self.samples else 0.0


@dataclass
class LearningModel:
    min_samples: int = 3
    stats: dict[tuple[str, str], DimensionStat] = field(default_factory=dict)
    suppressed: set[str] = field(default_factory=set)

    def adjustment_for(self, format_: str, objective: str, tags: list[str]) -> tuple[float, list[str]]:
        parts: list[float] = []
        notes: list[str] = []
        for key in dimensions(format_, objective, tags):
            st = self.stats.get(key)
            if st is None or st.samples < self.min_samples:
                continue
            shrink = st.samples / (st.samples + SHRINKAGE)
            value = MAX_ADJUSTMENT * st.mean * shrink
            if abs(value) < 0.25:
                continue
            parts.append(value)
            direction = "responded well to" if value > 0 else "mostly passed on"
            notes.append(f"You have {direction} {key[0]}={key[1]} ideas ({st.samples} reactions): {value:+.1f}.")
        if not parts:
            return 0.0, []
        adj = max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, sum(parts) / len(parts)))
        return round(adj, 2), notes

    def snapshot(self, computed_at, trigger_type: str | None = None, trigger_id: str | None = None):
        """Every dimension with at least one reaction, with exactly the adjustment `adjustment_for` would apply. For persistence."""
        from app.schemas.learning import LearningAdjustment

        out = []
        for (dim, value), st in sorted(self.stats.items()):
            active = st.samples >= self.min_samples
            adj = MAX_ADJUSTMENT * st.mean * st.samples / (st.samples + SHRINKAGE) if active else 0.0
            out.append(LearningAdjustment(dimension=dim, value=value, samples=st.samples, mean_signal=round(st.mean, 4), adjustment=round(adj, 4), active=active, computed_at=computed_at, trigger_type=trigger_type, trigger_id=trigger_id))
        return out

    @property
    def active(self) -> bool:
        return any(s.samples >= self.min_samples for s in self.stats.values())


def build_learning_model(recommendations: list[Recommendation], feedback: list[Feedback], outcomes: list[Outcome], *, min_samples: int = 3) -> LearningModel:
    by_id = {r.recommendation_id: r for r in recommendations}
    model = LearningModel(min_samples=min_samples)
    stats: dict[tuple[str, str], DimensionStat] = defaultdict(DimensionStat)

    def add(rec: Recommendation, value: float) -> None:
        for key in dimensions(rec.format.value, rec.objective.value, rec.tags):
            stats[key].samples += 1
            stats[key].total += value

    for fb in feedback:
        rec = by_id.get(fb.recommendation_id)
        if rec is None:
            continue
        if fb.action in _SUPPRESS:
            model.suppressed.add(rec.idea_fingerprint)
        value = _POSITIVE.get(fb.action) or _NEGATIVE.get(fb.action)
        if value is not None:
            add(rec, value)
    # Measured results count too, but only where a baseline existed (performance_index is None otherwise: not a zero).
    latest: dict[str, Outcome] = {}
    for o in sorted(outcomes, key=lambda o: o.captured_at):
        latest[o.recommendation_id] = o
    for rid, o in latest.items():
        rec = by_id.get(rid)
        if rec is None or o.performance_index is None:
            continue
        if o.performance_index >= 1.15:
            add(rec, 1.0)
        elif o.performance_index <= 0.85:
            add(rec, -1.0)
    model.stats = dict(stats)
    return model
