# GrowPilot Backend

NestJS 12 / TypeScript API for authentication, businesses, Instagram, products, owned media, content generation, posters, reels and approval-gated publishing. PostgreSQL uses Prisma 8 RC (`@prisma/orm-postgres`), not `@prisma/client`. See the [root setup guide](../README.md), [backend architecture](../docs/diagram/04-backend-architecture.md) and [workflow sequences](../docs/diagram/08-workflow-sequences.md). This service guide retains commands, fixture behavior and safety requirements.

## Project setup

```bash
npm ci
```

Use Node 24.11+ to satisfy the locked Prisma CLI engine range. Configure the names in [.env.example](.env.example), start root Compose for PostgreSQL/Redis/Adminer, and initialize/review the schema before first use. Never commit credentials. Swagger is `/docs` outside production; the API defaults to 4000 with no global `/api` prefix.

`npm run start:ai` applies additive AI migrations and starts a host Python engine on 8001 with PostgreSQL storage. `npm run start:all` kills listeners on 4000/3000, builds/starts root Compose's `service` profile including Python, then starts frontend and backend watch with `AI_ENGINE_ENABLED=true`. Do not run a host engine on 8001 simultaneously. `stop:all` only frees 4000/3000 and does not stop Docker services.

## Database And QA Fixtures

Both services use `growpilot_db`: Prisma owns `public`, Alembic owns `ai_engine`. The 17 backend models are defined in [prisma/schema.prisma](prisma/schema.prisma), with the emitted contract in [prisma/schema.json](prisma/schema.json) and client in [prisma/db.ts](prisma/db.ts). `public.recommendations` is separate from Python's `ai_engine.recommendations`. Do not let either migration tool reset the other's schema. There are no current presence-assessment, lead, business-preferences, campaign or content-hash approval tables.

From the workspace root, seed the local database with:

```bash
NODE_ENV=development ENABLE_TEST_MODE=true ENABLE_LIVE_INSTAGRAM_PUBLISH=false npm --prefix ./backend run seed
```

From this backend directory, use `npm run seed` instead. Keep
`ENABLE_TEST_MODE=true` and `ENABLE_LIVE_INSTAGRAM_PUBLISH=false` in `.env`.
The seed refuses production mode and live-publishing mode. It is transactional
and uses stable IDs: rerunning updates fixture records without duplicating them
or deleting unrelated data.

The original ten documents and their expected recommendations/behaviors are in
[prisma/test-cases.json](prisma/test-cases.json). The seed creates:

- One disabled QA owner (`qa-fixtures@growpilot.test`) with no usable shared password.
- Ten businesses, from Sunday Staples through Collective Test Store.
- Connected-case mock social accounts with no usable Instagram tokens.
- Up to six synthetic Instagram posts per account, with two nullable metric snapshots each. Unknown metrics remain null; TC009 has unavailable metrics and TC001 keeps zero posts.

[prisma/seed.ts](prisma/seed.ts) does not create leads, presence assessments, campaigns or generated recommendations. Expected outputs remain fixture assertions, not actual AI results. The disabled fixture owner has an unknown random password; use signup for an interactive login. No live Instagram API is called by the seed.

Entity relationships are maintained only in the [central database diagrams](../docs/diagram/06-database-architecture.md), covering all backend and AI application tables.

Publishing and the Python recommendation engine are implemented. The publisher requires:

1. A post in `USER_APPROVED`, or a reel in `APPROVED`, with current reviewable assets.
2. An explicit user "Approve and publish" action.
3. `ENABLE_LIVE_INSTAGRAM_PUBLISH=true` in the backend environment.
4. A server-verified allowlist marking the account as allowed for live testing.
5. Persisted approval state before publishing; dedicated content-hash approval rows are not implemented. A separate durable approval audit remains a desired strengthening, not a current guarantee.

TC010's `CONFIRM_LIVE_PUBLISH` is a historical fixture expectation, not a runtime environment gate. Publish DTOs require `confirm=true`; mock/test metadata never authorizes publication. Preserve drafts on failure. Current approval state/timestamps/logs are not a separate campaign or hashed-approval table.

## Modules And Runtime Boundaries

- [AI content](src/ai/README.md): Claude intent, verified-fact generation, edits and conversation context; never publishes.
- [Posters](src/poster/README.md): validated design, Sharp rendering, optional Gemini enhancement and original-photo fallback.
- [AI bridge](src/ai-engine/README.md): authenticated live and persisted mock intelligence; owner-derived profile IDs.
- Instagram media synchronization uses BullMQ/Redis and durable `sync_runs`. Reel generation is in-process, without a current TTS stage or durable reel queue: Claude script, images, FFmpeg and Cloudinary. Interrupted jobs are marked failed on startup.
- Optional Gemini poster/reel image work falls back to original photos. Direct `/media/ai-edit`, required Claude generation, rendering, uploads and publishing still report their own failures.
- Root Compose is development configuration, not a hardened public VPS deployment. `npm run deploy` has no verified configured production target.

## Compile and run the project

```bash
npm run build
npm run start:dev   # development watch; keep publishing disabled
npm run start:prod  # compiled output; provision production configuration explicitly
```

## Checks And Operations

```bash
npm test -- --runInBand
npm run lint
npm run test:cov
```

Use the [testing guide](../TESTING.md) to choose mocked/focused tests before database-writing or E2E suites. `format` writes source files. Root Compose and `start:all` are development tools, not a complete VPS deployment; see the [actual/proposed deployment diagrams](../docs/diagram/09-deployment-architecture.md).

Logs use NestJS Logger and local structured events; there is no configured Observe module. Paid AI/model access, Meta permissions, Cloudinary and production monitoring need operator verification. The backend manifest is private and declares `UNLICENSED`; the framework's upstream license is not a license grant for GrowPilot.
