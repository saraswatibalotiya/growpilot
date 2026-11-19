# PostgreSQL persistence

The engine stores application data in PostgreSQL, so live and mock recommendations, feedback, outcomes and learning adjustments survive restarts.
PostgreSQL is the default and is required outside automated tests. There is no application fallback to memory.

Both services use `growpilot_db` on the root PostgreSQL service. Prisma owns the backend's `public` tables; Alembic manages only
the `ai_engine` schema. Never run engine downgrades against the application database, or let Prisma manage the AI schema.

## Quick start (development)

```bash
cd ai-engine
docker compose -f ../docker-compose.yml up -d postgres
source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL='postgresql+asyncpg://growpilot_user:growpilot_password@localhost:5432/growpilot_db'
alembic upgrade head                       # create the ai_engine schema and tables

export STORAGE_BACKEND=postgres
uvicorn app.main:app --port 8001
```

The URL above uses local development credentials from the root Compose file. Production must supply its own credentials.
Alternatively run `npm --prefix ../backend run start:ai`: it selects PostgreSQL, applies migrations, and starts the engine.
`docker compose -f ../docker-compose.yml --profile service up -d --build` runs the engine in Docker against the same database.

Dashboard mocks are seeded per owner and industry under `mock_<businessId>_<industry>`, separate from `biz_<businessId>` live profiles.
The preview API reloads saved recommendations and feedback; regeneration appends history. Mock data is never a publishing authorization.

Bundled **fictional** demo profiles are NOT loaded into a PostgreSQL database unless you set `LOAD_MOCK_DATA=true` yourself.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_BACKEND` | `postgres` | Required for application use; memory is allowed only with explicit test settings |
| `DATABASE_URL` | none | `postgresql+asyncpg://user:password@host:port/database`. Required for `postgres`. Treated as a secret: never logged, printed or returned |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | 5 / 5 | Connection pool |
| `DB_CONNECT_TIMEOUT_SECONDS` | 5 | Time to open a connection |
| `DB_COMMAND_TIMEOUT_SECONDS` | 30 | Time for one statement |
| `TEST_DATABASE_URL` | none | Used only by the persistence tests. The database name must contain `test` |
| `AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION`, `AI_ENGINE_CONFIRM_DATABASE` | none | Both are needed to run a downgrade (below) |

## Migrations

```bash
export DATABASE_URL='postgresql+asyncpg://...'     # the database you intend to change, nothing else is consulted
alembic current                                    # which revision the database is at
alembic upgrade head                               # apply all new migrations (additive)
alembic history                                    # list revisions
```

* Existing upgrades preserve records while adding schema and, where needed, backfilling metadata. Revision `0001` creates tables; `0002` adds competitor provenance/freshness columns and backfills suggested competitors. These migrations do not drop/truncate application tables and target only `ai_engine`. Review future revisions rather than assuming every upgrade will always be nondestructive.
* Without `DATABASE_URL` Alembic refuses to run. It never guesses a database.
* **Downgrade to base deletes all engine data**. Individual downgrades can drop their added columns/metadata. Downgrades are blocked unless both variables are set, the second naming the exact database:

  ```bash
  AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION=yes AI_ENGINE_CONFIRM_DATABASE=growpilot_test alembic downgrade base
  ```

  If the name does not match the database actually connected to, it refuses. Use this on throwaway databases only. Take a backup
  (`pg_dump`) before changing a database that holds real data.
* To change the schema later: edit `app/db/models.py`, run `alembic revision --autogenerate -m "what changed"`, read the generated file,
  and make sure it is additive (add columns as nullable or with a default).
* Revisions: `0001` initial schema; `0002` adds `competitors.data_source` and `posts_updated_at` (additive; existing engine-suggested competitors are labelled `SAMPLE_PROVIDER`). A test migrates a database with old-shape rows up to head and checks nothing is lost.
* A test (`test_migration_matches_the_models`) fails if the models and the migrations disagree.

## Tables (schema `ai_engine`)

The complete [schema ownership and relationship diagrams](../../docs/diagram/06-database-architecture.md) live in the central diagram set. This document retains the operational table meanings, transaction/failure contract and migration safety details.

| Table | Holds |
|---|---|
| `ai_profiles` | Business/creator profile. `public_id` is the API's `profile_id` (`prof_...`); `id` is a UUID |
| `instagram_posts` | Imported post content (caption, type, time, permalink), unique per profile and media id |
| `post_analytics` | The metrics Instagram reported for a post. `NULL` = not reported, never 0 |
| `audience_comments` | Raw comments (kept so audience analysis can be repeated, for example for an earlier date) |
| `audience_insights` | Audience analyses over time (JSONB document, latest 20 kept) |
| `competitors`, `competitor_posts` | Competitors with their approval status and public posts only |
| `trend_snapshots` | The trends (with freshness) each recommendation run relied on, per profile and evaluation day (latest 100 kept) |
| `festival_events` | Verified-source, computed fixed-date and optional sample reference records, each with provenance/status; synced at startup |
| `recommendations` | The idea and its scores. `id` is the API's `recommendation_id`. Nested documents (reasoning, score breakdown, sources) are JSONB |
| `recommendation_evidence` | One row per supporting statement, in order |
| `recommendation_feedback` | What the owner did (saved, dismissed, published, ...) |
| `recommendation_outcomes` | Measured results at INITIAL/H24/H72/D7, unique per recommendation and interval |
| `learning_adjustments` | Rule-based history; a partial unique index permits at most one `is_current` row per (profile, dimension, value) |

Account-level analytics reports are not stored: they are derived from the stored posts, so they can not go stale.
`GET /api/v1/learning/history?profile_id=` returns the stored adjustments.

## How isolation is enforced

1. **Every query is scoped** by the profile row resolved from the public id. An id from another profile simply does not match (404).
2. **The schema enforces ownership.** Child rows point at their parent through a composite key `(parent_id, profile_id)`. Filing
   feedback, an outcome or evidence for profile A's recommendation under profile B is rejected by PostgreSQL itself, even for
   hand-written SQL. Tests try exactly that.
3. Database constraints also enforce profile-scoped uniqueness, selected status/action/interval enums, score ranges and some nonnegative counts. Request validation rejects negative input metrics, but not every metric/JSON field has a corresponding SQL check; do not assume arbitrary SQL writes receive full API validation.

## Transactions

Every store method is one transaction. Multi-table operations are all-or-nothing:

* saving recommendations together with their evidence (a failure in any one stores none of the batch);
* recording feedback or an outcome together with the recomputed learning adjustments;
* replacing a profile's posts or comments (a failure keeps the previous set).

## Failure handling

* A database that is down or slow becomes **503 `database_unavailable`**. A constraint conflict becomes **409**. Anything else is **500 `database_error`**.
  None of these messages contain the URL, host, user, password or SQL. Only the error *type* is logged.
* `/api/v1/health` checks the database and returns 503 when it is unreachable. Direct FastAPI startup can remain up with unavailable storage. `start.sh` and Compose run migrations first and can fail before Uvicorn starts; they do not silently select memory.
* Log lines are scrubbed of `scheme://user:password@host` and `password=` patterns, and `DATABASE_URL` is a `SecretStr`.

## Design note and known limitation

The services are synchronous, so the PostgreSQL store runs SQLAlchemy's async engine (asyncpg) on one dedicated background event-loop
thread and each call waits for its result. That kept all business logic untouched, but each request blocks its worker while the
database answers. Capacity/latency suitability has not been established by a production load test; async services/repository calls would be a separate architectural change.
Other limits: there is no row-level security (isolation is by foreign keys plus scoped queries), concurrent feedback from two
requests can compute adjustments from slightly stale data (the database enforces at most one current row per key), and raw comment
text is stored, which may contain personal details: apply your own retention policy.

## Tests

```bash
docker compose -f ../docker-compose.yml up -d postgres
# Use a separately provisioned disposable test database, never growpilot_db.
export TEST_DATABASE_URL='postgresql+asyncpg://growpilot_user:growpilot_password@localhost:5432/growpilot_ai_test'
pytest                      # everything; persistence tests are skipped if TEST_DATABASE_URL is not set
pytest tests/persistence    # only the PostgreSQL tests
```

The persistence tests never read `DATABASE_URL`, refuse a database whose name does not contain `test`, run the real migration, and
truncate the engine's tables between tests.

The full suite currently includes a downgrade-guard assertion hard-coded to `growpilot_ai_test`; another otherwise valid test database name can fail that case. Root Compose does not create a test database automatically. Provision disposable test storage explicitly; this test limitation is not a reason to run against application data.
