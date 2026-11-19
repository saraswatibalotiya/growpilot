# API (v1)

Base path `/api/v1`. Interactive docs: `/docs`. Development is open; with `SERVICE_TOKEN` set (mandatory in production) every
route except `/health` needs `Authorization: Bearer <token>`.

Success: `{"data": ..., "meta": {"request_id": "..."}}`. Error: `{"error": {"code": "...", "message": "...", "details": ...}, "meta": {...}}`.
Lists use `{"items", "page", "page_size", "total"}` (`page_size` max 100).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness (open) |
| POST | `/profiles` | Create a BUSINESS or CREATOR profile |
| PUT | `/profiles/{id}` | Create or replace a profile under an id you choose (idempotent; 201 first time, 200 after). Used by NestJS (`biz_<businessId>`) |
| GET / PATCH | `/profiles/{id}` | Read / partially update |
| POST | `/analytics/analyze` | Store posts and analyse (`replace` true/false) |
| GET | `/analytics/overview?profile_id=` | Baseline, insights, warnings, methodology |
| GET | `/analytics/top-content?profile_id=&which=top\|lowest` | Format-adjusted best/weakest posts |
| GET | `/analytics/content-breakdown?profile_id=` | By format and topic |
| POST | `/audience/analyze` | Store comments and analyse |
| GET | `/audience/insights?profile_id=` | Latest insights |
| POST | `/competitors/suggest` | Suggestions, saved as PENDING. Optional `query` and `category` narrow them |
| GET | `/competitors/providers` | Where competitor data can come from, and what each source can and can not do |
| GET | `/competitors/landscape?profile_id=&as_of=` | All approved competitors together: activity, topics, formats, gaps |
| POST | `/competitors/{id}/posts` | Supply public information about a competitor's recent posts |
| POST | `/competitors` | Add manually (approved at once) |
| GET | `/competitors?profile_id=&status=` | List |
| PATCH | `/competitors/{id}/approval` | Body `{profile_id, status: APPROVED\|REJECTED}` |
| GET | `/competitors/{id}/insights?profile_id=&as_of=` | Only for approved competitors (else 409) |
| DELETE | `/competitors/{id}?profile_id=` | Remove |
| POST | `/trends/analyze` | Current, relevant trends (with freshness) |
| GET | `/trends/sources` | Configured trend source, record count, and rejected records with reasons |
| GET | `/festivals/coverage?year=` | What is confirmed, approximate or missing for a year |
| GET | `/trends`, `/trends/upcoming` | Browse (stale hidden unless `include_stale`) |
| GET | `/festivals`, `/festivals/upcoming` | Festival data with a verification status on each record; `profile_id` adds relevance |
| POST | `/recommendations/generate` | 3-5 ranked recommendations |
| GET | `/recommendations?profile_id=` | Previously generated (paged) |
| GET | `/recommendations/{id}?profile_id=` | One |
| POST | `/recommendations/{id}/feedback` | SAVED, DISMISSED, LIKED, NOT_RELEVANT, ALREADY_POSTED, CREATED, PUBLISHED |
| GET | `/feedback?profile_id=` | Feedback list |
| GET | `/learning?profile_id=` | What the rule-based learning has adjusted |
| GET | `/learning/history?profile_id=` | The stored adjustments, newest recomputation first |
| POST / GET | `/recommendations/{id}/outcomes` | Record / list INITIAL, H24, H72, D7 metrics |

`POST /recommendations/generate` body: `{"profile_id", "count": 3-5, "goal": Objective?, "as_of": date?, "use_ai": bool}`.

| Status | Meaning |
|---|---|
| 401 | Missing/invalid service token |
| 404 | Not found, **or** belongs to another profile |
| 409 | Not enough data / duplicate interval / competitor not approved |
| 413 | Body too large |
| 429 | `RATE_LIMIT_PER_MINUTE` exceeded (`Retry-After` header) |
| 422 | Validation failed (values are never echoed) |
| 502 / 503 | AI provider failed / not configured |
| 503 `database_unavailable` | PostgreSQL unreachable (also `/health`). Nothing about the connection is revealed |
| 500 `database_error` | Unexpected database error (generic message) |
