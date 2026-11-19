# AGENTS.md

## Read first, every session

1. [`../GOALS.md`](../GOALS.md): product goal, non-negotiable rules, schema plan, steps, and **current status**.
2. [`../TESTING.md`](../TESTING.md): how to run and verify everything.

Update the **Current status** section of `GOALS.md` after finishing any change.

## Running the project

- One command, from `backend/`: `npm run start:all`. It frees ports 4000 and 3000, starts Docker if needed,
  builds/starts root Compose with the `service` profile (shared PostgreSQL, Redis, Adminer and Python), then runs frontend and backend watch with `AI_ENGINE_ENABLED=true`. Do not also run a host engine on 8001. `stop:all` frees only 4000/3000 and does not stop containers; use carefully on shared machines.
- Backend `http://localhost:4000` (Swagger at `/docs`); frontend `http://localhost:3000` (proxies `/api` to the backend).
- `.env` is read only at startup: restart after changing it. A second server on port 4000 exits with code 1.
- Schema changes use Prisma 8: `npm run contract:emit`, then `prisma migration plan`, then `prisma db migrate --advance-ref db`.
  Never `prisma migrate dev`; never reset the database.
- One application database: `growpilot_db`. Prisma owns `public`, Alembic owns `ai_engine`. AI persistence is PostgreSQL outside automated tests. `npm run start:ai` applies AI migrations and starts a local engine.
- Never read, print, or quote real `.env` values. Inspect environment examples only. Keep engine/provider secrets out of the frontend.

## Instagram Publishing Safety

Live Instagram publishing must be disabled by default. Never enable it as part
of local setup, fixture seeding, tests, or recommendation generation.

The implemented publisher requires every condition before calling a live API:

- The post is `USER_APPROVED`, or the reel is `APPROVED`, with current reviewable assets. There is no campaign model.
- The user explicitly clicked "Approve and publish".
- The backend environment has `ENABLE_LIVE_INSTAGRAM_PUBLISH=true`.
- The account is server-verified as allowlisted for live testing.
- Approval state is persisted before publication. A dedicated content-hash approval/audit record remains a desired safety requirement, not an implemented table or guaranteed post-approval log event.

TC010's `CONFIRM_LIVE_PUBLISH` is a historical fixture expectation, not a runtime environment gate. The publish DTO requires `confirm=true`. Preserve the
draft on failure. Mock IDs, preview JSON, and test metadata do not
authorize live publishing. Keep expected recommendation outputs separate from
actual engine outputs when using the QA fixtures.

## Photo Studio (sharp)

- In this libvips build sharp's `dilate` and `erode` are swapped, and `joinChannel` with a raw alpha silently drops the alpha. Use `growMask` and `withAlpha` in `src/media/studio/sharp-pipeline.ts`.
- Scratch scripts that import sharp must live inside `backend/` (e.g. `.scratch/`, git-ignored), not in `/tmp`.

## NestJS

The installed manifest/lockfile and existing module patterns are authoritative. https://docs.nestjs.com/llms.txt is an upstream reference, not a list of installed integrations. Current HTTP boot uses Express, `ValidationPipe`, class-validator and class-transformer; storage uses Prisma 8 RC, not Nest's database adapters.

The following links are upstream framework background, not claims that these packages are installed or required by GrowPilot. Verify current compatibility before adding dependencies:

- Databases: [`@nestjs/typeorm`](https://docs.nestjs.com/data/typeorm.md), [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle.md), [`@nestjs/mongoose`](https://docs.nestjs.com/data/mongodb.md), [`@nestjs/sequelize`](https://docs.nestjs.com/data/sequelize.md).
- OpenAPI: [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction.md). GraphQL: [`@nestjs/graphql`](https://docs.nestjs.com/graphql/quick-start.md). WebSockets: [`@nestjs/websockets`](https://docs.nestjs.com/websockets/gateways.md). Microservices: [`@nestjs/microservices`](https://docs.nestjs.com/microservices/basics.md).
- Sign-in: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md). Permissions: [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md). Rate limiting: [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md).
- Configuration: [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md). Caching: [`@nestjs/cache-manager`](https://docs.nestjs.com/data/caching.md). Health checks: [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus.md). Events inside the app: [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events.md).
- Email: [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md). Files, S3 included: [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md). Translations: [`@nestjs/i18n`](https://docs.nestjs.com/application/i18n.md).
- Retries, timeouts and circuit breakers: [`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience.md).
- Idempotency keys: [`@nestjs/idempotency`](https://docs.nestjs.com/reliability/idempotency.md). Transactional outbox: [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md). Sending and receiving webhooks: [`@nestjs/webhooks`](https://docs.nestjs.com/http/webhooks.md).
- Queues: [`@nestjs/bullmq`](https://docs.nestjs.com/application/queues.md). Scheduled jobs: [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling.md).
- Running a scheduled job on one instance, and locks: [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks.md). Processes that take days: [`@nestjs/workflows`](https://docs.nestjs.com/reliability/workflows.md).
- Language models, tools and agents: [`@nestjs/ai`](https://docs.nestjs.com/ai/overview.md). MCP servers: [`@nestjs/mcp`](https://docs.nestjs.com/mcp/overview.md).

GrowPilot DTO validation uses `ValidationPipe` and class-validator decorators; Zod validates AI/design contracts. Do not replace these with an upstream API merely because it appears in a framework example.

The configured adapter is `@nestjs/platform-express`; no performance comparison or alternative adapter deployment is established by this repository.

Use the locked package engine constraints; Node 24.11+ satisfies the current Prisma CLI range. Do not infer the repository's supported runtime solely from a generic Nest migration article.

## Runtime Evidence

The backend uses NestJS Logger and local structured events. There is no `ObserveModule` import, Observe dependency or verified production telemetry integration in the current application.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- Inspect available application logs, health responses and relevant focused tests. Request production evidence from the operator if it is unavailable; never invent telemetry or claim a live system was verified from source alone.
- Prisma skill copies under agent directories are vendor-synced tooling references, not proof GrowPilot uses Composer Cloud. `postinstall` can overwrite them on synchronization.
