# Order-service requirements

Consolidated from **D1** (CS3219 Project Milestone 1 Product Backlog, latest version —
the graded document) and the **Responsibilities** doc ("Order Service Responsibilities &
Integration Contract"). Neither PDF is in the repo; the relevant text is transcribed
here. `decisions.md` overrides both. Contradictions live in `conflicts.md`.

Status: `done` · `partial` · `todo` · `superseded (D-NNN)` · `other service`.
Evidence: `file` + symbol, or integration-test name (`tests/integration/errands.spec.ts`
unless stated). Keep evidence current — `order-requirements-sync` updates this file at
the end of every slice.

## 1. Numbering crosswalk

D1 reuses numbers (C15). These docs use aliases: **FR10-credit**, **FR10-notif**,
**FR9.1.3a** (release + free courier), **FR9.1.3b** (no re-accept).

| D1 (graded) | Responsibilities doc | Topic |
|---|---|---|
| FR3 | FR4 | Create / edit errand |
| FR4 | FR5 | Discovery of open errands |
| — | FR6 | State machine |
| FR5 | FR7 | Accept / assign |
| FR6 | FR8 | Concurrent acceptance |
| FR7 | FR9 | Courier lifecycle (+ confirm, dispute, 4 h — via D-005..D-008) |
| FR8 | FR10 | Requester cancel, item-type expiry |
| FR9 | FR11 | Courier cancellation |
| FR8.2 only | FR12 | Automatic transitions / timers |
| FR10-credit | FR13 | Closed-credit economy |
| FR10-notif | FR14 | Notifications |
| FR11 | FR15 | History, reorder |
| FR12 | FR16 | Live courier tracking |

The existing `README.md` uses Responsibilities numbering ("FR4 creation"). Prefer D1
numbers everywhere new.

## 2. Functional requirements (order-service scope)

FR1 (accounts) and FR2 (suppliers/pickup locations) belong to user-service and
supplier-service. Order-service depends on FR2.1 / FR2.4.1 (only available locations are
selectable) through `ServiceClients.pickup`.

### FR3 — Create errand (priority 1, sprint 2)
| ID | Requirement (D1) | Status | Evidence / notes |
|---|---|---|---|
| FR3.1 | Requester specifies pickup location, description, delivery destination, instructions, offered credits | done | `src/api/dto.ts` `CreateErrandDto`; test "reserves credits before publishing a uniquely identified OPEN errand and lists it" |
| FR3.1.1 | Reject missing/invalid fields or unavailable pickup | done | `CreateErrandDto`; `src/infrastructure/service-clients.ts` `ServiceClients.pickup` → `PICKUP_UNAVAILABLE`; test "rejects missing idempotency keys, unavailable pickup locations and inactive sessions" |
| FR3.2 | Create only after credits reserved | done | `src/infrastructure/order.repository.ts` `PrismaOrderRepository.execute` (CREATE branch inserts after `credits()` succeeds) |
| FR3.2.1 | Unique id, requester id, OPEN, createdAt | done | `PrismaOrderRepository.createIntent` (`errandId: randomUUID()`), `prisma/schema.prisma` `model Errand` |
| FR3.2.2 | Reserve fails → no errand | done | test "rejects insufficient credits without an errand, and never overspends concurrently" |
| FR3.3 | Edit OPEN, unassigned errand | done | `PrismaOrderRepository.editIntent`, `src/domain/errand.ts` `assertEditable` |
| FR3.3.1 | Edit description, delivery details, credits | done | `src/api/dto.ts` `EditErrandDto` |
| FR3.3.2 | Increase only if credits available | done | test "failed increases leave both errand fields and balances unchanged" |
| FR3.3.3 | Decrease releases excess | done | test "increases/decreases a bounty, releasing excess and reserving only the difference" |
| FR3.3.4 | Reject edit after acceptance | done | `assertEditable` (`ERRAND_NOT_EDITABLE`); test "rejects non-owner, stale, empty, pickup-changing and accepted edits" |
| FR3.4 | The errand request must be atomic | done | `ErrandOperation` journal + `src/infrastructure/recovery.worker.ts` `RecoveryWorker`; tests "recovers a lost reservation acknowledgement…", "retries after a real Order DB commit failure without reserving twice" |

### FR4 — Discovery (priority 1–2, sprint 2)
| ID | Requirement (D1) | Status | Evidence / notes |
|---|---|---|---|
| FR4.1 | Display OPEN, unassigned errands | done | `PrismaOrderRepository.listOpen`; `GET /api/errands` |
| FR4.1.1 | Filter by pickup location (vendor name, address line, postal code) | todo | C9 / Q-009 |
| FR4.1.2 | Exclude assigned/cancelled/expired/unavailable | partial | `listOpen` filters `status: OPEN, courierId: null, pendingOperationId: null, deletedAt: null`; expiry not implemented (S7) |
| FR4.2 | Courier views details before accepting | done | `src/application/order.service.ts` `OrderService.find` (OPEN + unassigned visible to all) |
| FR4.2.1 | Pickup info, delivery details, credits, status | done | `ErrandResponse` in `src/api/dto.ts` |
| FR4.2.2 | Indicate whether still available for acceptance | done | `availableForAcceptance` in `OrderService.find`; test "D3 queries: …" |

### FR5 — Accept (priority 1, sprint 3)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR5.1 | Authenticated courier accepts OPEN, unassigned errand | done | `POST /api/errands/:id/accept` → `OrderService.accept` → `PrismaOrderRepository.transition`; test "S4: a courier accepts an OPEN errand…" |
| FR5.1.1 | Reject if not OPEN or already assigned | done | conditional UPDATE guard; test "S4: rejects self-accept, unknown, deleted, taken and pending errands…" (409) |
| FR5.1.2 | Reject if courier is the requester | done | `requester_id <> courier` guard + `transition()` → 403 `ERRAND_ACTION_FORBIDDEN`; same test |
| FR5.2 | Record assignment, status ACCEPTED | done | sets `courier_id`, `accepted_at`, `version+1` and an `errand_history` row in one statement |
| FR5.2.1 | Removed from open list; both parties see it | done | `listOpen` filter; `OrderService.find` lets the assigned courier read; test "S4: a courier accepts…" |
| FR5.2.2 | Courier id visible to requester | done | `courierId` in `ErrandResponse`; same test |

### FR6 — Concurrent acceptance (priority 1–2, sprint 3)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR6.1 | At most one acceptance succeeds | done | single conditional UPDATE; test "S4 race (FR6): 20 parallel accepts…" (3 rounds) |
| FR6.1.1 | Exactly one courier, OPEN → ACCEPTED in one state change | done | same test: `version` 1, one history row |
| FR6.2 | Reject every losing attempt | done | same test: 19 × 409 |
| FR6.2.1 | Losers modify nothing, incl. credits | done | same test: credit balances unchanged, one history row |
| FR6.2.2 | Later reads return the winner | done | same test: requester GET returns the winner's `courierId` |

### FR7 — Courier lifecycle (priority 1, sprint 3)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR7.1 | Assigned courier marks ACCEPTED → PICKED_UP | done | `POST /api/errands/:id/pickup` → `OrderService.pickup`; test "S5: courier picks up and delivers…" |
| FR7.1.1 | Reject other users / invalid prior state | done | `OrderService.resolve` + `transition()`; test "S5: wrong actor gets 403, wrong state 409…" |
| FR7.1.2 | Record pickedUpAt | done | `picked_up_at` set by `PrismaOrderRepository.transition` |
| FR7.2 | *Requester* marks PICKED_UP → DELIVERED | superseded (D-005) | courier marks DELIVERED |
| FR7.2.1 | Reject unless PICKED_UP and *requester* | superseded (D-005) | becomes: unless PICKED_UP and assigned courier |
| FR7.2.2 | Record deliveredAt | done | `delivered_at` set by `PrismaOrderRepository.transition` |

### Derived lifecycle rows (Responsibilities §5 + decisions)
| ID | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| L-1 | Courier marks PICKED_UP → DELIVERED, records deliveredAt, starts 4 h clock | D-005, D-008 | done | `POST …/deliver` records `delivered_at`, the deadline's source of truth (`TimerWorker` sweeps it) |
| L-2 | Requester confirms DELIVERED → COMPLETED (`completionMethod=REQUESTER_CONFIRMED`) | D-006 | done | `POST …/confirm` → `OrderService.confirm`; test "S6a: requester confirms; errand.completed.v1 is written once…" |
| L-3 | Requester confirms early PICKED_UP → COMPLETED | D-006 | done | same route; test "S6a contract: credit-service settles the stored event…" |
| L-4 | Requester disputes DELIVERED → DISPUTED; no credit movement | D-007 | done | `POST …/dispute`; test "S5: courier picks up and delivers, requester disputes…" checks balances unchanged |
| L-5 | Still DELIVERED after 4 h → COMPLETED (`AUTO_TIMEOUT`); race-safe vs confirm/dispute | D-008 | done | `OrderService.autoComplete` (DB-clock guard in `PrismaOrderRepository.transition`), `src/infrastructure/timer.worker.ts` `TimerWorker`; tests "S6b: …" |
| L-6 | COMPLETED emits `errand.completed.v1` via outbox, exactly once per errand | D-001 | done | written in the same statement as the transition (`PrismaOrderRepository.transition`), partial unique index `outbox_events_one_completion_per_errand`; races "S6a race: …"; `OutboxRelay` tests "S6a relay: …" |
| L-7 | Courier may hold only one active errand | Resp §5 | todo | C5 / Q-005 |
| L-8 | 30-min ACCEPTED → OPEN (with exclusion); no 1-h timer | Resp §7, D-017 | done | `OrderService.reopen`, `REOPEN_DUE` + `dueReopens()` in `PrismaOrderRepository`, `TimerWorker` `reopen-<id>` jobs; tests "S8: an ACCEPTED errand not picked up within 30 minutes…", "F race: the 30-minute reopen vs a pickup…" |
| L-9 | Dispute resolution | Resp §5 (partial) | todo | C14 / Q-014 |

### FR8 — Requester cancel and item-type expiry (priority 1, sprint 4)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR8.1 | Requester cancels while OPEN (amended by D-015: also ACCEPTED) | done | `POST …/cancel` and owner `DELETE` (D-014) → `PrismaOrderRepository.cancelIntent`; test "S7: owner DELETE cancels on the same route…" |
| FR8.1.1 | Set CANCELLED and release credits | done | journal CANCEL op → `execute` + `close()`; one RELEASE ledger row; tests "S7: …" and "S7: cancelling an ACCEPTED errand releases the whole escrow and the courier (D-015)" |
| FR8.1.2 | Reject cancel from PICKED_UP onward | done | `TRANSITIONS` has cancel rows for OPEN/ACCEPTED only → 409; test "S7: cancel is 409 from PICKED_UP onward…" |
| FR8.2 | Expire an OPEN errand after its period from creation | done | `expires_at` fixed at create; `OrderService.expire`, `dueExpiries()`, `TimerWorker` `expire-<id>`; test "S7: an OPEN errand past its deadline expires once…" |
| FR8.2.1 | 2 h food; 24 h other items (D-018: requester-chosen `itemType`, default NON_PERISHABLE) | done | `CreateErrandDto.itemType`, `expiryFor()`, CHECK `errands_expiry_deadline`; test "S7: the requester picks the item type…" |
| FR8.2.2 | Remove from open list, release credits | done | EXPIRED is not OPEN; journal EXPIRE op releases (D-019) |
| FR8.2.3 | Never expire an accepted-or-later errand | done | `expireIntent` requires OPEN + unassigned under the row lock; accept refuses past the deadline; "F race: expiry vs 10 accepts…" |

### FR9 — Courier cancellation (priority 1, sprint 4)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR9.1 | Courier-initiated cancellation of accepted errands | done | `POST …/courier-cancel` → `OrderService.courierCancel`; test "S8: the courier gives an ACCEPTED errand back…" |
| FR9.1.1 | Assigned courier requests cancel of ACCEPTED with mandatory reason | partial | cancel works from ACCEPTED only (PICKED_UP → 409, Q-020); no reason field yet — Q-021 |
| FR9.1.2 | Notify requester; status ~~CANCELLED~~ OPEN (D-016) | partial | status OPEN done; notification waits for Q-010 |
| FR9.1.3a | ~~Release credits~~ credits stay reserved (D-016); free courier | done | courier/`accepted_at` cleared; balance unchanged in the S8 test |
| FR9.1.3b | Cancelling courier cannot accept the same errand again | done | `errand_excluded_couriers`; accept → 403 `ERRAND_COURIER_EXCLUDED`, SQL guard in `actorGuard`; also after a missed 30-min pickup (D-017) |

### FR10-credit — Closed-credit economy (priority 1, sprints 2–4)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR10-credit.1, .1.1–.1.3 | Initial balance, available/reserved, non-negative, once per user | other service | credit-service (+ web-app provisioning) |
| FR10-credit.2 | Reserve offered credits on creation | done | `OrderService.process` → `ServiceClients.reserve` |
| FR10-credit.2.1 | Reject creation on insufficient credits | done | test "rejects insufficient credits without an errand, and never overspends concurrently" |
| FR10-credit.2.2 | Concurrent creates never overspend | done | same test (credit-service enforces) |
| FR10-credit.3 | Transfer on COMPLETED; release on CANCELLED | partial | transfer via `errand.completed.v1` done (contract test "S6a contract: …"); release on DELETE done; CANCELLED status blocked (Q-007) |
| FR10-credit.3.1 | Ledger entry per reserve/transfer/release | other service | credit-service ledger |
| FR10-credit.3.2 | Transfer/release at most once | partial | release idempotent (test "lost release acknowledgement keeps deletion durable and retries without duplicate refunds"); transfer via event `eventId` dedupe (S6a) |
| FR10-credit.4, .4.1 | User views balances | other service | credit-service + web-app |

### FR10-notif — Notifications (priority 2–3, sprint 4)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR10-notif.1 | Notify requester and courier on ACCEPTED, PICKED_UP, DELIVERED, COMPLETED, CANCELLED | todo | S9; C10 |
| FR10-notif.1.1 | Only after the status change is recorded | todo | S9 — write in same transaction |
| FR10-notif.1.2 | Identify errand and triggering event | todo | S9 |
| FR10-notif.2, .2.1 | List own notifications: status, errand id, timestamp, read state | todo | S9 |
| FR10-notif.2.2 | Mark own as read only | todo | S9 |

### FR11 — History and reorder (priority 3, sprint 5)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR11.1 | Requester views past COMPLETED and CANCELLED errands | partial | `GET /api/errands/manage` (`PrismaOrderRepository.listManaged`) lists own errands incl. CANCELLED/EXPIRED (D-014: owner DELETE no longer hides them); not filtered to terminal states |
| FR11.1.1 | Pickup, delivery, credits, final status, timestamps | partial | lifecycle timestamps missing (S3) |
| FR11.1.2 | Reverse chronological by most recently updated | partial | sorts by `createdAt`, not `updatedAt` |
| FR11.2, .2.1, .2.2 | Reorder from template: revalidate pickup/credits; new id, nothing inherited | todo | S10 — reuse the create journal |

### FR12 — Live courier tracking (priority 4, sprint 5)
| ID | Requirement (D1) | Status | Notes |
|---|---|---|---|
| FR12.1, .1.1, .1.2 | Share assigned courier location; only that courier updates; only requester + courier read | todo | S11 |
| FR12.2, .2.1, .2.2 | Track only from PICKED_UP until COMPLETED/CANCELLED or unassigned | todo | S11 |
| FR12.3, .3.1, .3.2 | Stale indicator; purge location logs at terminal state | todo | S11 |

## 3. Lifecycle (authoritative target)

| From | Action | Actor | To | Timestamp / effect | Status of rule |
|---|---|---|---|---|---|
| — | create | REQUESTER | OPEN | createdAt; reserve (HTTP journal) | done |
| OPEN | edit | REQUESTER | OPEN | adjust (HTTP journal) | done |
| OPEN | accept | COURIER | ACCEPTED | acceptedAt, courierId | done (S4); C5, C12 parked |
| ACCEPTED | pickup | COURIER (assigned) | PICKED_UP | pickedUpAt | done (S5) |
| PICKED_UP | deliver | COURIER (assigned) | DELIVERED | deliveredAt; 4 h timer | done (S5, D-005) |
| PICKED_UP | confirm (early) | REQUESTER | COMPLETED | completedAt, REQUESTER_CONFIRMED; `errand.completed.v1` | done (S6a, D-006) |
| DELIVERED | confirm | REQUESTER | COMPLETED | as above | done (S6a, D-006) |
| DELIVERED | dispute | REQUESTER | DISPUTED | disputedAt; no credit effect | done (S5, D-007) |
| DELIVERED | auto-complete | SYSTEM | COMPLETED | AUTO_TIMEOUT; `errand.completed.v1` | done (S6b, D-008) |
| OPEN | cancel | REQUESTER | CANCELLED | cancelledAt; release (HTTP journal) | done (S7, D-014, D-015) |
| ACCEPTED | cancel | REQUESTER | CANCELLED | cancelledAt; courier released; release (HTTP journal) | done (S7, D-015) |
| OPEN | expire | SYSTEM | EXPIRED | expiredAt at `expires_at` (createdAt + 2 h / 24 h, never reset); release (HTTP journal) | done (S7, D-013, D-017..D-019) |
| ACCEPTED | courier-cancel | COURIER (assigned) | OPEN | courier released + excluded; credits stay | done (S8, D-016) |
| ACCEPTED | reopen (30 min after acceptedAt) | SYSTEM | OPEN | as courier-cancel | done (S8, D-017) |
| PICKED_UP… | cancel / courier-cancel | any | — | 409 | decided no (D-015); courier after pickup parked (Q-020) |
| PICKED_UP | 1-h timeout | SYSTEM | — | not built | dropped (D-017) |
| DISPUTED | resolve | ADMIN? | COMPLETED or CANCELLED | settle or release | C14 (DISPUTED is a dead end, D-020) |

Rows whose status column names an OPEN conflict must **not** be implemented until the
conflict is decided.
Implemented rows live in `src/domain/lifecycle.ts` `TRANSITIONS`.

## 4. Non-functional requirements (Responsibilities §12; D1 NFR1–NFR10)
| NFR | Obligation | Status | Evidence / notes |
|---|---|---|---|
| NFR1 | 100k historical errands; 500 concurrent users | partial | indexes in `prisma/schema.prisma` / migrations; not load-tested |
| NFR2.1 | 95% of list/create/details/accept < 2 s | todo | N3: `/me` called up to twice per request; tx held across credit HTTP |
| NFR2.2 | 95% of notifications available < 5 s | todo | S9 |
| NFR3.2 | All mutations authenticated + permission-checked; unauthorised → no state change | done | `src/api/auth.guard.ts` `AuthGuard`; actor checks in `OrderService.resolve` / `managed`; S4/S5/S6a 401/403 tests; `postman/order-service.postman_collection.json` |
| NFR4 | No private data in listings/logs | partial | pino redacts auth/cookie headers (`src/app.module.ts`); events must carry ids only |
| NFR5 | No permanent loss of critical state; resumable | partial | journal + `RecoveryWorker`; `outbox_events` + `OutboxRelay` (confirm-then-mark); deadlines in Postgres + `TimerWorker`; cancel/expiry timers blocked (S7, S8) |
| NFR8 | Structured logs w/ correlationId; health endpoint | done | `src/infrastructure/correlation.ts`, `src/api/correlation.middleware.ts`; id on journal ops, `errand_history`, outbox `headers`/AMQP header; `HealthController` |
| NFR9 | ≥80% coverage on critical logic; invalid-transition + concurrency tests | done | `test:coverage` (80% gate on domain/application; 96.7% statements, 92.2% branches); `tests/unit/lifecycle.spec.ts` matrix; race tests "S4 race…", "S5 race…", "S6a race…", "S6b race…", "F race: …" (cancel, courier cancel, reopen, expiry) |
| NFR10 | Containerised, restart-safe | done | `Dockerfile`, `docker-entrypoint.sh` (`migrate deploy`); image verified 2026-10-18 (9 migrations, ready after restart). Compose RabbitMQ wiring: Q-018 |

## 5. Known defects and risks
| ID | Problem | Where | Fix slice |
|---|---|---|---|
| K1 | Order allows `offeredCredits` up to 2,000,000,000; credit's max is 10,000,000 → amounts above 10M fail at credit as FAILED operations | `src/api/dto.ts` `CreateErrandDto`/`EditErrandDto` `@Max(2000000000)`; migration `202610120001_initial_errands` CHECK | S1 (done, `a77af2f`) |
| K2 | DB transaction + row lock held during the credit HTTP call (8 s fetch, 30 s tx timeout) | `PrismaOrderRepository.execute` | N3 |
| K3 | User Service `/me` called twice on some routes | `AuthGuard` + `ServiceClients.isAdministrator` | N2 |
| K4 | No correlation id propagation | — | N1 (fixed, `f2c4b61`) |
| K5 | Assigned courier cannot read their own errand | `OrderService.find` | S4 (fixed) |
| K6 | Timer job ids `auto-complete:<id>` were rejected by BullMQ ("Custom Id cannot contain :"), so the 4 h auto-complete never ran outside tests | `TimerWorker.sweep` | fixed (`e298bb0`) |
| R1 | Admin DELETE after acceptance can release credits before settlement | `deleteIntent` + `ServiceClients.release` ignoring `RESERVATION_STATE_CONFLICT` | S6a (C11) |
| R2 | Courier with no credit account → `errand.completed.v1` requeued forever | credit consumer 404 handling | S4/S6a (C12) |
| — | `dist/`, `coverage/`, `src/generated/` are stale local artefacts (gitignored) | — | run `db:generate`; ignore the others |

## 6. D1 amendments needed (take to the team)
1. FR7.2 / FR7.2.1: the **courier** marks DELIVERED (D-005).
2. Add a requester confirm step DELIVERED → COMPLETED and early confirm from PICKED_UP (D-006).
3. Add DISPUTED and the requester dispute action (D-007); dispute resolution once C14 is decided.
4. Add the 4-hour auto-complete (D-008), the 30-minute reopen with exclusion and no 1-hour timer (D-017).
5. FR9.1.2 / FR9.1.3a: courier cancel reopens the errand and keeps the credits reserved (D-016).
7. FR8.1: requester may also cancel an ACCEPTED errand (D-015); FR8.2.1: expiry by requester-chosen item type FOOD 2 h / NON_PERISHABLE 24 h (D-018); expiry ends in EXPIRED (D-013).
6. Renumber the second FR10 block and the second FR9.1.3 (C15).
