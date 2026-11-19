# PostgreSQL persistence

The engine can store everything in PostgreSQL, so recommendations, feedback, outcomes and learning adjustments survive restarts.
The default is still the in-memory store (nothing to install). Choose PostgreSQL with `STORAGE_BACKEND=postgres`.

The database belongs to the engine alone: its own database (or at least its own `ai_engine` schema). **Never point it at the
existing GrowPilot database.** The Docker Compose file in this folder starts a separate PostgreSQL for development.

## Quick start (development)

```bash
cd ai-engine
docker compose up -d                       # PostgreSQL 16 on localhost:5433, databases growpilot_ai and growpilot_ai_test
source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL='postgresql+asyncpg://growpilot_ai:growpilot_ai_dev_only@localhost:5433/growpilot_ai'
alembic upgrade head                       # create the ai_engine schema and tables

export STORAGE_BACKEND=postgres
uvicorn app.main:app --port 8001
```

The password above is a development placeholder from `docker-compose.yml`. Change it with `AI_ENGINE_DB_PASSWORD=... docker compose up -d`
before the first start (and use the same value in `DATABASE_URL`).

Bundled **fictional** demo profiles are NOT loaded into a PostgreSQL database unless you set `LOAD_MOCK_DATA=true` yourself.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_BACKEND` | `memory` | `memory` or `postgres` |
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

* `upgrade` is additive. It creates the `ai_engine` schema if missing and then creates tables. It never drops, truncates or alters
  existing data, and it fails instead of overwriting if a table already exists. It touches nothing outside `ai_engine`.
* Without `DATABASE_URL` Alembic refuses to run. It never guesses a database.
* **Downgrade deletes all engine data** and is blocked unless you set both variables, the second naming the exact database:

  ```bash
  AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION=yes AI_ENGINE_CONFIRM_DATABASE=growpilot_ai_test alembic downgrade base
  ```

  If the name does not match the database actually connected to, it refuses. Use this on throwaway databases only. Take a backup
  (`pg_dump`) before changing a database that holds real data.
* To change the schema later: edit `app/db/models.py`, run `alembic revision --autogenerate -m "what changed"`, read the generated file,
  and make sure it is additive (add columns as nullable or with a default).
* Revisions: `0001` initial schema; `0002` adds `competitors.data_source` and `posts_updated_at` (additive; existing engine-suggested competitors are labelled `SAMPLE_PROVIDER`). A test migrates a database with old-shape rows up to head and checks nothing is lost.
* A test (`test_migration_matches_the_models`) fails if the models and the migrations disagree.

## Tables (schema `ai_engine`)

```
ai_profiles ─┬─ instagram_posts ── post_analytics
             ├─ audience_comments
             ├─ audience_insights
             ├─ competitors ── competitor_posts
             ├─ trend_snapshots
             ├─ recommendations ─┬─ recommendation_evidence
             │                   ├─ recommendation_feedback
             │                   └─ recommendation_outcomes
             └─ learning_adjustments
festival_events   (shared reference data, not profile-owned)
```

| Table | Holds |
|---|---|
| `ai_profiles` | Business/creator profile. `public_id` is the API's `profile_id` (`prof_...`); `id` is a UUID |
| `instagram_posts` | Imported post content (caption, type, time, permalink), unique per profile and media id |
| `post_analytics` | The metrics Instagram reported for a post. `NULL` = not reported, never 0 |
| `audience_comments` | Raw comments (kept so audience analysis can be repeated, for example for an earlier date) |
| `audience_insights` | Audience analyses over time (JSONB document, latest 20 kept) |
| `competitors`, `competitor_posts` | Competitors with their approval status and public posts only |
| `trend_snapshots` | The trends (with freshness) each recommendation run relied on, per profile and evaluation day (latest 100 kept) |
| `festival_events` | Festival reference data (bundled SAMPLE data, `verification_status` says so), synced at start-up |
| `recommendations` | The idea and its scores. `id` is the API's `recommendation_id`. Nested documents (reasoning, score breakdown, sources) are JSONB |
| `recommendation_evidence` | One row per supporting statement, in order |
| `recommendation_feedback` | What the owner did (saved, dismissed, published, ...) |
| `recommendation_outcomes` | Measured results at INITIAL/H24/H72/D7, unique per recommendation and interval |
| `learning_adjustments` | History of the rule-based adjustments. Exactly one row per (profile, dimension, value) is `is_current` |

Account-level analytics reports are not stored: they are derived from the stored posts, so they can not go stale.
`GET /api/v1/learning/history?profile_id=` returns the stored adjustments.

## How isolation is enforced

1. **Every query is scoped** by the profile row resolved from the public id. An id from another profile simply does not match (404).
2. **The schema enforces ownership.** Child rows point at their parent through a composite key `(parent_id, profile_id)`. Filing
   feedback, an outcome or evidence for profile A's recommendation under profile B is rejected by PostgreSQL itself, even for
   hand-written SQL. Tests try exactly that.
3. Also enforced by the database: unique ids per profile, allowed values for status/action/interval, score ranges 0-100, non-negative metrics.

## Transactions

Every store method is one transaction. Multi-table operations are all-or-nothing:

* saving recommendations together with their evidence (a failure in any one stores none of the batch);
* recording feedback or an outcome together with the recomputed learning adjustments;
* replacing a profile's posts or comments (a failure keeps the previous set).

## Failure handling

* A database that is down or slow becomes **503 `database_unavailable`**. A constraint conflict becomes **409**. Anything else is **500 `database_error`**.
  None of these messages contain the URL, host, user, password or SQL. Only the error *type* is logged.
* `/api/v1/health` checks the database and returns 503 when it is unreachable. The service still starts if the database is down at boot.
* Log lines are scrubbed of `scheme://user:password@host` and `password=` patterns, and `DATABASE_URL` is a `SecretStr`.

## Design note and known limitation

The services are synchronous, so the PostgreSQL store runs SQLAlchemy's async engine (asyncpg) on one dedicated background event-loop
thread and each call waits for its result. That kept all business logic untouched, but each request blocks its worker while the
database answers. For this service's load that is fine; the clean long-term step is async services and an async repository interface.
Other limits: there is no row-level security (isolation is by foreign keys plus scoped queries), concurrent feedback from two
requests can compute adjustments from slightly stale data (the database still keeps exactly one current row per key), and raw comment
text is stored, which may contain personal details: apply your own retention policy.

## Tests

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql+asyncpg://growpilot_ai:growpilot_ai_dev_only@localhost:5433/growpilot_ai_test'
pytest                      # everything; persistence tests are skipped if TEST_DATABASE_URL is not set
pytest tests/persistence    # only the PostgreSQL tests
```

The persistence tests never read `DATABASE_URL`, refuse a database whose name does not contain `test`, run the real migration, and
truncate the engine's tables between tests.
