from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import Container, get_container
from app.schemas.common import Envelope, envelope
from app.schemas.trend import FestivalRecord, UpcomingFestival

router = APIRouter(prefix="/festivals", tags=["Festivals"])


@router.get("", response_model=Envelope[list[FestivalRecord]], summary="Festivals and occasions (bundled SAMPLE data: dates are approximate)")
def list_festivals(year: int | None = Query(default=None, ge=2000, le=2100), region: str | None = None, industry: str | None = None, c: Container = Depends(get_container)) -> Envelope[list[FestivalRecord]]:
    return envelope(c.festivals.list(year=year, region=region, industry=industry))


@router.get("/coverage", response_model=Envelope[dict], summary="What is confirmed, approximate or missing for a year. A missing festival is not the same as no festival")
def coverage(year: int = Query(ge=2000, le=2100), c: Container = Depends(get_container)) -> Envelope[dict]:
    return envelope(c.festivals.coverage(year))


@router.get("/upcoming", response_model=Envelope[list[UpcomingFestival]], summary="Festivals coming up, optionally scored for a profile")
def upcoming(as_of: date | None = None, days: int = Query(default=60, ge=1, le=365), region: str | None = None, industry: str | None = None, profile_id: str | None = None, c: Container = Depends(get_container)) -> Envelope[list[UpcomingFestival]]:
    profile = c.profiles.get(profile_id) if profile_id else None
    return envelope(c.festivals.upcoming(as_of=as_of, days=days, region=region, industry=industry, profile=profile))
