import anthropic

from app.ai.provider import AIProvider
from app.core.exceptions import AIProviderError


class ClaudeProvider(AIProvider):
    name = "claude"

    def __init__(self, *, api_key: str, model: str, timeout: float, max_output_tokens: int, max_retries: int, client: anthropic.AsyncAnthropic | None = None, **kwargs):
        super().__init__(max_retries=max_retries, **kwargs)
        self.model, self._max_tokens = model, max_output_tokens
        # Retries are done by AIProvider.complete so they are counted and bounded in one place.
        self._owns_client = client is None
        self._client = client or anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=0)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.close()

    async def _complete_once(self, system: str, prompt: str) -> str:
        try:
            message = await self._client.messages.create(model=self.model, max_tokens=self._max_tokens, system=system, messages=[{"role": "user", "content": prompt}])
        except anthropic.APITimeoutError as exc:
            raise AIProviderError("The AI provider timed out.", kind="timeout", retryable=True, provider=self.name) from exc
        except anthropic.RateLimitError as exc:
            raise AIProviderError("The AI provider rate limit was hit.", kind="rate_limited", retryable=True, provider=self.name) from exc
        except anthropic.AuthenticationError as exc:
            raise AIProviderError("The AI provider rejected the credentials.", kind="auth", provider=self.name) from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError("The AI provider could not be reached.", kind="network", retryable=True, provider=self.name) from exc
        except anthropic.PermissionDeniedError as exc:
            raise AIProviderError("The AI provider rejected the credentials.", kind="auth", provider=self.name) from exc
        except anthropic.NotFoundError as exc:
            raise AIProviderError("The configured AI model was not found.", kind="model_not_found", provider=self.name) from exc
        except anthropic.APIStatusError as exc:
            retryable = exc.status_code >= 500
            raise AIProviderError("The AI provider returned an error.", kind="server_error" if retryable else "bad_request", retryable=retryable, provider=self.name) from exc
        if getattr(message, "stop_reason", None) == "max_tokens":
            raise AIProviderError("The AI response was cut off before it finished.", kind="truncated", provider=self.name)
        return "".join(b.text for b in message.content if getattr(b, "type", None) == "text")
