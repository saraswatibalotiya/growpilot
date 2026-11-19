"""Recomputes the learning adjustments after a reaction, so they can be stored together with it in one transaction."""

from datetime import UTC, datetime

from app.recommendation.learning import build_learning_model
from app.repositories.base import Store
from app.schemas.learning import LearningAdjustment
from app.schemas.outcome import Outcome
from app.schemas.recommendation import Feedback


def adjustments_after(store: Store, profile_id: str, min_samples: int, *, feedback: Feedback | None = None, outcome: Outcome | None = None) -> list[LearningAdjustment]:
    """The adjustments as they will stand once `feedback` or `outcome` is stored. Pure: nothing is written here."""
    fb = store.feedback_for_profile(profile_id) + ([feedback] if feedback else [])
    out = store.outcomes_for_profile(profile_id) + ([outcome] if outcome else [])
    model = build_learning_model(store.list_recommendations(profile_id), fb, out, min_samples=min_samples)
    trigger = feedback or outcome
    kind = "feedback" if feedback else "outcome"
    trigger_id = getattr(trigger, "feedback_id", None) or getattr(trigger, "outcome_id", None)
    return model.snapshot(datetime.now(UTC), kind, trigger_id)
