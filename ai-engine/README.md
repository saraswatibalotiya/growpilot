# GrowPilot AI Engine (Content Intelligence)

A standalone Python service that looks at an Instagram business or creator profile and returns **3-5 ranked, evidence-backed
content recommendations**. It analyses past performance, audience comments, approved competitors, current trends and upcoming
Indian festivals, and explains every suggestion.

It is **completely independent** of the NestJS backend and React frontend in this repository. It shares no code, no database and no
credentials with them, and it runs with **no paid API key** (mock AI provider and bundled fictional sample data).

## Run it

```bash
cd ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Open http://localhost:8001/docs for the interactive API.

```bash
pip install -r requirements-dev.txt   # once, for tests and lint
pytest                                # all tests
ruff check .                          # lint
```

Try it (the sample data reads as current on **2026-10-05**, so pass `as_of` to get repeatable output):

```bash
curl -s localhost:8001/api/v1/recommendations/generate \
  -H 'content-type: application/json' \
  -d '{"profile_id":"prof_boutique_mumbai","as_of":"2026-10-05","count":4}' | python3 -m json.tool
```

Sample profiles (all fictional): `prof_boutique_mumbai`, `prof_beauty_creator`, `prof_food_creator`, `prof_restaurant_bengaluru`,
`prof_travel_creator`.

## The five quality demos

Five **fictional** profiles (restaurant, fashion creator, travel creator, beauty creator, and a brand-new business with almost no
data) with sample posts, comments and trends, built to check recommendation quality. The evaluation date is **2026-11-17**.
They are not real Instagram data and not benchmarks.

```bash
python -m app.demos --all                          # print recommendations for all five
python -m app.demos --demo restaurant              # one of: restaurant fashion_creator travel_creator beauty_creator new_business
python -m app.demos --demo travel_creator --as-of 2026-12-20 --count 5   # another day, 3-5 ideas
python -m app.demos --report                       # rewrite docs/RECOMMENDATION_QUALITY.md (expected vs actual)
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
python -m app.demos --demo restaurant --with-competitors --count 5    # FICTIONAL competitors
```

## Persistent storage (PostgreSQL)

```bash
docker compose up -d                                   # separate dev database on localhost:5433
export DATABASE_URL='postgresql+asyncpg://growpilot_ai:growpilot_ai_dev_only@localhost:5433/growpilot_ai'
alembic upgrade head                                   # create the tables (additive, never destructive)
STORAGE_BACKEND=postgres uvicorn app.main:app --port 8001
```

Recommendations, feedback, outcomes and learning adjustments then survive restarts. Details, the downgrade safety rules and the
table layout are in [docs/POSTGRES_PERSISTENCE.md](docs/POSTGRES_PERSISTENCE.md). To run the database tests set
`TEST_DATABASE_URL=postgresql+asyncpg://growpilot_ai:growpilot_ai_dev_only@localhost:5433/growpilot_ai_test`.

## Configuration

Everything is optional. See [.env.example](.env.example). Highlights: `AI_PROVIDER=mock|gemini|claude`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `SERVICE_TOKEN` (mandatory when `ENVIRONMENT=production`), `WEIGHT_*` score weights. Keys are read from the
environment only and are never logged or returned.

## What it does

| Area | Endpoint prefix (`/api/v1`) |
|---|---|
| Health | `/health` |
| Profiles (business / creator) | `/profiles` |
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
- Trends are **bundled fictional samples** unless you supply a sourced dataset; moving-festival dates are approximate samples (`SAMPLE_UNVERIFIED`) unless you supply a verified calendar. Fixed-date occasions are computed and confirmed. See [docs/REAL_DATA_SOURCES.md](docs/REAL_DATA_SOURCES.md).
- Storage is in memory by default (data is lost on restart). Set `STORAGE_BACKEND=postgres` to persist everything: see [docs/POSTGRES_PERSISTENCE.md](docs/POSTGRES_PERSISTENCE.md).
- The AI provider only polishes wording (`use_ai: true`). Scores, evidence and dates stay rule-based. Failures are returned as errors, never hidden.
- No Instagram login, scraping or publishing. Competitor analysis uses only public data supplied to it.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
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
docker build -t growpilot-ai-engine .
docker run -p 8001:8001 growpilot-ai-engine
```
