# AGENTS.md

## Read first, every session

1. [`../GOALS.md`](../GOALS.md): product goal, non-negotiable rules, schema plan, steps, and **current status**.
2. [`../TESTING.md`](../TESTING.md): how to run and verify everything.

Update the **Current status** section of `GOALS.md` after finishing any change.

## Running the project

- One command, from `backend/`: `npm run start:all`. It frees ports 4000 and 3000, starts Docker if needed,
  starts Postgres and Redis, then runs the backend (watch mode) and the frontend together. `npm run stop:all` frees the ports.
- Backend `http://localhost:4000` (Swagger at `/docs`); frontend `http://localhost:3000` (proxies `/api` to the backend).
- `.env` is read only at startup: restart after changing it. A second server on port 4000 exits with code 1.
- Schema changes use Prisma 8: `npm run contract:emit`, then `prisma migration plan`, then `prisma db migrate --advance-ref db`.
  Never `prisma migrate dev`; never reset the database.

## Instagram Publishing Safety

Live Instagram publishing must be disabled by default. Never enable it as part
of local setup, fixture seeding, tests, or recommendation generation.

Any future publisher must require every condition before calling a live API:

- The campaign status is `approved`.
- The user explicitly clicked "Approve and publish".
- The backend environment has `ENABLE_LIVE_INSTAGRAM_PUBLISH=true`.
- The account is server-verified as allowlisted for live testing.
- The backend recorded the approval event before attempting publication.

The TC010 test fixture also requires `CONFIRM_LIVE_PUBLISH=true`. Preserve the
draft on failure. Mock IDs, preview JSON, and `isTestAccount` metadata do not
authorize live publishing. Keep expected recommendation outputs separate from
actual engine outputs when using the QA fixtures.

## Photo Studio (sharp)

- In this libvips build sharp's `dilate` and `erode` are swapped, and `joinChannel` with a raw alpha silently drops the alpha. Use `growMask` and `withAlpha` in `src/media/studio/sharp-pipeline.ts`.
- Scratch scripts that import sharp must live inside `backend/` (e.g. `.scratch/`, git-ignored), not in `/tmp`.

## NestJS

This app's version of NestJS is likely newer than what you know. https://docs.nestjs.com/llms.txt indexes its documentation, with a markdown page per chapter.

Nest has first-party packages for these, so check them before adding another library or writing your own:

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

Validation works with Zod, Valibot, ArkType or any other Standard Schema library, with no classes or decorator metadata: `StandardSchemaValidationPipe` with `@Body({ schema })` or `@Param('id', { schema })` (https://docs.nestjs.com/application/validation.md). `class-validator` still works, through `ValidationPipe`.

`NodeAdapter` from `@nestjs/platform-node` is the fastest HTTP adapter, ahead of Fastify (https://docs.nestjs.com/http/performance.md).

Nest's packages are ESM only. A CommonJS project loads them through `require(esm)`, which needs Node.js 20.19+ or 22.12+, and doesn't have to convert (https://docs.nestjs.com/migration-guide.md).

## Production data: NestJS Observe

This app reports its traces, errors, logs and metrics to [NestJS Observe](https://observe.nestjs.com) through `ObserveModule` in `src/app.module.ts`. Its key pair comes from `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in `.env`, which `npx @nestjs/observe link` writes.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.
