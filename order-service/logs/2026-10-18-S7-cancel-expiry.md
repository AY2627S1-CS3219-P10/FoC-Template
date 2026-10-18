# 2026-10-18 · S7/S8 · Cancel, courier cancel, reopen timer and expiry
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: A status model (IN_PROGRESS removed), B requester cancel, C courier
cancel + exclusions, D 30-minute reopen, E item type + expiry, F race tests, plus
Postman requests and `docs/demo-timers.md` for the manual D3 demo.

## Summary
_Written at the end of the pass by `order-change-summary`._

## Commits

### 8e10e87 docs(order): record cancel, expiry and timer answers (D-013..D-020, Q-020)
- **When:** 2026-10-18 13:47 · **Slice:** — · **Refs:** D-013..D-020, Q-003/4/6/7/8, Q-020
- **Changed:**
  - `docs/decisions.md` — D-013..D-020 with the user's wording quoted
  - `docs/open-questions.md` — Q-003/4/6/7/8 ANSWERED; new Q-020 (courier cancel after pickup)
  - `docs/conflicts.md` — C3, C4, C6, C7, C8 DECIDED
  - `docs/roadmap.md` — S7 READY, S8 PARTIAL
- **Why:** decisions are recorded before any code so every later commit can point at them; D-018 replaces the brief's supplier-category default with the user's own answer (requester-chosen item type).
- **Verified:** docs only.
- **Follow-up:** Q-020.

### a2fcc3c feat(order): remove IN_PROGRESS, add cancel/expiry rows and CANCELLED/EXPIRED checks (D-013)
- **When:** 2026-10-18 13:53 · **Slice:** A · **Refs:** D-013..D-017, D-020
- **Changed:**
  - `migrations/202610180007_status_model` — IN_PROGRESS rows → PICKED_UP, enum rebuilt without it; new `expired_at`; CHECKs `errands_cancelled_state`, `errands_expired_state`, `errands_closed_unassigned`
  - `src/domain/lifecycle.ts` — rows for `cancel` (OPEN, ACCEPTED), `courier-cancel`, `reopen`, `expire`, with `releasesCredits` / `releasesCourier` / `excludesCourier` flags; DISPUTED has no row out
  - `src/infrastructure/order.repository.ts` — `transition()` refuses credit-releasing rows (they must use the journal); optional stamp
  - `src/api/dto.ts` — status enum from `ERRAND_STATUSES`, `expiredAt`
  - tests — 320-cell matrix, flag lists, CHECK cases for the new states
- **Why:** the brief asked for `RENAME VALUE`, but PICKED_UP already exists, so Postgres would refuse it; rebuilding the type is the only way to remove IN_PROGRESS (A-010). All rows go in the domain table first so later slices only add persistence.
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 344 passed; `pnpm test:integration` 43 passed; migration applied by hand to a Postgres 17 DB holding an OPEN row, an IN_PROGRESS row and its history row → PICKED_UP, constraints and indexes recreated.
- **Follow-up:** none.

### 6d61f77 feat(order): requester cancel via DELETE and POST /cancel from OPEN or ACCEPTED (D-014, D-015)
- **When:** 2026-10-18 13:56 · **Slice:** B · **Refs:** D-014, D-015, D-019, Q-011
- **Changed:**
  - `src/infrastructure/order.repository.ts` — `cancelIntent` journals a CANCEL operation under the row lock; `execute` releases, then `close()` sets CANCELLED, clears courier/`accepted_at` and writes history with the released courier in one statement; `deleteIntent` is now admin-only (behaviour unchanged)
  - `src/application/order.service.ts` — non-admin DELETE → `cancel()`; POST without a header uses `derivedKey('cancel', id)` so repeats find the same operation
  - `src/api/order.controller.ts` — `POST /api/errands/:id/cancel` (200 / 202 `ErrandOperation`)
  - `migrations/202610180008_cancel_operations`, `prisma/schema.prisma` — `OperationKind.CANCEL`, `errand_history.courier_id`
  - `tests/integration/errands.spec.ts` — OPEN and ACCEPTED cancel, idempotent repeats on both routes, 401/403/404/409, lost release ack; the old "owners delete" test now expects CANCELLED
- **Why:** cancel releases credits, so it goes through the journal like the old delete (D-001): the pending lock stops accept and pickup while the release is in doubt. That lock is also what makes cancel vs accept and cancel vs pickup race-safe. Admin DELETE stays a soft delete because Q-011 is still open (A-011).
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 344 passed; `pnpm test:integration` 46 passed.
- **Follow-up:** web-app contract and Postman requests are updated at the end of the pass.

### 9296379 feat(order): courier cancel reopens the errand and excludes that courier (D-016)
- **When:** 2026-10-18 13:58 · **Slice:** C · **Refs:** D-016, Q-020
- **Changed:**
  - `migrations/202610180009_excluded_couriers`, `prisma/schema.prisma` — `errand_excluded_couriers (errand_id, courier_id, created_at)`, PK on both ids
  - `src/infrastructure/order.repository.ts` — `transition()` clears courier/`accepted_at` for `releasesCourier` rows (guarded by the expected courier), inserts the exclusion in the same statement, records the released courier in history; accept's guard skips excluded couriers
  - `src/application/order.service.ts` — `courierCancel()`; accept → 403 `ERRAND_COURIER_EXCLUDED`; `availableForAcceptance` false for an excluded caller
  - `src/api/order.controller.ts` — `POST /api/errands/:id/courier-cancel`
  - `tests/integration/errands.spec.ts` — reopen with credits kept, exclusion, repeat, re-accept by another courier, other errands still allowed, 401/403/409
- **Why:** a single statement means the status change, history and exclusion commit together or not at all; checking the exclusion in SQL as well as in the service keeps the rule even if a call slips past the friendly 403. A repeat by the released courier returns the current state, matching the other lifecycle actions (A-012).
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 344 passed; `pnpm test:integration` 48 passed.
- **Follow-up:** Q-020 (courier cancel after pickup).

### e298bb0 fix(order): use BullMQ-valid timer job ids so the 4 h auto-complete is enqueued
- **When:** 2026-10-18 13:58 · **Slice:** D (pre-fix) · **Refs:** D-008, A-008
- **Changed:**
  - `src/infrastructure/timer.worker.ts` — `timerJob()` builds the job; id `auto-complete-<errandId>` instead of `auto-complete:<errandId>`
  - `tests/unit/timer-jobs.spec.ts` — runs BullMQ's own `validateOptions` on the job; regression case for the old id
- **Why:** BullMQ 6 throws "Custom Id cannot contain :" for ids with one colon. The sweep caught the error and only logged "will retry", so in the running service no DELIVERED errand was ever auto-completed. The integration tests missed it because they replace `TimerWorker` and call `autoComplete()` directly.
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 346 passed.
- **Follow-up:** the reopen and expiry timers reuse `timerJob()`.

### 9cff3e2 feat(order): reopen ACCEPTED errands not picked up within 30 minutes (D-017)
- **When:** 2026-10-18 14:00 · **Slice:** D · **Refs:** D-017
- **Changed:**
  - `src/infrastructure/order.repository.ts` — `REOPEN_DUE` guard (DB clock, `accepted_at` + 30 min), `dueReopens()`
  - `src/application/order.service.ts` — `reopen()`: reads the assigned courier, then the same single-statement row as courier cancel (OPEN, courier cleared, history, exclusion), guarded by that courier still being assigned
  - `src/infrastructure/timer.worker.ts` — the sweeper enqueues `reopen-<id>` jobs next to auto-complete; the worker dispatches by job name
  - `migrations/202610180010_reopen_index` — partial index on `accepted_at` for ACCEPTED rows
  - tests — due vs 29 min, 5 parallel jobs → 1 reopen, exclusion, credits untouched, pickup or cancel first → no-op
- **Why:** same pattern as the 4 h timer so there is one way timers work: the deadline lives in Postgres and the job re-checks it, so a duplicate job or a late Redis cannot reopen an errand the courier already picked up.
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 347 passed; `pnpm test:integration` 50 passed.
- **Follow-up:** none.

### 24294b4 feat(order): requester-chosen item type with fixed expiry; OPEN errands expire and release credits (D-018, D-019)
- **When:** 2026-10-18 14:51 · **Slice:** E · **Refs:** D-017, D-018, D-019, A-009
- **Changed:**
  - `migrations/202610180011_item_type_expiry`, `prisma/schema.prisma` — enum `ErrandItemType`, `item_type` (default NON_PERISHABLE), `expires_at` backfilled as `created_at + 24 h`, CHECK `errands_expiry_deadline`, partial index for the sweep, `OperationKind.EXPIRE`
  - `src/domain/errand.ts`, `src/api/dto.ts` — `itemType` optional on create only (400 on bad values, PATCH rejects it), `expiresAt` in responses, `expiryFor()`
  - `src/infrastructure/order.repository.ts` — create fixes `created_at`/`expires_at` from the DB clock; `expireIntent()` journals an EXPIRE release under the row lock only when due; `dueExpiries()`; accept refuses errands past the deadline
  - `src/application/order.service.ts`, `timer.worker.ts` — `expire()` and an `expire-<id>` timer job; 409 `ERRAND_EXPIRED`; `availableForAcceptance` false once past the deadline
  - tests — default 24 h / FOOD 2 h / invalid 400, expiry once with one release, ACCEPTED never expires, reopen keeps the deadline, lost release ack
- **Why:** expiry releases credits, so it uses the same journal as cancel (D-019) and its pending lock blocks a late accept. The CHECK makes "the deadline never moves" a database fact, not a convention. A failed (non-retryable) expiry release is skipped by the sweeper rather than retried every 30 s.
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 349 passed; `pnpm test:integration` 54 passed; migrations 8–11 applied by hand to a DB with existing rows → both rows NON_PERISHABLE, `expires_at - created_at = 1 day`.
- **Follow-up:** web-app sends no `itemType`, so its errands are all 24 h until its owner adds a control.
