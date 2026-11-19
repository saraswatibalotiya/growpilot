"""One interface for every AI provider. The rest of the engine never knows which one is in use.

Failure policy: a failed AI call raises AIProviderError. It is never turned into a success, never replaced silently by made-up
output. Only transient failures (timeout, rate limit, 5xx) are retried, a bounded number of times.
"""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

from app.core.config import Settings
from app.core.exceptions import AINotConfiguredError, AIProviderError

T = TypeVar("T")


@dataclass
class AICompletion:
    text: str
    provider: str
    model: str
    latency_ms: int
    attempts: int


class AIProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def _complete_once(self, system: str, prompt: str) -> str:
        """One call. Raise AIProviderError(kind=..., retryable=...) on failure."""

    def __init__(self, *, max_retries: int = 2, sleep: Callable[[float], Awaitable[None]] = asyncio.sleep):
        self.max_retries = max_retries
        self._sleep = sleep

    async def aclose(self) -> None:  # noqa: B027  (optional hook, not abstract)
        """Release network resources. Providers that own a client override this."""

    async def complete(self, system: str, prompt: str) -> AICompletion:
        started = time.perf_counter()
        attempts = 0
        while True:
            attempts += 1
            try:
                text = await self._complete_once(system, prompt)
            except AIProviderError as exc:
                if exc.retryable and attempts <= self.max_retries:
                    await self._sleep(min(0.5 * 2 ** (attempts - 1), 4.0))
                    continue
                raise
            if not text or not text.strip():
                raise AIProviderError("The AI provider returned an empty response.", kind="empty_response", provider=self.name)
            return AICompletion(text=text, provider=self.name, model=self.model, latency_ms=int((time.perf_counter() - started) * 1000), attempts=attempts)


def build_provider(settings: Settings) -> AIProvider:
    kind = settings.ai_provider
    if kind == "mock":
        from app.ai.mock_provider import MockProvider

        return MockProvider()
    if kind == "gemini":
        if not settings.gemini_api_key:
            raise AINotConfiguredError("AI_PROVIDER is 'gemini' but GEMINI_API_KEY is not set.", kind="not_configured", provider="gemini")
        from app.ai.gemini_provider import GeminiProvider

        return GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model, timeout=settings.ai_timeout_seconds, max_output_tokens=settings.ai_max_output_tokens, max_retries=settings.ai_max_retries)
    if not settings.anthropic_api_key:
        raise AINotConfiguredError("AI_PROVIDER is 'claude' but ANTHROPIC_API_KEY is not set.", kind="not_configured", provider="claude")
    from app.ai.claude_provider import ClaudeProvider

    return ClaudeProvider(api_key=settings.anthropic_api_key, model=settings.claude_model, timeout=settings.ai_timeout_seconds, max_output_tokens=settings.ai_max_output_tokens, max_retries=settings.ai_max_retries)
