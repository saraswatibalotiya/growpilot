# GrowPilot Goals (check this before every change)

Read this first. If a task doesn't move one of the steps below, question it before doing it.

## Product goal
Help a small business grow on Instagram **organically**: see how its presence is performing, diagnose the bottleneck, and get a recommended next action, with a human approving anything that gets published.

**Organic first, no boosting.** Good search optimisation, high-retention formats and real audience signals earn reach without paid promotion. GrowPilot never recommends boosting or ads, and never asks Meta for ad permissions.

## Non-negotiable rules
(from `backend/AGENTS.md` and the agreed plan)
- Publishing is **off by default**. Nothing publishes without: campaign `approved`, an explicit "Approve and publish" click, `ENABLE_LIVE_INSTAGRAM_PUBLISH=true`, the account allowlisted server-side, and the approval event recorded first.
- Mock data, preview JSON, and `isMock` metadata never authorize a live publish.
- Live actions need explicit human confirmation. Don't call live publishing endpoints without it.
- Tokens are encrypted only. No secrets in JSON columns, logs, or embeddings.
- Never reset the database. Destructive schema changes need explicit approval. Schema changes go through Prisma 8: contract emit, then migration plan, then db migrate, reviewed before applying.
- Mock fixtures must stay realistic and cover edge cases.

## Growth playbook (what recommendations are built from)
Every recommendation must come from one of these three pillars, be tied to evidence from the account's own data, and be an organic action.

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

## Onboarding: what we ask the business owner
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
- **Minimise data.** Store derived image features, not image copies. Disconnect deletes tokens. Implement Meta's data-deletion callback, which cascades deletes. Set retention periods for snapshots and assets.
- **Approval is evidence:** a publish needs an approval row whose `content_hash` matches the current draft.

## Schema plan

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

## Steps and done-when

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
- **Optional Gemini fallback (2026-11-19).** Reel creation and editing fall back to `FULL_PHOTO` when Gemini is not configured. If scene enhancement fails (including quota, timeout, or quality rejection), rendering continues with all original photos; the fallback is logged and stored without a user-facing job error. Poster enhancement already has an original-photo fallback. Rendering, storage, and publishing errors are still reported.
- **Running:** `npm run start:all` from `backend/` starts Docker, Postgres, Redis, the backend and the frontend (see `backend/AGENTS.md`).
- **Modules in the backend:** Auth (signup, login, rotating refresh tokens), Business, Instagram (OAuth, test-mode token connect, media sync), Media (Cloudinary uploads), Products, Conversations, Posts (draft state machine, duplicate-photo check), AI (content generation only, never publishes; see `backend/src/ai/README.md`), Publishing (the only path to Instagram, gated). Frontend: React + Vite in `frontend/`, voice or text "Create a post" flow, publishing behind `VITE_FEATURE_PUBLISHING`.
- **Tone per post, UI text in JSON (2026-11-16).** The owner picks a writing tone (12 options, `TONES` in `backend/src/common/constants.ts`) for every post and every reel; it is sent with the request and is part of the AI cache key. The `business_preferences` table, the `/business/preferences` routes, `businesses.brand_tone`, and the unused `leads` and `presence_assessments` tables were dropped (the owner also picks caption length and hashtag count per post or reel, `medium` pre-selected; the tone has no default). All frontend text now lives in `frontend/src/i18n/locales/<en|hi|mr>/*.json`, read with `useT()` / `translate()`; `npm run check:i18n` checks that the three languages have the same keys. Backend error messages are still English.
- **Publishing timeout fixed (2026-11-15).** Publish calls to Meta now allow 60 s (reads keep 10 s), because Meta downloads the photo during the container call. Each prepared Cloudinary URL is fetched once first, so the transformed JPEG already exists when Meta asks; if a photo can't be fetched, publishing stops before anything reaches Instagram and the post is not marked PUBLISHING. Covered by tests.
- **Step 1, media sync verified on the real account.**
  - Applied migration `20261114T1648_instagram_posts_sync`: `instagram_posts`, `post_metric_snapshots`, `sync_runs`, and `social_accounts.token_source` / `last_media_sync_at` / `live_publish_allowed` (default false).
  - `POST /integrations/instagram/accounts/:id/sync-media` (owner-only, throttled, live mode only) queues a BullMQ job; `GET .../sync-runs` shows the runs. Posts upsert on `(social_account_id, platform_media_id)`; each run appends one snapshot per post; unknown metrics are null.
  - **Real data:** after posting on `saras_vastras`, two live syncs gave 1 post (a carousel with no caption) and 2 snapshots: no duplicate posts. The metrics are real zeros (brand-new post) except `saves`, which Instagram did not return, stored as null.
  - Also verified on real Postgres with a stubbed Graph: re-runs and concurrent runs create no duplicate posts.
- **Known gap:** `social_accounts.follower_count` and `post_count` still show 0. Media sync doesn't update them; only `POST .../sync` (profile) does, and it isn't scheduled yet.
- **Not started in Step 1:** the profile and metrics sync kinds as jobs (only `media` exists), `deleted_at` marking, and `leads` attribution.
- **Not started:** onboarding questions and the `businesses` fields, the playbook feature calculator, and the rules.
- **Follow-up, Meta dashboard:** the login configuration still lists `ads_management` and `ads_read`. We don't use them (organic only), so remove them to ask for the least access.
- **Photo Studio (done, verified live on the sandal photos):** `POST /media/analyze|enhance|ai-edit`, `GET /media/:id/preview`, `POST /media/:id/approve` (code in `backend/src/media/studio/`). Enhancement is built-in Sharp, with no AI cost. Claude (Sonnet) only describes a photo, once per photo, and is cached. Processed photos are new `media_assets` rows (`variant`, `sourceAssetId`), cached by hash plus settings, and a post accepts one only after the owner approves it. AI editing needs an external editor that is not configured, so `/media/ai-edit` returns 503. Known limit: Professional Background can leave a faint light fringe around the product.
- **Duplicate check and resync:** before refusing a photo as already published, `PostsService` now runs a fresh media sync (`InstagramSyncService.syncBusinessNow`) so an archived or deleted post stops counting. Publishing sends the approved poster (`posterImageUrl`) as the cover slide. The AI never asks the owner for the product name; the photo supplies it.
- **AI Reel Creator (backend done, 2026-11-16; frontend not started):** `POST/GET /reels`, `GET /reels/:id[/status]`, `PATCH /reels/:id`, `POST /reels/:id/regenerate|cancel|approve|publish` (code in `backend/src/reels/`, migration `20261115T1855_migration`, table `reels`). A 10 s 1080x1920 MP4 is made in-process from a product photo: Claude writes the script, Google Cloud TTS (`GOOGLE_TTS_API_KEY`) speaks it in hi/mr/en, ffmpeg renders one of 4 templates. Without the key a job fails with "Voiceover is not configured on the server". Publishing reuses `PublishingService` (same flag, allowlist, approval and no-auto-retry rules); jobs stuck by a restart are moved to FAILED / PUBLISH_FAILED on boot.
- **AI engine connection (2026-11-17, additive, off by default).** `backend/src/ai-engine/` adds `/ai-insights/*` (status, analysis, audience, competitors, trends, recommendations generate/list/feedback/outcomes, learning) that call the internal Python engine in `ai-engine/` with a service token. Enabled only by `AI_ENGINE_ENABLED=true`; no existing module, table, migration or response changed, and with the engine off or down only these routes return 503. The business comes from the JWT user; the engine profile id is `biz_<businessId>` (new engine route `PUT /profiles/{id}`). Verified against a locally running engine (generate, feedback, trends, learning, wrong token, engine down). Design: `ai-engine/docs/NESTJS_INTEGRATION.md`. Not done: frontend UI, sending comments, competitor feed, enabling it in production. Engine side: Gemini/Claude wire-format tests and an opt-in live test (`ai-engine/tests/live`; valid-key calls not yet run), AI wording guard, rate limit, bundled official India 2027 festival calendar. Trends are still fictional samples.
- **AI Overview screen (2026-11-17, frontend; off unless the backend enables AI insights).** `/ai-insights` page (`frontend/src/pages/AiOverviewPage.tsx`) shows account health, best-performing content, audience insights, current trends and the latest ideas with Save / Not for me, from `/ai-insights/*` only. The sidebar link shows only when `GET /ai-insights/status` says enabled. Blocks load independently; thin data shows a calm message. No made-up score: health is a list of signs with their numbers; opportunity and confidence are shown separately. Sample trends are badged. en/hi/mr text added (`aiInsights.json`; Hindi/Marathi need native review). Logic tests: `npm run test:unit` (12 pass); `build`, `check:i18n` pass. Not done: not yet viewed in a browser against the full stack (backend + engine + login), recommendations history page, competitor and learning screens.
- **Test guide:** see [TESTING.md](TESTING.md).
