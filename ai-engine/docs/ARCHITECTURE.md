# Architecture

```
HTTP (FastAPI routes)  ->  services  ->  intelligence / recommendation (pure logic)
                              |
                         repositories (Protocols)  ->  InMemoryStore (today)  |  PostgreSQL (future)
                              |
                  integrations (competitor + trend providers, Instagram placeholder)   ai (provider abstraction)
```

| Layer | Folder | Rule |
|---|---|---|
| Routes | `app/api/routes` | Validate, call one service, wrap in the envelope. No logic. |
| Services | `app/services` | Orchestrate, enforce profile ownership, raise typed errors. |
| Intelligence | `app/intelligence` | Pure functions over plain data: analytics, comments, competitors, trends. No I/O. |
| Recommendation | `app/recommendation` | The single shared engine plus business/creator strategies. |
| Repositories | `app/repositories` | Protocols plus an in-memory store. Every read takes the profile id. |
| AI | `app/ai` | Provider abstraction (mock, Gemini, Claude), prompts, response parsing. |
| Schemas | `app/schemas` | Pydantic request/response models. |

## Principles

- **Independent.** Nothing imports from, or talks to, the NestJS app, its database or its credentials. NestJS calls the engine, never the reverse: see [NESTJS_INTEGRATION.md](NESTJS_INTEGRATION.md).
- **Missing is not zero.** Unavailable metrics are `None`. Unavailable signals are excluded and weights renormalised.
- **Profile isolation.** Repository reads are scoped by profile id; a wrong profile looks identical to a missing record (404).
- **No silent fallback.** An AI failure is returned as an error (502/503). Rule-based output is never presented as AI output.
- **Untrusted input.** Captions, comments, competitor and trend text are data. Lengths are bounded, drafts are escaped into the
  prompt data block, error messages never echo submitted values, and PII (phones, emails) is masked in audience output.
- **Auditable.** Every score is broken down; every recommendation lists its evidence and sources.

## Storage

The services depend on the repository Protocols in `app/repositories/base.py`, never on a storage technology. Two implementations
exist: `InMemoryStore` (default; data is lost on restart) and `PostgresStore` (`STORAGE_BACKEND=postgres`; SQLAlchemy 2 async +
asyncpg, Alembic migrations, a dedicated `ai_engine` schema). See [POSTGRES_PERSISTENCE.md](POSTGRES_PERSISTENCE.md). The engine
must never use the existing GrowPilot database. pgvector/RAG retrieval over past content is **not implemented**.

## Structural note

`app/intelligence/` and `app/recommendation/` hold pure logic and are shared by every profile type; business vs creator differences
live only in `app/recommendation/strategies`.
