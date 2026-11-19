from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel

from app.api.dependencies import Container, get_container
from app.data.previews import PreviewIndustry, seed_preview
from app.schemas.common import Envelope, envelope
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate
from app.schemas.recommendation import GenerateRequest
from app.schemas.trend import TrendAnalyzeRequest

router = APIRouter(prefix="/profiles", tags=["Profiles"])


class PreviewRequest(BaseModel):
    industry: PreviewIndustry
    regenerate: bool = False


@router.post("/{profile_id}/preview", summary="Load or generate a database-backed fictional business preview")
def preview(body: PreviewRequest, profile_id: str = Path(pattern=r"^mock_[A-Za-z0-9_\-]{1,59}$"), c: Container = Depends(get_container)):
    seed_preview(c.store, profile_id, body.industry)
    analysis = c.analytics.report(profile_id)
    audience = c.audience.insights(profile_id)
    trends = c.trends.analyze(TrendAnalyzeRequest(profile_id=profile_id))
    recs = c.store.list_recommendations(profile_id)
    if body.regenerate or not recs:
        recs, _ = c.recommendations.build(GenerateRequest(profile_id=profile_id, count=4))
        for rec in recs:
            rec.tags = [*rec.tags, "sample", body.industry]
            rec.risks_and_caveats.insert(0, "Fictional sample data, not your Instagram results.")
        c.recommendations.save(recs)
    acted = {entry.recommendation_id: entry.action for entry in c.store.feedback_for_profile(profile_id)}
    return envelope({"analysis": analysis, "audience": audience, "trends": trends, "recommendations": recs[:4], "acted": acted})


@router.post("", response_model=Envelope[Profile], status_code=201, summary="Create a business or creator profile")
def create_profile(body: ProfileCreate, c: Container = Depends(get_container)) -> Envelope[Profile]:
    return envelope(c.profiles.create(body))


@router.put("/{profile_id}", response_model=Envelope[Profile], summary="Create or replace a profile under an id you choose (idempotent)")
def put_profile(body: ProfileCreate, response: Response, profile_id: str = Path(pattern=r"^[A-Za-z0-9_\-]{1,64}$"), c: Container = Depends(get_container)) -> Envelope[Profile]:
    profile, created = c.profiles.upsert(profile_id, body)
    response.status_code = 201 if created else 200
    return envelope(profile)


@router.get("/{profile_id}", response_model=Envelope[Profile], summary="Get a profile")
def get_profile(profile_id: str, c: Container = Depends(get_container)) -> Envelope[Profile]:
    return envelope(c.profiles.get(profile_id))


@router.patch("/{profile_id}", response_model=Envelope[Profile], summary="Change part of a profile")
def update_profile(profile_id: str, body: ProfileUpdate, c: Container = Depends(get_container)) -> Envelope[Profile]:
    return envelope(c.profiles.update(profile_id, body))
