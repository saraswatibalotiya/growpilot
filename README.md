# GrowPilot

GrowPilot is an Instagram-focused workspace for small businesses and creators: manage a business profile and products, prepare photo posts and reels, connect Instagram, inspect performance, and choose evidence-backed content ideas. The product is **organic-growth first**; it is not an advertising or automatic-growth service.

The repository contains three independently configured applications:

1. A **React/Vite frontend** for the owner-facing workspace.
2. A **NestJS backend**, which owns authentication, business data, Instagram access, media processing, generation, and publishing.
3. A **Python/FastAPI AI engine**, which computes content intelligence and ranked recommendations. An optional NestJS bridge calls it over internal HTTP.

> **Safety and implementation status**
>
> - Live publishing is disabled by default and requires explicit approval and server-side gates. Never enable it merely to test setup.
> - The Python engine defaults to in-memory storage, fictional trend/demo data, and a mock wording provider. These defaults are for development, not evidence of real-world intelligence.
> - Gemini/Claude in the Python engine polish wording only. Python computes scores, evidence, dates, and ranking. The NestJS content-generation service is a separate AI integration with a different responsibility.
> - The AI Overview UI exists, but the backend bridge defaults to disabled.
> - Some older documents describe previous milestones. Where they conflict with the source, this guide documents the implementation inspected on **2026-11-18**. External credentials, provider entitlements, deployment, and live account permissions require operator setup.

## Table of contents

- [Project overview and feature status](#project-overview-and-feature-status)
- [Architecture and communication](#architecture-and-communication)
- [Repository map and important files](#repository-map-and-important-files)
- [Prerequisites](#prerequisites)
- [Dependency inventory](#dependency-inventory)
- [Environment and configuration reference](#environment-and-configuration-reference)
- [Database architecture](#database-architecture)
- [Backend architecture and API reference](#backend-architecture-and-api-reference)
- [Third-party integrations](#third-party-integrations)
- [Independent Python AI engine](#independent-python-ai-engine)
- [Frontend architecture](#frontend-architecture)
- [Local setup from a fresh clone](#local-setup-from-a-fresh-clone)
- [Run commands and startup order](#run-commands-and-startup-order)
- [Tests and code quality](#tests-and-code-quality)
- [Troubleshooting](#troubleshooting)
- [Production deployment](#production-deployment)
- [Developer workflow](#developer-workflow)
- [Architectural decisions and known limitations](#architectural-decisions-and-known-limitations)
- [Documentation and verification notes](#documentation-and-verification-notes)

## Project overview and feature status

The main users are owner-operated retailers, restaurants, service businesses, and content creators who need help turning their own products and Instagram performance into the next useful post.

| Capability | Implementation / boundary |
|---|---|
| Account access | Signup, login, JWT access tokens, rotating refresh tokens, and business-scoped data access in NestJS |
| Business workspace | Business onboarding/profile, products, conversations, and owned media |
| Instagram integration | Mock and live modes, OAuth, account connection, media synchronization, and metric snapshots |
| Content creation | AI-assisted captions and structured post content, poster creation, photo enhancement, and reel composition |
| Publishing | Explicit approval flow; server-side flag, account restrictions, and mock/live checks remain authoritative |
| AI Overview | Account-health indicators, top content, audience insights, trends, recommendations, and feedback through the NestJS bridge |
| Recommendation intelligence | Deterministic analytics, audience/competitor signals, trend freshness, festival relevance, opportunity/confidence scores, and bounded feedback learning |
| Real wording providers | Gemini REST and Anthropic SDK adapters in Python; mock mode needs no key |
| Real trends | **Requires manual setup:** import a permitted, sourced JSON dataset. No live search-interest/social feed is implemented |
| Festival dates | Fixed-date rules, a curated source-backed 2027 DoPT calendar, an operator calendar, and optional approximate samples |
| Annual festival refresh | **Not implemented:** the refresh module and workflow currently contain no executable implementation |
| Payments, ads, automated boosting | **Not implemented** |

This software does not guarantee followers, reach, sales, or model correctness. A recommendation's opportunity score is a relative ranking signal, not a forecast.

## Architecture and communication

```text
Browser: React/Vite (:3000)
  |
  | application HTTP API + user access token / refresh flow
  v
NestJS primary backend (:4000)
  |-- PostgreSQL primary application database (:5432)
  |-- Redis / BullMQ (:6379) for background work
  |-- Instagram / Meta APIs
  |-- Cloudinary media storage
  |-- NestJS AI/content, image and video integrations
  |
  | optional /ai-insights bridge
  | service token + request ID; authenticated business mapped to biz_<businessId>
  v
FastAPI AI engine (:8001, INTERNAL)
  |-- profile-scoped services
  |-- pure analytics / scoring / diversity / learning
  |-- optional Gemini / Claude wording polish
  |-- sourced files + explicitly labelled sample data
  `-- memory OR separate AI PostgreSQL (:5433 locally; ai_engine schema)

Adminer (:8080) -> primary development PostgreSQL
```

Ports above are development defaults, not separate public endpoints to expose in production.

### Why two backend services?

NestJS remains the system of record for users, businesses, Instagram authorization, and publishing. Python owns analytical computations and AI-specific persistence. The engine does not import NestJS code, receive Instagram OAuth credentials, or connect to the primary database. The shared service-authentication secret is only for the internal HTTP boundary.

Do not confuse the two AI implementations:

| Component | Purpose | Important path |
|---|---|---|
| NestJS AI module | Generate application content and creative drafts | [backend/src/ai/](backend/src/ai/) |
| NestJS AI-engine bridge | Authenticate the owner, map source data, call Python | [backend/src/ai-engine/](backend/src/ai-engine/) |
| Python AI engine | Analyze evidence and generate ranked recommendations; optionally polish wording | [ai-engine/app/](ai-engine/app/) |

### Generate-recommendations request

1. The browser sends `POST /ai-insights/recommendations/generate` to NestJS with the user's access token.
2. NestJS resolves the authenticated user's business. The client does not choose an engine profile ID.
3. The bridge reads the business, products, and recent Instagram posts/metric snapshots.
4. It synchronizes `biz_<businessId>` with Python using idempotent `PUT /api/v1/profiles/{profile_id}`.
5. If posts exist, it sends `POST /api/v1/analytics/analyze` with replacement semantics.
6. Python collects available signals, creates candidates, scores/ranks them, applies diversity rules, and builds explanations.
7. If `useAi` was requested at the NestJS boundary, Python's `use_ai` path polishes only title, hook, caption direction, and CTA.
8. Python validates the wording and stores the recommendation batch. Failed wording does not save a successful-looking rule-only batch.
9. NestJS returns the result and context describing Instagram connection, mock account status, and posts sent.

Generating ideas does **not** approve or publish a post. Feedback/outcomes in Python do not invoke the NestJS publishing flow.

## Repository map and important files

This is the maintained source/configuration map. Dependencies, caches, virtual environments, build output, and generated locale/data repetitions are intentionally grouped rather than printed file-by-file.

```text
growpilot/
├── README.md                     Cross-project setup and architecture (this guide)
├── GOALS.md                      Product principles and historical milestone notes
├── TESTING.md                    Earlier manual Instagram testing walkthrough
├── ai-engine.md                  Earlier architecture discussion/transcript
├── docker-compose.yml            Primary PostgreSQL, Redis, Adminer (not app containers)
├── .github/workflows/            Automation; festival workflow is currently an empty stub
├── backend/
│   ├── src/                      NestJS modules, controllers, services, repositories, jobs
│   ├── prisma/                   Prisma 8 TypeScript schema/configuration and emitted contract
│   ├── migrations/               Prisma 8 migration history, snapshots and refs
│   ├── scripts/                  Local orchestration and supporting scripts
│   ├── test/                     End-to-end test configuration/tests
│   ├── voices/                   Legacy/local voice assets (ignored; not current reel pipeline)
│   ├── .env.example              Safe backend configuration template
│   └── package.json / package-lock.json
├── frontend/
│   ├── src/                      React entry, routes, pages, hooks, UI, services, translations
│   ├── public/                   Static browser assets
│   ├── scripts/                  Locale checks and development helpers
│   ├── tests/                    Focused frontend logic tests
│   ├── .env.example              Safe browser configuration template
│   └── package.json / package-lock.json
└── ai-engine/
    ├── app/                      FastAPI application and intelligence implementation
    ├── alembic/                  AI-only PostgreSQL migrations
    ├── docker/initdb/            Empty AI test database initialization
    ├── docs/                     Engine contracts, design, quality reports and limitations
    ├── tests/                    Unit, HTTP, quality, persistence and opt-in live tests
    ├── .env.example              Independent Python configuration
    ├── Dockerfile                Python 3.12 image, non-root runtime, port 8001
    ├── docker-compose.yml        AI-only database and optional engine service
    ├── requirements.txt          Runtime dependency lower bounds (no Python lockfile)
    ├── requirements-dev.txt      Runtime + test/lint dependencies
    ├── pytest.ini / ruff.toml    Test and lint configuration
    └── alembic.ini               Migration configuration
```

### Cross-project files

| Path | Purpose / connection | When needed |
|---|---|---|
| [docker-compose.yml](docker-compose.yml) | Local shared infrastructure for NestJS; creates persistent PostgreSQL/Redis volumes | Development; not a production deployment |
| [GOALS.md](GOALS.md) | Organic-growth and human-approval principles; contains planned and historical work, not a current API contract | Development/design |
| [TESTING.md](TESTING.md) | Older manual smoke-test notes; some frontend/publishing claims are stale | Supplemental reference |
| [ai-engine.md](ai-engine.md) | Historical discussion, including tool transcript fragments; not executable setup | Background reference |
| [.gitignore](.gitignore) | Excludes credentials, dependency folders, builds, caches and voice-model assets | Both |
| [.github/workflows/refresh-festivals.yml](.github/workflows/refresh-festivals.yml) | Empty placeholder; does not schedule an annual run | No active runtime role |

For service-level maps, see [Backend architecture](#backend-architecture-and-api-reference), [Python AI engine](#independent-python-ai-engine), and [Frontend architecture](#frontend-architecture).

## Prerequisites

| Tool / service | Required version or constraint | Used by / requirement |
|---|---|---|
| Git | No repository-specific minimum | Clone and contribution workflow |
| Node.js | Use **Node 24.11+ LTS**; see package constraints below | Both Node applications; direct TypeScript frontend tests also need Node type-stripping support |
| npm | Use the npm supplied with your supported Node installation; no repository-pinned npm version | Separate `npm ci` in each Node app; no root npm workspace |
| Python | Docker uses **3.12**; Ruff targets `py312`. Existing local inspection used **3.14.7**; no formal tested support range is declared | Independent AI engine |
| Docker + Compose v2 | No pinned Docker version | Recommended local PostgreSQL/Redis/Adminer and optional AI container |
| PostgreSQL | Compose uses **16** | Primary database; separate AI database if persistence is enabled |
| Redis | Compose uses **7** | Backend queues/workers |
| FFmpeg | Backend dependency `ffmpeg-static` supplies the binary | Reel rendering/probing imports that path directly; no separate system FFmpeg/ffprobe requirement |
| Provider accounts | See [integrations](#third-party-integrations) | Only for selected paid/live features |

Locked Vite/React-plugin/oxlint packages declare Node `^20.19.0 || >=22.12.0`; that range alone does not ensure the frontend's direct `.ts` test command works on an older Node release. Use one supported modern Node version for both applications. See [dependency inventory](#dependency-inventory) for Prisma/NestJS constraints and versions. Do not assume the initial project's earlier setup documents describe the current Prisma CLI.

The locked Prisma CLI requires **`^22.18.0 || ^24.11.0 || >=26.0.0`**. There is no root `engines` declaration enforcing a single repository runtime; Node 24.11+ satisfies both applications' listed package-engine constraints.

## Dependency inventory

Tables list **directly declared** packages, including development packages. npm versions are resolved from each application's committed lockfile, not a claim that the current machine or production has been freshly installed. Transitive packages remain recorded in those lockfiles; they are not extra application dependencies to install by hand.

### Backend packages

Sources: [backend/package.json](backend/package.json), [backend/package-lock.json](backend/package-lock.json). Versions below are lock-resolved. Essential means required by the current application/build path; an optional feature dependency can still be installed unconditionally.

| Runtime package | Resolved version | Use / importance |
|---|---|---|
| `@anthropic-ai/sdk` | `1.8.0` | Claude content/intent/editing client; feature-dependent |
| `@nestjs/common` | `12.5.0` | Framework decorators/services; essential |
| `@nestjs/config` | `12.1.1` | Environment configuration; essential |
| `@nestjs/core` | `12.5.0` | Application container/lifecycle; essential |
| `@nestjs/jwt` | `12.0.4` | Access-token signing/verification; essential |
| `@nestjs/platform-express` | `12.5.0` | HTTP adapter; essential |
| `@nestjs/swagger` | `12.1.2` | Nonproduction OpenAPI UI; developer-facing |
| `@nestjs/throttler` | `6.7.1` | Global/endpoint rate limiting; essential |
| `@prisma/orm-postgres` | `8.0.0-rc.23` | Primary PostgreSQL ORM; essential |
| `bcrypt` | `6.0.0` | Password hashing; essential |
| `bullmq` | `6.7.6` | Instagram background synchronization; Redis required for worker |
| `class-transformer` | `0.5.1` | DTO transformation; essential |
| `class-validator` | `0.15.1` | Request validation; essential |
| `dotenv` | `18.0.10` | Environment loading |
| `ffmpeg-static` | `5.3.0` | Bundled FFmpeg binary support; media feature-dependent |
| `helmet` | `8.3.0` | HTTP security headers |
| `ioredis` | `6.0.0` | Redis queue/OAuth nonce client |
| `reflect-metadata` | `0.2.2` | Decorator metadata; framework essential |
| `rxjs` | `7.8.2` | Framework reactive primitives |
| `sharp` | `0.34.5` | Image processing, studio/templates; media essential |
| `uuid` | `14.0.3` | UUID utilities |
| `zod` | `4.6.7` | Runtime schemas/AI output validation |

| Development package | Resolved version | Use / importance |
|---|---|---|
| `@nestjs/cli` | `12.0.12` | Build/start/deploy CLI |
| `@nestjs/mau` | `0.2.9` | Declared Nest tooling; active use not established |
| `@nestjs/schematics` | `12.0.13` | Module/code scaffolding |
| `@nestjs/testing` | `12.5.0` | Nest test helpers |
| `@prisma/cli-engine` | `0.9.0` | Prisma TypeScript config/CLI |
| `@types/bcrypt` | `6.0.0` | Password-library types |
| `@types/express` | `5.0.6` | HTTP adapter types |
| `@types/jest` | `30.0.0` | Test types |
| `@types/node` | `24.19.2` | Node API types |
| `@types/supertest` | `7.2.1` | HTTP test types |
| `jest` | `30.5.2` | Unit/test runner |
| `oxlint` | `1.93.0` | Linting |
| `oxlint-tsgolint` | `7.0.2007` | Type-aware linting |
| `prettier` | `3.10.1` | Formatting |
| `prisma` | `8.0.0-rc.33` | Contract and migration CLI; **not legacy Prisma migrate workflow** |
| `source-map-support` | `0.5.21` | Source-mapped errors |
| `supertest` | `7.3.2` | HTTP tests |
| `ts-jest` | `29.4.15` | TypeScript Jest transformation |
| `ts-loader` | `9.6.2` | TypeScript build loader |
| `ts-node` | `10.9.2` | TypeScript seed/scripts |
| `tsconfig-paths` | `4.2.0` | TypeScript path resolution |
| `typescript` | `6.0.3` | Backend compiler (separate from frontend TypeScript 7) |

Logging uses the application/framework logging paths; there is no configured Observe module/dependency despite older developer notes mentioning it. Redis, PostgreSQL, Cloudinary and Meta are external services, not extra packages to add to these manifests.

### Frontend packages

Sources: [frontend/package.json](frontend/package.json), [frontend/package-lock.json](frontend/package-lock.json).

| Package | Declared | Lock-resolved | Class | Use / importance |
|---|---|---|---|---|
| `react` | `^19.3.1` | `19.3.1` | Runtime | Components, hooks and contexts; essential |
| `react-dom` | `^19.3.1` | `19.3.1` | Runtime | Browser root renderer; essential |
| `react-router-dom` | `^7.18.5` | `7.18.5` | Runtime | SPA routing/navigation; essential |
| `@types/node` | `^24.19.2` | `24.19.2` | Dev | Node/Vite configuration types |
| `@types/react` | `^19.3.0` | `19.3.0` | Dev | React TypeScript types |
| `@types/react-dom` | `^19.3.0` | `19.3.0` | Dev | Renderer TypeScript types |
| `@vitejs/plugin-react` | `^6.1.2` | `6.3.0` | Dev | React integration with Vite |
| `typescript` | `~7.0.2` | `7.0.2` | Dev | `tsc -b` build/type checking |
| `vite` | `^8.3.6` | `8.3.8` | Dev | Development server, bundler and preview |
| `oxlint` | `^1.90.0` | `1.93.0` | Dev | Optional lint quality command |

There is no installed Redux, Zustand, React Query, Axios, Tailwind, or component-library dependency in this frontend manifest. Fetch, React state/context, custom UI components, and CSS perform those jobs.

### Python engine packages

Sources: [requirements.txt](ai-engine/requirements.txt), [requirements-dev.txt](ai-engine/requirements-dev.txt). **No Python lockfile exists.** The third column is a snapshot of the existing local virtual environment inspected for this documentation; a new install may resolve differently.

| Package | Declared lower bound | Observed version | Class | Use / importance |
|---|---|---|---|---|
| `fastapi` | `>=0.115` | `0.163.1` | Runtime | HTTP routes, dependency injection, OpenAPI; essential |
| `uvicorn[standard]` | `>=0.30` | `0.54.0` | Runtime | ASGI server; essential |
| `pydantic` | `>=2.8` | `2.14.3` | Runtime | Request/response/domain contracts; essential |
| `pydantic-settings` | `>=2.4` | `2.16.3` | Runtime | Environment validation; essential |
| `httpx` | `>=0.27` | `0.28.1` | Runtime | Gemini HTTP client; also HTTP tests |
| `anthropic` | `>=0.50` | `2.9.0` | Runtime | Optional Claude execution path; installed by standard requirements |
| `sqlalchemy[asyncio]` | `>=2.0` | `2.1.9` | Runtime | Optional PostgreSQL execution path; installed by standard requirements |
| `asyncpg` | `>=0.29` | `0.32.0` | Runtime | Async PostgreSQL driver |
| `alembic` | `>=1.13` | `1.20.1` | Runtime tooling | AI schema migrations |
| `pytest` | `>=8.2` | `9.2.0` | Dev | Test runner |
| `pytest-asyncio` | `>=0.23` | `1.5.0` | Dev | Async tests |
| `ruff` | `>=0.6` | `0.17.5` | Dev | Linting |

The engine does not require PyTorch, TensorFlow, a GPU, embeddings, a vector database, the Google Python SDK, or a PDF parser. The historical manual calendar extraction helper is not a maintained runtime dependency.

## Environment and configuration reference

Use the three service-specific examples:

- [backend/.env.example](backend/.env.example)
- [frontend/.env.example](frontend/.env.example)
- [ai-engine/.env.example](ai-engine/.env.example)

Do not create a shared root secrets file and assume every application loads it. Keep actual environment files out of Git. Use a secret manager in production. Every `VITE_*` value is public after compilation: **never put API keys, JWT secrets, Instagram credentials, database URLs, or the AI service token in the frontend**.

### Backend environment

[main.ts](backend/src/main.ts), [app.module.ts](backend/src/app.module.ts), and feature configuration readers consume these values. `ConfigModule.forRoot()` loads backend dotenv configuration; development/start scripts also pass `.env` to the Nest CLI. Exported production values should come from a secret manager.

**Required** below means needed for the named feature, not necessarily eagerly validated on process startup. Provider model defaults are repository strings, not confirmation of current vendor availability.

| Name | Default / example | Purpose / requirement |
|---|---|---|
| `DATABASE_URL` | `postgresql://<user>:<password>@localhost:5432/growpilot_db` | Required primary PostgreSQL connection |
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | No explicit default; use `development` locally | `production` hides Swagger and refuses fixtures; `test` disables sync worker |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins; credentials enabled |
| `JWT_ACCESS_SECRET` | `<at-least-32-random-bytes>` | Required for access-token auth; generate securely |
| `JWT_SECRET` | No default | Legacy fallback only if preferred access secret is null/undefined; do not set both routinely |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Allowed 60-3600 seconds |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` | Allowed 3600-7776000 seconds |
| `INSTAGRAM_MODE` | `mock` | Only exact `live` selects live Meta requests |
| `INSTAGRAM_APP_ID` | Empty | Live OAuth app ID from Meta developer app |
| `INSTAGRAM_APP_SECRET` | Empty | Server-only Meta developer app secret |
| `INSTAGRAM_REDIRECT_URI` | Example: `http://localhost:4000/integrations/instagram/callback` | Required live OAuth callback; must match app configuration exactly |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Unset | Compatibility fallbacks for corresponding `INSTAGRAM_*` values |
| `INSTAGRAM_LOGIN_CONFIG_ID` | Unset | Optional Facebook Login flow selection; otherwise Instagram Login |
| `INSTAGRAM_GRAPH_VERSION` | `v23.0` | Meta API version; verify permissions/version support before upgrading |
| `INSTAGRAM_LIVE_ALLOWLIST` | Empty | Comma-separated permitted live identities |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | `<base64-32-byte-key>` | Required for stored-token encryption; generate with `openssl rand -base64 32` |
| `FRONTEND_URL` | Example: `http://localhost:3000` | OAuth result redirect; absent value uses backend result display |
| `ENABLE_TEST_MODE` | Off unless `true` | Test-only dashboard-token connection/fixture safety; keep false normally |
| `ENABLE_LIVE_INSTAGRAM_PUBLISH` | Off unless `true` | Explicit backend publishing gate; keep false during setup |
| `REDIS_HOST` | `localhost` | Queue and OAuth nonce storage |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | Unset | Redis credential if configured |
| `INSTAGRAM_SYNC_WORKER` | On unless `false`; off in tests | API process also consumes sync jobs unless disabled |
| `INSTAGRAM_SYNC_MAX_PAGES` | `20` | Media pages per run |
| `INSTAGRAM_SYNC_INSIGHTS_LIMIT` | `25` | Posts receiving insight requests per run |
| `INSTAGRAM_SYNC_REQUEST_DELAY_MS` | `250` | Delay between per-post insight requests |
| `ANTHROPIC_API_KEY` | Empty | Required for NestJS Claude features; obtain from Anthropic Console |
| `CLAUDE_SONNET_MODEL` | `claude-sonnet-5` | Content/editing/photo analysis; verify accessible model |
| `CLAUDE_HAIKU_MODEL` | `claude-haiku-4-5-20251001` | Intent/extraction/edit planning/summaries |
| `AI_HAIKU_TIMEOUT_MS` | `20000` | Small-model timeout |
| `AI_SONNET_TIMEOUT_MS` | `60000` | Content-model timeout |
| `AI_MAX_RETRIES` | `2` | NestJS AI retry configuration; separate process from Python's same-named setting |
| `AI_TRUSTED_IMAGE_HOSTS` | `res.cloudinary.com` | AI image input host allowlist; business upload/path checks additionally apply |
| `CLOUDINARY_CLOUD_NAME` | Empty | Required for Cloudinary uploads/storage; account dashboard |
| `CLOUDINARY_API_KEY` | Empty | Required for Cloudinary operations; server configuration |
| `CLOUDINARY_API_SECRET` | Empty | Required server-only Cloudinary secret |
| `GEMINI_API_KEY` | Empty / disabled | Optional NestJS image generation/enhancement; separate from Python wording config |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-lite-image` | Standard image model; verify account/model availability |
| `GEMINI_IMAGE_PREMIUM_MODEL` | `gemini-3.1-flash-image` | Premium image model; verify availability |
| `GEMINI_TIMEOUT_MS` | `90000` | Image-provider timeout |
| `GEMINI_DAILY_LIMIT_PER_BUSINESS` | `10` | Per UTC day; failed/rejected attempts count; 0 disables |
| `GEMINI_COST_PER_IMAGE_USD` | `0.02` | Estimated tracked cost, not verified vendor billing |
| `GEMINI_PREMIUM_COST_PER_IMAGE_USD` | `0.04` | Estimated premium cost |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Optional trusted provider endpoint override |
| `AI_ENGINE_ENABLED` | Off unless `true` | Additive Python bridge feature switch |
| `AI_ENGINE_URL` | `http://127.0.0.1:8001` | Server-to-server engine base URL; invalid config falls back to default |
| `AI_ENGINE_SERVICE_TOKEN` | Empty | Match Python `SERVICE_TOKEN`; mandatory there in production |
| `AI_ENGINE_TIMEOUT_MS` | `15000` | Ordinary bridge timeout |
| `AI_ENGINE_GENERATE_TIMEOUT_MS` | `60000` | Generation timeout |
| `AI_ENGINE_MAX_RETRIES` | `2` | Safe/idempotent calls only |
| `AI_ENGINE_BREAKER_THRESHOLD` | `5` | Failure threshold for process-local circuit breaker |
| `AI_ENGINE_BREAKER_COOLDOWN_MS` | `30000` | Circuit cooldown |
| `AI_ENGINE_MAX_POSTS` | `200` | Bound synchronized post input |

`GOOGLE_TTS_API_KEY`, `REEL_MOTION_EFFECTS` and Observe credentials in older notes are **not active configuration** in the inspected implementation. Current reels have no voiceover. Do not obtain or pay for those services based on stale setup instructions.

### Frontend environment

| Name | Default / example | Required? | Purpose |
|---|---|---|---|
| `VITE_API_BASE` | `/api` | Optional | Browser API base. For a different production origin, set before building |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` | Optional, dev process environment | Vite `/api` proxy target; `/api` is stripped before forwarding |
| `VITE_FEATURE_PUBLISHING` | `false` | Optional | Only exact string `true` enables the publishing UI; does not bypass backend gates |

The Vite config reads the proxy target from `process.env` without calling `loadEnv`. The verified override is:

```bash
cd frontend
VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev
```

`import.meta.env.DEV` is supplied by Vite, not a secret or manual variable. The old `VITE_FEATURE_AI` and `VITE_FEATURE_REELS` examples are **not consumed** by current source; do not use them to diagnose backend generation or reels.

### Python engine environment

[Settings](ai-engine/app/core/config.py) loads `.env` relative to the engine process's working directory; exported environment takes precedence. Run from [ai-engine/](ai-engine/). Empty optional keys are placeholders, not credentials.

| Name | Default / example format | Required? / purpose |
|---|---|---|
| `ENVIRONMENT` | `development`; `test` or `production` | Optional; production requires service authentication |
| `LOG_LEVEL` | `INFO` | Optional log verbosity |
| `AI_PROVIDER` | `mock`; `gemini` or `claude` | Optional; selects wording provider |
| `GEMINI_API_KEY` | Empty; `<server-side-key>` | Required only to use Gemini; obtain from Google AI Studio / authorized project |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Optional; must be available to the Google project |
| `ANTHROPIC_API_KEY` | Empty; `<server-side-key>` | Required only to use Claude; obtain from Anthropic Console |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Repository default, **not verified as available**; set an actual model permitted for your account |
| `AI_TIMEOUT_SECONDS` | `30` | Per-attempt timeout, greater than 0 and at most 120 |
| `AI_MAX_RETRIES` | `2` | 0-5 retries on appropriate transient failures |
| `AI_MAX_OUTPUT_TOKENS` | `2048` | 256-8192 output-token budget |
| `CORS_ORIGINS` | Empty; comma-separated origins | No browser origins by default; not a replacement for internal network isolation |
| `MAX_BODY_BYTES` | `2000000` | Declared `Content-Length` limit; not full streamed-body enforcement |
| `SERVICE_TOKEN` | Empty; `<random-service-secret>` | Mandatory in production; enforced in development too when set |
| `RATE_LIMIT_PER_MINUTE` | `300` | Per client address/process; `0` disables |
| `LOAD_MOCK_DATA` | `true` | Demo fixture loading. Set explicitly `false` for real profiles / production |
| `DEFAULT_TIMEZONE` | `Asia/Kolkata` | Analysis date/time interpretation |
| `MIN_POSTS_FOR_BASELINE` | `5` | Minimum post baseline |
| `MIN_POSTS_PER_FORMAT` | `3` | Minimum within-format comparison |
| `MIN_POSTS_FOR_TIMING` | `12` | Posting-time inference threshold |
| `MIN_COMMENTS_FOR_AUDIENCE` | `10` | Audience sample sufficiency |
| `TREND_MAX_AGE_DAYS` | `14` | Trend freshness window |
| `MIN_LEARNING_SAMPLES` | `3` | Minimum samples for bounded learning adjustments |
| `STORAGE_BACKEND` | `memory`; `postgres` | Memory loses data on restart |
| `DATABASE_URL` | `postgresql+asyncpg://<user>:<password>@localhost:5433/<ai-db>` | Required only for PostgreSQL storage; never point at the primary application database |
| `DB_POOL_SIZE` | `5` | PostgreSQL pool size |
| `DB_MAX_OVERFLOW` | `5` | Additional PostgreSQL connections |
| `DB_CONNECT_TIMEOUT_SECONDS` | `5` | Connection timeout |
| `DB_COMMAND_TIMEOUT_SECONDS` | `30` | Database command timeout |
| `TREND_PROVIDER` | `sample`; `file` or `none` | Samples are fictional; file mode requires an operator dataset |
| `TREND_DATA_FILE` | Empty; `/absolute/path/to/trends.json` | Required in file mode |
| `FESTIVAL_DATA_FILE` | Empty; `/absolute/path/to/calendar.json` | Optional operator source-backed calendar |
| `FESTIVAL_INCLUDE_BUNDLED_VERIFIED` | `true` | Include the curated 2027 DoPT records, with source/date caveats |
| `FESTIVAL_INCLUDE_SAMPLE` | `true` | Include approximate samples; use `false` for real intelligence |
| `WEIGHT_HISTORICAL` | `0.25` | Opportunity score weight |
| `WEIGHT_AUDIENCE` | `0.20` | Opportunity score weight |
| `WEIGHT_TREND` | `0.20` | Opportunity score weight |
| `WEIGHT_FESTIVAL` | `0.15` | Opportunity score weight |
| `WEIGHT_COMPETITOR` | `0.10` | Opportunity score weight |
| `WEIGHT_GOAL` | `0.10` | Opportunity score weight |

**Weight configuration caveat:** the nested `ScoreWeights` settings object reads exported `WEIGHT_*` environment values separately. It has no own `.env` loader. Export weight overrides before starting the process rather than assuming edits only in `.env` will apply.

Additional actual operational/test variables:

| Name | Scope / safe usage |
|---|---|
| `AI_ENGINE_DB_PASSWORD` | AI Compose PostgreSQL password; set a local value and match the database URL. The Compose default is development-only |
| `AI_ENGINE_SERVICE_TOKEN` | Required AI Compose interpolation, mapped to Python `SERVICE_TOKEN`; must match the bridge token. Export before **any** AI Compose command, including database-only startup |
| `TEST_DATABASE_URL` | Persistence tests only; use a separate disposable database with `test` in its name. Tests truncate engine tables |
| `LIVE_AI_TESTS` | Export `1` only for intentional network/paid provider tests; keys must also be exported |
| `AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION` | Downgrade safety gate; leave unset in normal use |
| `AI_ENGINE_CONFIRM_DATABASE` | Exact database-name confirmation for explicitly authorized downgrades; leave unset normally |

Alembic reads **exported `DATABASE_URL`**, not the application's `.env` settings. Production service Compose also has an explicit variable allowlist: setting `TREND_PROVIDER` or festival flags in the host environment does not automatically forward them into that container.

## Database architecture

There are **two separate PostgreSQL databases**, not one shared model:

| Database | Owner | Local address | Schema / migration tool |
|---|---|---|---|
| `growpilot_db` | NestJS application | `localhost:5432` | Primary application schema; Prisma 8 migrations |
| `growpilot_ai` | Python engine, optional | `localhost:5433` | `ai_engine`; SQLAlchemy + Alembic |
| `growpilot_ai_test` | Python persistence tests only | `localhost:5433` | Disposable AI test schema; never use development/production data |

The root Compose database service is named `postgres`; its development user is `growpilot_user`. The AI Compose database service is `ai-engine-db`; its user is `growpilot_ai`. Passwords must match the respective Compose configuration; do not copy local defaults into production.

Redis is a queue backend, not the primary database. The application does not configure MongoDB or a vector database.

### Primary application schema

Source of truth: [schema.prisma](backend/prisma/schema.prisma); configuration: [prisma.config.ts](backend/prisma.config.ts); connection: [prisma.service.ts](backend/src/database/prisma.service.ts). This uses Prisma 8's `@prisma/orm-postgres`, **not** a conventional Prisma Client setup. Generated [schema.json](backend/prisma/schema.json) and [schema.d.ts](backend/prisma/schema.d.ts) are committed and imported by the application.

All models use string primary keys. Most are UUID-on-create; refresh-token IDs are supplied. Database mappings are predominantly snake_case. `NumericString` fields represent database numeric values, not floating-point JS currency arithmetic.

| Model / database table | Data and relationships | Important additional keys/indexes |
|---|---|---|
| `User` / `users` | Identity, email, password hash, active/disabled; owns businesses, refresh sessions, conversations | Unique email |
| `RefreshToken` / `auth_refresh_tokens` | User, token hash/family, expiry/revocation | Unique tokenHash; userId and familyId indexes |
| `Business` / `businesses` | User-owned profile, onboarding, category/language/location/audience | userId index; parent of content and integrations |
| `SocialAccount` / `social_accounts` | Business-owned Instagram identity, encrypted access token, permissions, connection/sync/publish state | Unique platform/platformAccountId; businessId and platformAccountId indexes |
| `Recommendation` / `recommendations` | Primary app action/rationale/stage/confidence/status and JSON payload | businessId index; **separate from Python recommendations** |
| `InstagramPost` / `instagram_posts` | Imported media, caption, URL, timestamps/deletion state | Unique socialAccountId/platformMediaId; account/publishedAt index |
| `PostMetricSnapshot` / `post_metric_snapshots` | Append-only nullable metrics; unknown is distinct from zero | Post/capturedAt index |
| `SyncRun` / `sync_runs` | Account, sync kind/status/timing/count/errors | Account/startedAt index |
| `MediaAsset` / `media_assets` | Business-owned Cloudinary original/variant metadata, source asset, processing/approval | Business/createdAt; sourceAssetId; unique sourceAssetId/processingKey |
| `MediaAnalysis` / `media_analyses` | Versioned asset analysis/result/usage JSON | Unique asset/kind/version |
| `Product` / `products` | Business product, details/category/price/currency/image/availability | Business/createdAt; optional post/reel references |
| `Conversation` / `conversations` | Business/user conversation, active/closed | Business/createdAt; messages and generated posts |
| `ConversationMessage` / `conversation_messages` | User/assistant/system content, language and metadata | Conversation/createdAt |
| `GeneratedPost` / `generated_posts` | Business content, optional conversation/product, copy, approval/publish result | Business/createdAt |
| `PostImage` / `post_images` | Ordered generated-post carousel; zero is cover | Unique postId/position |
| `Reel` / `reels` | Source images/options, script/scenes, render report/assets, approval and publish/ambiguity state | Business/createdAt; optional product/media |
| `GenerationCache` / `generation_cache` | Business-owned cached generation JSON | Unique businessId/cacheKey |

Owning relationships generally cascade, including media-variant ancestry. Optional post→conversation/product and reel→product/media links use `SetNull`. These constraints do not replace service-level business ownership checks.

Enums cover user status, Instagram platform/account state, OAuth/dashboard token source, media variant, post/conversation/recommendation status, sync kind/state, and reel status/stage/template. Categories are `clothing`, `jewellery`, `grocery`, `footwear`, `other`; languages are `hi`, `mr`, `en`.

[migrations/app/](backend/migrations/app/) contains 20 timestamped TypeScript migration directories in the inspected checkout, from the initial schema through refresh sessions, Instagram/sync snapshots, onboarding, media/products/content, carousels, caching, studio/posters and reels. Migrations were inspected as an inventory, **not applied or exhaustively audited** during this documentation task.

### AI engine schema

Source of truth: [app/db/models.py](ai-engine/app/db/models.py); implementation: [repositories/postgres.py](ai-engine/app/repositories/postgres.py). UUID keys are internal database identities unless indicated otherwise. Most rich reports/lists are JSONB; this is intentional, not additional relational tables.

| Table | Stored data / ownership | Important constraints and indexes |
|---|---|---|
| `ai_profiles` | Business/creator profile, category, location, products/topics/goals | UUID PK, unique public profile ID, profile-type check |
| `instagram_posts` | Profile-owned input posts and captions | FK profile, unique `(profile_id, media_id)`, `(id, profile_id)` owner key, profile/date index |
| `post_analytics` | Nullable post metrics used for analysis | Composite post/profile FK, one row per post, nonnegative metrics, profile index |
| `audience_comments` | Supplied comments for one profile | Unique profile/comment ID, profile/time index |
| `audience_insights` | Generated audience report JSONB | Profile FK and generated-time index |
| `competitors` | Approval status, origin, provider/data source, freshness | Unique profile/public ID and profile/username; owner key; status/source checks |
| `competitor_posts` | Public post inputs for a profile's competitor | Composite competitor/profile ownership FK |
| `trend_snapshots` | Assessed trends as of a date, JSONB | Profile FK and snapshot timestamps |
| `festival_events` | Shared source-backed/rule/sample reference records | Unique public festival ID, date index |
| `recommendations` | Generated content concept, score/confidence, reasoning, caveats, fingerprint | UUID API identity, profile FK, owner key, 0-100 score checks, profile/created and fingerprint indexes |
| `recommendation_evidence` | Ordered evidence for a recommendation | Composite recommendation/profile FK, unique recommendation/position |
| `recommendation_feedback` | Owner actions on recommendations | Composite owner FK, action check, profile/time and recommendation indexes |
| `recommendation_outcomes` | Post-publish metrics per observation interval | Composite owner FK, unique recommendation/interval; `INITIAL`, `H24`, `H72`, `D7` check |
| `learning_adjustments` | Current and historical bounded adjustments | Nonnegative sample count, partial unique current profile/dimension/value, history index |

Alembic also maintains its version table. Revisions in [alembic/versions/](ai-engine/alembic/versions/) create the initial schema (`0001`) and add competitor data-source/freshness fields (`0002`).

Each store method is transactional; recommendation/evidence batches and feedback/outcome updates with their derived learning adjustments are atomic. Composite foreign keys protect child ownership. This is **not PostgreSQL row-level security**: service-level profile scoping remains necessary.

The store bridges synchronous service calls onto an async event-loop thread for database operations. Requests can still block waiting for the result; do not infer unlimited async scalability.

### Database creation, migrations and inspection

- Root `docker compose up -d` initializes the primary database and named volumes.
- AI Compose initializes its separate database and an empty test database through [01-create-test-database.sql](ai-engine/docker/initdb/01-create-test-database.sql). Initialization SQL runs only when the PostgreSQL data directory is first created.
- Apply each service's migrations before using its tables; commands appear in [local setup](#local-setup-from-a-fresh-clone).
- Inspect the primary database with Prisma Studio or Adminer at `http://localhost:8080` (server **`postgres`** from inside the Compose network, not `localhost`).
- AI database inspection can use any PostgreSQL client on port 5433. Avoid selecting raw audience comments in shared logs or screenshots.
- Primary QA fixtures require explicit seeding and belong to a **disabled** fixture owner, not a demo login account. Signup/onboarding creates an interactive user's owned data. Python demo fixtures are separate and are not production intelligence.
- Back up databases/volumes before migrations. Do not remove volumes or downgrade merely to fix a configuration error.

## Backend architecture and API reference

### Bootstrap and module boundaries

[main.ts](backend/src/main.ts) starts Nest/Express on port 4000 with Helmet, credentialed CORS, and global DTO transformation/whitelisting/rejection of unknown fields. There is **no global `/api` prefix**. [app.module.ts](backend/src/app.module.ts) registers modules and the global throttling guard (60 requests/minute baseline); it is **not a default-on authentication guard**. Business feature controllers explicitly apply JWT auth.

Swagger is available at `http://localhost:4000/docs` only outside production. It is the best local interactive reference for individual DTO fields. Controllers return service values directly: **there is no universal `{success,data}` envelope**. Errors use Nest HTTP exceptions/validation behavior unless a route supplies a more specific contract.

| Source directory | Responsibility |
|---|---|
| [auth/](backend/src/auth/) | Signup/login, JWT guard, rotating refresh sessions and auth DTOs |
| [database/](backend/src/database/) | Prisma connection/lifecycle |
| [health/](backend/src/health/) | PostgreSQL health query |
| [business/](backend/src/business/) | Business profile/onboarding |
| [products/](backend/src/products/) | Owned product catalog |
| [conversations/](backend/src/conversations/) | Conversations/messages |
| [posts/](backend/src/posts/) | Generated posts and ordered images |
| [publishing/](backend/src/publishing/) | Instagram publishing and slideshow rendering |
| [media/](backend/src/media/), [studio/](backend/src/media/studio/) | Cloudinary upload/storage, image analysis/enhancement/AI editing |
| [poster/](backend/src/poster/) | Template/generated posters, rendering/edit/save |
| [reels/](backend/src/reels/), [composer/](backend/src/reels/composer/) | Reel state, scripts, image scenes, composition and quality report |
| [ai/](backend/src/ai/) | Claude content/intent/editing prompts and services |
| [ai-engine/](backend/src/ai-engine/) | Feature-flagged private Python bridge; ownership mapping, bounded inputs, resilience |
| [instagram/](backend/src/instagram/) | OAuth, accounts, Graph client, sync queue and worker |
| [common/](backend/src/common/) | Shared helpers/constants |

### Authentication and ownership flow

1. Signup validates nested business input, normalizes email (trim/NFC/lowercase), hashes a 12-72-character password with bcrypt cost 12 (also at most 72 UTF-8 bytes), and creates owned user/business records.
2. Login verifies credentials and returns a safe user plus access/refresh tokens. Access JWT uses HS256, issuer `growpilot-api`, audience `growpilot-web`.
3. Browser requests send `Authorization: Bearer <access-token>`. Guards establish the user; services scope business/account/content access to that owner.
4. Refresh rotates stored, hashed refresh-token sessions/families. Refresh/logout authenticate through their refresh-token input rather than a bearer guard.
5. OAuth callback is public because Meta redirects there, but state/nonce validation binds it to the initiating connection. Stored Instagram tokens are encrypted; they are not returned as frontend provider configuration.

Example request shapes (placeholders, not working credentials):

```http
POST /auth/signup
Content-Type: application/json

{
  "name": "Example Owner",
  "email": "owner@example.test",
  "password": "<choose-a-local-password>",
  "business": { "name": "Example Shop", "category": "clothing" }
}
```

Signup returns HTTP 201; login (`POST /auth/login` with `email` and `password`) returns HTTP 200. Default token response:

```json
{
  "user": { "id": "<uuid>", "name": "Example Owner", "email": "owner@example.test", "status": "active" },
  "business": { "id": "<uuid>", "name": "Example Shop", "category": "clothing" },
  "accessToken": "<access-token>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "<refresh-token>",
  "refreshExpiresIn": 2592000
}
```

The `business` field appears in **signup**, not the login response. Password hashes are excluded. Do not paste token values into issue reports or shared screenshots.

### Actual public application routes

Paths below are relative to the backend origin, not the frontend `/api` proxy. Brace notation in the tables lists individual routes; it is not literal URL syntax. JWT routes also require owned resource IDs and valid DTOs. Publishing has additional approval/feature/live-account gates.

| Method | Path | Auth / purpose |
|---|---|---|
| GET | `/` | Public plain text `Hello World!`; not a health probe |
| GET | `/health` | Public PostgreSQL-backed liveness/readiness signal; no Redis/provider check |
| POST | `/auth/signup`, `/auth/login` | Public credential endpoints |
| POST | `/auth/refresh`, `/auth/logout` | Refresh-token input; no bearer guard |
| GET | `/docs` | Nonproduction Swagger UI |
| GET, POST, PATCH | `/business/profile` | JWT; current owned business |
| POST | `/media/upload` | JWT; image upload |
| GET | `/media/:id` | JWT; owned media metadata |
| POST | `/media/analyze`, `/media/enhance`, `/media/ai-edit` | JWT; studio operations |
| GET | `/media/ai-usage`, `/media/:id/preview` | JWT; image budget/preview |
| POST | `/media/:id/approve` | JWT; media approval |
| GET, POST | `/products` | JWT; list/create owned products |
| GET, PATCH, DELETE | `/products/:id` | JWT; owned product |
| POST | `/conversations` | JWT; create conversation |
| GET | `/conversations/:id` | JWT; owned conversation |
| POST | `/conversations/:id/messages` | JWT; add/process message |
| GET, POST | `/posts` | JWT; list/create generated content |
| GET, PATCH, DELETE | `/posts/:id` | JWT; owned generated post |
| POST | `/posts/:id/publish` | JWT + publishing safety gates |
| GET | `/posters/options` | JWT; available composer options |
| POST | `/posters/generate`, `/posters/render`, `/posters/edit`, `/posters/:id/save` | JWT; poster workflow |
| GET, POST | `/reels` | JWT; list/start reel |
| GET | `/reels/:id`, `/reels/:id/status` | JWT; owned reel/polling |
| PATCH | `/reels/:id` | JWT; update owned reel |
| POST | `/reels/:id/regenerate`, `/reels/:id/cancel`, `/reels/:id/approve`, `/reels/:id/publish` | JWT; lifecycle actions, additional publishing checks |
| POST | `/ai/classify-intent`, `/ai/generate-content`, `/ai/edit-content` | JWT; NestJS Claude features, **not Python recommendation scoring** |
| GET | `/ai-insights/status` | JWT; bridge availability/feature state |
| POST | `/ai-insights/analysis` | JWT; sync/assess owned account |
| GET | `/ai-insights/audience`, `/ai-insights/competitors`, `/ai-insights/trends` | JWT; scoped engine reports |
| POST | `/ai-insights/recommendations/generate` | JWT; generate scoped ideas |
| GET | `/ai-insights/recommendations` | JWT; existing scoped ideas |
| POST | `/ai-insights/recommendations/:id/feedback`, `/ai-insights/recommendations/:id/outcomes` | JWT; owned recommendation learning signals |
| GET | `/ai-insights/learning` | JWT; bounded learning report |
| GET | `/integrations/instagram/connect` | JWT; start OAuth/mock connection |
| GET | `/integrations/instagram/callback`, `/integrations/instagram/result` | Public callback/result display |
| POST | `/integrations/instagram/connect/token` | JWT + explicit `ENABLE_TEST_MODE=true`; test-only dashboard token |
| GET | `/integrations/instagram/accounts`, `/integrations/instagram/accounts/:id` | JWT; owned accounts |
| POST | `/integrations/instagram/accounts/:id/sync`, `/integrations/instagram/accounts/:id/sync-media` | JWT; profile/media sync |
| GET | `/integrations/instagram/accounts/:id/sync-runs`, `/integrations/instagram/accounts/:id/media`, `/integrations/instagram/accounts/:id/insights` | JWT; owned sync/history/analytics |
| DELETE | `/integrations/instagram/accounts/:id` | JWT; disconnect owned account |

Successful health response:

```json
{ "status": "ok", "app": "GrowPilot", "database": "connected", "timestamp": "<ISO-8601>" }
```

The `/ai-insights/*` routes orchestrate an internal service; they do not let callers select arbitrary Python profile IDs. There is no browser festival proxy or general-purpose URL-forwarding route.

### Background jobs and rendering lifecycle

- **Instagram sync:** BullMQ queue `instagram-sync`, job `sync-media`; account-derived deduplication, six attempts, exponential backoff starting at 60 seconds, worker concurrency 1. Completed/failed queue jobs are removed; `sync_runs` retains durable run outcomes. Keep Redis available even in Instagram mock mode unless deliberately disabling the worker. OAuth also uses Redis nonces.
- **Reels:** generation runs **in-process**, not a proven durable BullMQ pipeline. Startup marks interrupted generation failed; interrupted publishing becomes ambiguous `PUBLISH_FAILED`. Do not describe the sync queue as durable reel execution or retry an ambiguous publish blindly.
- **Renderer:** script text → image scenes → FFmpeg video → Cloudinary video/thumbnail. Current pipeline has **no TTS/voiceover stage** despite legacy DTO/schema wording. Renderers import the platform binary from `ffmpeg-static` and require that path; no system-PATH FFmpeg fallback was found. Probing uses FFmpeg output, not a standalone `ffprobe` requirement.
- **Approval and publishing:** normal post publishing requires `USER_APPROVED`, required content/media, an eligible live account, duplicate checks and an explicit enabled flag. Reels also check current assets/status and use an atomic state transition. The frontend flag alone cannot authorize a publish.
- **Annual festival refresh:** not implemented. Empty placeholders are described in [festival intelligence](#festival-intelligence-and-provenance), not an operating cron.

## Third-party integrations

| Integration / owner | Calls and data flow | Credentials / limits / failure considerations |
|---|---|---|
| Meta Instagram / NestJS | OAuth → owned social account → profile/media/insight synchronization → approval-gated publishing | Meta developer app, exact callback, permitted account/permissions, encrypted token key and live allowlist; default mock; Graph pagination/request-delay bounds |
| Anthropic Claude / NestJS | Intent classification, structured content, edits/photo analysis and reel-script preparation | Backend `ANTHROPIC_API_KEY`; model/timeouts/retries configured independently from Python; missing/invalid credentials fail relevant features |
| Google Gemini image API / NestJS | Image enhancement/editing/poster/reel image work where selected; Sharp template path remains available | Backend `GEMINI_API_KEY`; per-business daily attempt budget and estimated costs; no key does not make every media feature usable because uploads still need storage |
| Cloudinary / NestJS | Owned image/video upload, variants, reel video/thumbnail storage | Cloud name, API key and secret from Cloudinary dashboard; limits/billing controlled by that account; approved/owned URL checks remain necessary |
| Gemini or Claude wording / Python | Receives bounded deterministic recommendation context, returns wording, then Python validates | Python `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`; selected by `AI_PROVIDER`; see [failure behavior](#providers-and-failure-behavior) |
| Internal AI engine / NestJS | Server-owned profile mapping, post synchronization, analytics/ideas/feedback | Private URL/token, timeout/retry/circuit breaker and feature flag; no direct browser access |
| Trends/calendar inputs / Python | Sample/reviewed trend file and bundled/source-backed calendar files | No live Google Trends/social feed or calendar scraping service is implemented; preserve source and verification labels |
| Browser speech APIs / frontend | Device/browser speech recognition and synthesis | Browser permissions/capability; not a configured paid backend speech provider |

No payment integration, Google Cloud TTS pipeline, Observe module, live trend vendor connector, or automatic official-calendar ingestion was established in the inspected code. Do not create credentials for imagined integrations.

## Independent Python AI engine

### Entry point and code map

| Path | Purpose / connection | Environment |
|---|---|---|
| [app/main.py](ai-engine/app/main.py) | `create_app`, lifecycle, middleware, error handlers and router registration | Both |
| [app/core/](ai-engine/app/core/) | Validated settings, service auth, per-process limiter, request context, safe errors/logging | Both |
| [app/api/dependencies.py](ai-engine/app/api/dependencies.py) | Container wiring stores, analyzers, services, data sources and lazy provider clients | Both |
| [app/api/routes/](ai-engine/app/api/routes/) | Thin HTTP operations; no score computation in controllers | Both |
| [app/schemas/](ai-engine/app/schemas/) | Pydantic input/output/domain contracts, enum values, validation | Both |
| [app/services/](ai-engine/app/services/) | Profile ownership, orchestration, signal collection, persistence | Both |
| [app/intelligence/](ai-engine/app/intelligence/) | Pure analytics, format/topic/comment/competitor/trend rules | Both |
| [app/recommendation/](ai-engine/app/recommendation/) | Candidates, ranking, confidence, diversity, business/creator strategies and learning | Both |
| [app/ai/](ai-engine/app/ai/) | Provider factory, Gemini/Claude/mock clients, JSON parser and Python wording guard | Both |
| [app/ai/prompts/](ai-engine/app/ai/prompts/) | Wording-refinement prompt templates; changes require guard/regression tests | Both |
| [app/integrations/](ai-engine/app/integrations/) | Trend, festival and competitor source adapters/capabilities | Both |
| [app/data/](ai-engine/app/data/) | Bundled demo inputs and curated festival references | Both; filter explicitly in production |
| [app/repositories/](ai-engine/app/repositories/) | Storage protocol, memory and PostgreSQL implementations | Both |
| [app/db/](ai-engine/app/db/) | SQLAlchemy models/database lifecycle | PostgreSQL mode |
| [app/demos/](ai-engine/app/demos/) | Deterministic persona datasets and quality-demo runner | Development/test |
| [tests/](ai-engine/tests/) | Unit, HTTP, quality, persistence and explicit live suites | Development/CI |
| [docs/](ai-engine/docs/) | More detailed service references and generated historical quality report | Reference |
| [app/integrations/festivals/refresh.py](ai-engine/app/integrations/festivals/refresh.py) | Empty placeholder; not an ingestion command | No current runtime role |

### Analysis and recommendation rules

The engine analyzes posts within formats instead of comparing every raw metric across unrelated formats. Missing metrics are `null`, not invented zeros. With thin data it explains what is unknown and reduces confidence.

Audience insights use multilingual keyword rules, not a trained sentiment/demographic model. Commenters are a self-selected subset of the audience; counts are not audience-wide facts. Evidence excerpts mask recognizable emails/phone numbers, but the raw storage still needs privacy/retention controls.

Recommendation generation:

```text
Profile + as_of cutoff
  -> own posts/metrics + audience + approved competitors + contextual trends + festivals
  -> business/creator strategy + candidate evidence
  -> weighted opportunity score + separate confidence
  -> bounded learning + fingerprint suppression
  -> topic/format diversity selection
  -> optional wording polish + strict Python validation
  -> save batch -> API envelope
```

Default opportunity weights: historical `.25`, audience `.20`, trends `.20`, festivals `.15`, competitors `.10`, goals `.10`. Missing (`None`) signals are excluded and remaining weights renormalize; an observed zero remains zero.

Learning is transparent arithmetic, not model training: at least three samples, shrinkage `n / (n + 3)`, adjustment bounded to `+/-8`. Feedback and normalized outcomes can update format/objective/tag preferences. Used/dismissed fingerprints are suppressed.

Generation requests accept 3-5 recommendations (default 4). If there are insufficient distinct suitable ideas, the engine can return fewer and explain the limitation. Relevant imminent festivals may reserve a slot without inflating the underlying score. `as_of` excludes future-dated posts/comments.

### Providers and failure behavior

| Provider | Implementation | Configuration |
|---|---|---|
| Mock | [mock_provider.py](ai-engine/app/ai/mock_provider.py); deterministic JSON through the same parser/guard | `AI_PROVIDER=mock`; no key |
| Gemini | [gemini_provider.py](ai-engine/app/ai/gemini_provider.py); REST `generateContent` through pooled `httpx` | `AI_PROVIDER=gemini`, server-side key and accessible model |
| Claude | [claude_provider.py](ai-engine/app/ai/claude_provider.py); `AsyncAnthropic.messages.create` | `AI_PROVIDER=claude`, server-side key and accessible model |

Clients are created lazily, reused, and closed on shutdown. SDK retries are disabled for Claude; the shared provider layer owns bounded retries for timeout/network/rate-limit/server errors. Authentication and malformed output are not repaired by silently switching providers.

Only recommendation ID plus existing title/hook/caption direction/CTA are sent to the refiner. No Instagram access token is required. IDs must match exactly, JSON must match the output contract, and the wording guard rejects introduced numeric strings, hashtags, links, and selected unsupported claims.

**Important:** this lexical guard is not a mathematical guarantee against all hallucinations. Python-owned fields are preserved, but human review and evolving semantic checks are still appropriate.

Failures are explicit: missing configuration `503`; bad credentials, unavailable provider after retries, malformed/empty/truncated/unsafe output normally `502`; database unavailability `503`. The error includes a safe kind/provider rather than credentials. Failed AI refinement does not save recommendations, although earlier signal collection may already have saved a trend snapshot.

Switch provider through server configuration and restart; do not offer clients arbitrary model endpoints or credentials.

### Trends: current implementation, not a live feed

[file_provider.py](ai-engine/app/integrations/trends/file_provider.py) supports operator-supplied JSON. A trend's contract in [schemas/trend.py](ai-engine/app/schemas/trend.py) includes ID, title/topic, description, category, geography/language, source/type/URL, first observation, last check (`verified_date`), direction, evidence, confidence and expiry.

Use the schema's actual enum values; for example categories `FOOD`, `TRAVEL`, `FASHION`, and source types `SEARCH_INTEREST`, `SOCIAL_PLATFORM`, `EDITORIAL`. Do not invent Google Trends API credentials: no automatic Google Trends connector exists here.

- `TREND_PROVIDER=sample`: bundled fictional data with `is_sample=true`.
- `TREND_PROVIDER=file`: validate source fields, dates, URL and non-sample status; select contextually relevant, current records.
- `TREND_PROVIDER=none`: no trend feed.
- `GET /api/v1/trends/sources`: inspect source-load problems instead of assuming an empty list means no trends exist.

Format validation does not independently verify the publication or its claims. Obtain permitted data, retain provenance, expire it honestly, and match the profile category/geography.

### Festival intelligence and provenance

[calendar.py](ai-engine/app/integrations/festivals/calendar.py) constructs a merged calendar; [festival_service.py](ai-engine/app/services/festival_service.py) applies region/industry relevance and upcoming windows.

| Input | Verification status | Meaning |
|---|---|---|
| Operator calendar / bundled curated official-source records | `VERIFIED_SOURCE` | Source-backed author assertion, not automated source authentication |
| Fixed-date calendar rules | `RULE_FIXED_DATE` | Computed fixed-date occasions; not a lunar-calendar inference |
| [festivals_sample.json](ai-engine/app/data/festivals/festivals_sample.json) | `SAMPLE_UNVERIFIED` | Approximate demo dates; must never be shown as confirmed |

Load/merge flow:

1. Load and validate an optional `FESTIVAL_DATA_FILE`.
2. Load bundled verified calendar files if enabled.
3. Generate fixed-date occasions for the requested year.
4. Include approximate samples only if enabled.
5. Deduplicate by lowercase name + year with priority **verified > fixed rule > sample**. Earlier operator records win equal-status ties. Aliases with different names are not automatically merged.
6. Hard-filter region, then score contextual relevance. Recommendation generation considers a 45-day festival window.
7. Expose status/source/date note with the record; coverage reports distinguish available years and verification levels.

The bundled [festivals_verified_2027.json](ai-engine/app/data/festivals/festivals_verified_2027.json) contains **31 curated records** transcribed from the [Government of India DoPT 2027 holiday circular](https://dopt.gov.in/static/uploads/2026/08/2ffd159748162a48c025f7e6ca5807d5.pdf). This was a **manual curation**, not a maintained annual ingestion pipeline. Names/dates come from the cited calendar; industry/theme/region tags are GrowPilot annotations.

The source concerns central-government offices in Delhi/New Delhi, not every regional festival or every Indian employer. Moon-sensitive dates retain caveats. Structural validation does not establish that every transcription or regional annotation is correct. Do not describe the data as a complete universal Indian calendar.

For real intelligence use `FESTIVAL_INCLUDE_SAMPLE=false`; retain the source-backed/fixed-rule rows and add reviewed operator data where needed. Missing years should remain missing, not guessed. Calendar files are read during construction; restart after changes.

**Annual refresh is not active.** The empty workflow and refresh module do not implement source discovery, PDF parsing, validation, publication, or a scheduler. The previously discussed January 18, 03:00 Asia/Kolkata same-year schedule remains a requested design, not an installed cron job.

### Internal HTTP contract

Base: `http://127.0.0.1:8001/api/v1`. Send `Authorization: Bearer <SERVICE_TOKEN>` whenever configured. `/health` and FastAPI's generated documentation are outside the protected API router. End-user JWTs are not the engine's authentication mechanism.

All rows below are service-authenticated when a token is configured; only health is public. Profile-specific operations require `profile_id` in the body/query as defined by the linked schemas.

| Method | Path (after `/api/v1`) | Purpose |
|---|---|---|
| `POST` | `/profiles` | Create profile |
| `PUT` | `/profiles/{profile_id}` | Idempotent synchronization; 201 first create, 200 thereafter |
| `GET`, `PATCH` | `/profiles/{profile_id}` | Read/update profile |
| `POST` | `/analytics/analyze` | Ingest posts and compute analytics |
| `GET` | `/analytics/overview` | Latest account analytics |
| `GET` | `/analytics/top-content` | Top/lowest posts; pagination and `which` |
| `GET` | `/analytics/content-breakdown` | Content-format/topic breakdown |
| `POST` | `/audience/analyze` | Ingest comments/demographics and analyze |
| `GET` | `/audience/insights` | Latest audience report |
| `POST` | `/competitors/suggest` | Save suggestions as pending approval |
| `POST`, `GET` | `/competitors` | Manually add / list |
| `GET` | `/competitors/providers` | Provider capabilities and limitations |
| `GET` | `/competitors/landscape` | Approved-competitor comparison |
| `POST` | `/competitors/{competitor_id}/posts` | Supply permitted public post data |
| `GET` | `/competitors/{competitor_id}/insights` | Individual approved-competitor insights |
| `PATCH` | `/competitors/{competitor_id}/approval` | Approve/reject |
| `DELETE` | `/competitors/{competitor_id}` | Delete; 204 response |
| `POST` | `/trends/analyze` | Evaluate freshness/relevance as of a date |
| `GET` | `/trends/sources` | Source diagnostics |
| `GET` | `/trends` | Current contextual trends |
| `GET` | `/trends/upcoming` | Upcoming trends |
| `GET` | `/festivals` | Calendar filter by year/region/industry |
| `GET` | `/festivals/coverage` | Year coverage; year required |
| `GET` | `/festivals/upcoming` | Upcoming filter, 1-365 days, default 60 |
| `POST` | `/recommendations/generate` | Generate 3-5 requested ideas |
| `GET` | `/recommendations` | Paginated recommendations |
| `GET` | `/recommendations/{recommendation_id}` | Owned recommendation |
| `POST` | `/recommendations/{recommendation_id}/feedback` | Record owner action |
| `GET` | `/feedback` | Profile feedback |
| `GET` | `/learning` | Current adjustment model |
| `GET` | `/learning/history` | Adjustment history |
| `POST`, `GET` | `/recommendations/{recommendation_id}/outcomes` | Record/list outcome observations |
| `GET` | `/health` **without `/api/v1` prefix** | Storage-aware health; may return 503 |

There is no implemented flat `POST /api/v1/analysis`, `/feedback` POST, or `/outcomes` POST matching the earlier proposed integration table. Use the actual routes above. Generated docs: `http://127.0.0.1:8001/docs`, OpenAPI: `/openapi.json`; keep these internal in production.

Success envelope:

```json
{"data": {}, "meta": {"request_id": "example-request-123"}}
```

Error envelope:

```json
{
  "error": {"code": "not_found", "message": "Safe error description"},
  "meta": {"request_id": "example-request-123"}
}
```

Additional error details are optional. Validation returns 422 without echoing submitted sensitive values; payload limit 413; rate limit 429 with `Retry-After`. Valid request/correlation IDs are 8-64 characters from letters, digits, `.`, `_`, `-`; otherwise a new UUID is used.

Example for a **local development engine**, not a browser call:

```bash
# Create an owned input profile (requires a reachable local engine).
curl -sS -X PUT http://127.0.0.1:8001/api/v1/profiles/demo-restaurant \
  -H "Authorization: Bearer $AI_ENGINE_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"profile_type":"BUSINESS","name":"Demo Restaurant","category":"restaurant","city":"Mumbai","region":"Maharashtra","products":["thali"],"goals":["ENGAGEMENT"]}'

# Rule-only generation: no provider key/network required.
curl -sS -X POST http://127.0.0.1:8001/api/v1/recommendations/generate \
  -H "Authorization: Bearer $AI_ENGINE_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"profile_id":"demo-restaurant","count":4,"use_ai":false}'
```

The generation response's `data` contains `profile_id`, `recommendations`, and `notes`. Each idea carries content framing, format/objective, target audience/date, opportunity/confidence, signal breakdown, evidence/source references, caveats, tags/fingerprint and generation diagnostics. Treat missing evidence and low-confidence notes as meaningful output.

## Frontend architecture

The frontend is a React SPA built with Vite and TypeScript. It has custom CSS/components and localization; there is no separate SSR application.

| Path | Responsibility / connections | Environment |
|---|---|---|
| [src/main.tsx](frontend/src/main.tsx) | React root, StrictMode, localization and global stylesheet imports | Both |
| [src/App.tsx](frontend/src/App.tsx) | BrowserRouter, auth/post-flow providers, route guards | Both |
| [src/pages/](frontend/src/pages/) | Onboarding, home, post/reel workflows, products, settings, recommendations and insights | Both |
| [src/components/AppShell.tsx](frontend/src/components/AppShell.tsx) | Authenticated shell/sidebar, conditional AI Overview link | Both |
| [src/components/](frontend/src/components/) | UI primitives, icons, photo tools, poster studio, language/tone controls | Both |
| [src/components/reels/](frontend/src/components/reels/) | Reel player, image/template/look selectors, progress, dictation and confirmations | Both |
| [src/state/](frontend/src/state/) | Auth/session context and in-memory post draft | Both |
| [src/hooks/](frontend/src/hooks/) | Speech APIs, reel polling, recommendation-to-create and overview orchestration | Both |
| [src/services/](frontend/src/services/) | Typed backend calls grouped by feature | Both |
| [src/lib/api.ts](frontend/src/lib/api.ts) | Fetch wrapper, auth headers, coalesced refresh, 401 sign-out handling | Both |
| [src/lib/](frontend/src/lib/) | Shared types, storage, flags, onboarding and analysis helpers | Both |
| [src/i18n/](frontend/src/i18n/) | English/Hindi/Marathi JSON namespaces, provider and fallback logic | Both |
| [src/styles/](frontend/src/styles/) | CSS variables/tokens, layout, pages, reels, insights | Both |
| [src/mocks/](frontend/src/mocks/) | General recommendation templates; not the Python engine's output | Demo UI feature |
| [src/dev/](frontend/src/dev/) | Development session/draft helpers | Development only |
| [scripts/check-locales.mjs](frontend/scripts/check-locales.mjs) | Translation parity/placeholders/static-key validation | Development/CI |
| [tests/aiOverview.test.ts](frontend/tests/aiOverview.test.ts) | Focused pure-logic overview tests | Development/CI |
| [vite.config.ts](frontend/vite.config.ts) | Port 3000, `/api` development proxy and React plugin | Build/dev |
| [tsconfig.app.json](frontend/tsconfig.app.json), [.oxlintrc.json](frontend/.oxlintrc.json) | ES2023 app checking, unused checks, React/hooks lint rules | Build/dev |

### Routes and screens

| Access | Browser routes | Purpose |
|---|---|---|
| Public | `/welcome`, `/signup`, `/login` | Entry/authentication |
| Public declaration, internal onboarding checks | `/setup` | Business setup |
| Authenticated | `/` | Main home |
| Authenticated | `/create`, `/create/generating`, `/create/preview`, `/create/publish`, `/create/done` | Photo-post creation through confirmed result |
| Authenticated | `/posts`, `/products`, `/recommendations` | Owned content/products and local recommendation templates |
| Authenticated | `/ai-insights` | Python-backed AI Overview via NestJS |
| Authenticated | `/reels`, `/reels/library`, `/reels/:id` | Reel setup/library/preview |
| Authenticated | `/reels/:id/generating`, `/reels/:id/edit`, `/reels/:id/publish`, `/reels/:id/published` | Reel lifecycle; published path shares the publish component |
| Authenticated | `/settings`, `/help` | Integration/account settings and help |
| Redirect | `/reels/new`; unknown routes | Redirect to `/reels`; redirect to `/` respectively |
| Development only | `/dev/session`, `/dev/seed` | Session helper (public); draft seed (authenticated shell) |

Authentication waits for session loading before redirecting a signed-out user to `/welcome`. The browser stores access/refresh tokens and cached identity in localStorage. Signup credentials between onboarding steps stay in memory. Treat XSS protection and shared-device logout seriously; these are not HttpOnly cookie sessions.

The API client uses `/api` by default, adds the access token, coalesces concurrent refresh requests, retries after a successful refresh, and clears failed sessions on an authenticated 401. On startup the auth context loads the business and Instagram accounts; mock accounts are not treated as real connected accounts.

### User workflows

**Photo post:** upload photos, choose product/context/language/tone, create a conversation and post, request `/ai/generate-content`, answer clarifications or preview, optionally edit/create poster, request explicit approval, then publish. Success is shown only when the server returns `PUBLISHED`.

The post-flow context tracks up to ten ordered photos plus transcript/options/IDs/generated output. It does **not** survive page reload. Backend-saved content is separate from this temporary draft.

**Reel:** use real backend creation/status/edit/regeneration services, not a feature-flagged demo adapter. Status polls every two seconds and aborts on cleanup. Media downloads fetch the returned media URL directly; those bytes do not pass through the JSON API client.

**AI Overview:** [AiOverviewPage.tsx](frontend/src/pages/AiOverviewPage.tsx), [useAiOverview.ts](frontend/src/hooks/useAiOverview.ts), and [aiInsights.ts](frontend/src/services/aiInsights.ts) implement:

- Backend status cached for 60 seconds; status failure hides the feature as disabled/unavailable.
- Sidebar visibility based on `enabled`; loading requires both `enabled` and `available`.
- Analysis first, to synchronize post inputs; then audience, trends and recommendations load independently in parallel even if analysis fails.
- Account indicators rather than a fabricated single health score, best content, audience, contextual trends and recommendation summary.
- Explicit disconnected/mock/disabled/unavailable/empty/error states.
- Four initial recommendations; generate/regenerate replaces the list with a requested batch of four.
- Optimistic feedback with rollback/error on failure; section requests abort during cleanup.

There is no automatic status polling. The refresh path forces a status fetch but does not replace the hook's existing availability state; reload after changing server feature configuration if needed.

### State, localization and styling

React Context and local state handle sessions/drafts/screens. There is no global query-cache package. English, Hindi and Marathi resources are eagerly loaded; language preference uses `growpilot.uiLanguage`, updates document language, and falls back to English then the raw key. Run the locale checker after adding text.

Speech input/playback uses browser `SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis`. Availability, permissions, voices and language quality depend on the browser/device; this does not establish a backend TTS integration.

Production builds run `tsc -b && vite build`. Serve the generated SPA with history fallback and an API reverse proxy; Vite's development proxy is **not** included in static assets.

## Local setup from a fresh clone

The steps below are **instructions for the developer**. They have not been executed as part of this documentation-only update. Commands that install packages, create tables, upload media or call providers change your environment.

### 1. Install tools and clone

Install Git, Node **24.11+ LTS**/npm, Python 3.12 or a compatible interpreter, and Docker Desktop/Compose v2. Reels require a working platform-compatible binary supplied by `ffmpeg-static` during backend dependency installation; installing a system FFmpeg alone does not satisfy the imported-binary path. Start Docker Desktop. Use your organization's approved tool distributions.

```bash
git clone https://github.com/saraswatibalotiya/growpilot.git
cd growpilot
```

### 2. Install application dependencies

Each application has its own dependency boundary:

```bash
# From the repository root:
(cd backend && npm ci)
(cd frontend && npm ci)

cd ai-engine
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cd ..
```

The Python dev requirements include runtime requirements. Use [requirements.txt](ai-engine/requirements.txt) alone for a runtime-only installation. No root `npm install`, pnpm workspace, or combined install script is configured.

### 3. Create environment files

```bash
# From the repository root; do this once, do not overwrite existing configuration:
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai-engine/.env.example ai-engine/.env
```

Fill placeholders locally using the [environment reference](#environment-and-configuration-reference). Do not commit the resulting files. At minimum configure the primary database and JWT secrets before backend startup. Configure media/AI accounts only for features you intend to exercise; missing external credentials do not become working integrations merely because an HTTP server starts.

For a no-paid-provider Python demo keep `AI_PROVIDER=mock`, `STORAGE_BACKEND=memory`. For integration with real application data set `LOAD_MOCK_DATA=false`, `TREND_PROVIDER=none` (or a reviewed file), `FESTIVAL_INCLUDE_SAMPLE=false`, and a service token matching the backend bridge.

### 4. Start primary infrastructure

```bash
# From repository root:
docker compose up -d
docker compose ps
```

This starts **PostgreSQL 5432, Redis 6379, Adminer 8080 only**. PostgreSQL creates `growpilot_db` with user `growpilot_user`; set the backend `DATABASE_URL` to that database using the password configured in root Compose. Example URL shape:

```dotenv
DATABASE_URL=postgresql://growpilot_user:<compose-password>@localhost:5432/growpilot_db
```

Angle-bracket strings throughout this guide are placeholders to replace, not usable credentials. Percent-encode reserved characters in URI passwords. Do not copy the AI async-driver URL into the NestJS configuration.

### 5. Initialize the primary schema and start NestJS

The repository is on an early **Prisma 8 release candidate**, with a different CLI from mainstream Prisma tutorials. From a separate terminal:

```bash
cd backend
# Regenerate the tracked schema.json/schema.d.ts after schema changes or if missing:
npm run contract:emit

# Fresh, empty local database: command documented by this repository's Prisma 8 guide.
npx prisma db init
npx prisma migration status

npm run start:dev
```

**Important setup limitation:** [prisma-8.md](backend/prisma-8.md) describes `db init` as creating tables. It does **not** establish that this replays every checked-in migration or stamps an identical history. The sequence above is repository-documented, not a freshly exercised empty-database bootstrap. Before using an existing/shared database, inspect migration status and review a plan with the installed RC; do not run initialization blindly.

The documented schema-change workflow in [AGENTS.md](backend/AGENTS.md) is:

```bash
# From backend/, after editing the schema:
npm run contract:emit
npx prisma migration plan
# Review generated changes and back up the target before applying:
npx prisma db migrate --advance-ref db
```

Do **not** substitute legacy `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` instructions. No migration-name flag or verified production replay recipe is assumed here. Generated files are already tracked, so an unchanged checkout does not inherently need contract emission before every build.

From another terminal, confirm PostgreSQL-backed health:

```bash
curl -sS -f http://localhost:4000/health
```

Open `http://localhost:4000/docs` for development API exploration. Redis must be running for the default Instagram sync worker; mock Instagram mode alone does not disable that connection.

Optional **QA fixture** seeding, from the backend directory, targets the configured local database:

```bash
NODE_ENV=development ENABLE_TEST_MODE=true ENABLE_LIVE_INSTAGRAM_PUBLISH=false npm run seed
```

[seed.ts](backend/prisma/seed.ts) reads [test-cases.json](backend/prisma/test-cases.json) to create mock accounts/posts/snapshots. It refuses production, enabled live publishing, or missing explicit test mode. Its fixture owner is disabled and receives a random hashed password; **there is no known/default seed login**. Create a separate account through signup for browser use. Do not enable test mode permanently just to use seeded data.

### 6. Optional: start persistent Python storage

Skip this step for a standalone memory-mode demo. It is recommended when feedback/recommendations must survive restarts.

```bash
cd ai-engine
source .venv/bin/activate
export AI_ENGINE_SERVICE_TOKEN='<random-service-secret>'
export AI_ENGINE_DB_PASSWORD='<local-ai-database-password>'
docker compose up -d ai-engine-db
docker compose ps

export DATABASE_URL='postgresql+asyncpg://growpilot_ai:<local-ai-database-password>@localhost:5433/growpilot_ai'
alembic upgrade head
cd ..
```

Use the **same chosen AI database password** in Compose and the URL. Set `STORAGE_BACKEND=postgres` and the matching `DATABASE_URL` in the engine environment. Root and AI Compose are different projects; run each command from the directory shown.

`AI_ENGINE_SERVICE_TOKEN` is required at Compose parsing time even for database-only startup. For a host-run engine, set `SERVICE_TOKEN` to the same value in [ai-engine/.env](ai-engine/.env.example)'s local copy (or export it). The backend variable is named `AI_ENGINE_SERVICE_TOKEN`, not `SERVICE_TOKEN`.

The init script creates `growpilot_ai_test` only on the first database-volume initialization. Do not delete an existing volume merely to create that database; create a dedicated test database deliberately if the volume predates the script.

### 7. Start the engine independently

In its own terminal:

```bash
cd ai-engine
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Verify from another terminal:

```bash
curl -sS -f http://127.0.0.1:8001/health
```

Open `http://127.0.0.1:8001/docs`. To try the older fictional boutique fixture, leave demo seeding enabled and use `profile_id=prof_boutique_mumbai`, `as_of=2026-10-05` when generating. With `LOAD_MOCK_DATA=false`, create/sync a profile first; fixture IDs will not exist.

For PostgreSQL mode, an explicitly copied `LOAD_MOCK_DATA=true` opts into sample seeding. Change it before using the persistent integrated environment.

### 8. Start the frontend

After the backend is configured, migrated and running (see the backend steps and [run commands](#run-commands-and-startup-order)):

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`, sign up, and complete business onboarding. There is no assumed shared demo login. Connect a mock account for safe development, or configure live Meta access explicitly. Existing Instagram media/metrics must be synchronized before the AI Overview can report meaningful account analytics.

The UI publishing flag defaults to off. Keep it off while onboarding/testing. Provider generation and Cloudinary upload can require credentials even when Instagram itself is in mock mode.

### 9. Verify the integrated path

1. Confirm root Compose services are running and primary migrations applied.
2. Confirm backend responds and signup/login/onboarding work.
3. If enabling intelligence, confirm Python storage-aware health and token/URL match.
4. Enable `AI_ENGINE_ENABLED` in NestJS, restart it, and reload the frontend.
5. Inspect AI Overview status and banners; no Instagram connection or no synced posts is an expected data gap, not a successful live intelligence run.
6. Generate with wording disabled first. Inspect evidence, missing-data notes and sample labels.
7. Test a real wording provider only after configuring an authorized model/key and acknowledging costs.
8. Keep publishing disabled unless intentionally verifying the separate approval/live-publishing flow.

## Run commands and startup order

Use separate terminals for long-running host applications. Start dependencies before consumers:

```text
Primary PostgreSQL + Redis
  -> primary migrations
  -> NestJS API/workers
AI PostgreSQL (if selected)
  -> Alembic migrations
  -> Python engine (if bridge selected)
Frontend -> NestJS -> optional Python
```

The backend can run with the Python bridge off. The Python engine can run independently without NestJS, Instagram or Redis.

| Working directory | Command | Purpose / address |
|---|---|---|
| Root | `docker compose up -d` | Primary PostgreSQL 5432, Redis 6379, Adminer 8080 |
| Root | `docker compose ps` | Inspect primary containers |
| Root | `docker compose down` | Stop primary containers while retaining named volumes |
| `backend/` | `npm start` | Nest API with `.env` |
| `backend/` | `npm run start:dev` | Watch-mode API/workers, port 4000 |
| `backend/` | `npm run start:debug` | Debug/watch API |
| `backend/` | `npm run build` | Compile NestJS |
| `backend/` | `npm run start:prod` | Run `dist/main` after build; provision production env explicitly |
| `backend/` | `npm run contract:emit` | Regenerate schema contract artifacts |
| `backend/` | `npx prisma migration status` | Inspect primary migration state |
| `backend/` | `npx prisma studio` | Inspect configured primary DB; treat write access carefully |
| `ai-engine/` | `docker compose up -d ai-engine-db` | Optional AI PostgreSQL 5433; export Compose service token first |
| `ai-engine/` | `alembic upgrade head` | Apply AI migrations; export AI `DATABASE_URL` first |
| `ai-engine/` | `uvicorn app.main:app --reload --host 127.0.0.1 --port 8001` | Host development engine |
| `ai-engine/` | `uvicorn app.main:app --host 0.0.0.0 --port 8001` | Non-reloading ASGI process, behind private deployment networking |
| `ai-engine/` | `docker compose --profile service up -d --build` | Optional engine + separate database container; applies Alembic |
| `frontend/` | `npm run dev` | Development SPA, port 3000 |
| `frontend/` | `npm run build` | Type-check and create production static assets |
| `frontend/` | `npm run preview` | Local build preview; no project-specific preview port configured |

No single root command starts the complete three-application system. Do not run Compose `down -v` unless you deliberately intend to destroy the corresponding local database volume.

The backend has a **development-only** `npm run start:all` convenience script: it first runs `stop:all`, tries Docker Desktop/startup, starts root infrastructure, then frontend dev and backend watch processes. It does **not** start Python. `stop:all` kills listeners on hard-coded ports **4000 and 3000**, potentially unrelated processes, ignores custom backend ports, and does not stop Compose. Coordinated Ctrl-C cleanup is not established. Prefer the separate-terminal procedure above on shared machines.

`npm run deploy` invokes `nest deploy`, but no verified deployment target/environment is supplied; it is not a ready production release command. Backend `postinstall` attempts `prisma skills sync || exit 0`; this is tooling synchronization, not migration or contract generation.

## Tests and code quality

These are configured commands, **not claims of a fresh passing full-stack run**. This documentation change did not install dependencies, call paid APIs, publish media, or start production jobs.

### Backend checks

From [backend/](backend/):

```bash
npm run lint
npm run build
npm test -- --runInBand
# Focus one suite with the same runner, for example:
npm test -- --runInBand ai-engine
```

Other configured scripts: `npm run test:watch`, `npm run test:cov`, `npm run test:debug`, `npm run test:e2e`. `npm run format` **writes** Prettier changes across source/test TypeScript; do not treat it as a read-only check.

Jest runs through Node experimental VM modules and `ts-jest`; Supertest/Nest testing support HTTP tests. E2E tests may require a configured primary database and initialized schema. Run against an explicitly disposable database, never a production URL; inspect the selected suite's fixture/cleanup behavior before running it. The QA seed is not required for every unit suite and is not an interactive test login.

### Frontend checks

From [frontend/](frontend/):

```bash
npm run test:unit
npm run check:i18n
npm run lint
npm run build
```

The current unit script uses Node's built-in runner directly on TypeScript: `node --test "tests/*.test.ts"`. Use a modern Node release with type stripping. It covers 12 focused AI Overview logic cases, not all UI behavior. No frontend browser/E2E runner is declared.

`npm run build` includes `tsc -b`; there is no separate frontend `typecheck`, `test`, or formatting script to assume exists.

### Python checks

Activate the virtual environment, then from [ai-engine/](ai-engine/):

```bash
pytest
ruff check .

# Narrow selections, rather than always running everything:
pytest tests/unit tests/integration tests/quality
pytest tests/unit/test_ai_provider_scenarios.py
```

[pytest.ini](ai-engine/pytest.ini) supplies Python path/test discovery and asyncio mode. Tests include analytics, evidence/ranking/diversity, provider wire/error scenarios, HTTP contracts, competitor rules, and persona quality regressions. Real persistence and live provider tests skip without explicit opt-in:

```bash
# Disposable AI test database only: these tests truncate engine tables.
export TEST_DATABASE_URL='postgresql+asyncpg://growpilot_ai:<password>@localhost:5433/growpilot_ai_test'
pytest tests/persistence

# Costs/network are intentional here; export keys from your secret manager first.
export LIVE_AI_TESTS=1
pytest tests/live
```

Do not use the development/production database for tests. The name guard (`test` in the database name) supplements, but does not replace, choosing a dedicated database.

Provider scenarios cover success adapters, invalid keys, timeouts, rate limits, malformed/empty responses, unavailability, selection, and keyless mock behavior. A fake-client/wire test is not evidence that your real account can use a model. Live success requires actual keys, budget and entitlements.

### Repeatable quality demos

```bash
# From ai-engine/ with the venv active; fictional datasets, no real account.
python -m app.demos --all
python -m app.demos --demo restaurant
python -m app.demos --demo restaurant --with-competitors --count 5
```

The five quality personas use evaluation date **2026-11-17**. The API's older bundled profile fixtures are designed around **2026-10-05**; specify `as_of` when reproducing those outputs.

The following are **write operations**, not read-only test commands:

```bash
python -m app.demos --report          # rewrites the quality report
python -m app.demos.datasets --write  # regenerates persona JSON fixtures
```

Review their diffs before committing. The checked-in [quality report](ai-engine/docs/RECOMMENDATION_QUALITY.md) is a historical artifact, not proof of present-day live intelligence.

## Troubleshooting

| Symptom | Checks and corrective action |
|---|---|
| `npm ci` fails on engines/native packages | Confirm supported Node version, use each app's own directory/lockfile, and inspect the first installation error. Do not mix package managers or delete the lockfile as a first step |
| Direct frontend TypeScript tests fail to load | Use Node with built-in TypeScript stripping, preferably Node 24.11+ LTS; Vite's engine minimum is not enough to prove the test command works |
| Port already in use | Inspect the specific listener, e.g. `lsof -nP -iTCP:4000 -sTCP:LISTEN`; stop only a process you own or choose consistent alternate ports/URLs |
| Primary database refused/authentication failed | Start root Compose, inspect `docker compose ps`, compare backend URL/user/database/password against Compose, and distinguish host `localhost:5432` from container `postgres:5432` |
| Changed database password still fails | Existing volumes retain their initialized credentials. Changing Compose environment does not alter an existing PostgreSQL user's password. Update credentials deliberately; do not delete data volumes |
| Redis connection refused | Start root Redis, verify port 6379, and match queue host/port config. Processes in different containers cannot use host `localhost` to reach one another |
| Backend Prisma migration command rejects old flags | This repository uses Prisma 8 TypeScript schema/migration tooling. Use the [primary setup commands](#5-initialize-the-primary-schema-and-start-nestjs), not legacy Prisma CLI recipes |
| Prisma succeeds but application tables are absent | Verify the exact database URL and deployment of committed migrations; generation alone does not apply schema changes |
| Frontend `/api` 404 or HTML response | Confirm backend port and `/api` stripping in development. Production needs its own reverse proxy or `VITE_API_BASE` at build time |
| Proxy target override in `.env` has no effect | Launch Vite with exported/process `VITE_API_PROXY_TARGET`; config does not load it through `loadEnv` |
| Signed-in UI redirects unexpectedly | Inspect access/refresh flow and backend JWT configuration; clear stale localStorage only after considering unsaved draft data. A mock Instagram account is not a real live connection |
| AI Overview missing from sidebar | Enable backend bridge configuration and restart NestJS; disabled status hides link. There is no `VITE_FEATURE_AI` switch |
| AI Overview unavailable | Check Python `/health`, matching service token, bridge URL, timeouts and process-local circuit breaker. Reload after configuration changes |
| Audience section empty/404/409 | Current bridge sends posts but not comments/demographics. Missing audience data is expected until ingested, not a reason to synthesize audience claims |
| `uvicorn`, `pytest`, or imports missing | Activate `ai-engine/.venv`, run from `ai-engine/`, and ensure the documented requirements were installed in that environment, not global Python |
| Python fails at startup in production | Supply `SERVICE_TOKEN`; PostgreSQL mode also requires a valid `postgresql+asyncpg://` URL. Read the safe configuration error rather than disabling protection |
| AI Compose fails even for database-only startup | Export `AI_ENGINE_SERVICE_TOKEN` before invoking Compose; interpolation validates the profiled service too |
| Alembic reports missing URL/wrong database | Export `DATABASE_URL` in the migration shell. Alembic does not load engine `.env`; verify the separate `growpilot_ai` database |
| AI `/health` is 503 | Storage is not ready/reachable or schema setup is incomplete. Check database health/migrations; do not advertise the engine as ready from process existence alone |
| Gemini/Claude authentication/model error | Verify the selected server-side key, project permission and actual model ID. Never paste the key into browser tools/logs. Repository model defaults are not entitlements |
| Provider timeout/429/5xx | Check retry budget and total bridge generation timeout. Wait/scale appropriately; do not blindly retry non-idempotent generation or disguise failure as success |
| Malformed/empty/truncated/unsafe AI output | Inspect safe error kind and output budget; fix prompt/model compatibility with tests. Do not bypass the guard or save an invented fallback |
| Fictional trends or approximate festivals appear | Disable `TREND_PROVIDER=sample` and `FESTIVAL_INCLUDE_SAMPLE`; explicitly configure file/none and reviewed source data. Restart after calendar changes |
| Recommendations disappear after restart | Memory storage is the default. Configure/migrate the separate PostgreSQL store before expecting persistence |
| Database tests skip | Export a separate `TEST_DATABASE_URL` with `test` in its database name. Skipping is safer than silently using the development database |
| Live provider tests skip | They intentionally require `LIVE_AI_TESTS=1` and exported keys; app `.env` is not automatic test opt-in |
| Reel rendering fails | Check the imported `ffmpeg-static` binary's presence/platform execution, source images, Cloudinary and pipeline logs. Current reels have no TTS stage or system-PATH FFmpeg fallback. A working API does not prove a working renderer |
| Browser speech input unavailable | Browser APIs/permissions/voices vary; use typed input and check device support |
| Build/type-check failure | Read the first diagnostic and relevant service section. Existing migration/generated-file typing issues are not solved by inventing a new build script |

Use safe request IDs to correlate bridge/engine requests. Do not attach full environment dumps, tokens, raw customer comments or signed media URLs to public issues.

## Production deployment

### What is already configured

- Independent Node application build/start scripts and a static frontend build.
- Python [Dockerfile](ai-engine/Dockerfile) with a non-root runtime and health check.
- Optional AI [service Compose profile](ai-engine/docker-compose.yml) with PostgreSQL health dependency and `alembic upgrade head` before Uvicorn.
- Server-side integration gates, engine service-token validation, input validation, timeouts and scoped persistence.

### What requires manual setup

There is **no complete production platform deployment** in root Compose. Provision the primary database, Redis, media/provider accounts, separate AI database if enabled, private networking, DNS, HTTPS, reverse proxy, secrets, backups and log/metric collection.

Recommended boundary:

1. Public frontend over HTTPS with SPA history fallback.
2. Public NestJS API over HTTPS, either under the same-origin `/api` reverse proxy or an explicitly configured origin.
3. Python reachable **only** by NestJS on a private network; no public ingress for `/api/v1`, `/docs`, or `/openapi.json`.
4. Databases/Redis private and access-controlled. Do not expose local Adminer or development Compose credentials.

Build the frontend with its final public `VITE_API_BASE`; those values are compiled into assets. DNS, certificate issuance and proxy configuration are **Not configured** by this repository's frontend Vite config. Ensure Instagram redirect URLs exactly match the public HTTPS callback registered with Meta.

For Python:

```bash
# Run from ai-engine/; building is separate from applying migrations.
docker build -t growpilot-ai-engine .
```

The Dockerfile's default server command does not itself run migrations. With the provided optional service profile:

```bash
# Export secrets securely first; placeholders below are not valid credentials.
export AI_ENGINE_SERVICE_TOKEN='<random-service-secret>'
export AI_ENGINE_DB_PASSWORD='<ai-database-password>'
docker compose --profile service up -d --build
```

That Compose profile binds the engine to host loopback and sets production/service-auth/PostgreSQL mode and `LOAD_MOCK_DATA=false`. It does **not** disable fictional trends or festival samples, forward custom model IDs, or mount arbitrary operator data files. Those require an explicit deployment environment/mount configuration before presenting results as real intelligence.

Set `TREND_PROVIDER=none|file`, `FESTIVAL_INCLUDE_SAMPLE=false`, appropriate provider/model values, and production database/timeouts in your deployment configuration. Do not assume every host variable is forwarded through Compose's explicit environment list.

### Operational checklist

- Apply each database's migrations as a controlled release step; retain rollback/backups and never use destructive development reset against production.
- Run backend queue processors with the same queue/configuration expectations as the HTTP API.
- Protect publishing with explicit flags, approval, authorized accounts and Meta permissions.
- Rotate provider/JWT/Instagram/service credentials through a secret manager; never bake them into images or frontend assets.
- Restrict HTTP body size at ingress, rate-limit at a shared layer, and choose worker/pool sizes deliberately. Python's limiter and bridge breaker are process-local.
- Monitor HTTP failures/latency, queue failures/backlog, storage health, sync status, provider usage/cost and renderer failures.
- Probe Python `/health` for storage readiness; open documentation is not a readiness check.
- Establish retention/deletion for raw comments, tokens, generated media and per-business intelligence. Excerpt masking does not anonymize stored inputs.
- Smoke-test with mock publishing first. Live OAuth, provider, upload and publishing success is environment/account-specific and was **not verified by this documentation change**.

## Developer workflow

1. Start a branch from the team's agreed base (no repository-specific enforced branch policy is assumed).
2. Read the relevant service's contract/configuration first; keep unrelated changes out of the diff.
3. Add focused tests and validate the smallest affected flow before broader suites.
4. Review migrations, generated artifacts, lockfiles, mock/production behavior and error paths.
5. Update this guide and the directly affected service docs/environment examples.
6. Confirm no secrets, local databases, voice assets or dependency folders are staged; submit for review.

### Add a backend module or API

Follow the existing NestJS controller/service/repository/DTO patterns. Register the module through the application module, use existing authentication/business ownership checks, and keep source data access behind its established repository. Validate input, preserve API response/error conventions, and add tests for ownership and failure behavior.

For Python-backed APIs, extend the **bridge** rather than exposing Python to the browser. Derive profile ownership from the authenticated business, propagate request IDs, bound timeouts, and retry only safe operations. Feature-off and engine-unavailable behavior must not break unrelated application routes.

### Add a frontend screen/component

Add a page, a route in [App.tsx](frontend/src/App.tsx), and the appropriate authenticated shell navigation. Put backend access in [services/](frontend/src/services/) through the shared client, not ad hoc token handling in a component. Reuse [styles/](frontend/src/styles/) tokens and existing UI patterns.

Add English/Hindi/Marathi translation keys with matching placeholders, then run `npm run check:i18n`, focused tests, lint and build. Preserve explicit loading/empty/error/disabled states and abort obsolete requests.

### Add an AI feature

Define contracts in [schemas/](ai-engine/app/schemas/), pure computation in [intelligence/](ai-engine/app/intelligence/) or [recommendation/](ai-engine/app/recommendation/), orchestration in [services/](ai-engine/app/services/), and a thin route in [api/routes/](ai-engine/app/api/routes/). Wire the container and add memory/PostgreSQL parity coverage where storage changes.

Use missing-data semantics, source provenance, profile scoping and deterministic `as_of` tests. Provider text cannot become authoritative evidence. Prompt changes require malformed/empty/unsafe-output tests as well as a mock success case.

### Add database models/migrations

Primary data belongs to Prisma; AI data belongs to SQLAlchemy/Alembic. Do not cross their database boundaries. Add ownership keys/indexes/constraints, generate or author the appropriate service migration, review its operations, apply to a disposable database first, and document deployment order.

For AI revisions, from [ai-engine/](ai-engine/), with exported `DATABASE_URL`:

```bash
alembic revision --autogenerate -m "describe_ai_schema_change"
# Review the generated revision, then:
alembic upgrade head
```

Downgrades are intentionally guarded. Never opt into destructive gates just to silence an error.

### Add an external integration

Add a server-side adapter and validated configuration, never frontend secrets. Document credential source/scopes, accepted data/licensing, timeout/retry/error semantics and mock behavior. Use fake transports first, then explicit opt-in integration checks. Keep non-idempotent effects out of generic automatic retry loops.

## Architectural decisions and known limitations

### Decisions to preserve

| Decision | Consequence for contributors |
|---|---|
| NestJS owns users, business access and Instagram credentials | Never trust a browser-supplied engine profile ID or let Python replace user authentication |
| Optional internal Python service | Existing product routes must continue working when Python is disabled/unavailable |
| Separate AI database/schema | Never run Alembic against the NestJS database or share application models casually |
| Rule-owned evidence and scoring | LLM text must not overwrite opportunity, confidence, dates, evidence or ranking |
| Missing data is distinct from zero | Preserve nullable metrics and disclose insufficient samples |
| Approval before external side effects | Generating/saving/feedback is not permission to publish |
| Explicit mock provenance | Do not remove fictional/mock labels to make demos look live |
| Business/creator strategies over shared math | Change framing separately from ranking mechanics |
| Contextual trends/festivals | Require profile/geographic relevance, freshness, source and verification notes |
| Bounded feedback learning | It is transparent rule adjustment, not autonomous retraining |
| Browser API goes through NestJS | No frontend AI-engine URL/token/provider secrets |

### Current gaps and technical debt

- **Annual festival refresh: Not implemented.** The workflow/module are empty stubs. Current data is manually curated and loaded on startup.
- **Search/social trend ingestion: Requires manual setup.** Only sample, file and disabled providers exist.
- **Competitor live Instagram provider: Not implemented.** Capability reporting/placeholder returns unsupported behavior; use approved public inputs, not scraping.
- **Audience bridge data: incomplete.** NestJS does not currently synchronize comments/demographics into Python; audience insights may be missing even when post analytics work.
- **Competitor bridge feed: incomplete.** Public competitor posts must be supplied through the internal engine contract; no NestJS dashboard feed is wired for them.
- **Festival proxy: Not implemented in NestJS.** Engine festival endpoints are internal, not browser APIs.
- **Storage default: volatile.** Memory mode loses recommendations, feedback and learning on restart.
- **Data quality: limited.** Topic/comment rules can misread sarcasm, unusual wording and multilingual text. Excerpts do not eliminate privacy obligations for raw inputs.
- **Safety checks: bounded, not comprehensive.** Lexical wording checks cannot prove semantic truth. Request-size checking based on `Content-Length` needs an enforcing reverse proxy.
- **Rate limits/circuit state: process-local.** Multiple workers do not share quotas/breaker state. Internal service auth is not end-user per-tenant authorization.
- **Source-backed does not mean universally confirmed.** Calendar annotations/jurisdiction and moon-sensitive dates need review; file-format validation does not authenticate a trend source.
- **Python reproducibility: Not configured with a lockfile.** Lower bounds can resolve differently. The default Claude model must be checked against the selected account.
- **General recommendations vs AI Overview differ.** The former uses local templates; only the latter uses the integrated Python recommendation service.
- **Frontend runtime evidence: incomplete.** Unit/build checks do not replace authenticated browser/full-stack testing with real account permissions.
- **Production orchestration: Requires manual setup.** Root Compose is infrastructure-only. TLS, domains, reverse proxy, secrets, backups and centralized observability are not delivered by that file.
- **Older documentation can be stale.** The root testing guide, frontend README, engine introduction and milestone notes include superseded assumptions. Prefer the actual contracts and caveats in this guide.

## Documentation and verification notes

### Further reading

| Document | Scope / caution |
|---|---|
| [Backend README](backend/README.md) | Backend-specific development notes; reconcile versions/commands with current manifest |
| [Frontend README](frontend/README.md) | Earlier UI guide; several endpoint/demo/reel statements are superseded |
| [Engine README](ai-engine/README.md) | Standalone service introduction; current Compose token/migration caveats are documented above |
| [Engine architecture](ai-engine/docs/ARCHITECTURE.md) | Internal layering |
| [Engine API](ai-engine/docs/API.md) | Additional request examples; generated OpenAPI is the executable route contract |
| [AI providers](ai-engine/docs/AI_PROVIDERS.md) | Wording refinement and provider behavior |
| [Recommendation engine](ai-engine/docs/RECOMMENDATION_ENGINE.md) | Candidate/scoring/diversity design |
| [Competitor intelligence](ai-engine/docs/COMPETITOR_INTELLIGENCE.md) | Permitted public inputs, approvals and provider limitations |
| [Real data sources](ai-engine/docs/REAL_DATA_SOURCES.md) | Trend/festival source fields and honesty requirements |
| [PostgreSQL persistence](ai-engine/docs/POSTGRES_PERSISTENCE.md) | AI store, migration safety and test isolation |
| [NestJS integration](ai-engine/docs/NESTJS_INTEGRATION.md) | Internal bridge contract/security |
| [Recommendation quality](ai-engine/docs/RECOMMENDATION_QUALITY.md) | Historical fictional-persona report |
| [Known engine limitations](ai-engine/docs/KNOWN_LIMITATIONS.md) | Additional limitations |

### How this guide was checked

The documentation was derived from application entry points, controllers/routers, settings/environment references, service/repository implementations, Prisma/SQLAlchemy models and migrations, npm manifests/lockfiles, Python requirements and existing installed package metadata, scripts, Compose/Docker configuration, tests and existing documentation.

Commands were checked against scripts/configuration; local Markdown destinations and section anchors were checked separately. Real secret environment files were not read. No application logic, database schema, dependency manifest or runtime feature was changed for this task.

Documentation verification does **not** certify fresh installation, a passing full suite, valid commercial credentials, live provider/model entitlement, Meta approval, deliverable media URLs, or production readiness. Missing external configuration and incomplete capabilities are identified explicitly rather than supplied as fictional working defaults.