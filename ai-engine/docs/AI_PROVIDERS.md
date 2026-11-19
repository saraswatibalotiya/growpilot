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

Keys come from the process environment or configured dotenv file. A selected provider without a key returns **503 `ai_not_configured`** when AI is requested
(the service still starts and runs rule-only).

## Failure policy

| Failure | Behaviour |
|---|---|
| timeout, network, 429, 5xx | Retried up to `AI_MAX_RETRIES` with backoff, then **502** |
| auth, bad request, truncated, empty | Not retried; **502** |
| invalid JSON / wrong shape / wrong ids / over-long text | **502** with code `ai_provider_error` and `error.details.kind` such as `schema_mismatch` or `invalid_json`; recommendations are not saved |

Errors never include prompts, model text or keys. A failure is never replaced with rule-based output labelled as AI. Each
recommendation carries `generation` (provider, model, method, latency, attempts); rule-only output says `rules`.

## Final validation in Python

The model's wording is checked before recommendations are saved (`app/ai/guard.py`). It is rejected (HTTP **502**, code `ai_provider_error`, `error.details.kind=unsafe_content`) if it
adds a number, hashtag, link, or a word like "viral", "trending", "guaranteed" or "proven" that the rule-based draft did not contain.
It must also return exactly the requested ids. Scores, evidence, sources and dates never pass through the model at all.

Failure prevents recommendation-batch persistence, not every earlier write: signal collection may already have stored trend snapshots or audience insights. This wording policy is distinct from optional NestJS Gemini image enhancement, where posters/reels may continue using original photos. Lexical guards are not proof that all factual hallucinations are prevented.

Other failure kinds seen in `error.details.kind`: `auth` (also Gemini's HTTP 400 `API_KEY_INVALID`), `model_not_found`, `truncated`
(Gemini `MAX_TOKENS` or Claude `max_tokens`; raise `AI_MAX_OUTPUT_TOKENS`), `unexpected_response` (for example a safety block).

## Verifying a provider

* `pytest tests/unit/test_ai_provider_scenarios.py`: the real provider classes and the real Anthropic SDK error mapping, over mock HTTP.
  Covers valid key, invalid key, timeout, rate limit, malformed JSON, empty answer, truncation, provider unavailable, switching and no key.
* `LIVE_AI_TESTS=1 pytest tests/live -v` with keys securely exported: opt-in real calls. Earlier notes recorded invalid-key calls against both
  providers (reported as `auth`); this documentation audit did not reverify them or valid-key/model access. Run authorized checks after
  changing a model name. `gemini-2.5-flash` is sent with thinking switched off so reasoning tokens cannot starve the JSON answer.
* Switch providers with `AI_PROVIDER=gemini|claude|mock` and restart. Integrate Gemini first, validate, then enable Claude.

## Adding a provider

Subclass `AIProvider`, implement `_complete_once` raising `AIProviderError(kind, retryable)`, register it in `build_provider`.
