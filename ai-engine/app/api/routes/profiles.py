from fastapi import APIRouter, Depends, Path, Response

from app.api.dependencies import Container, get_container
from app.schemas.common import Envelope, envelope
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate

router = APIRouter(prefix="/profiles", tags=["Profiles"])


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
