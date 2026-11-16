# GrowPilot Testing Guide

Covers: starting Docker, the database, the API, Swagger, the Instagram flow (mock and live), and how to check results.

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

This is a local development password only. It's set in `docker-compose.yml`. The same URL is in `backend/.env` as `DATABASE_URL`.

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

### Open a shell (or use any GUI client such as TablePlus, DBeaver, or pgAdmin with the values above)

```bash
docker exec -it growpilot_postgres psql -U growpilot_user -d growpilot_db
```

Useful queries inside `psql`:

```sql
\dt                                              -- list tables
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
DATABASE_URL=postgresql://growpilot_user:growpilot_password@localhost:5432/growpilot_db?schema=public
JWT_SECRET=<at least 32 bytes>           # or JWT_ACCESS_SECRET
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
npm install
npm run build
```

## 6. Start the API

```bash
cd /Users/saraswatibalotiya/growpilot/backend
node --enable-source-maps --env-file=.env dist/main
```

Expected log line: `GrowPilot API running on http://localhost:4000`

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
| Frontend redirect target | http://localhost:3000/connect/instagram | No frontend yet, so this page will not load. Read `status` and `code` from the address bar |

### Instagram endpoints (all need `Authorization: Bearer <accessToken>`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/integrations/instagram/connect?businessId=` | Returns `authorizationUrl` |
| GET | `/integrations/instagram/accounts?businessId=` | List accounts for a business |
| GET | `/integrations/instagram/accounts/{id}` | Stored profile, no token |
| POST | `/integrations/instagram/accounts/{id}/sync` | Refresh profile from Instagram |
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
   {"name":"QA","email":"qa-you@example.test","password":"test-only-passphrase","business":{"name":"QA Biz","category":"retail"}}
   ```
   Copy `accessToken` and `business.id`.
4. Click **Authorize**, paste `accessToken`.
5. `GET /integrations/instagram/connect` with `businessId`. Copy `authorizationUrl`.
6. Open that URL in the browser. Expected final address: `http://localhost:3000/connect/instagram?status=success`.
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
5. Permissions: `instagram_business_basic`, `instagram_business_manage_insights`. Do **not** add `instagram_business_content_publish`.
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
- Never enable `ENABLE_LIVE_INSTAGRAM_PUBLISH`. Publishing is not implemented.

## 10. Automated tests

```bash
cd /Users/saraswatibalotiya/growpilot/backend
npm test
```

Known failing suites before this work: `health.controller.spec.ts` and `prisma.service.spec.ts`. The Instagram and auth suites should pass.

## 11. Stop everything

```bash
# stop API started in step 6 (Ctrl+C), or:
lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill
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
| `http://localhost:5555` does not respond | Nothing runs on 5555. The API is on 4000 |
| `invalid_state` after a successful login | State expired (10 min). Start again from `/connect` |
| `redirect_uri` error at Instagram login | Dashboard URI must exactly match `INSTAGRAM_REDIRECT_URI` |
| `not_allowlisted` | Username in `INSTAGRAM_LIVE_ALLOWLIST` doesn't match |
| 409 `Account was connected in a different INSTAGRAM_MODE` | Reconnect after switching modes |
| 503 `INSTAGRAM_TOKEN_ENCRYPTION_KEY must be...` | Set a base64 32-byte key |
