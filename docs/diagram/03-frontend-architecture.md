# 03 Frontend Architecture

[Index](README.md) | [Backend](04-backend-architecture.md) | [Workflow sequences](08-workflow-sequences.md)

The frontend is a React SPA with React Router, custom CSS/components and English/Hindi/Marathi JSON resources. There is no SSR layer, Redux/React Query dependency, browser provider SDK or direct engine API.

## Composition And State

```mermaid
flowchart TD
    Main["main.tsx\nReact root, I18nProvider, global styles"] --> App["App.tsx\nBrowserRouter"]
    App --> Auth["AuthProvider\nSession, business and Instagram status"]
    Auth --> Flow["PostFlowProvider\nTransient creation draft"]
    Flow --> Public["Public routes\nWelcome, signup, login and setup"]
    Flow --> Guard["RequireAuth\nLoading or signed-in check"]
    Guard --> Shell["AppShell and Outlet"]
    Shell --> Posts["Home, posts, products and creation"]
    Shell --> Reels["Reel setup, library, preview and lifecycle"]
    Shell --> Insights["AI Overview\nLive and persisted mock views"]
    Shell --> Settings["Settings and help"]
    Posts --> Services["Typed feature services"]
    Reels --> Services
    Insights --> Services
    Settings --> Services
    Services --> Client["lib/api.ts\nFetch, bearer auth, coalesced refresh"]
    Client --> Nest["NestJS through /api development proxy"]
    Auth --> Local["localStorage\nTokens and cached user"]
    Flow --> Memory["React memory\nPhotos, words, options and in-progress IDs"]
```

The post-flow draft does not survive a full reload. Saved backend posts and PostgreSQL AI recommendations are separate durable records. Signup credentials between onboarding steps stay in memory; access/refresh tokens currently use localStorage rather than HttpOnly cookies. Protect against XSS and log out on shared devices.

## Route Groups

| Access | Routes |
|---|---|
| Public declarations | `/welcome`, `/signup`, `/login`, `/setup` (with its own onboarding checks) |
| Authenticated workspace | `/`, `/posts`, `/products`, `/settings`, `/help`, `/recommendations`, `/ai-insights` |
| Post lifecycle | `/create`, `/create/generating`, `/create/preview`, `/create/publish`, `/create/done` |
| Reels | `/reels`, `/reels/library`, `/reels/:id`, `/:id/generating`, `/:id/edit`, `/:id/publish`, `/:id/published` under `/reels` |
| Redirects | `/reels/new` to `/reels`; unknown paths to `/` |
| Development-only | `/dev/session`, authenticated `/dev/seed`; excluded from production route declarations |

The backend OAuth redirect `/connect/instagram` has no dedicated React route. This is an implementation gap, not an extra route to draw as implemented.

## Authenticated Request Recovery

```mermaid
sequenceDiagram
    participant Page as Page or hook
    participant Client as Shared API client
    participant API as NestJS
    Page->>Client: Typed request
    Client->>API: Bearer access token
    alt Successful request
        API-->>Client: Service-specific JSON
        Client-->>Page: Typed result
    else Authenticated request returns 401
        Client->>API: POST /auth/refresh with refresh token
        Note over Client: Concurrent refresh attempts share one promise
        alt Refresh succeeds
            API-->>Client: Rotated tokens
            Client->>API: Retry original request
            API-->>Page: Result or explicit error
        else Refresh fails or retry is unauthorized
            Client-->>Page: Clear session and notify sign-out
        end
    end
```

The shared client is for JSON/application requests. Media players/downloads can fetch returned media URLs directly. Do not assume every media byte passes through NestJS.

## AI Overview Loading

```mermaid
flowchart TD
    Overview["AI Overview page\nAlways-visible navigation"] --> Mode{"Source?"}
    Mode -->|"Live"| Status["Cached backend status\n60 seconds"]
    Status -->|"Enabled and available"| Analysis["POST analysis\nSync owner's engine input first"]
    Status -->|"Disabled or unavailable"| Notice["Explicit state; other app routes unaffected"]
    Analysis --> Sections["Audience, trends and recommendations\nIndependent requests after analysis settles"]
    Mode -->|"Mock industry"| Saved["POST mock/overview\nLoad all sections and saved feedback together"]
    Saved --> Database["Server persistence required\nNo client-result fallback"]
    Sections --> Cards["Evidence-backed indicators and ideas"]
    Database --> Cards
```

Live feedback is optimistic with rollback on error; mock feedback updates after a successful save. Selecting an industry remounts its preview. Regeneration changes the displayed batch but preserves earlier server rows. The separate `/recommendations` route uses editorial templates, not engine-ranked results.

`VITE_FEATURE_PUBLISHING` is the current frontend capability flag. It never bypasses backend gates. There are no current `VITE_FEATURE_AI` or `VITE_FEATURE_REELS` switches. Browser speech recognition/playback depends on device permissions and support; it is not backend TTS.

## Verify This Diagram

From repository root with dependencies installed:

```bash
npm --prefix frontend run test:unit
npm --prefix frontend run check:i18n
npm --prefix frontend run build
npm --prefix frontend run lint
```

Then sign in locally, verify signed-out redirects, open all route groups, choose live/mock AI sources, save/reload a mock recommendation, and check error states with the engine unavailable. Test on desktop/mobile and in each UI language. Keep publishing disabled. Automated logic/build checks do not replace authenticated browser testing.

Evidence: [route declarations](../../frontend/src/App.tsx), [API client](../../frontend/src/lib/api.ts), [overview hooks](../../frontend/src/hooks/useAiOverview.ts), [auth context](../../frontend/src/state/AuthContext.tsx), [post context](../../frontend/src/state/PostFlowContext.tsx), [Vite config](../../frontend/vite.config.ts), [manifest](../../frontend/package.json).