# 2026-10-18 · D3 · Order lifecycle, events, containers and Postman
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: S1 (credit cap), N1 (correlation ids), S3–S6b (lifecycle, accept,
pickup/deliver/dispute, confirm + outbox, auto-complete), requester cancel, Docker,
Postman.

## Summary
_Written at the end of the pass by `order-change-summary`._

Assumptions so far (decide-and-note; fold into the summary):
- A-003 History table is `errand_history` (handoff name; alternative: roadmap's `errand_status_history`).
- A-004 Wrong actor is checked before state: 403 beats 409 (alternative: 409 first, which leaks state to strangers).
- A-005 COMPLETED rows must carry courier, `accepted_at`, `picked_up_at` (alternative: allow admin/legacy COMPLETED without them).
- A-006 Repeating a lifecycle action whose effect is already the current state returns 200 with the current errand (alternative: 409). Matches accept replay; never re-applies.
- A-007 A non-participant calling pickup/deliver/dispute gets 403, not 404 (alternative: 404 like `GET`). The handoff asks for 403 "wrong actor"; ids are UUIDv4.

## Commits

### a77af2f fix(order): cap offered credits at credit-service's 10M limit
- **When:** 2026-10-18 06:26 · **Slice:** S1 · **Refs:** K1, FR3.1.1, NFR9
- **Changed:**
  - `src/domain/errand.ts` — `MAX_OFFERED_CREDITS = 10_000_000`, used by `CreateErrandDto`/`EditErrandDto`
  - `migrations/202610180001_credit_cap` — DB CHECK narrowed from 2e9 to 10M
  - `tests/unit/dto.spec.ts` — 10M accepted, 10M+1 rejected on create and edit
  - `tests/jest-coverage.json`, `package.json` — `test:coverage` runs unit + integration, 80% gate on domain/application
- **Why:** credit-service rejects amounts above 10M, so larger bounties always ended as FAILED operations after a round trip; rejecting at the edge gives a clear 400 instead.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 35/35 passed, statements 95.8%, branches 82.8%.
- **Follow-up:** none.

### f2c4b61 feat(order): propagate x-correlation-id through logs, credit calls and retries
- **When:** 2026-10-18 06:28 · **Slice:** N1 · **Refs:** NFR8, Q-017
- **Changed:**
  - `src/infrastructure/correlation.ts`, `src/api/correlation.middleware.ts` — reuse a valid inbound `x-correlation-id` or generate one, keep it in AsyncLocalStorage, echo it in the response
  - `src/app.module.ts` — middleware on all controllers; pino logs now include `service`, ISO `timestamp`, `severity`, `correlationId`
  - `src/infrastructure/service-clients.ts` — forwards the id on every user/supplier/credit call
  - `prisma/schema.prisma`, `migrations/202610180002_operation_correlation`, `order.repository.ts` — id stored on journal operations; recovery-worker retries reuse it
  - `tests/unit/correlation.spec.ts`, one integration test — id reaches credit's ledger row and the stored operation
- **Why:** NFR8 wants one id across the create and complete flows, and the demo needs a single id to follow a request from order into credit logs and ledger. Using credit's existing header name avoids a new convention.
- **Verified:** `typecheck`, `lint` clean; 16 unit and 23 integration tests passed.
- **Follow-up:** header name still to be confirmed with the team (Q-017); the AMQP-header half arrives with the outbox (S6a).

### 474865f docs(order): add handoff for the next agent session and N1 log entry
- **When:** 2026-10-18 06:32 · **Slice:** — · **Refs:** D-012
- **Changed:**
  - `logs/HANDOFF-2026-10-18.md` — state, decisions, next steps and parked questions for the next agent session
  - `logs/2026-10-18-D3-order-lifecycle.md` — entry for `f2c4b61`
  - `.agents/README.md` — start-of-task step now reads the newest handoff
- **Why:** the pass continues in a fresh session; one file gives it the facts without re-deriving them from the diffs.
- **Verified:** docs only.
- **Follow-up:** none.

### 4b6ebfe feat(order): add lifecycle states, timestamps, history table and transition table
- **When:** 2026-10-18 06:43 · **Slice:** S3 · **Refs:** D-005..D-008, FR5–FR7, Q-006, A-003, A-004, A-005
- **Changed:**
  - `migrations/202610180003_lifecycle_statuses` — enum values PICKED_UP, DISPUTED (own migration: a new value is unusable in the transaction that adds it)
  - `migrations/202610180004_lifecycle_columns`, `prisma/schema.prisma` — `accepted_at…cancelled_at`, `completion_method`, `errand_history` (actor NULL only for SYSTEM), per-state CHECKs + timestamp ordering
  - `src/domain/lifecycle.ts` — `TRANSITIONS` (decided rows only) and `transition()`: actor never allowed → 403, wrong state → 409
  - `src/api/dto.ts` — additive: new statuses and optional timestamp/`completionMethod` fields in `ErrandResponse`
  - `tests/unit/lifecycle.spec.ts` — 216-case matrix against an independent expected list; domain lists match Prisma enums
  - `tests/integration/errands.spec.ts` — CHECK rejection test; fixtures forcing ACCEPTED/COMPLETED now carry their timestamps
- **Why:** later slices (accept, pickup/deliver/dispute, confirm, auto-complete) need one place that says who may do what, and DB constraints so a buggy UPDATE cannot produce e.g. COMPLETED without a completion method. Checking the actor first means strangers learn nothing about an errand's state.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 260/260 (236 unit, 24 integration), statements 96.6%, branches 84.4%; `prisma migrate diff` (migrated DB → schema) empty; 0003/0004 applied on a DB with existing rows.
- **Follow-up:** Q-006 (IN_PROGRESS/EXPIRED); no CHECKs for CANCELLED/EXPIRED until Q-007.

### 43cb46a feat(order): add race-safe POST /api/errands/:id/accept
- **When:** 2026-10-18 06:47 · **Slice:** S4 · **Refs:** FR5, FR6, NFR9, Q-005, Q-012
- **Changed:**
  - `src/infrastructure/order.repository.ts`, `src/application/ports.ts` — `transition()`: one statement (conditional UPDATE + `errand_history` insert in a CTE) guarded by status, `deleted_at`, `pending_operation_id` and the actor
  - `src/application/order.service.ts` — `accept()`: 0 rows → re-read → 404/403/409; the winner repeating gets the current state; `find()` lets the assigned courier read
  - `src/api/order.controller.ts` — `POST /api/errands/:id/accept` (200 `Errand`)
  - `tests/integration/errands.spec.ts` — `courier` / `courier-N` fake sessions; happy path, rejections, 20-way race × 3 rounds, same-courier double accept
  - `docs/contracts/web-app.md`, `docs/requirements.md`, `docs/roadmap.md` — additive route, FR5/FR6 evidence, S4 done
- **Why:** the guarantee lives in Postgres, not in app locks: concurrent UPDATEs serialise on the row lock and losers re-check the WHERE against the winner's row, so at most one courier can match. One statement also makes the history row atomic with the change without holding a transaction open in Node. Re-reading only on failure keeps the success path to one query.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 264/264, statements 96.0%, branches 87.0%. Mutation check: with the status/courier guards removed the race test failed (6 winners), then restored.
- **Follow-up:** Q-005 (one active errand) and Q-012 (courier credit account) plug in at the marked spot in `accept()`.

### 3973172 feat(order): add pickup, deliver and dispute actions
- **When:** 2026-10-18 06:49 · **Slice:** S5 · **Refs:** FR7.1, FR7.2.2, D-005, D-007, A-006, A-007
- **Changed:**
  - `src/application/order.service.ts` — `pickup`/`deliver`/`dispute` and `accept` share `act()`: fresh read → role → `transition()` → conditional UPDATE, re-read once if a concurrent change won
  - `src/domain/lifecycle.ts` — `alreadyApplied()` for idempotent repeats
  - `src/api/order.controller.ts` — three `POST /api/errands/:id/<action>` routes (200 `Errand`)
  - `tests/integration/errands.spec.ts` — full ACCEPTED→DISPUTED walk with history and unchanged balances; 401/403/404/409/repeat matrix; 10 parallel pickups apply once
  - `docs/requirements.md`, `docs/contracts/web-app.md`, `docs/roadmap.md` — evidence, additive routes, S5 done
- **Why:** one code path for every lifecycle action means S6a's confirm only adds a route and the outbox write. Reading first lets the domain table pick the from-state (confirm has two) and give precise 403/409 errors; the UPDATE's WHERE still guarantees correctness if the read is stale.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 268/268, statements 96.5%, branches 90.2%.
- **Follow-up:** dispute resolution (Q-014); 4 h timer on `delivered_at` (S6b).
