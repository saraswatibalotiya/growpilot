"""GrowPilot AI Engine: a FastAPI service using the shared database's ai_engine schema."""

import re
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.dependencies import Container, build_container
from app.api.routes import analytics, audience, competitors, feedback, festivals, health, outcomes, profiles, recommendations, trends
from app.core.config import Settings, get_settings
from app.core.constants import API_PREFIX, APP_NAME, APP_VERSION
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging, logger, set_request_id
from app.core.rate_limit import enforce_rate_limit
from app.core.security import require_service_auth
from app.data.seed import load_mock_data

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Gives every request an id (a safe client-supplied one is kept), enforces the body limit and logs the outcome."""

    def __init__(self, app, max_body_bytes: int):
        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(self, request: Request, call_next):
        supplied = request.headers.get("x-request-id") or request.headers.get("x-correlation-id") or ""
        request_id = supplied if _REQUEST_ID.match(supplied) else uuid.uuid4().hex
        set_request_id(request_id)

        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > self.max_body_bytes:
            body = {"error": {"code": "payload_too_large", "message": "The request body is too large."}, "meta": {"request_id": request_id}}
            return JSONResponse(status_code=413, content=body, headers={"x-request-id": request_id})

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        logger.info("request", extra={"method": request.method, "path": request.url.path, "status": response.status_code})
        return response


def _prepare_storage(settings: Settings, container: Container) -> None:
    """Start-up work that needs the store. A database that is down at start-up does not stop the app: /health reports it (503)
    and requests fail safely until it is back."""
    from app.core.exceptions import AppError

    persistent = settings.storage_backend == "postgres"
    try:
        # Bundled FICTIONAL demo profiles go into a persistent database only when LOAD_MOCK_DATA is set explicitly.
        wants_mock = settings.load_mock_data and (not persistent or "load_mock_data" in settings.model_fields_set)
        if wants_mock and not container.store.list():
            load_mock_data(container.store)
        if persistent:
            container.store.sync_festivals(container.festivals.list())
    except AppError as exc:
        logger.warning("storage_not_ready", extra={"error_code": exc.code})


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    container = container or build_container(settings)
    _prepare_storage(settings, container)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("startup", extra={"environment": settings.environment, "ai_provider": settings.ai_provider})
        yield
        await container.aclose()
        container.store.close()  # release database connections on shutdown

    app = FastAPI(
        title=APP_NAME,
        version=APP_VERSION,
        description=(
            "Content intelligence for GrowPilot: analytics, audience, competitor and trend analysis, and ranked content "
            "recommendations. Runs on mock data and the mock AI provider with no keys. Development access is open; "
            "production requires a service token."
        ),
        lifespan=lifespan,
    )
    app.state.container = container
    app.dependency_overrides[get_settings] = lambda: settings

    app.add_middleware(RequestContextMiddleware, max_body_bytes=settings.max_body_bytes)
    if settings.cors_origin_list:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["authorization", "content-type", "x-request-id", "x-correlation-id"])
    install_exception_handlers(app)

    secured = [Depends(require_service_auth), Depends(enforce_rate_limit)]
    app.include_router(health.router, prefix=API_PREFIX)  # the health check stays open for orchestrators
    app.include_router(profiles.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(analytics.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(audience.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(competitors.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(trends.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(festivals.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(recommendations.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(feedback.router, prefix=API_PREFIX, dependencies=secured)
    app.include_router(outcomes.router, prefix=API_PREFIX, dependencies=secured)
    return app


app = create_app()
