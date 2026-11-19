"""Application errors and the handlers that turn them into safe, consistent JSON."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import get_request_id, logger


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, details: Any = None):
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str, *, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"


class AIProviderError(AppError):
    """An AI provider failed. It is reported to the caller; it is never turned into a made-up success."""

    status_code = 502
    code = "ai_provider_error"

    def __init__(self, message: str, *, kind: str = "failure", retryable: bool = False, provider: str | None = None):
        super().__init__(message, details={"kind": kind, "provider": provider})
        self.kind = kind
        self.retryable = retryable
        self.provider = provider


class AINotConfiguredError(AIProviderError):
    status_code = 503
    code = "ai_not_configured"


class DatabaseUnavailableError(AppError):
    """The database could not be reached or timed out. The message never names the host, user or password."""

    status_code = 503
    code = "database_unavailable"


class DatabaseError(AppError):
    status_code = 500
    code = "database_error"


def _body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error, "meta": {"request_id": get_request_id()}}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimitedError) else None
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message, exc.details), headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Field paths and messages only: never echo the submitted values back.
        issues = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body("validation_error", "The request is not valid.", issues))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_error", extra={"error_type": type(exc).__name__})
        return JSONResponse(status_code=500, content=_body("internal_error", "Something went wrong."))
