# GrowPilot Prisma 8 Reference

Prisma ORM lets you query your database in simple, easy-to-read TypeScript. Define what your data looks like, and Prisma ORM gives you a fully typed client — with autocomplete for every table, column, and relation.

This project uses PostgreSQL 16, Prisma CLI `8.0.0-rc.33` and `@prisma/orm-postgres` `8.0.0-rc.23` as locked by the backend. This is not a legacy Prisma Client/migrate-dev setup. The configured database is `growpilot_db`; Prisma owns `public`, while Python/Alembic owns `ai_engine` in the same database. Do not initialize/reset the shared database indiscriminately.

## Requirements

- **PostgreSQL 15 or newer.** Older servers are not supported. Run `SELECT version()` against your server to verify.
- The ORM setup command can probe the server when invoked with `--probe-db`. Database inspection, initialization and migration commands connect to the configured target; do not treat CLI execution as inherently read-only.

## Your data contract

Your data contract is the heart of your application. It lives at [`prisma/schema.prisma`](prisma/schema.prisma) and describes your models:

The actual `User` model has a string ID, email, name, password hash, status and timestamps. Do not copy generic `Int`/username/Post-relation examples into this application; consult the schema and generated types for the precise current fields and relations.

Every model you define in your contract can be queried from your app. Your editor will autocomplete the query methods and show you what type each model field is:

```typescript
import { db } from './prisma/db';

const user = await db.orm.public.User
  .where({ email: 'alice@example.com' })
  .first();

// The generated schema.d.ts supplies the actual User result type, or null.
```

Your contract has two companion files in the same directory:

- **`schema.json`** — emitted model/storage contract consumed by the application
- **`schema.d.ts`** — generated types for queries and results

Commit both files to git. When you change your contract, run `npx prisma contract emit` to update them.

Automatic emission requires a configured plugin; GrowPilot's backend build is `nest build`, with explicit `npm run contract:emit`. The separate Vite frontend is not a Prisma contract plugin.

## Configuration

[`prisma.config.ts`](prisma.config.ts) tells the CLI where your contract lives and how to connect to your database. It loads environment variables from `.env` automatically:

```typescript
import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './prisma/schema.prisma',
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
```

`DATABASE_URL` comes from the process environment or the local dotenv loader. See the safe [.env.example](.env.example); never inspect or publish real environment values:

```env
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/growpilot_db"
```

You can customize how your environment variables are loaded by changing or removing the `import 'dotenv/config'` line.

## Quick reference

### Commands

```bash
npm run contract:emit          # Update schema.json and schema.d.ts
npx prisma db init             # Bootstrap only a deliberately selected fresh database
npx prisma migration status    # Show migration status
npx prisma migration plan --name <slug>  # Author a migration plan; review it
npx prisma db migrate --advance-ref db   # Apply reviewed migrations and advance db ref
```

### Files

| File | Purpose |
|---|---|
| [`prisma/schema.prisma`](prisma/schema.prisma) | Your data contract — define your models here |
| [`prisma.config.ts`](prisma.config.ts) | CLI configuration |
| [`prisma/db.ts`](prisma/db.ts) | Database client — `import { db } from './prisma/db'` |
| [prisma/schema.json](prisma/schema.json) | Compiled contract (generated) |
| [prisma/schema.d.ts](prisma/schema.d.ts) | Contract types (generated) |

### Workflow

1. Edit [`prisma/schema.prisma`](prisma/schema.prisma) to add or change models.
2. Run `npx prisma contract emit` to regenerate the contract.
3. Use `npx prisma migration plan --name <slug>`, inspect the generated migration, back up the target, then `npx prisma db migrate --advance-ref db` as appropriate for the selected database/ref.
4. Query your models using the emitted types. Emitting a contract does not create database tables or apply migrations. Do not use legacy `prisma migrate dev`, reset, or db-push recipes.

`db init` is bootstrap, not proof of replaying/stamping the checked-in migration chain. No production replay is certified by this documentation-only audit. Follow the installed RC command help and inspect refs/status before applying to existing data. The local ORM skill is installed at `node_modules/@prisma/orm-postgres/skills/prisma-8/SKILL.md`; agent-directory Composer/Platform skills are upstream reference material and do not mean this app deploys on Composer Cloud.

## Upstream pnpm Background (Not GrowPilot's Setup)

GrowPilot uses separate npm package/lockfile boundaries, not a pnpm workspace. The following scaffold notes are optional upstream context; their remote-package behavior was not verified in this audit.

If this project lives inside a pnpm workspace, a few things are worth knowing:

- **Catalogs.** When the workspace's `pnpm-workspace.yaml` defines a `catalogs` entry for `prisma` or `@prisma/orm-postgres`, pnpm uses the catalog version everywhere — `init` does too. If you wanted the published `latest` instead, update or remove the catalog entry, then re-run `pnpm install`.
- **`pnpm dlx`.** `pnpm dlx prisma@latest orm init …` works in any directory. Inside a workspace, pnpm still resolves dependencies through the workspace's catalog/overrides rather than the registry; expect the installed Prisma ORM packages to reflect the workspace's catalog rather than `latest`.
- **`pnpm` → `npm` fallback.** If `pnpm` ever fails to install Prisma ORM with a `workspace:*` or `catalog:` resolution error (a leak in a published artefact), `init` falls back to `npm install` and surfaces a warning. Once the offending package republishes a clean version you can switch back with `pnpm install`.
