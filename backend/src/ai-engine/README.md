# AI engine connection (`/ai-insights`)

An optional bridge to the internal [Python AI engine](../../../ai-engine/README.md). Full design, security table and error list:
[`ai-engine/docs/NESTJS_INTEGRATION.md`](../../../ai-engine/docs/NESTJS_INTEGRATION.md).

- **Off by default.** `AI_ENGINE_ENABLED=true` turns it on; `start:all` sets it for local development. Disabled/down intelligence operations fail without disabling unrelated app features. Authenticated `/ai-insights/status` returns `{enabled, available}` rather than throwing for those conditions.
- **Shared database, separate ownership.** It reads the business, products and Instagram posts/snapshots from `public`. The engine persists results in `growpilot_db.ai_engine`, managed by Alembic, never Prisma.
- **Ownership.** The business comes from the verified JWT user. The engine profile id is `biz_<businessId>`; clients never send a business or profile id.
- **Files.** `ai-engine.client.ts` (auth, timeouts, retries for safe calls, circuit breaker, correlation id), `ai-engine.service.ts` (flow and error mapping), `ai-engine.mapper.ts` (our data to the engine's shape; unknown metrics stay null), `ai-engine-source.repository.ts` (reads), `ai-engine.controller.ts`.
- **Saved mock previews.** `POST /ai-insights/mock/overview` accepts `industry` and optional `regenerate`; mock feedback uses `POST /ai-insights/mock/recommendations/:id/feedback`. Profiles are derived as `mock_<businessId>_<industry>` and never mixed with live recommendations. No client-supplied business/profile ID is accepted.
- **Run the engine locally:** `npm run start:ai` applies additive migrations and starts PostgreSQL-backed storage. Configure `SERVICE_TOKEN` to match `AI_ENGINE_SERVICE_TOKEN` when using service authentication. `npm run start:all` also starts the engine through root Compose.
