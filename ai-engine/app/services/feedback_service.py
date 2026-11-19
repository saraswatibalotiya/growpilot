import uuid
from datetime import UTC, datetime

from app.core.exceptions import NotFoundError
from app.recommendation.learning import build_learning_model
from app.repositories.base import Store
from app.schemas.recommendation import Feedback, FeedbackIn
from app.services.learning_adjustments import adjustments_after


class FeedbackService:
    def __init__(self, store: Store, min_learning_samples: int):
        self.store = store
        self.min_samples = min_learning_samples

    def record(self, recommendation_id: str, data: FeedbackIn) -> Feedback:
        # The recommendation must belong to the profile named in the request. A wrong pair looks exactly like a missing one.
        if self.store.get_recommendation(data.profile_id, recommendation_id) is None:
            raise NotFoundError("Recommendation not found.")
        fb = Feedback(feedback_id=str(uuid.uuid4()), recommendation_id=recommendation_id, profile_id=data.profile_id, action=data.action, comment=data.comment, created_at=datetime.now(UTC))
        return self.store.add_feedback(fb, adjustments_after(self.store, data.profile_id, self.min_samples, feedback=fb))

    def list(self, profile_id: str) -> list[Feedback]:
        if self.store.get(profile_id) is None:
            raise NotFoundError("Profile not found.")
        return self.store.feedback_for_profile(profile_id)

    def learning_history(self, profile_id: str):
        """The stored adjustments (the current set, or all of them), as they were when each reaction arrived."""
        if self.store.get(profile_id) is None:
            raise NotFoundError("Profile not found.")
        return self.store.list_learning_adjustments(profile_id, current_only=False)

    def learning_summary(self, profile_id: str) -> dict:
        """What the engine has learned so far, in plain terms. Empty until there are enough reactions."""
        if self.store.get(profile_id) is None:
            raise NotFoundError("Profile not found.")
        model = build_learning_model(self.store.list_recommendations(profile_id), self.store.feedback_for_profile(profile_id), self.store.outcomes_for_profile(profile_id), min_samples=self.min_samples)
        from app.recommendation.learning import MAX_ADJUSTMENT, SHRINKAGE

        adjustments = []
        for (dim, value), st in sorted(model.stats.items()):
            if st.samples < self.min_samples:
                continue
            adjustments.append({"dimension": dim, "value": value, "samples": st.samples, "adjustment": round(MAX_ADJUSTMENT * st.mean * st.samples / (st.samples + SHRINKAGE), 2)})
        return {"profile_id": profile_id, "method": "rule-based: bounded score adjustment per format, objective and driver, from feedback and measured outcomes. Not a trained model.", "minimum_samples": self.min_samples, "max_adjustment": MAX_ADJUSTMENT, "adjustments": adjustments, "suppressed_ideas": len(model.suppressed), "active": model.active}
