# GrowPilot Architecture And Verification

This is the single home for GrowPilot architecture diagrams and their explanations. All diagrams are Mermaid embedded in Markdown; no separate `docs/architecture/` directory is used. Source-reviewed on 2026-11-19. Diagrams describe current implementation unless explicitly labelled **proposed**.

## Reading Order

| Page | What You Will Understand | How To Verify |
|---|---|---|
| [01 System](01-system-architecture.md) | Services, responsibilities, trust and data boundaries | API health and private engine access |
| [02 Repository](02-repository-architecture.md) | Where source, contracts, tests and instructions live | Follow source links and package scripts |
| [03 Frontend](03-frontend-architecture.md) | Routing, authentication, drafts and saved previews | UI flows, logic tests, build and locales |
| [04 Backend](04-backend-architecture.md) | Modules, ownership, queues and publishing gates | Focused NestJS tests and Swagger |
| [05 AI Engine](05-ai-engine-architecture.md) | Signals, deterministic ranking, wording and persistence | Engine unit/integration tests and safe demos |
| [06 Database](06-database-architecture.md) | One database, two schema owners and entity relationships | Read-only SQL and isolated persistence tests |
| [07 Integrations](07-external-integrations.md) | Meta, Cloudinary, Claude, Gemini and file sources | Mock transports before opt-in external checks |
| [08 Workflows](08-workflow-sequences.md) | Authentication, posts, reels, sync and recommendations | Endpoint-by-endpoint smoke scenarios |
| [09 Deployment](09-deployment-architecture.md) | Actual local topology and a proposed VPS boundary | Startup, health, ports and deployment checklist |

New contributors should read 01 and 02, follow the [root setup guide](../../README.md), then use the [testing guide](../../TESTING.md). Read the relevant subsystem page before changing code. Each diagram page includes its implementation evidence, verification steps and limitations.

## Safe First Session

1. Install the supported Node/Python tools and each application's dependencies as described in the root guide.
2. Configure secrets locally using environment examples; do not commit or share real values. Keep live publishing disabled.
3. Start root PostgreSQL/Redis/Adminer, review/apply the appropriate schema setup, and choose **one** AI engine startup method: host `start:ai` or Docker `service` profile.
4. Start NestJS with the AI bridge enabled and start the frontend. Check backend `/health` and engine `/api/v1/health`; the engine must report PostgreSQL storage.
5. Sign up as a real local owner. In AI Overview select a fictional industry, generate/save, reload and inspect `growpilot_db.ai_engine` in Adminer. This needs no live Instagram data or paid wording provider.
6. Use disposable databases for database-writing tests. Never point persistence tests at `growpilot_db`.

Normal applications persist both live and mock recommendations in PostgreSQL. Temporary React state, process-local rate limits, tests and editorial template constants are not substitutes for persisted AI recommendations.

## Which Other Markdown Files Remain Necessary?

The diagram set explains the whole architecture, but it does not safely replace every operational or contract document.

| Keep | Why It Is Not Redundant |
|---|---|
| [Root README](../../README.md) | New-user installation, configuration, migration prerequisites and entry links |
| [TESTING.md](../../TESTING.md) | Detailed safe test procedures, mock/live distinctions and troubleshooting |
| [GOALS.md](../../GOALS.md) | Product principles and explicitly historical/proposed roadmap; not the current schema contract |
| [Backend guide](../../backend/README.md), [frontend guide](../../frontend/README.md), [engine guide](../../ai-engine/README.md) | Service-specific commands and usage, not duplicate architecture diagrams |
| [Contributor instructions](../../backend/AGENTS.md), [Prisma guide](../../backend/prisma-8.md), agent skills | Safety rules and version-specific tooling guidance; skills may be vendor-synced |
| [Engine API](../../ai-engine/docs/API.md), [integration contract](../../ai-engine/docs/NESTJS_INTEGRATION.md), [persistence guide](../../ai-engine/docs/POSTGRES_PERSISTENCE.md) | Detailed request/error/migration contracts and data safety |
| Provider, recommendation, competitor and data-source guides under [engine docs](../../ai-engine/docs/) | Domain algorithms, provenance and failure-policy details |
| [Historical quality report](../../ai-engine/docs/RECOMMENDATION_QUALITY.md), [limitations](../../ai-engine/docs/KNOWN_LIMITATIONS.md) | Evaluation evidence and limitations; not proof of current live accuracy |

The former root `ai-engine.md` and `ai-engine/docs/ARCHITECTURE.md` were removed after their useful content was covered in pages 01/05/06 and references redirected. Embedded architecture blocks in other guides now link here rather than maintain competing diagrams. Setup, testing, API contracts, migration safety, domain rules, contributor instructions and historical evaluations remain because this set does not replace them. Upstream SDK examples in agent skills are tooling references, not GrowPilot architecture.

## Verification Status And Known Gaps

Source inspection and documentation checks do not certify a fresh installation, external credentials, paid model entitlement, Meta approval, production readiness or real-world recommendation quality. Commands on these pages are instructions, not claims that they were run during this documentation task.

- The backend redirects OAuth to `/connect/instagram`, but React has no dedicated callback route; check owned account status and reopen Settings.
- Swagger still says read-only, although gated publication is implemented. Legacy voice-related reel fields do not indicate an active TTS stage.
- Live audience comments and competitor-dashboard ingestion are incomplete; automatic trend discovery, annual festival refresh and RAG are not implemented.
- Demo CLI test settings can inherit application storage: explicitly use `STORAGE_BACKEND=memory` for test-only demos.
- The quality-report generator's exact-output test conflicts with its corrected historical header. One migration test additionally hard-codes `growpilot_ai_test`. These source follow-ups are not fixed by documentation.
- Root Compose is development configuration. The proposed VPS layout in page 09 is not a delivered deployment stack, backup system or TLS setup.