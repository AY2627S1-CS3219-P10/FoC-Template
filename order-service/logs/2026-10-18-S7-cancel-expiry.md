# 2026-10-18 · S7/S8 · Cancel, courier cancel, reopen timer and expiry
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: A status model (IN_PROGRESS removed), B requester cancel, C courier
cancel + exclusions, D 30-minute reopen, E item type + expiry, F race tests, plus
Postman requests and `docs/demo-timers.md` for the manual D3 demo.

## Summary
### Questions for you
New this pass:
1. **Q-020** May a courier cancel after pickup? — A) never, problems go through a dispute; B) PICKED_UP → OPEN with exclusion, credits stay; C) PICKED_UP → CANCELLED with a full release · **Recommend:** A until dispute resolution (Q-014) exists.
2. **Q-021** Must a courier cancel carry a reason (D1 FR9.1.1)? — A) required, stored on the history row; B) optional; C) none · **Recommend:** A (D1 and Resp both ask for it; new route, web-app unaffected).
Still open from before (unchanged): **Q-012** courier credit account at accept (rec A) · **Q-011** admin DELETE after acceptance (rec A) · **Q-019** RabbitMQ testcontainer dep (rec A) · **Q-005** one active errand per courier (rec A) · **Q-014** dispute resolution (rec C) · **Q-009** pickup filter (rec A) · **Q-010** notifications owner (rec A) · **Q-017** keep `x-correlation-id` (rec yes). Team: Q-015, Q-016, Q-018.
Please also check the assumptions A-009…A-018 below; any veto becomes a question.

### What changed
Errands can now end without completing. The requester cancels an OPEN or ACCEPTED errand (`POST …/cancel`, or web-app's existing DELETE), which releases the whole escrow and frees the courier. The courier can give an ACCEPTED errand back (`POST …/courier-cancel`): it reopens with credits still reserved, and that courier can never take it again. An ACCEPTED errand nobody picks up within 30 minutes reopens the same way. At creation the requester picks `itemType` FOOD (2 h) or NON_PERISHABLE (default, 24 h); an OPEN errand past that deadline becomes EXPIRED and its credits are released. IN_PROGRESS is gone. FR8, FR9 (except the reason, Q-021) and L-8 are done. Also fixed: the 4 h auto-complete had never run outside tests, because BullMQ rejected its job id.

### How it works
- [lifecycle.ts](../src/domain/lifecycle.ts) `TRANSITIONS` has every row, with flags: `releasesCredits` (cancel, expire), `releasesCourier`, `excludesCourier` (courier cancel, reopen).
- Rows that release credits use the journal ([order.repository.ts](../src/infrastructure/order.repository.ts) `cancelIntent` / `expireIntent` → `execute` → `close`). The intent locks the row and sets `pending_operation_id`, which is what makes a concurrent accept or pickup lose. After credit-service confirms the release, one statement sets the status and clears the courier, and the history row keeps who the courier was.
- Courier cancel and reopen are one conditional UPDATE in `transition()`. Status, history and the `errand_excluded_couriers` row commit together. Accept's SQL guard skips excluded couriers and errands past `expires_at`.
- [timer.worker.ts](../src/infrastructure/timer.worker.ts) sweeps every 30 s for auto-complete, reopen and expiry deadlines in Postgres and enqueues `<name>-<errandId>` jobs; each job re-checks with the DB clock.
- `expires_at` is fixed at creation from the DB clock; the CHECK `errands_expiry_deadline` stops it ever moving.

### Try it
Postman folder 4 (`postman/README.md`), or by hand with a requester JWT `$R` and courier JWT `$C`:
`POST /api/errands` with `"itemType":"FOOD"` → `expiresAt` is 2 h after `createdAt` · `POST /api/errands/{id}/accept` ($C) → `/courier-cancel` ($C) → OPEN · `/accept` again ($C) → 403 `ERRAND_COURIER_EXCLUDED` · `POST /api/errands/{id}/cancel` ($R) → CANCELLED, credits back. Timers: [demo-timers.md](../docs/demo-timers.md) (SQL ageing; the sweeper applies the change within 30 s).

### Tests
`pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean · `pnpm test` 349 passed · `pnpm test:integration` 60 passed (full suite twice; `-t race` 13 passed three times) · `pnpm test:coverage` 409 passed, domain/application 96.68% statements, 93.49% branches · `prisma migrate diff` (fresh DB with all 15 migrations → schema) empty · migrations 0007–0011 applied by hand to a DB with existing rows (IN_PROGRESS row → PICKED_UP; backfill NON_PERISHABLE, +24 h) · compiled `TimerWorker` against a real Redis 7: all three job kinds enqueued and dispatched. Postman collection **not run live**. One filtered run failed all 6 new race tests after more than 10 minutes, with no error captured; every run since passed.

### Assumptions and risks
- A-009 `itemType` is create-only, so `expires_at` never moves (alternative: editable; would become a question).
- A-010 IN_PROGRESS removed by rebuilding the enum, because `RENAME VALUE` fails when PICKED_UP already exists (brief said RENAME VALUE).
- A-011 Admin DELETE keeps the old soft delete, also on an admin's own errand (alternative: owners who are admins cancel).
- A-012 A repeat courier cancel by the released courier returns 200 with the current state (alternative: 403).
- A-013 `POST …/cancel` needs no `Idempotency-Key`; the key is derived from the errand id. A permanently failed release via POST repeats the same failure; DELETE with a new key retries.
- A-014 Accept is refused (409 `ERRAND_EXPIRED`) once past `expires_at`, even before the sweep; the open list may still show the errand for ≤ 30 s.
- A-015 Cancel by a non-requester → 403 `ERRAND_OWNER_REQUIRED`; owner DELETE after pickup → 409 `ERRAND_INVALID_TRANSITION` (was `ERRAND_NOT_DELETABLE`; web-app does not branch on codes).
- A-016 If an expiry release fails for good, the errand stays OPEN past its deadline (accept refused) and the sweeper skips it; needs a manual fix.
- A-017 New `errand_history.courier_id` keeps the released courier on cancel and reopen rows.
- A-018 `GET /api/errands` is not filtered per caller: an excluded courier still sees the errand there; details say `availableForAcceptance: false`.
- Risk: web-app has no UI for `itemType`, cancel of an ACCEPTED errand, courier cancel or the courier actions, so all its errands are 24 h and D3 shows these with Postman. Its "The request has been removed" text no longer fits (the errand stays visible as CANCELLED).
- Risk: K2 still applies; the journal holds the row lock during the release HTTP call.

### Next
Answer Q-020/Q-021 (small additions to S8). Ready without answers: N2 (single `/me` call, K3), S10 history + reorder, S11 live tracking.

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

### 4f65762 test(order): race tests for cancel, courier cancel, reopen and expiry against accept, pickup and completion
- **When:** 2026-10-18 15:23 · **Slice:** F · **Refs:** FR6, NFR9, D-015..D-019
- **Changed:**
  - `tests/integration/errands.spec.ts` — six races on real Postgres, 3–5 fresh rounds each: cancel vs 10 accepts; cancel vs pickup; courier cancel vs pickup; 30-min reopen vs pickup; expiry (×3) vs 10 accepts, plus the not-yet-due case; confirm vs dispute vs the 4 h job
- **Why:** cancel vs accept can legitimately end with both succeeding (accept first, then a cancel from ACCEPTED is allowed by D-015), so that test checks for one consistent end state (CANCELLED, one release, courier recorded if one got in) rather than a single winner. The others check one winner, the loser's 403/409, one history row and the credit effect.
- **Verified:** `pnpm test:integration` 60 passed twice in full (8–9 s); `-t race` 13 passed three times. One earlier filtered run reported the 6 new tests failed after more than 10 minutes, without a captured error; every run since passed, which points at Testcontainers startup rather than a race (risk noted).
- **Follow-up:** none.

### 2800a47 docs(order): Postman requests, timer demo SQL, contract and requirements for cancel and expiry
- **When:** 2026-10-18 15:24 · **Slice:** — · **Refs:** D-013..D-020, Q-020, Q-021
- **Changed:**
  - `postman/order-service.postman_collection.json`, `postman/README.md` — folder 4 (21 requests): item type, courier cancel + exclusion, requester cancel of an ACCEPTED errand, DELETE as cancel, 409s after pickup; table of what is tested manually because web-app has no UI for it
  - `docs/demo-timers.md` — copy-paste SQL to age `accepted_at`, `created_at`/`expires_at` and the delivery stamps so reopen, expiry and auto-complete show live within one sweep
  - `docs/contracts/web-app.md` — new routes, `itemType`/`expiresAt`, DELETE now cancels, no `itemType` control in web-app yet (all its errands are 24 h)
  - `docs/requirements.md`, `docs/roadmap.md` — FR8/FR9/L-8 rows with evidence, lifecycle table, K6, D1 amendments; S7 DONE, S8 DONE except parked parts
  - `docs/open-questions.md` — Q-021 (courier cancel reason, D1 FR9.1.1)
  - `.agents/` — lifecycle skill: journal pattern for credit-releasing rows, `timerJob()`; code map
- **Why:** D3 is partly shown by hand, so every route web-app cannot reach needs a ready request and every timer needs a way to show it without waiting and without a bypass endpoint.
- **Verified:** docs only; the demo SQL was run against a Postgres 17 DB with the full schema (all three updates accepted; moving `expires_at` alone rejected by `errands_expiry_deadline`). The Postman collection was **not** run live.
- **Follow-up:** Q-021.
