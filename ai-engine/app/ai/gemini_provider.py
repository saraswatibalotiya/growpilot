import httpx

from app.ai.provider import AIProvider
from app.core.exceptions import AIProviderError

_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, *, api_key: str, model: str, timeout: float, max_output_tokens: int, max_retries: int, client: httpx.AsyncClient | None = None, **kwargs):
        super().__init__(max_retries=max_retries, **kwargs)
        self._key, self.model, self._max_tokens = api_key, model, max_output_tokens
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _complete_once(self, system: str, prompt: str) -> str:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": self._max_tokens},
        }
        if "2.5-flash" in self.model:
            # Thinking tokens share maxOutputTokens on these models and can starve the JSON answer. This one cannot be switched off on Pro.
            body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
        try:
            r = await self._client.post(_URL.format(model=self.model), json=body, headers={"x-goog-api-key": self._key})  # the key goes in a header, never in the URL
        except httpx.TimeoutException as exc:
            raise AIProviderError("The AI provider timed out.", kind="timeout", retryable=True, provider=self.name) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError("The AI provider could not be reached.", kind="network", retryable=True, provider=self.name) from exc
        if r.status_code == 429:
            raise AIProviderError("The AI provider rate limit was hit.", kind="rate_limited", retryable=True, provider=self.name)
        if r.status_code in (401, 403):
            raise AIProviderError("The AI provider rejected the credentials.", kind="auth", provider=self.name)
        if r.status_code >= 500:
            raise AIProviderError("The AI provider had an internal error.", kind="server_error", retryable=True, provider=self.name)
        if r.status_code >= 400:
            # Google reports an invalid or expired key as HTTP 400 (API_KEY_INVALID), not 401/403.
            if _is_key_problem(r):
                raise AIProviderError("The AI provider rejected the credentials.", kind="auth", provider=self.name)
            if r.status_code == 404:
                raise AIProviderError("The configured AI model was not found.", kind="model_not_found", provider=self.name)
            raise AIProviderError(f"The AI provider rejected the request (HTTP {r.status_code}).", kind="bad_request", provider=self.name)
        try:
            candidate = r.json()["candidates"][0]
            parts = candidate["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AIProviderError("The AI provider returned an unexpected response shape (possibly blocked by safety filters).", kind="unexpected_response", provider=self.name) from exc
        if candidate.get("finishReason") == "MAX_TOKENS":
            raise AIProviderError("The AI response was cut off before it finished.", kind="truncated", provider=self.name)
        return text


def _is_key_problem(r: httpx.Response) -> bool:
    try:
        error = r.json().get("error", {})
        reasons = {d.get("reason") for d in error.get("details", []) if isinstance(d, dict)}
        return bool(reasons & {"API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED"}) or "api key" in str(error.get("message", "")).lower()
    except (ValueError, AttributeError):
        return False
