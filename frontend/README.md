# GrowPilot frontend

Voice-first web app for small businesses. React 19, TypeScript, Vite. No UI library: the design system is plain CSS variables in `src/styles/tokens.css`.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The backend must be running on port 4000 (`docker compose up -d`, then start the API). The dev server proxies `/api` to it, so there is no CORS setup. Port 3000 is the origin the backend allows.

```bash
npm run build      # type-check and production build
npm run lint
```

## Layout

| Folder | What lives there |
|---|---|
| `src/pages` | One file per screen (Welcome, Signup, Setup, Home, Create, Generating, Preview, Publish, Done, Posts, Products, Settings, Help) |
| `src/components` | Shared UI: app shell, buttons, poster preview, icons, illustrations |
| `src/services` | All backend calls. Pages never call `fetch` directly |
| `src/lib` | API client (token refresh), types, feature flags, storage |
| `src/state` | Auth session and the post being made |
| `src/hooks` | Browser speech recognition and playback |
| `src/mocks` | **Demo-only** stand-ins for backend features that don't exist yet |
| `src/dev` | **Development-only** helpers (sample sessions and drafts). Not in the production build |

## What is real and what is demo

Real, calling the backend: signup, login, token refresh, business profile, products, photo upload, conversations, posts, Instagram connection status.

Not available on the backend yet, so the frontend handles them honestly:

| Feature | Backend endpoint needed | What the UI does until then |
|---|---|---|
| AI caption and poster text | `POST /content/generate`, `POST /content/revise` | Shows sample text labelled "Demo content" |
| Post becomes a reviewable preview | A server step that moves a post to `PREVIEW_READY` | Approval is refused by the backend (409) and the UI says so |
| Publishing | `POST /posts/:id/publish` | Publish Now explains that nothing was posted. It never shows success |

When the backend ships an endpoint, set the matching flag in `.env` (see `.env.example`): `VITE_FEATURE_AI=true`, `VITE_FEATURE_PUBLISHING=true`.

## AI Overview (`/ai-insights`)

A screen that shows what the Python AI engine found: account health, best-performing content, audience insights, current trends and the latest
content ideas (with Save / Not for me). It calls only the backend's `/ai-insights/*` routes with the owner's normal access token. The
browser never contacts the engine, never sees its address or token, and never sends a business id.

- **Off unless the backend turns it on.** `GET /ai-insights/status` decides: the sidebar link and the page appear only when the backend reports `enabled`. With it off or the engine down the rest of the app is unchanged.
- **Each block loads on its own.** One that fails or has no data yet (for example no comments, or too few posts) shows a plain message and never blanks the others.
- **No invented numbers.** "Account health" is a list of signs, each with the engine's numbers behind it, not a score. Opportunity (ranking) and Confidence (evidence) are shown separately, and the screen says opportunity is not a prediction. Sample trends carry a "Sample" badge, and a demo Instagram account shows a "demo data" banner.
- **Files:** `pages/AiOverviewPage.tsx`, `components/AiInsightCards.tsx`, `hooks/useAiOverview.ts`, `services/aiInsights.ts`, `lib/aiOverview.ts` (pure logic), `styles/ai-insights.css`, `i18n/locales/*/aiInsights.json`.
- **Limits:** the engine's own sentences (the evidence lines) are English only; the Hindi and Marathi interface text should be reviewed by a native speaker; the backend does not yet send comments, so the audience block says "not enough data" until it does.

`npm run test:unit` runs the logic tests (Node's built-in runner, `frontend/tests`).

## Security notes

- No API keys or Meta credentials are in this code. Instagram tokens stay on the server.
- The access token (15 minutes) and rotating refresh token are kept in `localStorage`. Move to httpOnly cookies if the backend adds them.
- The signup password is held in memory between the two onboarding steps and is never written to storage.

## Reel Creator

Screens: `/reels` (choose a photo, plus Your Reels), `/reels/setup`, `/reels/:id/generating`, `/reels/:id` (preview and edit), `/reels/:id/publish`.
All calls live in `src/services/reels.ts` and follow the routes `POST /reels/generate`, `GET /reels`, `GET /reels/:id`,
`GET /reels/:id/status`, `PATCH /reels/:id`, `POST /reels/:id/regenerate-storyboard`, `POST /reels/:id/approve`,
`POST /reels/:id/publish` (body `{ "confirm": true }`) and `POST /reels/:id/cancel`. The shapes are the `Reel` types in that file.

`VITE_FEATURE_REELS=true` uses the real backend. While it is off (the default), an isolated demo adapter
(`src/mocks/reelsDemo.ts`) runs instead: a silent 10-second clip is made in the browser from the owner's photo, every screen
shows a "Demo mode" notice, Reels are forgotten on reload, and publishing always ends in a clear "nothing was posted" result.
