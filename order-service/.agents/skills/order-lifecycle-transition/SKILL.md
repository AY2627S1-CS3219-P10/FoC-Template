---
name: order-lifecycle-transition
description: Add or change an errand status transition, its event or its timer using the existing transition table, single-statement conditional UPDATE, outbox and sweeper patterns. Use for new lifecycle actions (cancel, expiry, dispute resolution, courier cancel) once their questions are answered.
---

# order-lifecycle-transition

Only implement rows that `docs/decisions.md` has decided. Open rows stay parked.

## 1. Domain row (`src/domain/lifecycle.ts`)
- Add the action to `LIFECYCLE_ACTIONS` and a row to `TRANSITIONS`:
  `{ from, action, actor, to, stamp, completionMethod? }`. `stamp` must be a column
  in `STAMP_COLUMNS` (`order.repository.ts`); add a migration column if it is new.
- Update the independent `allowed` / `actorsByAction` lists in
  `tests/unit/lifecycle.spec.ts`. The matrix test then covers every combination.
- Rule: an actor never allowed the action → 403; allowed actor, wrong state → 409.

## 2. Persistence (`PrismaOrderRepository.transition`)
- Every transition is **one SQL statement**: `UPDATE … WHERE status = from AND
  deleted_at IS NULL AND pending_operation_id IS NULL AND <actorGuard>` plus CTEs for
  `errand_history` and, if needed, `outbox_events`. No read-modify-write in Node.
- New actor or time conditions go in `actorGuard`, e.g. SYSTEM rows use the DB clock
  (`AUTO_COMPLETE_DUE`). Never use app time for deadlines.
- Per-state invariants are CHECKs (`migrations/202610180004_lifecycle_columns`); add one
  for the new state. A new enum value goes in its **own** migration.

## 3. Use case and route
- User actions: `OrderService.act(id, action, userId, token)`. It reads, resolves the role,
  repeats once on a lost race, and returns the current state for repeats (`alreadyApplied`).
  Route: `POST /api/errands/:id/<action>`, `@HttpCode(200)` (see `order-api-endpoint`).
- System actions: a service method calling `repository.transition(id, row, null)`
  (see `autoComplete`). It must be safe to run any number of times.

## 4. Events (`docs/events.md`)
- Credit-relevant events only via the outbox CTE in the same statement (D-001). Payload
  built in SQL from the updated row; ids and numbers only; correlation id in `headers`.
- If an event must exist at most once per errand, add a partial unique index.
- A contract test must feed the stored row to the consumer's real handler, as
  "S6a contract" does with credit's `CreditEventsHandler`.

## 5. Timers (`src/infrastructure/timer.worker.ts`)
- The deadline is a Postgres column. Add a `due…()` query (partial index on the
  deadline) and enqueue one BullMQ job per errand on `order-timers` with a stable
  `jobId`. The job's conditional UPDATE re-checks the deadline.
- Override new workers with `{}` in the integration harness; test the service method
  directly and age timestamps with SQL (`age()` helper), never sleep.

## 6. Tests (minimum)
Happy path with history rows, 401/403/404/409, repeat request, a race on real Postgres
(`order-race-testing`), and for events: exactly one outbox row with the exact payload.

Hand off to: order-race-testing, order-requirements-sync.
