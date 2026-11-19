"""Service-to-service authentication.

Development: open, so the engine can be tried locally.
Production: a shared SERVICE_TOKEN is mandatory (the settings refuse to load without one), and every call must send
`Authorization: Bearer <token>`.

A profile id in a request is NOT proof of authorization. Future NestJS integration must authenticate the caller, check the
user owns the profile, and only then call this service. See docs/NESTJS_INTEGRATION.md.
"""

import hmac

from fastapi import Depends, Header

from app.core.config import Settings, get_settings
from app.core.exceptions import UnauthorizedError


def require_service_auth(authorization: str | None = Header(default=None), settings: Settings = Depends(get_settings)) -> None:
    if not settings.service_token:
        return  # only reachable outside production
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not supplied or not hmac.compare_digest(supplied.encode(), settings.service_token.encode()):
        raise UnauthorizedError("A valid service token is required.")
