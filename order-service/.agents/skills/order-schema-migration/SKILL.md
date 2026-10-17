---
name: order-schema-migration
description: Change the order-service Postgres schema safely with hand-written Prisma migrations, enum add/rename rules and client regeneration. Use whenever a slice adds columns, tables, indexes or enum values.
---

# order-schema-migration

## Before you start
1. Look at the existing folders in `migrations/` (set in `prisma.config.ts`) and copy their naming and style. Do not assume a convention; read one.
2. The slice brief must list the schema change. Anything destructive (drop column, drop table, narrowing a type, deleting rows) is a **hard stop**.

## Rules
- **Additive first.** New columns are nullable or have a default, so old rows and the running web-app keep working.
- One migration per logical change. Never edit a migration that has already been committed; add a new one.
- Write the SQL by hand in `migrations/<yyyymmddhhmm>_<name>/migration.sql` and update `prisma/schema.prisma` to match. They must agree exactly.
- After changing the schema run `db:generate` so the generated client matches. Do not commit stale `src/generated/`; follow whatever the repo does about that directory and note it if unclear.

## Enums
- **Adding a value:** `ALTER TYPE "<Enum>" ADD VALUE '<VALUE>';`. In Postgres a newly added value cannot be used in the same transaction that adds it, so do not insert rows using it in the same migration.
- **Renaming or removing a value** (for example `IN_PROGRESS`, `EXPIRED`): this is decision C6. If it is OPEN, **park it** and add only the new values. Never rename a value that existing code or the web-app reads until the decision is recorded.
- Existing rows must still be valid after the migration.

## Columns expected for the lifecycle slices
`delivered_at`, `completed_at`, `completion_method` (`REQUESTER_CONFIRMED` | `AUTO_TIMEOUT`), plus timestamps for pickup and the timer deadlines the slice needs. Deadlines are Postgres columns and the source of truth for timers.

## New tables
- `errand_history`: one row per transition (errand, from, to, actor, at).
- `outbox_events(id=eventId, aggregate_id, event_type, payload jsonb, published, created_at, published_at)`.
- Index what the queries use (open-list filters, sweeper scans on deadline columns, unpublished outbox rows).

## Verify
1. Apply the migration to a fresh database and to a database that already has rows.
2. Run `typecheck` and the integration tests.
3. Add or update a test that reads and writes the new columns.

## Docs
Update `docs/requirements.md` evidence and note the migration name in the change summary.

Hand off to: order-slice (continue the build) or order-verify.
