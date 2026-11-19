from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.ai.refiner import RecommendationRefiner
from app.api.dependencies import Container, get_container
from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.common import Envelope, Page, envelope
from app.schemas.recommendation import GenerateRequest, Recommendation

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


class GeneratedRecommendations(BaseModel):
    profile_id: str
    recommendations: list[Recommendation]
    notes: list[str]


@router.post("/generate", response_model=Envelope[GeneratedRecommendations], summary="Generate 3-5 ranked, evidence-backed recommendations")
async def generate(body: GenerateRequest, c: Container = Depends(get_container)) -> Envelope[GeneratedRecommendations]:
    recs, notes = c.recommendations.build(body)
    if body.use_ai:
        # A failure here is reported to the caller as an error. It is never swallowed and replaced with rule-only output.
        recs = await RecommendationRefiner(c.ai_provider()).refine(recs)
    c.recommendations.save(recs)
    return envelope(GeneratedRecommendations(profile_id=body.profile_id, recommendations=recs, notes=notes))


@router.get("", response_model=Envelope[Page[Recommendation]], summary="Previously generated recommendations")
def list_recommendations(profile_id: str, page: int = Query(default=1, ge=1), page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE), c: Container = Depends(get_container)) -> Envelope[Page[Recommendation]]:
    return envelope(c.recommendations.list(profile_id, page=page, page_size=page_size))


@router.get("/{recommendation_id}", response_model=Envelope[Recommendation], summary="One recommendation")
def get_recommendation(recommendation_id: str, profile_id: str, c: Container = Depends(get_container)) -> Envelope[Recommendation]:
    return envelope(c.recommendations.get(profile_id, recommendation_id))
