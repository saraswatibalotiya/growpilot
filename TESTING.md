# GrowPilot Testing Guide

Covers local startup, shared PostgreSQL, authenticated creation and AI previews, fixtures, and opt-in Instagram checks. Audited against source on 2026-11-19; this guide is not a claim that external credentials or live publishing were reverified.

---

## 1. Start Docker Desktop

- macOS: open **Docker** from Applications, or run `open -a Docker`.
- Wait until the whale icon in the menu bar stops animating.
- Check it's ready:

```bash
docker info > /dev/null && echo "Docker is up"
```

## 2. Start Postgres and Redis

From the project root (`/Users/saraswatibalotiya/growpilot`):

```bash
docker compose up -d
docker ps --format '{{.Names}}  {{.Status}}'
```

Expected: `growpilot_postgres` and `growpilot_redis` show `Up`.

## 3. Database URL

| Field | Value |
|---|---|
| Connection URL | `postgresql://growpilot_user:growpilot_password@localhost:5432/growpilot_db` |
| Host / Port | `localhost` / `5432` |
| Database | `growpilot_db` |
| User | `growpilot_user` |
| Password | `growpilot_password` |

This is a local development password from root Compose, not a production credential. Configure backend `DATABASE_URL` accordingly; actual secret files were not inspected. Python uses the async-driver form of the same URL and stores its tables in schema `ai_engine`.

### Check the connection

```bash
docker exec growpilot_postgres psql -U growpilot_user -d growpilot_db -c "select 1;"
```

### Browser view (Adminer)

Open **http://localhost:8080** and log in:

| Field | Value |
|---|---|
| System | PostgreSQL |
| Server | `postgres` |
| Username | `growpilot_user` |
| Password | `growpilot_password` |
| Database | `growpilot_db` |

Start it with `docker compose up -d adminer` (it starts with the other containers too).

Select **schema `public`** for backend tables or **`ai_engine`** for AI data. Both have a table called `recommendations`; `public.recommendations` is not the Python engine's output.

### Open a shell (or use any GUI client such as TablePlus, DBeaver, or pgAdmin with the values above)

```bash
docker exec -it growpilot_postgres psql -U growpilot_user -d growpilot_db
```

Useful queries inside `psql`:

```sql
\dt                                              -- list tables
\dt ai_engine.*                                  -- AI tables in the same database
select id, email, name, created_at from users order by created_at desc limit 5;
select id, name, user_id from businesses order by created_at desc limit 5;
select id, username, is_mock, status, follower_count, post_count, token_expires_at, last_synced_at
  from social_accounts where platform = 'instagram' order by created_at desc;
\q                                               -- quit
```

Never query `access_token_encrypted` for real values in shared logs.

## 4. Backend environment (`backend/.env`)

Required keys:

```
DATABASE_URL=postgresql://growpilot_user:growpilot_password@localhost:5432/growpilot_db
JWT_ACCESS_SECRET=<at least 32 random bytes>
INSTAGRAM_TOKEN_ENCRYPTION_KEY=<base64 of 32 random bytes>
INSTAGRAM_MODE=mock                      # mock | live
INSTAGRAM_APP_ID=<only for live>
INSTAGRAM_APP_SECRET=<only for live>
INSTAGRAM_REDIRECT_URI=http://localhost:4000/integrations/instagram/callback
INSTAGRAM_LIVE_ALLOWLIST=<your ig username, lowercase, no @>   # live only
FRONTEND_URL=http://localhost:3000
ENABLE_LIVE_INSTAGRAM_PUBLISH=false      # keep false
```

Generate a new encryption key if needed:

```bash
openssl rand -base64 32
```

## 5. Install and build

```bash
cd /Users/saraswatibalotiya/growpilot/backend
npm ci
npm run build
```

## 6. Start the API

```bash
cd /Users/saraswatibalotiya/growpilot/backend
node --enable-source-maps --env-file=.env dist/main
```

Expected log line: `GrowPilot API running on http://localhost:4000`

For host development use `npm run start:dev`; run `npm run start:ai` from another backend terminal for the persistent AI engine. From `frontend/`, `npm run dev` starts port 3000. Alternatively `npm run start:all` starts infrastructure plus Python in Docker and both Node development processes, but first kills listeners on 4000/3000. Do not start both host and Docker engines on 8001. See [root setup](README.md) for first-time migrations and configuration.

To use another port without editing `.env`:

```bash
PORT=4100 node --env-file=.env dist/main
```

Stop it with `Ctrl+C`, or find the process with `lsof -iTCP:4000 -sTCP:LISTEN` and stop that PID.

## 7. URLs to test

Base API URL: **http://localhost:4000**

| What | URL | Notes |
|---|---|---|
| Health check | http://localhost:4000/health | Should return `"database":"connected"` |
| Root | http://localhost:4000/ | Basic response |
| **Swagger UI** | **http://localhost:4000/docs** | Interactive docs. Available when `NODE_ENV` is not `production` |
| Signup | `POST http://localhost:4000/auth/signup` | Use in Swagger or curl |
| Connect Instagram | `GET http://localhost:4000/integrations/instagram/connect?businessId=…` | Needs JWT |
| OAuth callback | `GET http://localhost:4000/integrations/instagram/callback` | Called by Instagram, not by you |
| Frontend | http://localhost:3000/settings | Implemented integration settings. The backend still emits `/connect/instagram`, but React has no matching callback route; its wildcard redirects. Inspect backend account status and reopen Settings rather than assuming a dedicated callback screen exists |
| AI health | http://localhost:8001/api/v1/health | Must report `storage: postgres`; `/health` without the prefix is not an engine route |

### Instagram endpoints (all need `Authorization: Bearer <accessToken>`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/integrations/instagram/connect?businessId=` | Returns `authorizationUrl` |
| GET | `/integrations/instagram/accounts?businessId=` | List accounts for a business |
| GET | `/integrations/instagram/accounts/{id}` | Stored profile, no token |
| POST | `/integrations/instagram/accounts/{id}/sync` | Refresh profile from Instagram |
| POST | `/integrations/instagram/accounts/{id}/sync-media` | Queue durable media/metric sync, live accounts only, HTTP 202 |
| GET | `/integrations/instagram/accounts/{id}/sync-runs` | Poll latest sync runs |
| GET | `/integrations/instagram/accounts/{id}/media?limit=25&after=` | Live media list |
| GET | `/integrations/instagram/accounts/{id}/insights?metrics=reach,views&days=7` | Insights |
| DELETE | `/integrations/instagram/accounts/{id}` | Disconnect (204) |

### Callback status codes (`status` / `code` in the frontend redirect)

| code | Meaning |
|---|---|
| `status=success` | Connected |
| `denied` | You cancelled on Instagram |
| `invalid_state` | State missing, forged, or older than 10 minutes. Start again from `/connect` |
| `unsupported_account_type` | Account is Personal. Switch to Business or Creator |
| `not_allowlisted` | Live mode: username/ID not in `INSTAGRAM_LIVE_ALLOWLIST` |
| `account_in_use` | Instagram account already connected to another business |
| `business_already_connected` | This business already has a different Instagram account |
| `instagram_error` | Meta returned an error. Check the server log |

## 8. Test A: mock mode (no Meta needed)

1. `INSTAGRAM_MODE=mock`, restart the API.
2. Open http://localhost:4000/docs.
3. `POST /auth/signup` with:
   ```json
   {"name":"QA","email":"qa-you@example.test","password":"test-only-passphrase","business":{"name":"QA Biz","category":"clothing"}}
   ```
   Copy `accessToken` and `business.id`.
4. Click **Authorize**, paste `accessToken`.
5. `GET /integrations/instagram/connect` with `businessId`. Copy `authorizationUrl`.
6. Open that URL in the browser. The backend constructs `/connect/instagram?status=success` when `FRONTEND_URL` is set; the current SPA has no dedicated route there. Reopen Settings and verify the account through the API. Without `FRONTEND_URL`, the backend result endpoint displays the outcome.
7. `GET /integrations/instagram/accounts?businessId=` and copy the `id`.
8. Check `GET /accounts/{id}`, `POST /sync`, `GET /media`, `GET /insights`.
9. `DELETE /accounts/{id}`, then `GET /accounts/{id}` should show `status: disconnected`.
10. Confirm in the database:
    ```bash
    docker exec growpilot_postgres psql -U growpilot_user -d growpilot_db -c "select username, is_mock, status from social_accounts where platform='instagram' order by created_at desc limit 3;"
    ```

Each mock connect creates a unique fake account per business.

## 9. Test B: live mode, your own Instagram account

Setup:

1. Switch your Instagram account to **Professional → Business or Creator**.
2. https://developers.facebook.com/apps → create an app (type Business), add **Instagram → API setup with Instagram login**.
3. Copy the **Instagram app ID** and **Instagram app secret** (not the main app's).
4. Add redirect URI: `http://localhost:4000/integrations/instagram/callback`.
5. Inspect the requested scopes in [instagram-graph.constants.ts](backend/src/instagram/instagram-graph.constants.ts) and Meta's current dashboard requirements. The implemented app includes publishing scope; receiving that scope does not enable publication. Keep the server publishing flag false during connection/read tests. Do not request advertising permissions for this organic-only app.
6. App roles → add yourself as **Instagram Tester**. On your phone: Instagram Settings → Apps and websites → Tester invites → accept.
7. Set in `backend/.env`:
   ```
   INSTAGRAM_MODE=live
   INSTAGRAM_APP_ID=...
   INSTAGRAM_APP_SECRET=...
   INSTAGRAM_LIVE_ALLOWLIST=<your username, lowercase, no @>
   ```
8. Restart the API.

Run:

1. Steps 2–5 of Test A (signup, Authorize, connect).
2. Open `authorizationUrl` in the browser that is logged in to your Instagram account and approve.
3. Check the final address bar: `status=success` means it worked.
4. Call sync, media, and insights.
5. Test disconnect.

Expected limits:
- Insights may return 403 for some metrics on small accounts. That's expected.
- Accounts connected in mock mode are rejected in live mode. Use a fresh business or reconnect.
- Keep `ENABLE_LIVE_INSTAGRAM_PUBLISH=false` for these read/sync tests. Publishing is implemented, but testing it requires a separately approved live action, an allowlisted real account, `confirm=true`, and an approved post/reel. Mock mode never publishes.

## 10. Automated tests

```bash
cd /Users/saraswatibalotiya/growpilot/backend
npm test
```

Do not treat old pass/fail notes as a current test result. Inspect the selected suite before running database tests, and use only disposable test data. Backend scripts also provide `build`, `lint`, `test:e2e`, and coverage. `format` writes source files.

### Frontend And Engine Checks

```bash
# frontend/
npm run test:unit
npm run check:i18n
npm run build

# ai-engine/, existing virtual environment active
pytest tests/unit tests/integration tests/quality
ruff check .
```

Persistence tests require a separately provisioned database whose name contains `test`; fixtures truncate its AI tables. The current downgrade safety test additionally hard-codes `growpilot_ai_test`, so use that disposable name for the full suite until the test is made name-independent. Never set `TEST_DATABASE_URL` to `growpilot_db`. Live provider tests require explicit `LIVE_AI_TESTS=1`, exported keys, and acknowledgement of network/cost. These are instructions, not a fresh passing test report.

### Saved Mock AI Preview

Enable the backend bridge, start the PostgreSQL-backed engine, sign in, and open `/ai-insights`. Select Mock version and each industry. Opening a preview calls `POST /ai-insights/mock/overview`; generating again appends history. Save/Not for me calls the mock-feedback endpoint. Reload and verify persisted results and feedback. Inspect `growpilot_db.ai_engine.ai_profiles`, `recommendations`, and `recommendation_feedback` in Adminer. Sample profiles are owner/industry scoped and are not publishing authorization. The standalone `/recommendations` page remains local idea templates, not this persisted intelligence flow.

## 11. Stop everything

```bash
# stop host API/frontend/engine with Ctrl+C in their own terminals
# stop database and cache (keeps data)
cd /Users/saraswatibalotiya/growpilot && docker compose stop
# remove containers (keeps data volumes)
docker compose down
```

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 5432` | Docker not running, or `docker compose up -d` not run |
| `Database error while reading contract marker` | Postgres is down, or `DATABASE_URL` wrong |
| `Port 4000 already in use` | Another instance is running. Use `PORT=4100` or stop it |
| `http://localhost:5555` does not respond | API is 4000; Prisma Studio is a separate explicitly started command, not part of app startup |
| `invalid_state` after a successful login | State expired (10 min). Start again from `/connect` |
| `redirect_uri` error at Instagram login | Dashboard URI must exactly match `INSTAGRAM_REDIRECT_URI` |
| `not_allowlisted` | Username in `INSTAGRAM_LIVE_ALLOWLIST` doesn't match |
| 409 `Account was connected in a different INSTAGRAM_MODE` | Reconnect after switching modes |
| 503 `INSTAGRAM_TOKEN_ENCRYPTION_KEY must be...` | Set a base64 32-byte key |
| AI startup rejects memory or missing URL | Use `npm --prefix backend run start:ai` from root, or export valid PostgreSQL settings. Application memory storage is not allowed |
| AI recommendations seem absent | Choose schema `ai_engine`, not `public`, in the shared database |
| Callback redirects to home | Backend `/connect/instagram` has no dedicated SPA route; check owned accounts and reopen Settings |
