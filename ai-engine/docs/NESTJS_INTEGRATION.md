# NestJS integration

The engine is an **internal service**. The NestJS backend stays the application backend: it owns authentication, Instagram OAuth,
the database and the API the frontend calls. The browser never talks to the engine and never sees its address or token.

```
Frontend --> NestJS (/ai-insights/*, JWT) --> Python engine (/api/v1/*, service token, private network)
```

The NestJS side is the additive module `backend/src/ai-engine/` (see its README). It is **off unless `AI_ENGINE_ENABLED=true`**; with it
off, or with the engine down, only the `/ai-insights/*` routes answer 503 and nothing else in GrowPilot changes.

## Request flow ("Generate recommendations")

1. The frontend calls `POST /ai-insights/recommendations/generate` with its normal access token.
2. NestJS authenticates the user and finds **that user's own business** from the token. No business or profile id is accepted from the client.
3. NestJS reads the business, its products and recent Instagram posts with their latest metric snapshot (read-only).
4. `PUT /api/v1/profiles/biz_<businessId>`: create or refresh the engine's copy of the profile. Idempotent; no id-mapping table and no change to the NestJS database.
5. `POST /api/v1/analytics/analyze` with the posts (`replace: true`), skipped when there are none.
6. `POST /api/v1/recommendations/generate`. The engine scores, ranks, validates and **stores** the result in its own database.
7. NestJS returns the engine's result plus a `context` (`instagramConnected`, `mockAccount`, `postsSent`) so the UI can say when it rests on demo data.

## Endpoint mapping

The paths below are the engine's real routes (the earlier proposal of flat `/feedback` and `/outcomes` paths was not adopted: feedback and
outcomes belong to a recommendation, so they are nested).

| NestJS (JWT) | Engine |
|---|---|
| `GET  /ai-insights/status` | `GET /health` (never fails) |
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
| Retries | Only calls that are safe to repeat (profile sync, analysis with `replace`, reads): up to `AI_ENGINE_MAX_RETRIES` on connection errors, timeouts, 429, 502/503/504. **Generating and feedback are never retried**, so nothing is saved twice. |
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

1. Run the engine with `ENVIRONMENT=production`, `SERVICE_TOKEN=<long random>`, `STORAGE_BACKEND=postgres` on a private network (its own database, never the NestJS one). `alembic upgrade head` first.
2. In `backend/.env`: `AI_ENGINE_ENABLED=true`, `AI_ENGINE_URL=http://<engine host>:8001`, `AI_ENGINE_SERVICE_TOKEN=<same token>`. Restart NestJS.
3. `GET /ai-insights/status` should return `{"enabled": true, "available": true}`.

## Not done

* Comments are not sent (no audience analysis from NestJS yet) and competitor data is not fed from NestJS.
* The frontend has no UI for any of this.
* The rate limit and circuit breaker are per process.
