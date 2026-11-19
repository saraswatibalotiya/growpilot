# NestJS integration

The engine is an **internal service**. The NestJS backend stays the application backend: it owns authentication, Instagram OAuth,
the database and the API the frontend calls. The browser never talks to the engine and never sees its address or token.

The system boundary and sequence diagrams live exclusively in [system architecture](../../docs/diagram/01-system-architecture.md) and [workflow sequences](../../docs/diagram/08-workflow-sequences.md). This document retains the endpoint/security/error contract.

The NestJS side is the additive module `backend/src/ai-engine/` (see its README). It is **off unless `AI_ENGINE_ENABLED=true`**; with it
off, or with the engine down, intelligence operations fail without disabling unrelated product routes. Authenticated `/ai-insights/status` returns `{enabled, available}` rather than throwing for disabled/down state. `start:all` explicitly enables the bridge for local development.

## Request flow ("Generate recommendations")

See [live recommendation sequence](../../docs/diagram/08-workflow-sequences.md#4-generate-live-recommendations) for the source-verified request order and save/error branches. The browser never supplies a business/profile ID. The response includes `context` (`instagramConnected`, `mockAccount`, `postsSent`) to disclose input provenance.

## Endpoint mapping

The paths below are the engine's real routes (the earlier proposal of flat `/feedback` and `/outcomes` paths was not adopted: feedback and
outcomes belong to a recommendation, so they are nested).

Engine column paths below are relative to `/api/v1`; the client prepends that prefix. Thus health is `/api/v1/health`, not `/health` on the server root.

| NestJS (JWT) | Engine |
|---|---|
| `GET  /ai-insights/status` | `GET /health`; can fail, converted into `available:false` |
| `POST /ai-insights/mock/overview` | `POST /profiles/mock_<businessId>_<industry>/preview` |
| `POST /ai-insights/mock/recommendations/:id/feedback` | `POST /recommendations/{id}/feedback`, scoped to the derived mock profile |
| `POST /ai-insights/analysis` | `PUT /profiles/{id}`, `POST /analytics/analyze` |
| `GET  /ai-insights/audience` | `GET /audience/insights` |
| `GET  /ai-insights/competitors` | `GET /competitors` |
| `GET  /ai-insights/trends` | `POST /trends/analyze` |
| `POST /ai-insights/recommendations/generate` | `POST /analytics/analyze`, `POST /recommendations/generate` |
| `GET  /ai-insights/recommendations` | `GET /recommendations` |
| `POST /ai-insights/recommendations/:id/feedback` | `POST /recommendations/{id}/feedback` |
| `POST /ai-insights/recommendations/:id/outcomes` | `POST /recommendations/{id}/outcomes` |
| `GET  /ai-insights/learning` | `GET /learning` |

Audience insights need comments; NestJS does not sync comments yet, so `/ai-insights/audience` returns what the engine has (usually 404/409).

## Security

| Control | Where |
|---|---|
| Service-to-service auth | Engine requires `Authorization: Bearer <SERVICE_TOKEN>` (mandatory in production; it refuses to start without one). NestJS sends `AI_ENGINE_SERVICE_TOKEN`. |
| Internal network only | Do not publish the engine's port. `docker-compose.yml` (profile `service`) binds it to `127.0.0.1`. NestJS reaches it through `AI_ENGINE_URL`. |
| Ownership | The profile id is derived from the authenticated user's business (`biz_<id>`). A recommendation id sent by a client is only ever used together with that derived profile id; the engine answers 404 for another profile's records. |
| Validation | NestJS DTOs (whitelist, no unknown fields) and the engine's pydantic models. Recommendation ids in URLs are checked against `[A-Za-z0-9_-]{1,64}`. |
| Timeouts | `AI_ENGINE_TIMEOUT_MS` (15 s), `AI_ENGINE_GENERATE_TIMEOUT_MS` (60 s, AI wording can be slow). |
| Retries | Safe/idempotent calls retry up to `AI_ENGINE_MAX_RETRIES`. Generation, mock overview and feedback are not automatically retried. This reduces duplicate side effects but does not provide request-idempotency or prevent repeated user submissions. |
| Circuit breaker | After `AI_ENGINE_BREAKER_THRESHOLD` consecutive connection failures calls fail fast for `AI_ENGINE_BREAKER_COOLDOWN_MS`. |
| Correlation ids | NestJS sends `X-Request-ID` (a safe incoming one is reused); the engine logs it and returns it in `meta.request_id`. |
| Rate limiting | NestJS: the existing global throttler. Engine: `RATE_LIMIT_PER_MINUTE` (default 300) per caller, `429` with `Retry-After`. |
| No leaks | NestJS answers 503 `AI_ENGINE_UNAVAILABLE` / `AI_ENGINE_DISABLED` with generic text; engine addresses, tokens and bodies are never returned or logged. Redirects are refused so the token cannot be forwarded. |

## Errors seen by the frontend

| Status / code | Meaning |
|---|---|
| 503 `AI_ENGINE_DISABLED` | Feature flag off |
| 503 `AI_ENGINE_UNAVAILABLE` | Engine down, slow, or misconfigured (details are in the server log only) |
| 404 | No business profile yet, or the record is not this business's |
| 409 `AI_NEEDS_MORE_DATA` / `AI_NO_POSTS` | Not enough Instagram data yet |
| 502 `AI_WORDING_FAILED` | Only when `useAi: true`: the AI provider failed. Retry later or generate without AI wording. It is never replaced with rule-based text labelled as AI |

## Turning it on

1. Use the same `growpilot_db` with engine tables restricted to `ai_engine`; Prisma owns `public`. Export the async-driver `DATABASE_URL`, apply Alembic migrations, and configure `ENVIRONMENT=production` plus `SERVICE_TOKEN` on a private deployment. Root Compose is development configuration and does not force production/authentication.
2. In `backend/.env`: `AI_ENGINE_ENABLED=true`, `AI_ENGINE_URL=http://<engine host>:8001`, `AI_ENGINE_SERVICE_TOKEN=<same token>`. Restart NestJS.
3. `GET /ai-insights/status` should return `{"enabled": true, "available": true}`.

## Not done

* Comments are not sent (no audience analysis from NestJS yet) and competitor data is not fed from NestJS.
* The AI Overview frontend exists with always-visible navigation and live/mock selectors. Live sections load independently; saved mock sections load together, preserve feedback, and retain prior recommendation batches. Dedicated full-history, competitor and learning screens are not implemented.
* The rate limit and circuit breaker are per process.

## Saved Mock Ownership

`POST /ai-insights/mock/overview` accepts `industry` and optional `regenerate`; the business/profile ID is never a browser field. Each of four industries gets `mock_<businessId>_<industry>`, separate from `biz_<businessId>` live data. The engine seeds fictional inputs, computes real rule-based analyses, and persists the recommendations and feedback. Mock provenance remains labelled and never authorizes publication. The frontend shows persistence failures instead of local fallback results.
