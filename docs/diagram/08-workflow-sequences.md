# 08 Workflow Sequences

[Index](README.md) | [Database](06-database-architecture.md) | [Deployment](09-deployment-architecture.md)

Paths in these sequences are backend paths after Vite strips `/api`; internal engine requests include `/api/v1`. Each sequence describes current code, not a claim that external accounts/providers were exercised. Keep publication disabled during ordinary verification.

## 1. Signup, Login And Session Rotation

```mermaid
sequenceDiagram
    actor Owner
    participant UI as React workspace
    participant API as AuthController and service
    participant DB as public identity tables
    Owner->>UI: Signup details and initial business
    UI->>API: POST /auth/signup
    API->>API: Validate, normalize and hash password
    API->>DB: Create user, business and hashed refresh session
    API-->>UI: Safe user/business and access/refresh tokens
    UI->>UI: Store tokens and cached identity locally
    Owner->>UI: Later sign in
    UI->>API: POST /auth/login
    API->>DB: Verify active user and create session
    API-->>UI: Safe user and tokens
    UI->>API: POST /auth/refresh with refresh token
    API->>DB: Revoke old session token and rotate token pair
    API-->>UI: New access and refresh tokens
    UI->>API: POST /auth/logout with refresh token
    API->>DB: Revoke session
    API-->>UI: HTTP 204
```

Signup's business result is not part of the login response. The QA fixture owner is disabled and has no shared password; use signup. The shared frontend client coalesces refresh attempts; see [frontend request recovery](03-frontend-architecture.md).

## 2. Create And Review A Photo Post

```mermaid
sequenceDiagram
    actor Owner
    participant UI as Create and preview pages
    participant API as NestJS
    participant Cloud as Cloudinary
    participant Model as Claude creative provider
    participant DB as public content tables
    Owner->>UI: Choose photos, words, language and tone
    UI->>API: POST /media/upload for each selected photo
    API->>Cloud: Store validated owned image
    API->>DB: Save media metadata
    API-->>UI: Owned image URL
    UI->>API: POST /conversations and add user message
    UI->>API: POST /posts with owned image URLs
    API->>DB: Save DRAFT and ordered post images
    UI->>API: POST /ai/generate-content with required tone
    API->>Model: Grounded context and validated image
    alt Clarification required
        API-->>UI: Clarification question, no publication
    else Valid generated content
        API->>DB: Save content and advance to PREVIEW_READY
        API-->>UI: Generated draft and warnings
        opt Owner requests an edit or poster
            UI->>API: POST /ai/edit-content or /posters operation
            API->>DB: Save reviewed content or separate poster asset
            API-->>UI: Updated preview
        end
    end
```

The form supports up to ten photos. The empty photo area opens the gallery input; Camera uses the capture input. Generation is not approval. Optional Gemini poster enhancement can fall back to the original photo; required Claude/storage failures do not become fabricated success.

## 3. OAuth And Queued Media Sync

```mermaid
sequenceDiagram
    actor Owner
    participant UI as Workspace
    participant API as Instagram service
    participant Redis as Redis nonce and queue
    participant Meta as Meta OAuth and Graph
    participant Worker as Sync worker
    participant DB as public account and sync tables
    UI->>API: Authenticated GET /integrations/instagram/connect
    API->>Redis: Store expiring OAuth nonce
    API-->>UI: Authorization URL
    Owner->>Meta: Approve permitted account access
    Meta->>API: GET /integrations/instagram/callback
    API->>Redis: Validate and consume nonce
    API->>Meta: Exchange token and verify identity/permissions
    API->>DB: Store owned account and encrypted token
    API-->>UI: Redirect with outcome
    Note over UI: Current callback SPA route is missing, reopen Settings
    UI->>API: POST accounts/id/sync-media
    API->>DB: Record or reuse sync run
    API->>Redis: Enqueue deduplicated sync-media job
    API-->>UI: HTTP 202 and run
    Worker->>Redis: Consume job
    Worker->>Meta: Page permitted media and insights
    Worker->>DB: Upsert posts and append nullable metric snapshots
    Worker->>DB: Record run outcome
    UI->>API: GET accounts/id/sync-runs
    API-->>UI: Latest run states
```

Account endpoint paths above are under `/integrations/instagram`. OAuth flow and media sync are different operations; profile sync is a separate `POST accounts/:id/sync`. Queued media sync is live-only and rejects mock accounts. Mock connection/read checks are described in [TESTING.md](../../TESTING.md). The unmatched frontend callback is an existing gap, not fixed by this diagram.

## 4. Generate Live Recommendations

```mermaid
sequenceDiagram
    participant UI as AI Overview
    participant API as Authenticated Nest bridge
    participant Public as public source tables
    participant Engine as FastAPI services
    participant AI as ai_engine schema
    participant Model as Optional wording provider
    UI->>API: POST /ai-insights/recommendations/generate
    API->>Public: Resolve owned business, products, synced posts and metrics
    API->>Engine: PUT /api/v1/profiles/biz_businessId
    Engine->>AI: Upsert analytical profile
    opt Synced posts exist
        API->>Engine: POST /api/v1/analytics/analyze with replacement
        Engine->>AI: Persist input posts and metrics
    end
    API->>Engine: POST /api/v1/recommendations/generate
    Engine->>AI: Read scoped evidence/history and record signal snapshots
    Engine->>Engine: Generate, score, diversify and explain
    opt use_ai requested
        Engine->>Model: Bounded existing wording fields only
        Model-->>Engine: Candidate wording
        Engine->>Engine: Validate JSON, exact IDs and wording guard
    end
    alt Rules and optional wording valid
        Engine->>AI: Transactionally save batch and evidence
        Engine-->>API: Recommendations and notes
        API-->>UI: Result plus connection/data context
    else Provider, validation or database failure
        Engine-->>API: Safe explicit error
        API-->>UI: Mapped status and message
    end
```

The browser does not choose the analytical profile ID. Missing comments/competitors remain unknown rather than invented. A failed wording pass does not save recommendations, although earlier snapshot/insight writes can have occurred. Non-idempotent generation is not automatically retried; repeated user requests can create additional batches.

## 5. Persist And Reload A Mock Industry

```mermaid
sequenceDiagram
    actor Owner
    participant UI as Mock overview hook
    participant API as Nest bridge
    participant Engine as Preview route
    participant DB as ai_engine schema
    Owner->>UI: Select mock mode and industry
    UI->>API: POST /ai-insights/mock/overview
    API->>API: Resolve business and derive mock profile ID
    API->>Engine: POST /api/v1/profiles/mock_id/preview
    Engine->>DB: Initialize only missing fictional inputs
    Engine->>DB: Load saved recommendations and feedback
    alt No saved results or regenerate=true
        Engine->>Engine: Analyze and build rule-based sample recommendations
        Engine->>DB: Append recommendation batch and evidence
    end
    Engine-->>UI: Overview and saved actions through NestJS
    Owner->>UI: Save or Not for me
    UI->>API: POST /ai-insights/mock/recommendations/id/feedback
    API->>Engine: Feedback with owner-derived mock profile
    Engine->>DB: Persist feedback and learning changes
    Engine-->>UI: Success through NestJS
    Owner->>UI: Reload or return to this industry
    UI->>API: Load saved mock overview again
    API->>Engine: Same owner/industry profile
    Engine->>DB: Read durable results and actions
    Engine-->>UI: Saved overview through NestJS
```

The four industries are isolated from one another and from live profiles. Regeneration retains old rows; reload does not mean delete/reseed everything. A storage outage must show an error, not local-only recommendations. Counts are usage-dependent, not a fixed number guaranteed by migration.

## 6. Generate And Recover A Reel

```mermaid
sequenceDiagram
    participant UI as Reel pages
    participant API as ReelsService
    participant Pipeline as In-process pipeline
    participant Model as Claude and optional Gemini
    participant Cloud as Cloudinary
    participant DB as public.reels
    UI->>API: POST /reels with owned photo and required tone
    API->>DB: Create QUEUED row
    API->>Pipeline: Start background work in this process
    API-->>UI: QUEUED response
    Pipeline->>DB: Record script stage
    Pipeline->>Model: Write grounded script
    Pipeline->>DB: Save script/scenes and enter rendering
    opt An AI image look is selected and available
        Pipeline->>Model: Enhance source scenes
        alt Image result fails or is rejected
            Pipeline->>DB: Store FULL_PHOTO fallback and retain original inputs
        end
    end
    Pipeline->>Pipeline: Render and quality-check FFmpeg video
    Pipeline->>Cloud: Upload video and thumbnail
    Pipeline->>DB: READY only with stored video URL
    UI->>API: Poll GET /reels/id/status
    API-->>UI: Current stage, error or ready assets
    opt Process restarts during work
        API->>DB: Mark interrupted generation FAILED
        API->>DB: Mark interrupted publication PUBLISH_FAILED and ambiguous
    end
```

There is no active voiceover/TTS stage. Cancellation is observed between pipeline stages; regeneration clears approval/staleness as needed. This is not a durable queue that resumes unfinished render work after a restart.

## 7. Approval And Publication (Opt-In Live Operation)

```mermaid
sequenceDiagram
    actor Owner
    participant UI as Review UI
    participant API as NestJS lifecycle and publisher
    participant DB as public post or reel
    participant Meta as Instagram Graph
    Owner->>UI: Review current media and content
    alt Photo post
        UI->>API: PATCH /posts/id with status USER_APPROVED
    else Generated reel
        UI->>API: POST /reels/id/approve
    end
    API->>DB: Persist approval state and applicable timestamp
    Owner->>UI: Explicitly confirm publication
    UI->>API: POST publish endpoint with confirm=true
    API->>API: Check server flag, ownership, approval and current assets
    API->>API: Verify real connected live account and allowlist
    alt Any gate fails
        API-->>UI: Explicit refusal, no publication
    else Gates pass
        API->>DB: Enter PUBLISHING before irreversible action
        API->>Meta: Create/process media container and publish
        alt Publication confirmed
            Meta-->>API: Published media ID
            API->>DB: Record PUBLISHED result
            API-->>UI: Confirmed result
        else Failure or uncertain outcome
            API->>DB: Preserve draft and failure/ambiguity state
            API-->>UI: Error, operator may need to inspect Instagram
        end
    end
```

Post and reel publication use `/posts/:id/publish` and `/reels/:id/publish`. The post DTO can also request a slideshow `format=reel`; this is distinct from generated `/reels` resources. Posters become the cover slide followed by source photos, capped at ten slides. No separate hashed approval/campaign table exists. Never automatically retry a potentially completed publish.

## Verification Matrix

| Sequence | Safe Check | Expected Evidence / Prerequisites |
|---|---|---|
| Auth | Signup/login/refresh/logout through local UI or Swagger | Owned identity; tokens rotate; no hashes returned; no seeded shared login |
| Post creation | Upload a test product image, choose tone, generate/review without publishing | Separate media/draft rows; Claude/Cloudinary credentials are needed for actual generation/storage |
| Sync | Mock connection/read checks first; queue live sync only for an explicitly authorized test account | `sync_runs`, imported posts and appended metric snapshots; Meta permissions for live sync |
| Live intelligence | Call analysis/generation after owned posts sync; leave `useAi=false` initially | Profile-scoped evidence and saved AI recommendations; no paid wording call required |
| Mock intelligence | Select each industry; save, reload, regenerate and inspect schema `ai_engine` | Same saved actions after reload; additional batches retained; no Meta/paid wording required |
| Reel | Mocked `reels.service.spec.ts` first; actual render only with configured media/provider dependencies | READY includes a stored video; optional Gemini failures use originals |
| Publication | Test mocked gate/ambiguity suites with live flag false | Routine tests must not invoke real publication; live verification is a separate approved operation |

For detailed commands and disposable-database restrictions use [TESTING.md](../../TESTING.md). Evidence: [auth controller](../../backend/src/auth/auth.controller.ts), [post service](../../backend/src/posts/posts.service.ts), [publishing DTO](../../backend/src/publishing/publishing.dto.ts), [publisher](../../backend/src/publishing/publishing.service.ts), [Instagram controller](../../backend/src/instagram/instagram.controller.ts), [AI bridge](../../backend/src/ai-engine/ai-engine.service.ts), [preview route](../../ai-engine/app/api/routes/profiles.py), [reel lifecycle](../../backend/src/reels/reels.service.ts), [reel pipeline](../../backend/src/reels/reel-pipeline.service.ts).