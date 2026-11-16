Ran terminal command: cd /Users/saraswatibalotiya/growpilot/backend; ls src; cat src/app.module.ts; wc -l src/*/*.ts | grep -v spec | sort -rn | head -12; cat src/database/prisma.service.ts | head -40

Ran terminal command: cd /Users/saraswatibalotiya/growpilot/backend; cat src/auth/jwt-auth.guard.ts | head -40; ls src/config src/common 2>/dev/null; sed -n 1,50p src/products/products.controller.ts; grep -n "class\|IsString\|Max" src/products/products.dto.ts | head -12; sed -n 1,40p src/products/products.service.ts

Backend section 1 of 7: architecture (minutes 0–8). I've read the repo structure, `main.ts`, `app.module.ts`, the auth guard, and the products controller, service and repository. I haven't changed anything. This section covers just the architecture. We go through the rest of the plan one section at a time, after your answers.

## 1. What this backend is

It is a **NestJS monolith**: one Node process, one Postgres database, and many feature modules under `src/`. There is **no Prisma Client in the classic sense**. It uses Prisma 8's new typed ORM and contract files (see "Database access" below).

```
 Browser (React, :3000)
        │  HTTPS /api/*  (Vite proxy in dev, Nginx in prod)
        ▼
┌─────────────────────────────── NestJS process (:4000) ───────────────────────────────┐
│ main.ts: helmet → CORS → global ValidationPipe → Swagger (non-prod) → listen         │
│                                                                                      │
│ Global guard: ThrottlerGuard (60 requests / 60 s per client)                         │
│        ▼                                                                             │
│ Controller  ──(JwtAuthGuard)──►  Service  ──►  Repository  ──►  PrismaService ──► Postgres
│  (route, DTO)                  (rules)       (queries)         (db client)           │
│                                   │                                                  │
│                                   ├─► AI: Anthropic (text), Gemini (images)          │
│                                   ├─► Media: Cloudinary (files), sharp, ffmpeg       │
│                                   └─► Instagram: Meta Graph API, Redis (nonce+queue) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Startup (what runs, in order)

1. `main.ts` creates the app from `AppModule`.
2. It applies `helmet()` (security headers) and CORS. CORS now reads `CORS_ORIGINS`, which I changed earlier for deployment.
3. It registers a **global `ValidationPipe`** with `whitelist`, `transform` and `forbidNonWhitelisted`. Every `@Body()` and `@Query()` DTO is validated automatically. Unknown fields are rejected with a 400, not ignored.
4. Swagger at `/docs` is enabled only when `NODE_ENV` is not `production`.
5. `app.module.ts` wires up the pieces:
   - `ConfigModule.forRoot({ isGlobal: true })`: reads `.env` once, and `ConfigService` can be injected anywhere.
   - `PrismaModule`: the one database connection.
   - The feature modules.
   - `ThrottlerModule`, plus `{ provide: APP_GUARD, useClass: ThrottlerGuard }`, which means rate limiting applies to **every** route. Some routes override it, for example `@Throttle` on the reel and publish endpoints.
6. At boot, `PrismaService.onModuleInit()` runs `SELECT 1`. If `DATABASE_URL` is wrong, the app fails to start, which is what you want. `ReelsService.onModuleInit()` also marks any reel left mid-render by a crash as `FAILED`.

## 3. Module map

| Module | Responsibility |
|---|---|
| `auth` | sign up and login, JWT access and refresh tokens, `JwtAuthGuard` |
| `business` | the owner's business profile (`primaryBusinessId(userId)`) |
| `products`, `media` | product catalogue and uploaded photos (Cloudinary) |
| `media/studio` | photo editing and Gemini image service |
| `conversations`, `ai` | what the owner said, plus Claude content generation |
| `posts`, `poster`, `publishing` | post drafts, poster images, publishing |
| `reels` | the reel pipeline and ffmpeg composer |
| `instagram` | OAuth, tokens, Graph client, sync queue and worker |
| `database` | `PrismaService`, the only door to Postgres |
| `common` | pagination helpers, database error helpers |
| `health` | health endpoint |

## 4. The standard layering

I'll use **products** as the example, because it follows the pattern cleanly:

```
ProductsController      route + @UseGuards(JwtAuthGuard) + DTO types. No logic.
   → ProductsService    userId → businessId, builds the row, enforces ownership.
      → ProductsRepository   the only place that talks to PrismaService.
         → PrismaService.db  → Postgres
```

Important points:
- **Controllers stay thin.** They read `req.userId` and hand off. The controller never sees the database.
- **Services own the rules.** `ProductsService.create` calls `business.primaryBusinessId(userId)` first. Ownership comes from the **token**, never from a `businessId` the client sends. That blocks the biggest multi-tenant bug, where one shop reads another shop's data.
- **Repositories own the queries.** This is also why the unit tests can swap in in-memory fakes, as in `FakeRepository` in the reels tests.

## 5. Dependency injection in this codebase

Nest builds each class's constructor arguments from the `providers` of the module. Example: `ReelsModule` lists `ReelsRepository, ReelScriptService, ReelPipelineService, ReelsService`. `ReelsService` asks for `BusinessService`, `MediaRepository`, `PublishingService` and others. They come from other modules, which is why `ReelsModule` has `imports: [BusinessModule, MediaModule, ...]`.

You saw DI at work earlier. When I removed the voiceover class, I also had to remove it from the `ReelsModule` providers, and from the `ReelPipelineService` constructor. Otherwise Nest would fail at startup with "can't resolve dependencies".

## 6. Authentication flow (preview)

`JwtAuthGuard` reads the `Authorization: Bearer` header and verifies the token. The checks are:
- HS256 only.
- issuer `growpilot-api`.
- audience `growpilot-web`.
- the signing secret from `AuthService.signingSecret()`.

It then puts `userId` on the request as `req.userId`. We'll trace this in section 2.

## 7. Configuration

Everything comes from `.env` through `ConfigService`. Required ones use `getOrThrow` (the app won't boot without `DATABASE_URL`). Optional ones have defaults. For example `PORT` defaults to 4000, `CORS_ORIGINS` to localhost, and `GEMINI_IMAGE_MODEL` to a built-in name.

## 8. Database access

Instead of `@prisma/client`, `PrismaService` builds a client from two **generated contract files**, `prisma/schema.json` and `schema.d.ts`. Those come from `schema.prisma` via `npm run contract:emit`. That's why your repositories write `this.prisma.db.orm.public.Reel...` and why a schema change needs the emit step plus a migration.

## Check your understanding

1. A client sends `POST /reels` with `"businessId": "someone-else"` in the JSON body. What stops it from creating a reel for another shop? Name **two** layers that act on it.
2. Why do `ProductsService` and `ReelsService` call `BusinessService.primaryBusinessId(userId)` instead of accepting a `businessId` from the request?
3. If you create a new `FooService` and inject it into `ReelsService` but forget to add it to any module's `providers`, what happens and when do you find out?

Answer these and I'll move on to section 2: three real endpoints, with the full HTTP-to-response trace of `POST /reels`.