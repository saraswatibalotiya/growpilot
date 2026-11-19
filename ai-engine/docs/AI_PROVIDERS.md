# AI providers

`AI_PROVIDER` selects `mock` (default), `gemini` or `claude`. The rest of the engine only sees `AIProvider.complete()`.

## What AI does here

Only **wording polish** for recommendations when the request sets `use_ai: true`: title, hook, caption direction and call to
action. Scores, evidence, sources, dates, formats and hashtags are never sent for rewriting and never changed. The drafts are sent
in a `<data>` block, escaped so they cannot close it; the prompt (`app/ai/prompts/refine_recommendations.txt`) tells the model that
block is data, forbids new facts, prices, trend claims or hashtags, and forbids inferring personal traits.

Not implemented: AI-generated competitor suggestions (the mock suggestion provider is used), and AI trend discovery.

## Providers

| Provider | Needs | Notes |
|---|---|---|
| mock | nothing | Returns the drafts tidied, in the real JSON format. Exercises the whole path without a network. |
| gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`) | HTTPS via httpx; key sent in a header, never in the URL. |
| claude | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (default `claude-sonnet-5-5`) | Official `anthropic` SDK. |

Keys come from the environment only. A selected provider without a key returns **503 `ai_not_configured`** when AI is requested
(the service still starts and runs rule-only).

## Failure policy

| Failure | Behaviour |
|---|---|
| timeout, network, 429, 5xx | Retried up to `AI_MAX_RETRIES` with backoff, then **502** |
| auth, bad request, truncated, empty | Not retried; **502** |
| invalid JSON / wrong shape / wrong ids / over-long text | **502** `schema_mismatch` / `invalid_json`. Nothing is saved |

Errors never include prompts, model text or keys. A failure is never replaced with rule-based output labelled as AI. Each
recommendation carries `generation` (provider, model, method, latency, attempts); rule-only output says `rules`.

## Final validation in Python

The model's wording is checked before anything is saved (`app/ai/guard.py`). It is rejected (**502 `unsafe_content`**, nothing saved) if it
adds a number, hashtag, link, or a word like "viral", "trending", "guaranteed" or "proven" that the rule-based draft did not contain.
It must also return exactly the requested ids. Scores, evidence, sources and dates never pass through the model at all.

Other failure kinds seen in `error.details.kind`: `auth` (also Gemini's HTTP 400 `API_KEY_INVALID`), `model_not_found`, `truncated`
(Gemini `MAX_TOKENS` or Claude `max_tokens`; raise `AI_MAX_OUTPUT_TOKENS`), `unexpected_response` (for example a safety block).

## Verifying a provider

* `pytest tests/unit/test_ai_provider_scenarios.py`: the real provider classes and the real Anthropic SDK error mapping, over mock HTTP.
  Covers valid key, invalid key, timeout, rate limit, malformed JSON, empty answer, truncation, provider unavailable, switching and no key.
* `LIVE_AI_TESTS=1 GEMINI_API_KEY=... ANTHROPIC_API_KEY=... pytest tests/live -v`: real calls. An invalid key was checked live against both
  providers (reported as `auth`). The valid-key calls need your keys and have **not** been run by the authors: run them, and again after
  changing a model name. `gemini-2.5-flash` is sent with thinking switched off so reasoning tokens cannot starve the JSON answer.
* Switch providers with `AI_PROVIDER=gemini|claude|mock` and restart. Integrate Gemini first, validate, then enable Claude.

## Adding a provider

Subclass `AIProvider`, implement `_complete_once` raising `AIProviderError(kind, retryable)`, register it in `build_provider`.
