from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.dependencies import Container, get_container
from app.core.constants import APP_NAME, APP_VERSION
from app.schemas.common import Envelope, envelope

router = APIRouter(tags=["Health"])


class Health(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    ai_provider: str
    storage: str


@router.get("/health", response_model=Envelope[Health], summary="Is the engine running?")
def health(container: Container = Depends(get_container)) -> Envelope[Health]:
    s = container.settings
    container.store.ping()  # raises 503 database_unavailable (without naming the host or credentials) if storage is down
    return envelope(Health(status="ok", service=APP_NAME, version=APP_VERSION, environment=s.environment, ai_provider=s.ai_provider, storage=getattr(container.store, "backend", "unknown")))
