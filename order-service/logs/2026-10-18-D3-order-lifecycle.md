# 2026-10-18 · D3 · Order lifecycle, events, containers and Postman
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: S1 (credit cap), N1 (correlation ids), S3–S6b (lifecycle, accept,
pickup/deliver/dispute, confirm + outbox, auto-complete), requester cancel, Docker,
Postman.

## Summary
### Questions for you
Blocking what D3 can show (cancel + expiry):
1. **Q-006** Rename `IN_PROGRESS` → `PICKED_UP` (A), or keep both (B)? Does expiry end in `EXPIRED` (A) or `CANCELLED` (B)? · **Recommend:** rename; `EXPIRED` (D1 names it).
2. **Q-007** Owner `DELETE` once CANCELLED exists: soft-delete + new `POST …/cancel` (A), or DELETE sets CANCELLED on the same route + `…/cancel` (B)? · **Recommend:** B (keeps web-app working, history shows CANCELLED).
3. **Q-008** Errand category for 2 h / 24 h expiry: derive from supplier category and snapshot it (A), or a new request field (B)? · **Recommend:** A.
Credit safety:
4. **Q-012** Courier without a credit account makes credit requeue `errand.completed.v1` forever. Check at accept → 409 (A), ask credit to change 404 handling (B), user-service `user.verified.v1` (C)? · **Recommend:** A now, raise C with the team.
5. **Q-011** Admin DELETE after acceptance: hide only (no credit call) once ≥ PICKED_UP (A), or forbid after OPEN (B)? · **Recommend:** A.
6. **Q-019** (new) Add dev dep `@testcontainers/rabbitmq@12.1.0` for an automated real-broker test? It changes shared lockfile sections, outside D-011. Yes (A) / no, keep fake-channel tests + manual check (B). · **Recommend:** A.
Later slices: **Q-005** one active errand per courier (rec: yes, partial unique index) · **Q-003** courier cancel → OPEN (rec) or CANCELLED · **Q-004** timers (rec: 30-min reopen yes, 1-h cancel no, expiry from `createdAt`) · **Q-014** dispute resolution (rec: admin resolve + requester withdraw) · **Q-009** pickup filter (rec: `pickupLocationId` + `q`) · **Q-010** notifications owner (rec: order-service) · **Q-017** keep `x-correlation-id` (rec: yes).
Team: Q-015 D1 renumbering, Q-016 event naming, **Q-018** send the compose message in `docs/events.md` §8.

### What changed
The errand lifecycle now works end to end on the backend: a courier accepts (race-safe), picks up and delivers; the requester confirms (also early from PICKED_UP) or disputes; a DELIVERED errand completes itself after 4 h. Completion writes `errand.completed.v1` to a transactional outbox, and a relay publishes it to RabbitMQ so credit-service pays the courier exactly once. New queries: a courier's assigned errands, an admin view of one requester, and an `availableForAcceptance` flag. A Postman collection proves 401/403/409 handling. FR5, FR6, FR7, L-1…L-6, NFR3.2/8/9 are done. Still missing: requester cancel and expiry (Q-006/7/8), courier cancel and timers (Q-003/4), dispute resolution (Q-014), notifications (Q-010).

### How it works
- [lifecycle.ts](../src/domain/lifecycle.ts) `TRANSITIONS`: one row per (from, action, actor). An actor never allowed the action gets 403; a wrong state gets 409.
- [order.service.ts](../src/application/order.service.ts) `act()`: read the errand → resolve the role (requester / assigned courier / accept candidate) → domain row → repository; re-read once if a concurrent change won; a repeat returns the current state.
- [order.repository.ts](../src/infrastructure/order.repository.ts) `transition()`: **one SQL statement**: a conditional `UPDATE … WHERE status = from AND <actor guard>` with `version+1`, plus CTEs that insert the `errand_history` row and, for COMPLETED, the outbox row. Concurrent callers serialise on the row lock, so exactly one wins.
- [outbox.relay.ts](../src/infrastructure/outbox.relay.ts): publishes credit's envelope and marks the row published only after the broker confirms. [timer.worker.ts](../src/infrastructure/timer.worker.ts): a sweeper reads deadlines from Postgres; the job re-checks them with DB `now()`.
- DB CHECKs per state (e.g. COMPLETED needs `completed_at` + `completion_method`); unique index: one completion event per errand.

### Try it
`postman/README.md`: fill `foc-local` with four test accounts, run the collection. Or: `POST /api/errands/{id}/accept` (courier JWT) → `/pickup` → `/deliver` (courier) → `/confirm` (requester JWT) → `GET /api/errands/{id}` shows `COMPLETED`, `completionMethod`.

### Tests
`pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean · `pnpm test` 237 passed · `pnpm test:integration` 43 passed · `pnpm test:coverage` 280 passed, domain/application 96.7% statements, 92.2% branches. Also: `prisma migrate diff` empty; image build + run (9 migrations, ready, restart-safe); relay verified once by hand against RabbitMQ 4.2. Postman collection **not run live** (needs the full stack and accounts).

### Assumptions and risks
- A-003 History table `errand_history` (alternative: `errand_status_history`).
- A-004 / A-007 Wrong actor → 403 before any state check, also for non-participants (alternative: 404 like `GET`).
- A-005 COMPLETED rows must carry courier, `accepted_at`, `picked_up_at`.
- A-006 Repeating an action already in effect → 200 with the current errand (alternative: 409).
- A-008 4 h timer is sweeper-only (≤ 30 s late) (alternative: also a delayed job at deliver).
- Risk: until Q-012 is settled, completing an errand for a courier without a credit account parks the event in credit's retry loop. Until Q-011, admin DELETE can still release after acceptance.
- Risk: root compose does not give order-service RabbitMQ (Q-018); on this Mac the RabbitMQ image needs `--user rabbitmq --tmpfs /var/lib/rabbitmq:uid=100,gid=101`.

### Next
Answer Q-006/7/8 → S7 requester cancel + expiry (use `order-lifecycle-transition`). Ready without answers: N2 (single `/me` call, K3), S10 history + reorder, S11 live tracking.

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

### 24f7c13 feat(order): add confirm and write errand.completed.v1 to a transactional outbox
- **When:** 2026-10-18 06:52 · **Slice:** S6a (part 1) · **Refs:** D-001, D-006, L-2, L-3, L-6, FR10-credit.3
- **Changed:**
  - `migrations/202610180005_outbox_events`, `prisma/schema.prisma` — `outbox_events`; partial unique index, one `errand.completed.v1` per errand; index on unpublished rows
  - `src/infrastructure/order.repository.ts` — a transition into COMPLETED also inserts the event in the same statement; payload built in SQL from the updated row; correlation id in `headers`
  - `src/domain/events.ts` — event name and the exact payload type
  - `src/application/order.service.ts`, `src/api/order.controller.ts` — `POST /api/errands/:id/confirm`
  - `tests/integration/errands.spec.ts` — exact payload/headers; contract test through credit's `CreditEventsHandler` (delivered twice, courier paid once); wrong actor/state; three race tests
  - `docs/requirements.md`, `docs/contracts/web-app.md`, `docs/events.md` — evidence, route, status
- **Why:** the event must exist if and only if the errand is COMPLETED. Writing both in one statement means no crash window between them, and the unique index backs that up. The payload comes from the row being updated, so `amount` is the reserved bounty at completion. The contract test uses credit's real handler, so an extra key or a wrong type fails here, not in credit's DLQ.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 274/274, statements 96.6%, branches 90.2%; `prisma migrate diff` empty.
- **Follow-up:** relay (next commit); admin-delete guard Q-011; courier credit account Q-012.

### 841ab3c feat(order): relay outbox events to RabbitMQ behind ORDER_EVENTS_ENABLED
- **When:** 2026-10-18 06:58 · **Slice:** S6a (part 2) · **Refs:** D-001, D-011, NFR5, Q-018, Q-019
- **Changed:**
  - `src/infrastructure/outbox.relay.ts`, `src/app.module.ts` — `OutboxRelay`: 1000 ms poll, batch 50, `foc.events` topic exchange, credit's envelope, persistent, `messageId=eventId`, `x-correlation-id` AMQP header; marks published after broker confirm; off unless `ORDER_EVENTS_ENABLED=true`
  - `package.json`, root `pnpm-lock.yaml` (order-service importer only) — `amqplib@0.10.9`, `@types/amqplib@0.10.8`
  - `.env.example` — `ORDER_EVENTS_ENABLED`, `RABBITMQ_URL`, `ORDER_EVENTS_EXCHANGE`
  - `tests/integration/errands.spec.ts` — relay against an in-memory confirm channel: exact envelope/options, publish once, broker rejection keeps the row pending and the retry reuses the eventId
  - `docs/open-questions.md` (Q-019), `docs/events.md`, `docs/requirements.md`, `docs/roadmap.md`
- **Why:** confirm-then-mark gives at-least-once delivery with a stable eventId, which credit already deduplicates; marking first could lose a payment. Off by default so the integration harness and a stack without RabbitMQ keep working; rows simply wait. `@testcontainers/rabbitmq` was tried and removed: it adds shared lockfile entries outside D-011, so it is parked as Q-019, not added.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 276/276, statements 96.6%, branches 90.2%. One-off manual run (temp test, deleted) against `rabbitmq:4.2-management-alpine`: message received with the expected envelope, `messageId`, `deliveryMode 2`, header; row marked published. Note: on this Mac that image only starts with `--user rabbitmq --tmpfs /var/lib/rabbitmq:uid=100,gid=101` (`.erlang.cookie` eacces otherwise).
- **Follow-up:** Q-019; Q-018 compose wiring; Q-012 courier credit account before an end-to-end demo.

### 3cc7bdc feat(order): auto-complete DELIVERED errands after 4 hours
- **When:** 2026-10-18 07:00 · **Slice:** S6b · **Refs:** D-008, L-1, L-5, NFR5, A-008
- **Changed:**
  - `src/domain/lifecycle.ts` — `AUTO_COMPLETE_AFTER_HOURS = 4`
  - `src/infrastructure/order.repository.ts`, `src/application/ports.ts` — SYSTEM rows guarded by `delivered_at <= CURRENT_TIMESTAMP - 4h`; `dueAutoCompletions()`
  - `migrations/202610180006_auto_complete_index` — partial index on `delivered_at` for DELIVERED rows
  - `src/application/order.service.ts` — `autoComplete(id)`: idempotent, returns whether it won
  - `src/infrastructure/timer.worker.ts`, `src/app.module.ts` — `TimerWorker`: 30 s sweeper → BullMQ `order-timers`, `jobId` per errand, fresh correlation id per job
  - `tests/integration/errands.spec.ts` — timestamps aged with SQL (no sleeps): 3h59m no-op, dispute at 3h59m wins, 5 parallel jobs → one event, confirm vs job ×5 → one event
- **Why:** the deadline lives in Postgres and the job re-checks it inside the same conditional UPDATE, so Redis is only a work queue: wiping it, duplicating jobs or racing a confirm/dispute cannot complete an errand twice or early. DB `now()` avoids app clock skew between replicas.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 279/279, statements 96.6%, branches 90.2%. `TimerWorker` itself is thin glue with no direct test (same as `RecoveryWorker`).
- **Follow-up:** none.

### 9d0850c feat(order): add courier assignments, admin per-requester view and availability flag
- **When:** 2026-10-18 07:01 · **Slice:** S2 / D3 queries · **Refs:** FR4.2.2, FR5.2.1, NFR3.2
- **Changed:**
  - `src/api/order.controller.ts`, `src/api/dto.ts` — `GET /api/errands/assigned`; `ManageErrandsDto.requesterId` (optional, admin-only for others); `availableForAcceptance` documented
  - `src/application/order.service.ts` — `assigned()`; `managed()` 403 `ADMINISTRATOR_REQUIRED` for non-admins asking for someone else; flag on details
  - `src/application/ports.ts`, `src/infrastructure/order.repository.ts` — `listAssigned()`
  - `tests/integration/errands.spec.ts` — courier list, admin per-requester list, 403/400 cases, flag before/after accept
  - `docs/requirements.md`, `docs/contracts/web-app.md`, `docs/roadmap.md`
- **Why:** D3 asks for courier, requester and admin query patterns. A separate DTO keeps `requesterId` from being silently accepted on the public open list (400 there). Authorization is checked in the service from user-service's `isAdmin`, never from the query.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 280/280, statements 96.7%, branches 92.2%.
- **Follow-up:** pickup-location filter (Q-009).

### 8bc6fb8 test(order): add Postman collection proving backend authorization
- **When:** 2026-10-18 07:04 · **Slice:** D3 Postman / containers · **Refs:** NFR3.2, NFR10, D3 Parts 4–5
- **Changed:**
  - `postman/order-service.postman_collection.json` — 32 requests with tests: 401, 403 (wrong actor), 409 (wrong state, lost race, key reuse), idempotent replays, lifecycle to COMPLETED, query patterns
  - `postman/foc-local.postman_environment.json` — URLs and per-role credentials (passwords typed as secrets, empty)
  - `postman/README.md` — prerequisites, how JWTs come from user-service `POST /api/auth/login`, how to run
  - `docs/roadmap.md` — Postman row
- **Why:** D3 asks for Postman proof that authorization is enforced by the backend. Logging in through the real user-service keeps the proof honest: no test-only bypass exists in order-service.
- **Verified:** JSON parses; versions/codes cross-checked against the integration tests. **Not run live:** that needs user/supplier/credit running with verified test accounts. Container check (no commit needed): `docker build -f order-service/Dockerfile .` OK; image run against Postgres 17 + Redis applied all 9 migrations, `/health/live` and `/health/ready` OK, unauthenticated `GET /api/errands` 401; after `docker restart` "No pending migrations", ready again.
- **Follow-up:** live Newman run once the stack and accounts exist; compose wiring Q-018; RabbitMQ on this Mac needs the `--user rabbitmq --tmpfs` workaround (see `841ab3c`).

### c710f7a docs(order): add order-lifecycle-transition skill from the implemented patterns
- **When:** 2026-10-18 07:04 · **Slice:** — · **Refs:** A-002, D-010
- **Changed:**
  - `.agents/skills/order-lifecycle-transition/SKILL.md` — 52-line procedure: domain row + matrix test, single-statement UPDATE with history/outbox CTEs, `act()`, outbox and timer patterns, minimum tests
  - `.agents/README.md` — skill row; code map lists `lifecycle.ts`, `events.ts`, `outbox.relay.ts`, `timer.worker.ts`, `postman/`
  - `docs/events.md` — pointer to the real skill (the old `order-domain-events` name never existed)
- **Why:** A-002 deferred these skills until real code existed. One short skill instead of three keeps agent context small, and the cancel/expiry slices can copy the patterns once Q-006/7/8 are answered.
- **Verified:** docs only.
- **Follow-up:** none.
