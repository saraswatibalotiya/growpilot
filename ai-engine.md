I will check on any running background test jobs and briefly inspect the remaining `ai-engine/` modules so I can provide a comprehensive, detailed architectural overview with clickable file and symbol paths.

List Shell Sessions
Completed with input: {}

Read 
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/recommendation/engine.py"
}

Read 
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/services/recommendation_service.py"
}

Read 
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/repositories/base.py"
}

Here is a complete, detailed overview of the **GrowPilot AI Engine** architecture, its layers, data flow, design rules, and important file paths.

---

## 1. High-Level Role & System Boundary

The Python service in `ai-engine/` is a **standalone, internal FastAPI intelligence service** that sits behind the primary NestJS backend. It shares **zero code, database tables, or Instagram OAuth credentials** with the NestJS app.

```text
Frontend (React/Vite)
   │  (User JWT)
   ▼
NestJS Primary Backend  ──►  backend/src/ai-engine/  (Feature-flagged: AI_ENGINE_ENABLED)
   │  (Bearer SERVICE_TOKEN + X-Request-ID over internal HTTP)
   ▼
Python FastAPI AI Engine (ai-engine/app/)
   ├── HTTP Layer: Routes, Auth, Rate Limiting, Correlation IDs, Envelopes
   ├── Service Layer: Orchestration & Profile-scoped Authorization
   ├── Pure Domain Layer (Zero I/O):
   │     ├── Intelligence Analyzers (Posts, Audience, Competitors, Trends)
   │     └── Deterministic Recommendation Engine (Candidates, Scoring, Diversity, Learning)
   ├── Optional AI Layer: Gemini / Claude / Mock (Wording Polish + Python Guard ONLY)
   └── Repository Layer (Protocol-driven):
         ├── InMemoryStore (default dev/test)
         └── PostgresStore (dedicated `ai_engine` schema on port 5433)
```

---

## 2. Layered Architecture & Key File Paths

### Layer 1: Application Bootstrap, Config & Security (`app/main.py`, `app/core/`)
Handles FastAPI wiring, middleware, settings validation, authentication, rate limiting, and uniform error envelopes.
* **`main.py`** — App factory (`create_app`), `RequestContextMiddleware` (propagates `x-request-id` / `x-correlation-id` and enforces `MAX_BODY_BYTES`), lifespan startup/shutdown, and router registration under `/api/v1`.
* **`dependencies.py`** — Dependency-injection `Container` holding `Settings`, `Store`, all domain services, and a lazily initialized/pooled `AIProvider`.
* **`config.py`** — Pydantic `Settings` (`AI_PROVIDER`, `STORAGE_BACKEND`, `ScoreWeights`, thresholds). Refuses to boot in `production` without `SERVICE_TOKEN` or in `postgres` mode without a `postgresql+asyncpg://` URL.
* **`security.py`** — `require_service_auth`: constant-time (`hmac.compare_digest`) Bearer token check on every route except `/health`.
* **`rate_limit.py`** — In-memory sliding-window per-caller rate limiter (`RATE_LIMIT_PER_MINUTE`, returns `429` with `Retry-After`).
* **`exceptions.py`** — Typed exceptions (`NotFoundError`, `ConflictError`, `AIProviderError`, `AINotConfiguredError`, `DatabaseUnavailableError`) mapped to `{"error": {...}, "meta": {"request_id": ...}}` without echoing sensitive input values.

---

### Layer 2: HTTP API Routes (`app/api/routes/` & `app/schemas/`)
Thin controllers with **no business logic**—they validate Pydantic inputs, call a single service method, and wrap outputs in `Envelope[T]`.
* **`profiles.py`** — `POST /profiles`, `PUT /profiles/{profile_id}` (idempotent upsert used by NestJS with `biz_<businessId>`), `GET / PATCH /profiles/{profile_id}`.
* **`analytics.py`** — `POST /analytics/analyze` (ingest posts + compute baselines), `GET /overview`, `GET /top-content`, `GET /content-breakdown`.
* **`audience.py`** — `POST /audience/analyze` (ingest comments + extract questions/themes), `GET /audience/insights`.
* **`competitors.py`** — `POST /suggest`, `POST /competitors`, `PATCH /{id}/approval` (`APPROVED` required before insights), `POST /{id}/posts`, `GET /landscape`, `GET /{id}/insights`.
* **`trends.py`** & **`festivals.py`** — `POST /trends/analyze`, `GET /trends/sources`, `GET /festivals/upcoming`, `GET /festivals/coverage`.
* **`recommendations.py`** — `POST /recommendations/generate`, `GET /recommendations`, `GET /recommendations/{id}`.
* **`feedback.py`** & **`outcomes.py`** — Record user actions (`SAVED`, `DISMISSED`, `PUBLISHED`, etc.), post-publish outcomes (`INITIAL`, `H24`, `H72`, `D7`), and read `GET /learning`.
* **Schemas (`app/schemas/`)**: Contract definitions in `profile.py`, `analytics.py`, `recommendation.py`, `trend.py`, `competitor.py`, `outcome.py`, and `common.py`.

---

### Layer 3: Orchestration Services (`app/services/`)
Coordinate between the `Store` and the pure analyzers, enforcing profile isolation (`profile_id` scoping) and temporal cutoffs (`as_of` date filtering so backtesting never leaks future data).
* **`recommendation_service.py`** — `collect_signals()` gathers analytics, audience, approved competitors, fresh contextual trends, upcoming festivals (45-day window), reused hashtags, and the profile's learning model into a `Signals` bundle, then runs `RecommendationEngine`.
* **`analytics_service.py`**, **`audience_service.py`**, **`competitor_service.py`**.
* **`trend_service.py`** & **`festival_service.py`** — Merge and

Read 
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/recommendation/ranking.py"
}

Read 
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/recommendation/learning.py"
}

Read , lines 1 to 90
Completed with input: {
  "path": "/Users/saraswatibalotiya/growpilot/ai-engine/app/db/models.py",
  "view_range": [
    1,
    90
  ]
}

Here is the detailed, end-to-end architecture overview of the **GrowPilot Python AI Engine** (`ai-engine/`), including how layers interact, core design invariants, data flows, and exact file paths.

---

## 1. High-Level Role & System Topology

The AI Engine is a **standalone, internal FastAPI service** responsible for deterministic content intelligence, analytics baselines, audience/competitor/trend analysis, ranked content recommendations, and feedback learning.

```text
GrowPilot Frontend (React/Vite)
        │  JWT (Browser)
        ▼
NestJS Monolith (backend/src/ai-engine/) ──► Owns Auth, Users, Instagram OAuth & Sync, Primary DB
        │  Bearer SERVICE_TOKEN + X-Request-ID (Server-to-Server only)
        ▼
Python FastAPI AI Engine (ai-engine/)
   ├── HTTP Layer (app/api/routes/)          Validate input, enforce auth/rate-limit, wrap envelope
   ├── Service Layer (app/services/)         Orchestrate signals, enforce profile isolation
   ├── Pure Domain Logic
   │     ├── Intelligence (app/intelligence/) Pure analyzers (posts, comments, competitors, trends)
   │     └── Recommendation (app/recommendation/) Candidate gen, scoring, diversity, learning
   ├── Optional AI Polish (app/ai/)          Gemini / Claude / Mock wording refiner + Python guard
   └── Storage Protocol (app/repositories/)  InMemoryStore (dev/test) | PostgresStore (`ai_engine` schema)
```

### Core Architectural Invariants
1. **Strict Separation of Responsibilities:** Python rules compute **all** baselines, evidence, opportunity scores, confidence scores, and rankings. LLMs (Gemini/Claude) **only polish copy** (`title`, `hook`, `caption_direction`, `call_to_action`) when `use_ai=true` and can never alter scores or invent facts.
2. **Missing Data $\neq$ Zero:** Unavailable Instagram metrics or missing signals (`audience`, `competitors`, `trends`) are represented as `None`. Scoring dynamically renormalizes weights across available signals rather than penalizing missing ones as `0`.
3. **No Silent AI Fallbacks:** If `use_ai=true` is requested and the LLM fails, times out, or violates output guards, the engine returns `502`/`503` without saving—never silently disguising rule-only output as AI-polished output.
4. **Zero Shared Database / Credentials:** It never touches the NestJS database or Instagram tokens. When using PostgreSQL, it lives in its own isolated database and `ai_engine` schema.

---

## 2. Directory & Layer Breakdown (with Key File Paths)

### A. Entrypoint, Configuration & Cross-Cutting Core
* **`main.py`** — FastAPI app factory (`create_app`), lifespan management, `RequestContextMiddleware` (propagates `x-request-id` / `x-correlation-id` and enforces `MAX_BODY_BYTES`), CORS, and router mounting under `/api/v1`.
* **`dependencies.py`** — Dependency-injection `Container` wiring the `Store`, domain services, trend/festival providers, and lazy-initialized `AIProvider` connection pool.
* **`config.py`** — `pydantic-settings` `Settings` class & `ScoreWeights`. Enforces startup invariants (e.g., refuses `ENVIRONMENT=production` without `SERVICE_TOKEN`; requires `postgresql+asyncpg://` when `STORAGE_BACKEND=postgres`).
* **`security.py`** — Constant-time (`hmac.compare_digest`) `Bearer <SERVICE_TOKEN>` verification on every route except `/health`.
* **`rate_limit.py`** — In-memory sliding-window per-caller rate limiter (`RATE_LIMIT_PER_MINUTE`, returns `429` with `Retry-After`).
* **`exceptions.py`** — Typed domain errors (`NotFoundError`, `ConflictError`, `AIProviderError`, `AINotConfiguredError`, `DatabaseUnavailableError`) mapped to uniform `{"error": ..., "meta": {"request_id": ...}}` JSON responses without echoing sensitive input values.

---

### B. HTTP API Layer (`app/api/routes/` & `app/schemas/`)
Thin FastAPI routers that validate Pydantic payloads, call a single service method, and return `Envelope[T]` (`{"data": ..., "meta": {"request_id": ...}}`):
* **`profiles.py`** & **`schemas/profile.py`** — `POST /profiles`, `GET/PATCH /profiles/{id}`, and idempotent `PUT /profiles/{id}` (used by NestJS to sync `biz_<businessId>` without an ID mapping table).
* **`analytics.py`** & **`schemas/analytics.py`** — `POST /analytics/analyze` (ingests `PostIn` items), `GET /analytics/overview`, `/top-content`, `/content-breakdown`.
* **`audience.py`** — `POST /audience/analyze` (comments + demographics), `GET /audience/insights`.
* **`competitors.py`** — Competitor suggestions (`PENDING` until approved), manual add, approval workflow, public post ingestion, per-competitor insights, and `/competitors/landscape`.
* **`trends.py`** & **`festivals.py`** — Contextual trend evaluation (`/trends/analyze`, `/trends/sources`) and festival calendars (`/festivals/upcoming`, `/festivals/coverage`).
* **`recommendations.py`** — `POST /recommendations/generate`, paged `GET /recommendations`, `GET /recommendations/{id}`.
* **`feedback.py`** & **`outcomes.py`** — Record owner actions (`SAVED`, `DISMISSED`, `PUBLISHED`, etc.), post-publish metrics (`INITIAL`, `H24`, `H72`, `D7`), and inspect `/learning` adjustments.

---

### C. Pure Intelligence Layer (`app/intelligence/`)
Stateless, I/O-free pure functions operating on Pydantic models:
* **`engagement_analyzer.py`** & **`format_analyzer.py`** — Computes account engagement baselines, format-normalized performance indices (so Reels aren't unfairly compared raw against static images), and posting-time windows (gated by `MIN_POSTS_FOR_BASELINE=5`, `MIN_POSTS_PER_FORMAT=3`, `MIN_POSTS_FOR_TIMING=12`).
* **`topic_extractor.py`** & **`content_analyzer.py`** — Extracts topics across English, Hinglish, and Devanagari captions and identifies winning/underperforming themes.
* **`comment_analyzer.py`** & **`audience_classifier.py`** — Detects price/shipping/sizing questions, objections, sentiment, and language mix while masking PII (emails/phone numbers).
* **`competitor_analyzer.py`** — Compares approved competitor formats/topics against the owner's posts to find content gaps.
* **`trend_analyzer.py`** — Evaluates trend freshness (`FRESH`, `STALE` > 14 days, `EXPIRED`, `UPCOMING`, `UNVERIFIED`) and contextual relevance matching profile category/niche/products + city/region/country.

---

### D. Recommendation & Learning Engine (`app/recommendation/`)
A single pipeline shared by `BUSINESS` and `CREATOR` profiles:
1. **Signal Collection** (`recommendation_service.py`) — Gathers profile, `as_of`-filtered analytics, audience insights, approved competitor gaps, contextual fresh trends, upcoming festivals (45-day window), owner's reused hashtags, and the active `LearningModel`.
2. **Strategy Selection** (`strategies/business.py`, `strategies/creator.py`) — Supplies profile-appropriate framing, CTAs, and objectives without duplicating engine math.
3. **Candidate Generation** (`candidate_generator.py`) — Turns each signal (winning format/topic, audience question, competitor gap, fresh trend, upcoming festival, evergreen fallback) into structured `Candidate` seeds with `Evidence` and `SourceReference` objects.
4. **Scoring & Ranking** (`ranking.py`):
   * **Opportunity Score (0–100):** Weighted sum over *available* signals (default weights: historical `0.25`, audience `0.20`, trend `0.20`, festival `0.15`, competitor `0.10`, goal `0.10`, renormalized when signals are `None`) + bounded learning adjustment.
   * **Confidence Score (0–95):** Combines evidence quality, breadth of agreeing signals, signal coverage, and `data_sufficiency` (penalizes missing post/comment history).
5. **Diversity Selection** (`diversity.py`) — Picks 3–5 top candidates while avoiding repetitive formats/topics and reserving a slot for relevant imminent festivals.
6. **Transparent Rule-Based Learning** (`learning.py`) — Aggregates feedback (`SAVED`/`LIKED`/`PUBLISHED` = `+1`, `DISMISSED`/`NOT_RELEVANT` = `-1`) and post-publish `Outcome` performance indices (`>=1.15` = `+1`, `<=0.85` = `-1`) per format/objective/tag. Applies shrinkage (`n / (n + 3)`) capped at `±8.0` points once `min_samples >= 3`, and suppresses fingerprints already used or dismissed.

---

### E. AI Provider & Safety Guard Layer (`app/ai/`)
Invoked **only** when `POST /recommendations/generate` sets `use_ai: true`:
* **`provider.py`** — Abstract `AIProvider` with bounded exponential-backoff retries on transient errors (`timeout`, `network`, `rate_limited`, `server_error`) and `build_provider(settings)` factory.
* **`gemini_provider.py`** — Calls Google `generateContent` via `httpx` (`x-goog-api-key` in header, never URL; `thinkingBudget: 0` on `2.5-flash`; maps HTTP 400 `API_KEY_INVALID` to `auth` and `MAX_TOKENS` to `truncated`).
* **`claude_provider.py`** — Uses `anthropic.AsyncAnthropic` with SDK retries disabled so retry counting stays centralized in `AIProvider.complete`.
* **`mock_provider.py`** — Deterministic zero-key provider that exercises the full prompt, JSON parser, and guard path offline.
* **`refiner.py`** & **`prompts/refine_recommendations.txt`** — Sends *only* `{recommendation_id, title, hook, caption_direction, call_to_action}` inside an escaped `<data>` block (`<` escaped as `\u003c` to prevent prompt-injection tag breakout).
* **`response_parser.py`** & **`guard.py`** — Validates strict JSON schema/lengths, verifies exact ID parity, and runs `check_wording()` in Python to reject (`502 unsafe_content`) any AI rewrite that introduces new numbers, hashtags, links, or unsupported claims (`viral`, `trending`, `guaranteed`, `proven`).

---

### F. External Data Integrations (`app/integrations/` & `app/data/`)
* **Trends** (`provider_interface.py`, `file_provider.py`) — Supports `TREND_PROVIDER=sample` (explicitly flagged `is_sample=True`), `file` (strictly validates source name, `http(s)` URL, observation dates, and rejects malformed/sample rows via `/trends/sources`), or `none`.
* **Festivals** (`calendar.py`, `festival_service.py`) — Merges three tiers by trustworthiness (`VERIFIED_SOURCE` > `RULE_FIXED_DATE` > `SAMPLE_UNVERIFIED`):
  1. Operator-supplied `FESTIVAL_DATA_FILE` + bundled official India 2027 DoPT calendar (`festivals_verified_2027.json`), including moon-sighting caveats.
  2. Computed fixed-date occasions (`Republic Day`, `Independence Day`, `Christmas`, etc.) for any year.
  3. Bundled approximate samples (`festivals_sample.json`) — never labeled confirmed.

---

### G. Persistence Layer (`app/repositories/`, `app/db/`, `alembic/`)
* **`repositories/base.py`** — `Store` protocol combining `ProfileRepository`, `ContentRepository`, `CompetitorRepository`, `RecommendationRepository`, and `InsightRepository`. Every read requires `profile_id` for tenant isolation.
* **`repositories/memory.py`** — Fast `InMemoryStore` default for local runs and unit tests.
* **`repositories/postgres.py`** & **`db/models.py`** — Async SQLAlchemy 2 + `asyncpg` store in the dedicated `ai_engine` PostgreSQL schema (`ai_profiles`, `instagram_posts`, `post_metrics`, `audience_comments`, `analytics_snapshots`, `audience_snapshots`, `competitors`, `competitor_posts`, `recommendations`, `recommendation_feedback`, `recommendation_outcomes`, `learning_adjustments`, `trend_snapshots`, `festival_events`). Uses composite foreign keys `(parent_id, profile_id)` so cross-profile data corruption is impossible at the DB constraint level. Schema migrations live in **`alembic/versions/`**.

---

### H. NestJS Bridge & Test Suites
* **NestJS Client Module** (`backend/src/ai-engine/`):
  * `ai-engine.client.ts` — `Bearer` service auth, `X-Request-ID` forwarding, timeouts, retries on idempotent calls only, and a circuit breaker.
  * `ai-engine.service.ts` & `ai-engine.controller.ts` — Feature-flagged (`AI_ENGINE_ENABLED=true`) `/ai-insights/*` endpoints; derives `biz_<businessId>` from the JWT user so clients can never spoof profile ownership.
* **Test Suites** (`ai-engine/tests/`):
  * `tests/unit/` — Analyzers, ranking, trends/festivals, and wire-level Gemini/Claude scenarios (`test_ai_provider_scenarios.py`).
  * `tests/integration/` — Full FastAPI routes & NestJS contract tests (`test_api.py`, `test_internal_contract.py`).
  * `tests/persistence/` — Contract parity tests run against both `InMemoryStore` and real PostgreSQL (`test_store_contract.py`).
  * `tests/quality/` — End-to-end recommendation quality & competitor regression suites across 5 persona datasets.
  * `tests/live/` — Opt-in real-network smoke tests for Gemini and Claude (`test_live_providers.py`).

*(Note: If you'd also like me to proceed with implementing the **Phase 7 Frontend AI Dashboard** screens starting with AI Overview in `frontend/`, let me know and I will build it right away!)*