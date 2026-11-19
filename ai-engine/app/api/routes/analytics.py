from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.dependencies import Container, get_container
from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.analytics import AnalyticsReport, AnalyzeRequest, FormatBreakdown, PostScore, TopicBreakdown
from app.schemas.common import DataCoverage, Envelope, Insight, Page, envelope

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class AnalyticsOverview(BaseModel):
    profile_id: str
    posts_analyzed: int
    baseline: dict[str, float | int | str | None]
    data_coverage: DataCoverage
    insights: list[Insight]
    warnings: list[str]
    methodology: list[str]


class ContentBreakdown(BaseModel):
    formats: list[FormatBreakdown]
    topics: list[TopicBreakdown]


@router.post("/analyze", response_model=Envelope[AnalyticsReport], summary="Store posts and analyse performance")
def analyze(body: AnalyzeRequest, c: Container = Depends(get_container)) -> Envelope[AnalyticsReport]:
    return envelope(c.analytics.analyze(body))


@router.get("/overview", response_model=Envelope[AnalyticsOverview], summary="Baseline, insights and warnings")
def overview(profile_id: str, c: Container = Depends(get_container)) -> Envelope[AnalyticsOverview]:
    r = c.analytics.report(profile_id)
    return envelope(AnalyticsOverview(profile_id=r.profile_id, posts_analyzed=r.posts_analyzed, baseline=r.baseline, data_coverage=r.data_coverage, insights=r.insights, warnings=r.warnings, methodology=r.methodology))


@router.get("/top-content", response_model=Envelope[Page[PostScore]], summary="Best or weakest posts, adjusted for format")
def top_content(profile_id: str, which: str = Query(default="top", pattern="^(top|lowest)$"), page: int = Query(default=1, ge=1), page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE), c: Container = Depends(get_container)) -> Envelope[Page[PostScore]]:
    r = c.analytics.report(profile_id)
    items = r.top_posts if which == "top" else r.lowest_posts
    start = (page - 1) * page_size
    return envelope(Page[PostScore](items=items[start : start + page_size], page=page, page_size=page_size, total=len(items)))


@router.get("/content-breakdown", response_model=Envelope[ContentBreakdown], summary="Performance by format and topic")
def content_breakdown(profile_id: str, c: Container = Depends(get_container)) -> Envelope[ContentBreakdown]:
    r = c.analytics.report(profile_id)
    return envelope(ContentBreakdown(formats=r.formats, topics=r.topics))
