from fastapi import APIRouter, Depends

from app.api.dependencies import Container, get_container
from app.schemas.common import Envelope, envelope
from app.schemas.outcome import Outcome, OutcomeIn

router = APIRouter(prefix="/recommendations", tags=["Outcomes"])


@router.post("/{recommendation_id}/outcomes", response_model=Envelope[Outcome], status_code=201, summary="Record measured results for a published recommendation")
def add_outcome(recommendation_id: str, body: OutcomeIn, c: Container = Depends(get_container)) -> Envelope[Outcome]:
    return envelope(c.outcomes.record(recommendation_id, body))


@router.get("/{recommendation_id}/outcomes", response_model=Envelope[list[Outcome]], summary="Outcomes recorded for a recommendation")
def list_outcomes(recommendation_id: str, profile_id: str, c: Container = Depends(get_container)) -> Envelope[list[Outcome]]:
    return envelope(c.outcomes.list(profile_id, recommendation_id))
