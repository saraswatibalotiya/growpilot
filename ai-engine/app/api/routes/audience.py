from fastapi import APIRouter, Depends

from app.api.dependencies import Container, get_container
from app.schemas.audience import AudienceAnalyzeRequest, AudienceInsights
from app.schemas.common import Envelope, envelope

router = APIRouter(prefix="/audience", tags=["Audience"])


@router.post("/analyze", response_model=Envelope[AudienceInsights], summary="Store comments and analyse what the audience asks and says")
def analyze(body: AudienceAnalyzeRequest, c: Container = Depends(get_container)) -> Envelope[AudienceInsights]:
    return envelope(c.audience.analyze(body))


@router.get("/insights", response_model=Envelope[AudienceInsights], summary="The latest audience insights for a profile")
def insights(profile_id: str, c: Container = Depends(get_container)) -> Envelope[AudienceInsights]:
    return envelope(c.audience.insights(profile_id))
