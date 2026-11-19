from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import Container, get_container
from app.schemas.common import Envelope, envelope
from app.schemas.trend import TrendAnalysis, TrendAnalyzeRequest, TrendAssessment, TrendCategory

router = APIRouter(prefix="/trends", tags=["Trends"])


@router.post("/analyze", response_model=Envelope[TrendAnalysis], summary="Which trends are current and relevant to this profile")
def analyze(body: TrendAnalyzeRequest, c: Container = Depends(get_container)) -> Envelope[TrendAnalysis]:
    return envelope(c.trends.analyze(body))


@router.get("/sources", response_model=Envelope[dict], summary="Which trend source is configured, how many records it gave, and which records were rejected and why")
def sources(c: Container = Depends(get_container)) -> Envelope[dict]:
    provider = c.trends.provider
    info = provider.describe() if hasattr(provider, "describe") else {"provider": getattr(provider, "name", "unknown"), "records": len(provider.list_trends()), "rejected": []}
    return envelope({**info, "sample_records": sum(1 for t in provider.list_trends() if t.is_sample)})


@router.get("", response_model=Envelope[list[TrendAssessment]], summary="Trends, with freshness. Stale, expired and unsourced ones are hidden unless asked for")
def list_trends(category: TrendCategory | None = None, region: str | None = None, as_of: date | None = None, include_stale: bool = False, c: Container = Depends(get_container)) -> Envelope[list[TrendAssessment]]:
    return envelope(c.trends.list(category=category, region=region, as_of=as_of, include_stale=include_stale))


@router.get("/upcoming", response_model=Envelope[list[TrendAssessment]], summary="Seasonal trends that have not started yet")
def upcoming(as_of: date | None = None, days: int = Query(default=60, ge=1, le=365), category: TrendCategory | None = None, c: Container = Depends(get_container)) -> Envelope[list[TrendAssessment]]:
    return envelope(c.trends.upcoming(as_of=as_of, days=days, category=category))
