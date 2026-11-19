"""A per-caller request limit (sliding one-minute window, in memory).

It protects the engine from a runaway or misconfigured caller. It is per process: behind several workers each has its own
window, so treat the number as a safety net, not as a quota. The caller is the client address, which for NestJS is one address.
"""

import time
from collections import defaultdict, deque

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.core.exceptions import RateLimitedError

_WINDOW_SECONDS = 60.0


class SlidingWindowLimiter:
    def __init__(self, limit: int, clock=time.monotonic):
        self.limit, self._clock = limit, clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> int | None:
        """None if the call is allowed, otherwise the number of seconds to wait."""
        if self.limit <= 0:
            return None
        now, hits = self._clock(), self._hits[key]
        while hits and now - hits[0] >= _WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(1, int(_WINDOW_SECONDS - (now - hits[0])) + 1)
        hits.append(now)
        return None


def enforce_rate_limit(request: Request, settings: Settings = Depends(get_settings)) -> None:
    limiter = getattr(request.app.state, "limiter", None)
    if limiter is None or limiter.limit != settings.rate_limit_per_minute:
        limiter = request.app.state.limiter = SlidingWindowLimiter(settings.rate_limit_per_minute)
    wait = limiter.check(request.client.host if request.client else "unknown")
    if wait is not None:
        raise RateLimitedError("Too many requests. Try again shortly.", retry_after=wait)
