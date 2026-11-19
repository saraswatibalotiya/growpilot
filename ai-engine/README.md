# GrowPilot AI Engine (Content Intelligence)

A standalone Python service that looks at an Instagram business or creator profile and returns **3-5 ranked, evidence-backed
content recommendations**. It analyses past performance, audience comments, approved competitors, current trends and upcoming
Indian festivals, and explains every suggestion.

It runs as a separate service from NestJS and React, using the same `growpilot_db` PostgreSQL database. AI data lives in the
`ai_engine` schema, separate from Prisma's `public` tables. The mock AI provider needs no paid API key; both live and mock results persist.

## Run it

Start the shared PostgreSQL service first (`docker compose up -d postgres` from repository root). `start.sh` requires an existing virtual environment, applies AI-schema migrations and uses local root-Compose database defaults unless `DATABASE_URL` is exported. Configure production credentials explicitly; do not use development defaults on a public server.

```bash
cd ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
sh start.sh
```

Open http://localhost:8001/docs for the interactive API.

```bash
pip install -r requirements-dev.txt   # once, for tests and lint
pytest                                # all tests
ruff check .                          # lint
```

The recommended startup defaults `LOAD_MOCK_DATA=false`; the fixture IDs below do not exist automatically. To use these older bundled fixtures, explicitly export `LOAD_MOCK_DATA=true` before startup in a local demo database, or create a profile through the API. Their reference date is **2026-10-05**; `as_of` controls relevant date filters, not a complete historical database snapshot. Include service authorization when configured:

```bash
curl -s localhost:8001/api/v1/recommendations/generate \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"profile_id":"prof_boutique_mumbai","as_of":"2026-10-05","count":4}' | python3 -m json.tool
```

Sample profiles (all fictional): `prof_boutique_mumbai`, `prof_beauty_creator`, `prof_food_creator`, `prof_restaurant_bengaluru`,
`prof_travel_creator`.

## The five quality demos

Five **fictional** profiles (restaurant, fashion creator, travel creator, beauty creator, and a brand-new business with almost no
data) with sample posts, comments and trends, built to check recommendation quality. The evaluation date is **2026-11-17**.
They are not real Instagram data and not benchmarks.

The current CLI runner constructs test settings but does not explicitly choose a store. **Export `STORAGE_BACKEND=memory` for these test-only demos** so they cannot inherit an application PostgreSQL connection. This is not application runtime storage. `--report` and dataset `--write` modify files; do not run them as read-only checks. Report generation uses its fixed evaluation date/count, not the CLI's `--as-of`/`--count` options.

```bash
STORAGE_BACKEND=memory python -m app.demos --all
STORAGE_BACKEND=memory python -m app.demos --demo restaurant
STORAGE_BACKEND=memory python -m app.demos --demo travel_creator --as-of 2026-12-20 --count 5
STORAGE_BACKEND=memory python -m app.demos --report  # writes the fixed-date quality report
python -m app.demos.datasets --write               # regenerate app/demos/data/*.json
pytest tests/quality                               # the quality tests
```

Results and the problems found are in [docs/RECOMMENDATION_QUALITY.md](docs/RECOMMENDATION_QUALITY.md); limits are in
[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## Competitor intelligence

Competitors are analysed from **public information only**, supplied by the owner (no scraping; official Instagram access is a documented
placeholder). The engine reports who is active, what they post, which formats and hashtags they use, and which topics they cover that
you do not, and turns cross-competitor gaps into recommendations. See [docs/COMPETITOR_INTELLIGENCE.md](docs/COMPETITOR_INTELLIGENCE.md).

```bash
STORAGE_BACKEND=memory python -m app.demos --demo restaurant --with-competitors --count 5
```

## Persistent storage (PostgreSQL)

```bash
docker compose -f ../docker-compose.yml up -d postgres  # shared database on localhost:5432
export DATABASE_URL='postgresql+asyncpg://growpilot_user:growpilot_password@localhost:5432/growpilot_db'
alembic upgrade head                                   # create the tables (additive, never destructive)
STORAGE_BACKEND=postgres uvicorn app.main:app --port 8001
```

Recommendations, feedback, outcomes and learning adjustments then survive restarts. Details, the downgrade safety rules and the
table layout are in [docs/POSTGRES_PERSISTENCE.md](docs/POSTGRES_PERSISTENCE.md). To run the database tests set
`TEST_DATABASE_URL` to a separately provisioned disposable test database. Never run persistence tests against `growpilot_db`.

## Configuration

Application PostgreSQL storage and a valid database URL are required. See [.env.example](.env.example). Highlights: `AI_PROVIDER=mock|gemini|claude`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `SERVICE_TOKEN` (mandatory when `ENVIRONMENT=production`), `WEIGHT_*` score weights. Keys are read from the
process environment or the configured dotenv file and must never be logged or returned. Provider model defaults are not evidence of account entitlement or live availability.

## What it does

| Area | Endpoint prefix (`/api/v1`) |
|---|---|
| Health | `/health` |
| Profiles (business / creator) | `/profiles` |
| Saved dashboard mock previews | `POST /profiles/{id}/preview` (`mock_` profile IDs only) |
| Performance analytics | `/analytics` |
| Audience and comment intelligence | `/audience` |
| Competitors (suggested = PENDING until approved, or added manually) | `/competitors` |
| Trends (freshness-checked) and festivals | `/trends`, `/festivals` |
| Recommendations | `/recommendations/generate`, `/recommendations` |
| Feedback and learning | `/recommendations/{id}/feedback`, `/feedback`, `/learning` |
| Outcomes | `/recommendations/{id}/outcomes` |

Responses use `{ "data": ..., "meta": {"request_id": ...} }`; errors use `{ "error": {"code","message","details"}, "meta": ... }`.

## Honest limits

- **Opportunity score is a ranking signal, not a forecast** of views, reach or sales. Confidence is scored separately.
- The learning is a transparent, bounded rule (at most +/-8 points, only after 3+ reactions). It is **not a trained model**.
- Audience analysis is keyword-rule based (English, Hinglish, Devanagari). Comments are a self-selected sample, and the output says so.
- Trends are **bundled fictional samples** unless you supply a sourced dataset. Festival inputs include approximate samples, computed fixed dates and 31 bundled verified-source India 2027 calendar records, plus optional operator files. Source status and regional/moon-sighting caveats remain important. See [docs/REAL_DATA_SOURCES.md](docs/REAL_DATA_SOURCES.md).
- PostgreSQL storage is mandatory outside automated tests. Live and mock recommendations, feedback and outcomes persist in `growpilot_db.ai_engine`: see [docs/POSTGRES_PERSISTENCE.md](docs/POSTGRES_PERSISTENCE.md).
- The AI provider only polishes wording (`use_ai: true`). Scores, evidence and dates stay rule-based. Failures are returned as errors, never hidden.
- No Instagram login, scraping or publishing. Competitor analysis uses only public data supplied to it.

## Docs

- [Architecture diagrams and reading order](../docs/diagram/README.md)
- [AI engine architecture](../docs/diagram/05-ai-engine-architecture.md)
- [PostgreSQL persistence](docs/POSTGRES_PERSISTENCE.md)
- [Competitor intelligence](docs/COMPETITOR_INTELLIGENCE.md)
- [Trends and festivals: sources and verification](docs/REAL_DATA_SOURCES.md)
- [API](docs/API.md)
- [Recommendation engine](docs/RECOMMENDATION_ENGINE.md)
- [AI providers](docs/AI_PROVIDERS.md)
- [NestJS integration](docs/NESTJS_INTEGRATION.md)
- [Recommendation quality (expected vs actual)](docs/RECOMMENDATION_QUALITY.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Docker

```bash
docker compose -f ../docker-compose.yml --profile service up -d --build
```
