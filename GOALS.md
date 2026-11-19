# GrowPilot Goals (check this before every change)

Read this first. If a task doesn't move one of the steps below, question it before doing it.

## Product goal
Help a small business grow on Instagram **organically**: see how its presence is performing, diagnose the bottleneck, and get a recommended next action, with a human approving anything that gets published.

**Organic first, no boosting.** Good search optimisation, high-retention formats and real audience signals earn reach without paid promotion. GrowPilot never recommends boosting or ads, and never asks Meta for ad permissions.

## Non-negotiable rules
(from `backend/AGENTS.md` and the agreed plan)
- Publishing is **off by default**. Require post `USER_APPROVED` or reel `APPROVED`, explicit confirmation, `ENABLE_LIVE_INSTAGRAM_PUBLISH=true`, and a real connected live account allowlisted server-side. There is no campaign model. Dedicated content-hash approval records remain a planned strengthening, not a current guarantee.
- Mock data, preview JSON, and `isMock` metadata never authorize a live publish.
- Live actions need explicit human confirmation. Don't call live publishing endpoints without it.
- Stored Instagram OAuth tokens are encrypted; refresh sessions store hashes. Browser access/refresh tokens currently use localStorage, not HttpOnly cookies. Never put secrets in business JSON, logs, prompts, or embeddings.
- Never reset the database. Destructive schema changes need explicit approval. Schema changes go through Prisma 8: contract emit, then migration plan, then db migrate, reviewed before applying.
- Mock fixtures must stay realistic and cover edge cases.

## Growth playbook (what recommendations are built from)
These are product/editorial goals, not verified claims about Instagram's proprietary ranking algorithm or proof every rule is implemented. Recommendations must disclose available evidence and unknowns. The current Python engine uses historical performance, audience, approved competitors, contextual trends/festivals and goals, with separate opportunity/confidence scores; general fallback ideas must not imply account-specific evidence.

### 1. Search and discovery (Instagram SEO)
Instagram reads text and visuals to categorise a post.
- **Descriptive keywords in captions:** clear sentences using the words the target audience searches for. No keyword stuffing.
- **3 to 5 specific, niche hashtags**, not 30 broad ones (`#MumbaiVeganEats`, not `#Food`).
- **Alt text and on-screen text:** Instagram reads the text inside Reels and carousels. Put the main topic in the first seconds of a video or on the first slide.
- **Location tag** (city, neighbourhood or venue) when the content is relevant to local audiences.

### 2. High-retention formats
The algorithm pushes posts that hold attention and spark conversation.
- **Reels:** the fastest way to reach people who don't follow you yet. Hook in the first 2 seconds with movement or a bold statement.
- **Educational or relatable carousels:** swiping increases time on post.
- **Sends and saves** weigh more than likes. Checklists, quick tips and relatable memes people want to send to friends.

### 3. Direct audience signals
- **Collabs** ("Invite Collaborator"): the post appears on both profiles and reaches both audiences.
- **Engage in the niche before and after posting:** 10 to 15 minutes of thoughtful comments on larger accounts and active users.
- **Post when the audience is active:** Instagram Insights, "Total Followers", shows the days and hours.
- **Reply to comments quickly** after posting to boost early engagement.

### Where each signal comes from
| Playbook signal | Source | Availability | Step |
|---|---|---|---|
| Keywords in caption | `caption` text matched against the niche keywords | Derived | 2 |
| Hashtag count and niche-specificity | Parsed from `caption`; specificity needs the niche and playbook content | Count derived; specificity needs knowledge/LLM | 2, 4 |
| Alt text, on-screen text | Not reliably readable through the API | Image analysis, or ask the user; else unknown (null) | 2 |
| Location tag | Not reliably readable through the API | Ask the user; else unknown (null) | onboarding |
| Reels share of posts | `media_product_type` = REELS | Stored now | 2 |
| Hook in first 2 seconds | Needs video analysis | Not available yet: advice only | later |
| Carousel share of posts | `media_type` = CAROUSEL_ALBUM | Stored now | 2 |
| Saves and sends | `saves`, `shares` per-post insights (nullable) | Stored now; Meta may withhold some (seen: `saves` null on first live post) | 2, 3 |
| Collab posts | Not reliably readable | Ask the user; else unknown | later |
| Niche engagement before/after posting | Not measurable through the API | User checklist or self-report | later |
| Best posting hours and days | `online_followers` account insight (typically needs enough followers) plus post `published_at` | Needs the `metrics` sync kind; verify on the real account | 1 (metrics sync), 3 |
| Comment reply speed | Comments with timestamps and replies; needs comment permission | Not built; verify on the real account | later |

Missing or withheld data is unknown (null). A rule must say "can't tell yet" rather than treat unknown as zero.

## Onboarding: Current Inputs And Proposed Extensions
Current business storage has name, category, description, city/area, audience, language and primary goal. The following richer niche/formats/frequency/collaboration questions are proposed extensions, not a claim that every field is in the current form or database.
The API can't tell us the niche or what the owner is trying to post, so we ask at onboarding (and let them edit later). These answers feed the rules, retrieval filters and LLM prompts.
- **Niche** and **who the target audience is** (the words they'd search for).
- **Main location**: city, neighbourhood or venue, and whether the business is local.
- **What they post now:** formats (Reels, carousels, single photos, stories), main topics, and how often.
- **Goal:** more enquiries, bookings, orders or followers (extends the existing `primary_goal`).
- **Collab and community:** whether they already collaborate with other creators or brands.

Planned storage: new fields on `businesses` (below). The posts themselves still come from the Instagram sync; the answers add what the API can't see.

## Data principles
- **Store facts, compute insights.** Raw posts and metrics are stored. Features and diagnoses are derived and versioned (`feature_version`, `model_version`, `prompt_version`).
- **Append-only metric history.** Never overwrite snapshots; insert a new row on each sync.
- **NULL means unknown, 0 means zero.** Never fill gaps with zeros.
- **Idempotent upserts** on natural keys, such as `(social_account_id, platform_media_id)`, so retries are safe.
- **Enums for every status column**, with allowed transitions enforced in services.
- **Index for real queries:** latest posts per account, and latest snapshot per post.
- **Minimise data.** Disconnect wipes stored connection tokens. Actual media originals and approved variants are stored in Cloudinary with database metadata. A complete Meta data-deletion callback and retention policy remain future work; do not describe them as implemented.
- **Approval is evidence (target):** a dedicated approval row bound to `content_hash` is proposed. Current code persists post/reel approval state and reel approval time, not this proposed table.

## Historical Schema Proposal (Not The Current Contract)

Retained for design context. Some concepts were implemented under different names; others remain unimplemented or were removed. The actual contract is [backend/prisma/schema.prisma](backend/prisma/schema.prisma): 17 `public` models, including generated posts/reels, not `content_drafts`, campaigns, leads, or presence assessments. Python owns the separate `ai_engine` schema in the same `growpilot_db`. The proposed tables/columns below must never be treated as existing migration instructions.

### Modify existing tables
| Table | Change | Why |
|---|---|---|
| `social_accounts` | Add `token_source` (oauth / dashboard), `last_media_sync_at`, `live_publish_allowed` (bool, default false) | Know where a token came from, sync incrementally, keep the publish allowlist server-side |
| `social_accounts` | Set `is_mock` default to false, and set it explicitly everywhere | A default of true could mislabel real accounts |
| `presence_assessments` | Add `window_start`, `window_end`, `posts_analyzed`, `aggregation_method` (total / average / median), `feature_version`, `stage`, `bottleneck`, `assessed_at` | Each assessment is a reproducible, dated snapshot |
| `recommendations` | Add `assessment_id` FK, `generator` (rules / llm), `model_version`, `prompt_version`, `evidence_json`, `creative_draft_json`, `accepted_at`, `dismissed_at`, `outcome_json`, `evaluated_at`; make `action_type` an enum | Trace every recommendation to its evidence, generator, and result |
| `leads` | Add optional `social_account_id`, `instagram_post_id` | Attribute an enquiry to the post that triggered it |
| `businesses` | Add `niche`, `target_audience`, `local_area`, `is_local` (bool), `content_formats[]`, `content_topics[]`, `posting_frequency`, `uses_collabs` (bool). All nullable, set at onboarding and editable | The API can't see the niche or what the owner intends to post; the playbook rules need it |

### New tables
**Instagram data (Steps 1–2)**
- `instagram_posts`: `social_account_id`, `platform_media_id`, `media_type`, `media_product_type`, `caption`, `permalink`, `media_url`, `thumbnail_url`, `published_at`, `last_seen_at`, `deleted_at`. Unique `(social_account_id, platform_media_id)`; index `(social_account_id, published_at DESC)`.
- `post_metric_snapshots`: `instagram_post_id`, `captured_at`, `reach`, `views`, `likes`, `comments`, `saves`, `shares`, `profile_visits` (all nullable). Append-only; index `(instagram_post_id, captured_at DESC)`.
- `post_visual_features`: `instagram_post_id`, `aspect_ratio`, `width`, `height`, `brightness`, `contrast`, `dominant_colors_json`, `model_tags_json`, `model_name`, `model_version`, `analyzed_at`. One row per post per feature version.
- `sync_runs`: `social_account_id`, `kind` (profile / media / metrics), `status`, `started_at`, `finished_at`, `items_processed`, `error_code`, `error_message`. Index `(social_account_id, started_at DESC)`.

**Knowledge and RAG (Step 4, pgvector)**
- `knowledge_documents`: `title`, `source`, `version`, `status` (draft / published / retired), `reviewed_by`, `reviewed_at`. Only reviewed content is retrievable.
- `knowledge_chunks`: `document_id`, `content`, `category[]`, `bottleneck[]`, `stage[]`, `format[]`, `embedding vector(N)`, `embedding_model`. Metadata filter first, then vector search; HNSW index on `embedding`.
- `post_embeddings`: `instagram_post_id`, `text`, `embedding vector(N)`, `embedding_model`. Separate table so models can be re-embedded.

**Audio (Step 6)**
- `audio_catalog`: `title`, `artist`, `vibe`, `tempo`, `tags[]`, `categories[]`, `region`, `observed_at`, `expires_at`, `source`, `added_by`. Metadata only, never audio files. Curated manually, not scraped.

**Creation and publishing (Steps 7–8)**
- `content_drafts`: `business_id`, `social_account_id`, `recommendation_id`, `status`, `caption`, `audio_catalog_id`, `scheduled_for`, `content_hash`, `published_media_id`, `failure_reason`. Statuses: draft → ready_for_review → approved → scheduled → publishing → published / failed / blocked / cancelled.
- `draft_assets`: `draft_id`, `kind` (original / edited), `storage_key`, `mime_type`, `width`, `height`, `sha256`, `edit_prompt`, `edit_model`. Original kept alongside every edit.
- `publish_approvals`: `draft_id`, `user_id`, `content_hash`, `approved_at`, `ip`, `user_agent`, `revoked_at`. Audit record of the explicit "Approve and publish" click.
- `publish_attempts`: `draft_id`, `attempt_no`, `container_id`, `status`, `meta_error_code`, `meta_error_message`, `started_at`, `finished_at`. Every call to Meta is logged.

## Original Roadmap Acceptance Criteria

These are historical targets, not a current completion checklist. The implemented recommendation endpoint is `/ai-insights/recommendations/generate`, not the proposed `/businesses/:id/recommendations`. Publishing currently runs synchronously/in-process, not as the proposed delayed BullMQ publisher.

| Step | Database work | Feature work | Done when |
|---|---|---|---|
| 1 | `instagram_posts`, `post_metric_snapshots`, `sync_runs`; `social_accounts` changes | BullMQ jobs for profile, media, and metrics sync | Your real account's posts and metrics appear; re-running creates no duplicates |
| 2 | `post_visual_features`; `presence_assessments` changes; `businesses` onboarding fields | Onboarding questions (niche, audience, location, content posted); deterministic feature calculator: hashtag count, keyword match, format mix (Reels/carousel share), saves/shares rates, posting times; image signals | Features computed for every post, with nulls handled; every business has its niche answers |
| 3 | `recommendations` changes | Rule engine + `GET /businesses/:id/recommendations` (rules only), built on the three playbook pillars; organic actions only | All 10 fixtures produce their expected bottleneck; no recommendation suggests boosting or ads |
| 4 | pgvector, `knowledge_documents`, `knowledge_chunks`, `post_embeddings` | Playbook seed, embedding job, filtered retrieval | Retrieval returns relevant chunks for each fixture |
| 5 | (uses recommendations) | LLM generation, schema validation, numbers check | No invented numbers; rules fallback works |
| 6 | `audio_catalog` | Admin CRUD; freshness filter | The LLM suggests only catalogue IDs |
| 7 | `content_drafts`, `draft_assets`, `publish_approvals` | Upload, AI image edit, review and approval flow | Original and edited assets stored; approval logged with hash |
| 8 | `publish_attempts` | Gated publisher (BullMQ delayed job) | Publishes only to the allowlisted test account with every check passing |
| 9 | `leads` changes; outcome fields | Outcome evaluation job, metrics dashboard data | Each published draft is linked to its post metrics |
| 10 | Deletion cascades, retention jobs | Disconnect cleanup, Meta data-deletion callback | Disconnecting removes tokens; deletion requests are honoured |

## Current status
- **Python 3.12 Docker startup compatibility (2026-11-20):** deferred annotations prevent class methods named `list` from breaking later `list[...]` annotations in the memory repository and competitor/festival/trend services. Regression tests cover all four classes. The Python 3.12 image was rebuilt and startup/health checked in network-isolated test mode; application PostgreSQL requirements are unchanged. VPS rollout still requires deploying the changed source and rebuilding its image.
- **Central architecture documentation:** all maintained system/repository/service/database/integration/workflow/deployment diagrams and their explanations live in [docs/diagram/](docs/diagram/README.md). Root/service READMEs and [TESTING.md](TESTING.md) remain operational entry guides. Duplicate architecture overviews were removed only after replacement; API/domain/safety and historical evaluation documents are retained.
- **One persistent application database (2026-11-19).** NestJS and the AI engine share `growpilot_db`: Prisma owns `public`, Alembic owns `ai_engine`. PostgreSQL is mandatory outside automated tests; no application memory fallback. Dashboard mock inputs and recommendations now live server-side with separate owner/industry profiles, saved feedback, and append-only recommendation generation history. Root Compose and `npm run start:ai` use the shared database; the separate AI database service was removed. Existing legacy volumes are not deleted.
- **Optional Gemini fallback (2026-11-19).** Reel creation and editing fall back to `FULL_PHOTO` when Gemini is not configured. If scene enhancement fails (including quota, timeout, or quality rejection), rendering continues with all original photos; the fallback is logged and stored without a user-facing job error. Poster enhancement already has an original-photo fallback. Rendering, storage, and publishing errors are still reported.
- **Startup:** `npm run start:all` builds/starts root Compose's `service` profile, including Python, then frontend/backend watch with the bridge enabled. It first kills listeners on 4000/3000; `stop:all` does not stop containers. `npm run start:ai` is the alternative host-engine command; do not run both engines on 8001.
- **Modules in the backend:** Auth (signup, login, rotating refresh tokens), Business, Instagram (OAuth, test-mode token connect, media sync), Media (Cloudinary uploads), Products, Conversations, Posts (draft state machine, duplicate-photo check), AI (content generation only, never publishes; see `backend/src/ai/README.md`), Publishing (the only path to Instagram, gated). Frontend: React + Vite in `frontend/`, voice or text "Create a post" flow, publishing behind `VITE_FEATURE_PUBLISHING`.
- **Tone per post, UI text in JSON (2026-11-16).** The owner picks a writing tone (12 options, `TONES` in `backend/src/common/constants.ts`) for every post and every reel; it is sent with the request and is part of the AI cache key. The `business_preferences` table, the `/business/preferences` routes, `businesses.brand_tone`, and the unused `leads` and `presence_assessments` tables were dropped (the owner also picks caption length and hashtag count per post or reel, `medium` pre-selected; the tone has no default). All frontend text now lives in `frontend/src/i18n/locales/<en|hi|mr>/*.json`, read with `useT()` / `translate()`; `npm run check:i18n` checks that the three languages have the same keys. Backend error messages are still English.
- **Publishing timeout fixed (2026-11-15).** Publish calls to Meta now allow 60 s (reads keep 10 s), because Meta downloads the photo during the container call. Each prepared Cloudinary URL is fetched once first, so the transformed JPEG already exists when Meta asks; if a photo can't be fetched, publishing stops before anything reaches Instagram and the post is not marked PUBLISHING. Covered by tests.
- **Media sync implemented; historical 2026-11-14 verification notes (not rerun by this documentation audit).**
  - Applied migration `20261114T1648_instagram_posts_sync`: `instagram_posts`, `post_metric_snapshots`, `sync_runs`, and `social_accounts.token_source` / `last_media_sync_at` / `live_publish_allowed` (default false).
  - `POST /integrations/instagram/accounts/:id/sync-media` (owner-only, throttled, live mode only) queues a BullMQ job; `GET .../sync-runs` shows the runs. Posts upsert on `(social_account_id, platform_media_id)`; each run appends one snapshot per post; unknown metrics are null.
  - **Real data:** after posting on `saras_vastras`, two live syncs gave 1 post (a carousel with no caption) and 2 snapshots: no duplicate posts. The metrics are real zeros (brand-new post) except `saves`, which Instagram did not return, stored as null.
  - Also verified on real Postgres with a stubbed Graph: re-runs and concurrent runs create no duplicate posts.
- **Known gap:** media sync does not update profile follower/post totals; `POST .../sync` does. Current live values cannot be inferred from old zero-count observations. No periodic profile job is implemented.
- **Not started in Step 1:** the profile and metrics sync kinds as jobs (only `media` exists), `deleted_at` marking, and `leads` attribution.
- **Implemented versus deferred:** basic onboarding and Python deterministic analytics/ranking are implemented. The richer onboarding fields and original bottleneck/RAG/lead-attribution roadmap are not fully implemented.
- **External Meta configuration:** the source requests Instagram scopes, not advertising permissions. Historical dashboard notes mentioned ads permissions; current external dashboard state must be checked by the operator.
- **Photo Studio:** `/media/analyze|enhance|ai-edit`, preview and approval are implemented. Sharp handles local enhancement; Claude handles cached analysis; Gemini is an optional configured image editor with usage budgets. Without it direct AI editing returns unavailable, while poster/reel enhancement can fall back to original photos. Originals and variants have separate media rows; live image quality was not reverified during this audit.
- **Duplicate check and resync:** before refusing a photo as already published, `PostsService` now runs a fresh media sync (`InstagramSyncService.syncBusinessNow`) so an archived or deleted post stops counting. Publishing sends the approved poster (`posterImageUrl`) as the cover slide. The AI never asks the owner for the product name; the photo supplies it.
- **AI Reel Creator:** frontend setup/library/progress/edit/preview/publish screens and `/reels` lifecycle APIs are implemented. Claude writes the script; image scenes, FFmpeg and Cloudinary produce/store the video. The current pipeline has no TTS/voiceover stage, despite legacy voice-related contract fields. Optional Gemini failures fall back to original photos. Interrupted generation/publishing is recovered as FAILED/PUBLISH_FAILED, not transparently resumed.
- **AI engine connection:** authenticated `/ai-insights/*` bridges live analysis, audience/competitors/trends, generation/history/feedback/outcomes/learning and saved mocks. Default bridge configuration is off; `start:all` explicitly enables it. Status returns availability rather than throwing when disabled/down. Live profile IDs are `biz_<businessId>` and mock IDs include owner/industry. Python persists in shared PostgreSQL. Live comments and competitor-dashboard ingestion remain gaps. Provider wire tests do not establish live model entitlement; sample trends remain labelled fictional. See [integration guide](ai-engine/docs/NESTJS_INTEGRATION.md).
- **AI Overview:** the sidebar is always visible, with live/mock source and industry selectors. Live blocks load independently; saved mock blocks load together. Health uses evidence-backed indicators, not a fabricated aggregate score. Recommendations/feedback persist; regeneration retains prior records. Full history, competitor and learning screens are not implemented. Hindi/Marathi interface copy needs native review. Historical test/browser results are not a fresh verification claim.
- **Documentation audit (2026-11-19):** documentation-only corrections distinguish implementation, historical results and proposed work. Remaining source gaps include the unmatched OAuth callback SPA route, stale Swagger summary and legacy voice fields. No runtime configuration, migrations, dependencies or business logic were changed for this audit.
- **Test guide:** see [TESTING.md](TESTING.md).
