# GrowPilot frontend

Owner-facing React 19 / TypeScript / Vite application for products, photo posts, reels, Instagram connections, and AI insights. Shared UI components and CSS implement the design system; there is no component-library dependency. Reviewed against source on 2026-11-19.

## Run it

```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
```

The Vite server defaults to port 3000 and proxies `/api` to `http://localhost:4000`, stripping `/api`. `VITE_API_PROXY_TARGET` changes the development proxy target; `VITE_API_BASE` changes the browser API base. Different frontend origins must be allowed by backend CORS. Docker infrastructure alone does not start NestJS; see the [root setup guide](../README.md).

```bash
npm run build      # type-check and production build
npm run lint
npm run check:i18n  # en/hi/mr key and placeholder parity
npm run test:unit   # Node built-in test runner
```

## Architecture Reference

The [repository map](../docs/diagram/02-repository-architecture.md), [frontend architecture](../docs/diagram/03-frontend-architecture.md) and [workflow sequences](../docs/diagram/08-workflow-sequences.md) are the single maintained source for layout, route/state diagrams and request sequences. This README retains service commands, usage details and feature/security caveats.

## Implemented Workflows

Signup/login, token refresh, business profiles, products, uploads, conversations, posts, Instagram status, caption generation, posters, and reels call NestJS. Credentials and external AI requests stay server-side.

The post flow uploads up to ten photos, records or accepts text, requires a selected tone, creates a draft, calls `/ai/generate-content`, and opens a reviewable preview. Editing uses `/ai/edit-content`. The large empty photo area, Upload, and Camera controls open their respective file inputs. Poster composition uses `/posters/*`.

`VITE_FEATURE_PUBLISHING=true` exposes the frontend publishing capability. It does not authorize publication: backend approval, live-mode checks, server flag, and allowlist remain authoritative. There are no current `VITE_FEATURE_AI` or `VITE_FEATURE_REELS` switches. The standalone `/recommendations` page uses local idea templates; it is distinct from the persisted AI Overview recommendations.

## AI Overview (`/ai-insights`)

A screen that shows what the Python AI engine found: account health, best-performing content, audience insights, current trends and the latest
content ideas (with Save / Not for me). It calls only the backend's `/ai-insights/*` routes with the owner's normal access token. The
browser never contacts the engine, never sees its address or token, and never sends a business id.

- **Live availability.** The sidebar link is always present. `GET /ai-insights/status` controls the live view's loading, disabled, and unavailable states; other features remain usable.
- **Saved mock previews.** Two selectors choose live/mock mode and fashion, grooming, beauty, or cafe. Mock requests use authenticated `POST /ai-insights/mock/overview`; feedback uses `/ai-insights/mock/recommendations/:id/feedback`. Mock mode also requires a working, enabled backend bridge and PostgreSQL. There is no local-result fallback. Inputs, generated recommendations, and feedback persist in `growpilot_db.ai_engine`, separated from live profiles by owner/industry. Generating again appends history.
- **Loading.** Live sections load independently after the initial analysis request. Mock sections load together from the saved overview endpoint. Missing data and unavailable services have explicit states.
- **No invented numbers.** "Account health" is a list of signs, each with the engine's numbers behind it, not a score. Opportunity (ranking) and Confidence (evidence) are shown separately, and the screen says opportunity is not a prediction. Sample trends carry a "Sample" badge, and a demo Instagram account shows a "demo data" banner.
- **Files:** `pages/AiOverviewPage.tsx`, `components/AiInsightCards.tsx`, `hooks/useAiOverview.ts`, `services/aiInsights.ts`, `lib/aiOverview.ts` (pure logic), `styles/ai-insights.css`, `i18n/locales/*/aiInsights.json`.
- **Limits:** Hindi and Marathi UI text needs native review. Live Instagram comments are not imported by the bridge, so live audience analysis may be empty; the mock profiles have explicit fictional comments. Existing sourced trends can be stale and correctly excluded.

`npm run test:unit` runs the logic tests (Node's built-in runner, `frontend/tests`).

## Security notes

- No API keys or Meta credentials are in this code. Instagram tokens stay on the server.
- The access token (15 minutes) and rotating refresh token are kept in `localStorage`. Move to httpOnly cookies if the backend adds them.
- The signup password is held in memory between the two onboarding steps and is never written to storage.

## Reel Creator

Screens are `/reels`, `/reels/library`, `/reels/:id/generating`, `/reels/:id`, `/reels/:id/edit`, `/reels/:id/publish`, and `/reels/:id/published`. `/reels/new` redirects to `/reels`; there is no `/reels/setup` route.

[src/services/reels.ts](src/services/reels.ts) uses `POST /reels`, `GET /reels`, `GET /reels/:id`, `GET /reels/:id/status`, `PATCH /reels/:id`, and `POST /reels/:id/regenerate|cancel|approve|publish`. Publication sends `{ "confirm": true }`; regeneration sends a `part` and optional script options. There is no browser reel demo adapter. Optional Gemini enhancement falls back to original photos; real rendering/upload failures remain visible. Legacy voice-related type fields do not mean the current pipeline generates voiceover.
