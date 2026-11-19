# AI engine connection (`/ai-insights`)

An optional, additive link to the internal Python AI engine (`../ai-engine`). Full design, security table and error list:
[`ai-engine/docs/NESTJS_INTEGRATION.md`](../../../ai-engine/docs/NESTJS_INTEGRATION.md).

- **Off by default.** `AI_ENGINE_ENABLED=true` turns it on. Off or down, only `/ai-insights/*` answers 503; no other module imports this one.
- **Read-only here.** It reads the business, products and Instagram posts/snapshots; it never writes to GrowPilot tables and adds no migration.
- **Ownership.** The business comes from the verified JWT user. The engine profile id is `biz_<businessId>`; clients never send a business or profile id.
- **Files.** `ai-engine.client.ts` (auth, timeouts, retries for safe calls, circuit breaker, correlation id), `ai-engine.service.ts` (flow and error mapping), `ai-engine.mapper.ts` (our data to the engine's shape; unknown metrics stay null), `ai-engine-source.repository.ts` (reads), `ai-engine.controller.ts`.
- **Run the engine for local testing:** `cd ../ai-engine && SERVICE_TOKEN=dev-token uvicorn app.main:app --port 8001`, then set `AI_ENGINE_ENABLED=true`, `AI_ENGINE_SERVICE_TOKEN=dev-token`.
