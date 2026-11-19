from fastapi import APIRouter, Depends

from app.api.dependencies import Container, get_container
from app.schemas.common import Envelope, envelope
from app.schemas.learning import LearningAdjustment
from app.schemas.recommendation import Feedback, FeedbackIn

router = APIRouter(tags=["Feedback"])


@router.post("/recommendations/{recommendation_id}/feedback", response_model=Envelope[Feedback], status_code=201, summary="Record what the owner did with a recommendation")
def add_feedback(recommendation_id: str, body: FeedbackIn, c: Container = Depends(get_container)) -> Envelope[Feedback]:
    return envelope(c.feedback.record(recommendation_id, body))


@router.get("/feedback", response_model=Envelope[list[Feedback]], summary="Feedback recorded for a profile")
def list_feedback(profile_id: str, c: Container = Depends(get_container)) -> Envelope[list[Feedback]]:
    return envelope(c.feedback.list(profile_id))


@router.get("/learning/history", response_model=Envelope[list[LearningAdjustment]], summary="Stored learning adjustments, newest recomputation first")
def learning_history(profile_id: str, c: Container = Depends(get_container)) -> Envelope[list[LearningAdjustment]]:
    return envelope(c.feedback.learning_history(profile_id))


@router.get("/learning", response_model=Envelope[dict], summary="What the rule-based learning has adjusted, and why")
def learning(profile_id: str, c: Container = Depends(get_container)) -> Envelope[dict]:
    return envelope(c.feedback.learning_summary(profile_id))
