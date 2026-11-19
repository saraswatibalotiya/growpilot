from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import Container, get_container
from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.integrations.competitors.data_providers import ProviderCapabilities, all_providers
from app.schemas.common import Envelope, Page, envelope
from app.schemas.competitor import ApprovalStatus, ApprovalUpdate, Competitor, CompetitorCreate, CompetitorInsights, CompetitorLandscape, CompetitorPostsUpdate, CompetitorSuggestRequest

router = APIRouter(prefix="/competitors", tags=["Competitors"])


@router.post("/suggest", response_model=Envelope[list[Competitor]], status_code=201, summary="Suggest competitors (saved as PENDING: nothing is activated until you approve)")
async def suggest(body: CompetitorSuggestRequest, c: Container = Depends(get_container)) -> Envelope[list[Competitor]]:
    return envelope(await c.competitors.suggest(body.profile_id, body.max_suggestions, body.query, body.category))


@router.post("", response_model=Envelope[Competitor], status_code=201, summary="Add a competitor yourself (approved at once)")
def add_competitor(body: CompetitorCreate, c: Container = Depends(get_container)) -> Envelope[Competitor]:
    return envelope(c.competitors.add_manual(body))


@router.get("", response_model=Envelope[Page[Competitor]], summary="List competitors, optionally by approval status")
def list_competitors(profile_id: str, status: ApprovalStatus | None = None, page: int = Query(default=1, ge=1), page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE), c: Container = Depends(get_container)) -> Envelope[Page[Competitor]]:
    items = c.competitors.list(profile_id, status)
    start = (page - 1) * page_size
    return envelope(Page[Competitor](items=items[start : start + page_size], page=page, page_size=page_size, total=len(items)))


@router.get("/providers", response_model=Envelope[list[ProviderCapabilities]], summary="Where competitor public data can come from, and what each source can and can not do")
def providers() -> Envelope[list[ProviderCapabilities]]:
    return envelope([p.capabilities() for p in all_providers()])


@router.get("/landscape", response_model=Envelope[CompetitorLandscape], summary="All approved competitors together: activity, topics, formats, and the gaps in your own content")
def landscape(profile_id: str, as_of: date | None = None, c: Container = Depends(get_container)) -> Envelope[CompetitorLandscape]:
    return envelope(c.competitors.landscape(profile_id, as_of))


@router.post("/{competitor_id}/posts", response_model=Envelope[Competitor], summary="Supply public information about a competitor's recent posts")
def set_competitor_posts(competitor_id: str, body: CompetitorPostsUpdate, c: Container = Depends(get_container)) -> Envelope[Competitor]:
    return envelope(c.competitors.set_posts(body, competitor_id))


@router.get("/{competitor_id}/insights", response_model=Envelope[CompetitorInsights], summary="Insights from an approved competitor's public posts")
def competitor_insights(competitor_id: str, profile_id: str, as_of: date | None = None, c: Container = Depends(get_container)) -> Envelope[CompetitorInsights]:
    return envelope(c.competitors.insights(profile_id, competitor_id, as_of))


@router.patch("/{competitor_id}/approval", response_model=Envelope[Competitor], summary="Approve or reject a competitor")
def set_approval(competitor_id: str, body: ApprovalUpdate, c: Container = Depends(get_container)) -> Envelope[Competitor]:
    return envelope(c.competitors.set_approval(body.profile_id, competitor_id, body.status))


@router.delete("/{competitor_id}", status_code=204, summary="Remove a competitor")
def delete_competitor(competitor_id: str, profile_id: str, c: Container = Depends(get_container)) -> None:
    c.competitors.delete(profile_id, competitor_id)
