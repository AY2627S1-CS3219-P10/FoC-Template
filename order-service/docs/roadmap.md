# Roadmap and ready queue

Agents pick work from the **ready queue** below (D-009). Rules:
- **READY** — start it.
- **PARTIAL** — start only the part listed under "Can proceed"; the parked part waits.
- **BLOCKED** — skip it; its questions go in the next summary's "Questions for you".
- "after X" means X must be DONE first.

`order-requirements-sync` updates this file at the end of every slice. When a question is
answered, re-evaluate every slice that lists it.

## Ready queue (in recommended order)

| # | Slice | Status | Can proceed | Parked / blocked by |
|---|---|---|---|---|
| 1 | S0 Agent docs | DONE (this pass) | — | — |
| 2 | S1 Hygiene | READY | everything | — |
| 3 | N1 Correlation IDs | READY | HTTP in/out + logs, using `x-correlation-id` behind one constant | final header name (Q-017) |
| 4 | S3 Lifecycle model | PARTIAL | add PICKED_UP, DISPUTED; timestamps; `completionMethod`; history table; domain transition table for decided rows | rename/removal of IN_PROGRESS / EXPIRED (Q-006) |
| 5 | S4 Accept | PARTIAL, after S3 | race-safe conditional-UPDATE accept, self-accept rejection, courier can read assigned errand, race test | one-active-errand constraint (Q-005); courier credit-account check (Q-012) |
| 6 | S5 Pickup / deliver / dispute | after S3, S4 | everything (D-005, D-007) | dispute *resolution* (Q-014) is a later slice |
| 7 | S2 Discovery | PARTIAL | `availableForAcceptance` flag on details, exclusion of non-OPEN | pickup-location filter (Q-009) |
| 8 | S6a Completion + outbox | PARTIAL, after S3, S5, N1 | outbox table, relay, confirm + early confirm, `errand.completed.v1`, contract test | admin-delete guard (Q-011); end-to-end with courier accounts (Q-012); docker wiring (Q-018) |
| 9 | S6b 4 h auto-complete | after S6a | everything (D-008) | — |
| 10 | S10 History + reorder | after S3 | history view, reorder via create journal | cancelled errands in history depend on Q-007 |
| 11 | S11 Live tracking | after S5 | everything | — |
| 12 | N2 Single `/me` call | READY | everything | — |
| 13 | N3 Latency review | READY | analysis, tx-across-HTTP fix proposal | — |
| 14 | N4 Coverage gate | after S1 | everything | — |
| — | S7 Requester cancel + expiry | BLOCKED | — | Q-006, Q-007, Q-008 |
| — | S8 Courier cancel + 30 min / 1 h timers | BLOCKED | — | Q-003, Q-004 |
| — | S9 Notifications + Socket.IO | BLOCKED | — | Q-010 |
| — | S12 Dispute resolution | BLOCKED | — | Q-014 |

## Slice details

### S0 — Agent docs (DONE)
Docs and `.agents/` tooling. No code. Summary: `docs/changes/001-S0-agent-docs.md`.

### S1 — Hygiene
- **Goal:** fix K1 and add coverage tooling.
- **FRs/NFRs:** FR3.1.1, NFR9.
- **Work:** cap `offeredCredits` at 10,000,000 in `CreateErrandDto`/`EditErrandDto` and a
  new migration replacing the `errands_positive_bounty` CHECK; add `test:coverage`
  script (jest `--coverage`, thresholds 80% for `src/domain`, `src/application`);
  record the working toolchain command in `.agents/reference/toolchain.md`.
- **Acceptance:** create/edit with 10,000,001 → 400; coverage script runs.

### N1 — Correlation IDs
- **Goal:** one id per request across logs, credit calls and (later) events.
- **Work:** Fastify hook/interceptor reading `x-correlation-id` (≤128 chars) or generating a
  UUID; pino `correlationId`; `ServiceClients.request` forwards it; echo in response.
- **Acceptance:** a create shows the same id in order logs and credit's ledger row.

### S2 — Discovery (FR4)
- **Can proceed:** additive `availableForAcceptance` boolean on details (FR4.2.2);
  confirm exclusion rules (FR4.1.2) with tests.
- **Parked:** pickup filter (Q-009).

### S3 — Lifecycle model
- **Goal:** schema + domain foundation for every later lifecycle slice.
- **Can proceed:** enum values PICKED_UP, DISPUTED (ADD VALUE); columns `acceptedAt`,
  `pickedUpAt`, `deliveredAt`, `disputedAt`, `completedAt`, `cancelledAt`,
  `completionMethod`; `errand_status_history` table; `src/domain` transition table with
  decided rows (see requirements.md §3); per-state CHECK constraints; full matrix unit
  tests.
- **Parked:** IN_PROGRESS/EXPIRED rename/removal (Q-006).
- **Acceptance:** matrix test covers every status × action × actor.

### S4 — Accept (FR5, FR6)
- **Can proceed:** `POST /api/errands/:id/accept` with a single conditional UPDATE
  (`status=OPEN AND courier_id IS NULL AND pending_operation_id IS NULL AND
  deleted_at IS NULL AND requester_id <> $courier`); idempotent replay for the same
  courier; `OrderService.find` lets the assigned courier read it; race test (20 parallel
  accepts → 1 winner, version +1 once, no credit change).
- **Parked:** one-active-errand index (Q-005), courier credit-account check (Q-012).
  Keep each as one isolated function so the answer plugs in.

### S5 — Pickup, deliver, dispute (FR7, D-005, D-007)
- **Work:** `POST …/pickup` (assigned courier, ACCEPTED → PICKED_UP), `POST …/deliver`
  (assigned courier, PICKED_UP → DELIVERED), `POST …/dispute` (requester, DELIVERED →
  DISPUTED, no credit effect). History rows.
- **Acceptance:** wrong actor → 403; wrong state → 409; timestamps recorded.

### S6a — Completion + outbox (FR10-credit.3, D-001, D-006)
- **Can proceed:** `outbox_events` table + relay; `POST …/confirm` (requester; DELIVERED
  or PICKED_UP → COMPLETED, `REQUESTER_CONFIRMED`); `errand.completed.v1` written in the
  same transaction; contract test through credit's `CreditEventsHandler`; RabbitMQ
  testcontainer test; confirm-vs-dispute race test.
- **Parked:** C11 admin-delete guard (Q-011); C12 account check (Q-012).
- **New deps (justify in brief):** `amqplib`, `@types/amqplib`, `@testcontainers/rabbitmq`.

### S6b — 4 h auto-complete (D-008)
- `order-timers` queue; job at `deliveredAt + 4h`; sweeper; conditional UPDATE
  `WHERE status='DELIVERED' AND delivered_at <= now() - interval '4 hours'`; outbox event
  in the same transaction; `AUTO_TIMEOUT`.
- **Acceptance:** dispute at 3h59m → job no-op; job twice → one event; Redis wiped → sweeper
  recovers.

### S7 — Requester cancel + category expiry (FR8) — BLOCKED (Q-006, Q-007, Q-008)
### S8 — Courier cancel + timers (FR9, C4) — BLOCKED (Q-003, Q-004)
### S9 — Notifications + Socket.IO (FR10-notif) — BLOCKED (Q-010)

### S10 — History + reorder (FR11)
History endpoint (terminal states, ordered by `updatedAt desc`); reorder = new create
operation from a template with revalidation through the same journal.

### S11 — Live tracking (FR12)
Ephemeral latest-location store (not authoritative), assigned-courier writes only,
requester + courier reads, stale flag, purge at terminal state.

### S12 — Dispute resolution — BLOCKED (Q-014)

### N2 — Single `/me` call · N3 — Latency review · N4 — Coverage gate
See requirements.md §5 (K2, K3) and NFR9.
