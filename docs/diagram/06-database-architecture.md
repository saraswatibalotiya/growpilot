# 06 Database Architecture

[Index](README.md) | [AI engine](05-ai-engine-architecture.md) | [Workflow sequences](08-workflow-sequences.md)

There is **one application PostgreSQL database, `growpilot_db`**, with two separately managed schemas. The diagrams show logical entity relationships and selected identities, not every field/index. Source contracts remain authoritative.

## Schema Ownership

```mermaid
flowchart LR
    Nest["NestJS repositories"] --> Prisma["Prisma 8 RC\nContract and migration refs"]
    Prisma --> Public[("growpilot_db.public\n17 application tables")]
    Python["Python services"] --> SQL["SQLAlchemy / PostgresStore\nAlembic migrations"]
    SQL --> AI[("growpilot_db.ai_engine\n14 application tables plus version table")]
    Business["Owned public.businesses.id"] -.->|"Derived by NestJS; not a database FK"| Profile["AI profile public_id\nLive business or owner/industry mock"]
```

Do not let Prisma migrate/reset `ai_engine`, or Alembic touch `public`. Application authentication and scoped queries are still required; no PostgreSQL row-level-security policy is implemented. No cross-schema foreign key is declared for the derived business/profile mapping.

## Backend Entities: public

```mermaid
erDiagram
    users ||--o{ businesses : owns
    users ||--o{ auth_refresh_tokens : has
    users ||--o{ conversations : starts
    businesses ||--o{ social_accounts : connects
    businesses ||--o{ recommendations : has_backend_actions
    businesses ||--o{ products : catalogs
    businesses ||--o{ media_assets : stores_metadata
    businesses ||--o{ generation_cache : caches
    businesses ||--o{ conversations : contains
    businesses ||--o{ generated_posts : creates
    businesses ||--o{ reels : creates
    social_accounts ||--o{ instagram_posts : imports
    social_accounts ||--o{ sync_runs : records
    instagram_posts ||--o{ post_metric_snapshots : appends
    media_assets |o--o{ media_assets : source_variants
    media_assets ||--o{ media_analyses : caches_analysis
    media_assets |o--o{ reels : optional_source
    products |o--o{ generated_posts : optional_product
    products |o--o{ reels : optional_product
    conversations ||--o{ conversation_messages : contains
    conversations |o--o{ generated_posts : optional_context
    generated_posts ||--o{ post_images : ordered_photos
```

All 17 names are physical table names. Backend IDs are string-valued in the contract. Relationships generally cascade from the owner; optional post/reel references use `SetNull` where declared. A post's ordered image positions are unique; Instagram media is unique per account/platform media ID. Metrics are nullable: unknown is not a measured zero.

The backend `recommendations` table is a separate model from the engine's ranked ideas. There are no current `presence_assessments`, `leads`, `business_preferences`, campaign, content-draft, hashed-approval or RAG tables. A legacy schema comment about reel voiceover does not create an active TTS pipeline.

## AI Entities: ai_engine

```mermaid
erDiagram
    ai_profiles ||--o{ instagram_posts : owns_input
    ai_profiles ||--o{ audience_comments : owns_input
    ai_profiles ||--o{ audience_insights : stores_reports
    ai_profiles ||--o{ competitors : tracks
    ai_profiles ||--o{ trend_snapshots : captures
    ai_profiles ||--o{ recommendations : receives
    ai_profiles ||--o{ learning_adjustments : learns_preferences
    instagram_posts ||--o| post_analytics : has_metrics
    competitors ||--o{ competitor_posts : has_public_inputs
    recommendations ||--o{ recommendation_evidence : explains
    recommendations ||--o{ recommendation_feedback : receives
    recommendations ||--o{ recommendation_outcomes : observes
    festival_events {
        uuid id PK
        string public_id UK
        date date
        string verification_status
    }
```

`festival_events` is shared reference data, not owned by an individual profile. Alembic also maintains `ai_engine.alembic_version`, outside the 14 application models.

Internal AI keys are UUIDs; API profile/competitor IDs and imported media IDs have separate columns. Composite `(parent_id, profile_id)` foreign keys bind post metrics, competitor posts, recommendation evidence, feedback and outcomes to their parent's owner. The simplified diagram does not draw each repeated composite field.

Account analytics reports are recomputed from persisted posts/metrics; no `analytics_snapshots` table exists. Audience reports are JSONB history. Recommendation/evidence batches, feedback/outcome plus learning changes, and input replacement are transactional per store operation. The whole preview endpoint is **not** a single cross-operation transaction. Learning permits at most one current row per profile/dimension/value; JSON metrics are not protected by every API validation rule when written directly through SQL.

## Storage Locations

| Data | Durable Location / Behavior |
|---|---|
| Application identity/content | `public` tables |
| Live and mock AI inputs/results | Owner-scoped `ai_engine` rows; regeneration retains prior recommendation batches |
| Feedback/outcomes/learning | AI tables, not client-only state |
| Uploaded/processed image and video bytes | Cloudinary; database stores ownership and URLs/metadata |
| Sync/OAuth coordination | Redis; sync history stays in PostgreSQL |
| In-progress post form | React memory; does not survive a full reload |
| Browser session tokens | localStorage; server refresh sessions store hashes |

## Inspect Without Changing Data

In Adminer at `http://localhost:8080`, select server `postgres`, database `growpilot_db`, and schema **`ai_engine`** to see AI recommendations. `public.recommendations` can be empty without implying lost AI data. Root Compose credentials are local development defaults; see [TESTING.md](../../TESTING.md).

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('public', 'ai_engine')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;

SELECT count(*) AS saved_ai_recommendations FROM ai_engine.recommendations;
SELECT count(*) AS saved_feedback FROM ai_engine.recommendation_feedback;
```

Expected counts depend on use; a newly migrated database is empty until inputs/results are created. Do not select password hashes, encrypted tokens or raw customer comments into shared logs/screenshots.

## Migrations And Tests

For Prisma, see the [version-specific workflow](../../backend/prisma-8.md). Contract emission is not table creation. Review bootstrap versus migration-ref state before using an existing database; never use legacy reset recipes.

For AI migrations, export the intended async-driver `DATABASE_URL`, then run `alembic current` / `alembic upgrade head` from `ai-engine/`. Existing revisions add schema/backfill metadata while preserving rows; review future revisions. Downgrade to base deletes engine data and requires explicit safety gates. It is not a troubleshooting step.

```bash
# From repository root, once, only when this disposable database does not exist:
docker exec growpilot_postgres createdb -U growpilot_user growpilot_ai_test

# Then use a dedicated test shell:
cd ai-engine
source .venv/bin/activate
export TEST_DATABASE_URL='postgresql+asyncpg://growpilot_user:growpilot_password@127.0.0.1:5432/growpilot_ai_test'
pytest tests/persistence
```

This example uses root Compose's development credentials, not inspected secret files; adapt credentials for your environment. If the test database already exists, verify that it is disposable and owned by this test setup instead of dropping/recreating it. A disposable test database is not a second application database: normal backend/AI data still shares `growpilot_db`.

Fixtures truncate test tables. The name must contain `test`; one existing downgrade test additionally hard-codes `growpilot_ai_test`. Never use `growpilot_db` or delete application volumes to make tests pass. Restart tests prove persistence through new store connections; they do not prove a production backup/restore strategy.

Evidence: [Prisma schema](../../backend/prisma/schema.prisma), [emitted contract](../../backend/prisma/schema.json), [SQLAlchemy models](../../ai-engine/app/db/models.py), [PostgresStore](../../ai-engine/app/repositories/postgres.py), [migration safety](../../ai-engine/alembic/env.py), [persistence contract](../../ai-engine/docs/POSTGRES_PERSISTENCE.md).