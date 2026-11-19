# GrowPilot

GrowPilot helps business owners prepare Instagram photo posts and reels, manage products and connections, inspect account performance, and choose evidence-backed content ideas. It is organic-growth first, not an ads or automatic-publication service.

**Start here:** [Architecture diagrams and reading order](docs/diagram/README.md) · [Testing guide](TESTING.md) · [Product principles and roadmap](GOALS.md).

All maintained architecture diagrams and their explanations live exclusively in **[docs/diagram/](docs/diagram/README.md)**. Those pages cover the system, repository, frontend, backend, AI engine, database, integrations, workflow sequences and actual versus proposed deployment. This root guide is for installation and first verification, not a second architecture manual.

## Before You Start

- Use Node **24.11+** to satisfy the current locked Prisma CLI engine range, and npm for the two separate Node packages. There is no root npm workspace/install script.
- Use Python **3.12** or a compatible local interpreter; the engine image uses 3.12 and there is no formal tested support matrix or Python lockfile.
- Start Docker with a Compose version supporting profiles and optional `env_file` entries. Root development services are PostgreSQL 16, Redis 7 and Adminer, with an optional Python service profile.
- Backend media features depend on the imported `ffmpeg-static` platform binary, Cloudinary and appropriate fonts. A system FFmpeg installation alone does not replace that imported path.
- Provider model IDs, Meta permissions, public media URLs and production capacity must be verified for your environment. No paid provider is required for the saved mock-intelligence check below.
- Keep `ENABLE_LIVE_INSTAGRAM_PUBLISH=false`. Generation, feedback and mock fixtures never authorize publication.

## 1. Install Dependencies

From repository root:

```bash
(cd backend && npm ci)
(cd frontend && npm ci)

cd ai-engine
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cd ..
```

For a Python runtime-only installation, use [requirements.txt](ai-engine/requirements.txt) instead. npm dependencies are locked separately in each Node app. Backend `postinstall` synchronizes Prisma tooling skills; it does not migrate the database.

## 2. Configure Local Settings

Create your local settings from these safe templates without overwriting existing files:

- [backend/.env.example](backend/.env.example)
- [frontend/.env.example](frontend/.env.example)
- [ai-engine/.env.example](ai-engine/.env.example)

Actual secret files are not documentation input and must not be committed, printed or shared. `VITE_*` values are compiled into public browser assets; never put keys, database URLs, JWT secrets or the AI service token there.

| Area | Important Settings |
|---|---|
| Backend database/auth | `DATABASE_URL`, `JWT_ACCESS_SECRET`; choose a strong secret and the intended local database |
| Instagram | Default `INSTAGRAM_MODE=mock`; token storage requires `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Live access needs explicit app/redirect/allowlist setup |
| Publishing | Keep `ENABLE_LIVE_INSTAGRAM_PUBLISH=false`; frontend `VITE_FEATURE_PUBLISHING` does not bypass backend gates |
| AI bridge | `AI_ENGINE_ENABLED=true`, internal URL (default host port 8001), and matching service token when configured |
| Python persistence | `STORAGE_BACKEND=postgres`; async-driver URL for the same `growpilot_db`; application memory storage is not allowed |
| Python data/provider | `AI_PROVIDER=mock`, `LOAD_MOCK_DATA=false` for an integrated local account. Dashboard mocks seed themselves separately |
| Browser API | Default `/api`; Vite proxies to localhost:4000 and strips the prefix. Configure backend CORS if frontend origin changes |
| Optional creative/media providers | Claude key/model settings, Cloudinary credentials, optional Gemini image settings; obtain only for features you intend to use |

The host `start:ai` command overrides old memory settings and supplies root development database defaults unless `DATABASE_URL` is exported. Configure Python `SERVICE_TOKEN` to match backend `AI_ENGINE_SERVICE_TOKEN` if service authentication is used. Do not mix the two variable names or use a backend `postgresql://` URL where Python requires `postgresql+asyncpg://`.

Vite's proxy override is read from the process environment: `VITE_API_PROXY_TARGET=http://localhost:4000 npm --prefix frontend run dev`. The only current frontend capability flag is publishing; old `VITE_FEATURE_AI`/`VITE_FEATURE_REELS` switches are not consumed.

## 3. Start Infrastructure And Prepare Schemas

```bash
# Repository root: no Python container without the service profile.
docker compose up -d
docker compose ps
```

The application uses **one database: `growpilot_db`**. Prisma owns `public`; Alembic owns `ai_engine`. Adminer defaults to `http://localhost:8080`, server `postgres` inside Docker. [Database diagrams and inspection](docs/diagram/06-database-architecture.md) explain both schemas and similarly named recommendation tables.

### Backend Schema

This repository uses Prisma 8 RC, not `@prisma/client` plus legacy `migrate dev`. Follow [backend/prisma-8.md](backend/prisma-8.md) and [contributor safety rules](backend/AGENTS.md). Contract emission is separate from applying tables.

```bash
# From backend/, inspect the target/history first:
npx prisma migration status

# Only for a deliberately selected fresh, empty development database:
npx prisma db init
```

`db init` is a bootstrap command, not a verified production replay recipe for every checked-in migration/ref. Do not run it blindly on existing/shared data. For an actual schema change: emit the contract, create/review a migration plan, back up the target, then apply with the installed Prisma 8 workflow. Never use reset, destructive volume removal or legacy db-push recipes to fix setup errors. Fresh-database bootstrap was not executed by this documentation change.

### AI Schema

`npm --prefix backend run start:ai` applies the additive Alembic migrations before starting the host engine. The Docker `service` profile also migrates before Uvicorn. For manual migrations, export the intended async-driver `DATABASE_URL` and run `alembic current` / `alembic upgrade head` from `ai-engine/`. See the [migration contract](ai-engine/docs/POSTGRES_PERSISTENCE.md). Neither tool may reset the other schema.

## 4. Start Applications In Separate Terminals

From repository root, with the prerequisites above complete:

```bash
# Terminal A: NestJS, AI bridge enabled, publication disabled.
AI_ENGINE_ENABLED=true ENABLE_LIVE_INSTAGRAM_PUBLISH=false npm --prefix backend run start:dev
```

```bash
# Terminal B: existing ai-engine/.venv; shared PostgreSQL required.
npm --prefix backend run start:ai
```

```bash
# Terminal C: React/Vite.
npm --prefix frontend run dev
```

Default URLs are frontend `http://localhost:3000`, backend `http://localhost:4000`, nonproduction Swagger `http://localhost:4000/docs`, and private engine docs `http://localhost:8001/docs`. Vite may choose a different port if occupied; adjust allowed origins deliberately rather than starting duplicate servers.

Alternatively use root `docker compose --profile service up -d --build` for the Python container, then start the Node apps separately. **Do not run host and Docker engines on port 8001 together.**

`npm --prefix backend run start:all` is the development convenience for that Docker-engine shape: it first kills listeners on hard-coded ports 4000/3000, tries Docker Desktop startup, builds/starts Compose, then runs the Node apps with the bridge enabled. `stop:all` does not stop containers. Prefer explicit terminals on shared machines and do not treat these scripts as a VPS release manager. See [deployment choices](docs/diagram/09-deployment-architecture.md).

## 5. Verify Without Paid Providers Or Live Instagram

```bash
curl --fail --silent --show-error http://localhost:4000/health
curl --fail --silent --show-error http://localhost:8001/api/v1/health
```

Expect backend database connected and engine `status=ok`, `storage=postgres`. Backend health does not validate Redis, media or providers. The engine has no root `/health` endpoint.

1. Sign up in the local UI and complete onboarding. The disabled seeded QA owner is not a shared demo login.
2. Open **AI Overview**, choose **Mock version**, then fashion, grooming, beauty or cafe.
3. Generate/save an idea, reload and return to the same industry. Saved recommendations and actions should reload from PostgreSQL; generation adds history rather than deleting it.
4. In Adminer choose `growpilot_db`, schema **`ai_engine`**, then `recommendations` or `recommendation_feedback`. `public.recommendations` is a different backend table.
5. Keep live publishing off. No Meta account or paid wording key is needed for this mock flow. Actual uploads, creative content and rendering still need their configured providers/storage.

Detailed success/error paths and safe verification scenarios are in [workflow sequences](docs/diagram/08-workflow-sequences.md) and [TESTING.md](TESTING.md). The separate frontend `/recommendations` page uses local editorial templates, not engine-ranked results.

## 6. Run Appropriate Checks

```bash
# Repository root:
npm --prefix frontend run test:unit
npm --prefix frontend run check:i18n
npm --prefix frontend run build
npm --prefix backend test -- --runInBand --runTestsByPath src/ai-engine/ai-engine.service.spec.ts src/ai-engine/ai-engine.controller.spec.ts
npm --prefix backend run build

# ai-engine/, venv active:
pytest tests/unit tests/integration
ruff check .
```

Builds/formatters can write output; choose checks intentionally. Database-writing/E2E suites require inspected cleanup and disposable storage. Python persistence tests truncate tables: never point `TEST_DATABASE_URL` at `growpilot_db`. The general name guard requires `test`, and one existing downgrade test additionally hard-codes `growpilot_ai_test`. Provision that test database separately; root Compose does not create it.

For fictional CLI demos, use `STORAGE_BACKEND=memory python -m app.demos --demo restaurant` from `ai-engine/`; this runner constructs test settings and must not inherit application database storage. Normal application runs still require PostgreSQL. `--report` and dataset `--write` modify files. The historical report's corrected header currently differs from the generator's exact-output template, so the full quality suite has a known source follow-up. Do not claim all tests pass from this documentation change.

Live engine-provider checks require explicit `LIVE_AI_TESTS=1`, securely exported credentials, and acknowledgement of network/cost. Live Instagram publication is a separate approved operation, not a prerequisite for testing the app.

## Troubleshooting And Limits

| Symptom | Check |
|---|---|
| No AI rows visible | Select `ai_engine`, not `public`, in the same database; create a preview first |
| Engine rejects startup | PostgreSQL is mandatory; check URL/config and migrations, not memory fallback |
| AI Overview unavailable | Bridge flag, engine `/api/v1/health`, matching service token, URL and process-local circuit breaker |
| Live audience section empty | Bridge does not currently import live comments; fictional previews have explicit sample comments |
| OAuth returns to home | Backend redirects to `/connect/instagram`, but React lacks a dedicated callback route; check owned accounts and reopen Settings |
| Port conflict | Stop only a process you own or choose consistent alternate ports; do not blindly kill unrelated listeners |
| Credentials changed but DB login fails | Existing volumes retain initialized PostgreSQL credentials; rotate intentionally, never delete data to fix it |
| Gemini unavailable | Optional poster/reel image work uses original photos; direct editing, required Claude/render/upload and publication failures remain explicit |
| Production readiness | Root Compose is development configuration, not a hardened public VPS deployment; follow the explicitly proposed deployment checklist |

Opportunity scores are rankings, not promises of reach/sales. Sample trends and historical evaluations are not live evidence. Missing metrics stay unknown, not zero. See [engine limitations](ai-engine/docs/KNOWN_LIMITATIONS.md).

## Documentation Map

- [Central architecture index](docs/diagram/README.md): all Mermaid diagrams, source links, verification steps and the rationale for retained/deleted documents.
- [TESTING.md](TESTING.md): detailed local/mock/live verification and troubleshooting.
- [Backend usage](backend/README.md), [frontend usage](frontend/README.md), [engine usage](ai-engine/README.md): service commands and contracts.
- [Engine API](ai-engine/docs/API.md), [Nest integration contract](ai-engine/docs/NESTJS_INTEGRATION.md), [persistence safety](ai-engine/docs/POSTGRES_PERSISTENCE.md): detailed technical contracts.
- [Provider policy](ai-engine/docs/AI_PROVIDERS.md), [algorithm details](ai-engine/docs/RECOMMENDATION_ENGINE.md), [competitor rules](ai-engine/docs/COMPETITOR_INTELLIGENCE.md), [data provenance](ai-engine/docs/REAL_DATA_SOURCES.md), [historical quality](ai-engine/docs/RECOMMENDATION_QUALITY.md): domain/reference material, not parallel architecture manuals.
- [GOALS.md](GOALS.md), [backend/AGENTS.md](backend/AGENTS.md), [Prisma reference](backend/prisma-8.md): principles, contributor safety and version-specific tooling.

### Markdown Audit Register

The 2026-11-19 audit reviewed the then-current 30 repository Markdown files and labelled historical results, planned work and verification limits. Architecture has since been consolidated into [docs/diagram/](docs/diagram/README.md); the root AI overview and engine architecture duplicate were removed after replacement, while operational/domain/safety documents remain. No `docs/architecture/` directory is used.

Documentation is source-backed, not certification of a fresh installation, paid model availability, external Meta configuration, production performance or current calendar transcription. Architecture consolidation changes documentation only; existing application, dependency and migration changes are not reverted or altered.