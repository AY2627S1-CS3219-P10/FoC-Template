# Contract: credit-service (port 3003)

Credit Service owns every balance mutation. Order-service never touches credit's data
except through the calls below. Verified against `credit-service/` source on
2026-10-18; if credit changes, re-check (`git log -- credit-service/src/api`) and update
this file in the same slice.

Citations are `file` + symbol. Paths are relative to the repo root.

## 1. How order calls credit (HTTP)

- Base URL: `CREDIT_SERVICE_URL` (default `http://127.0.0.1:3003`), prefix `/v1`.
- Auth: `Authorization: Bearer $CREDIT_ORDER_SERVICE_TOKEN`
  (`credit-service/src/api/internal-service-auth.guard.ts` `InternalServiceAuthGuard`,
  `@InternalCallerOnly('order-service')`). Missing/malformed header → 401; any other
  caller's token → 403. Tokens are ≥32 chars and distinct per caller.
- Correlation: optional `x-correlation-id` (≤128 chars) is echoed back and stored on
  ledger rows (`credit-service/src/api/correlation-id.interceptor.ts`). Order does not
  send it yet (N1).
- Error body: `{statusCode, code, message, details?, correlationId, timestamp, path}`.
- Unknown body fields are rejected (global `ValidationPipe` with `forbidNonWhitelisted`).
- Order's client: `order-service/src/infrastructure/service-clients.ts`
  `ServiceClients.request` (8 s timeout) with `reserve`, `adjust`, `release`.

| Call | Route (`credit-service/src/api/credit.controller.ts`) | Body | Success | Used by order |
|---|---|---|---|---|
| Reserve | `POST /v1/credit-reservations` (`CreditController.reserve`) | `{errandId, requesterId, amount}` amount int 1..10,000,000 | 201 new / 200 replayed | create (journal `CREATE`) |
| Adjust | `POST /v1/credit-reservations/:errandId/adjustment` (`CreditController.adjust`) | `{requesterId, targetAmount, idempotencyKey}` — **absolute** new amount; key ≤128 chars | 200 | edit (journal `EDIT`, key = operation id) |
| Release | `POST /v1/credit-reservations/:errandId/release` (`CreditController.release`) | `{requesterId, amount}` amount = current reservation | 200 | delete/cancel/expiry (journal) |
| Settle | `POST /v1/credit-reservations/:errandId/settlement` (`CreditController.settle`) | `{requesterId, courierId, amount}` | 200 | **never** — settlement is event-only (D-001) |
| Balance | `GET /v1/credit-accounts/:userId` (`CreditController.getBalance`) | — (user JWT, owner or admin) | 200 / 404 `ACCOUNT_NOT_FOUND` | candidate for the C12 accept check |

Reserve/adjust/release responses: `{reservation, requesterBalance, replayed}`;
reservation = `{reservationId, errandId, requesterId, courierId|null, amount, status,
createdAt, updatedAt, settledAt, releasedAt}`.

## 2. Reservation semantics

- One reservation per `errandId` (unique). States `RESERVED → SETTLED | RELEASED`; both
  terminal.
- **Reserve replay:** same `errandId` + same `requesterId` + same `amount` → 200
  `replayed:true`, even after settle/release. Any mismatch → 409 `IDEMPOTENCY_CONFLICT`.
  Gotcha: after an adjustment, replaying the original reserve amount conflicts.
- **Adjust:** checks in order — reservation exists; requester matches; if the
  `idempotencyKey` was used: same target → replay, different → 409
  `ADJUSTMENT_IDEMPOTENCY_CONFLICT`; only then must status be RESERVED.
- **Release:** `amount` must equal the current reservation. Already RELEASED → 200
  replay. Already SETTLED → 409 `RESERVATION_STATE_CONFLICT`.
- **Settle (via event):** `amount` must equal the current reservation; the courier must
  already have a credit account; requester ≠ courier.
- Limits: `MAX_CREDIT_BALANCE` = 10,000,000 (`credit-service/src/domain/credit.constants.ts`).
  Order currently allows 2e9 — defect K1.

## 3. Error codes and how order must treat them

Defined in `credit-service/src/domain/credit.errors.ts`. "Retryable" means the journal
operation stays PENDING, the API answers 202, and `RecoveryWorker` retries.

| Code | HTTP | Meaning | Order handling |
|---|---|---|---|
| `INSUFFICIENT_CREDITS` | 422 | not enough available | FAILED → 422 to the user |
| `ACCOUNT_NOT_FOUND` | 404 | requester/courier has no account | FAILED |
| `RESERVATION_NOT_FOUND` | 404 | no reservation for errand | FAILED (indicates a bug) |
| `IDEMPOTENCY_CONFLICT` | 409 | same key/errand, different data | FAILED (bug) |
| `ADJUSTMENT_IDEMPOTENCY_CONFLICT` | 409 | adjust key reused with another target | FAILED (bug) |
| `RESERVATION_STATE_CONFLICT` | 409 | already settled/released | release: currently ignored by `ServiceClients.release` — **unsafe after acceptance (C11)** |
| `SELF_SETTLEMENT_FORBIDDEN` | 409 | courier = requester | prevented by accept rule FR5.1.2 |
| `SETTLEMENT_COURIER_CONFLICT` | 409 | settled to another courier | event path → DLQ |
| `ACCOUNT_BALANCE_LIMIT_EXCEEDED` | 409 | courier would exceed 10M | event path → DLQ |
| `EVENT_REPLAY_CONFLICT` | 409 | same eventId, different payload | event path → DLQ (never reuse eventIds) |
| `CREDIT_INVARIANT_VIOLATION` | 409 | internal invariant | FAILED |
| `CONCURRENT_OPERATION` | 409 | serialisation retries exhausted | **retryable** (already in `ServiceClients.request`) |
| `VALIDATION_ERROR` | 400 | bad body | FAILED (bug) |
| network error, timeout, 5xx | — | — | retryable |

## 4. Events (RabbitMQ)

- Broker: `RABBITMQ_URL`; topic exchange **`foc.events`**, durable. Routing key = event
  type.
- Envelope (Nest RMQ style): `{ "pattern": "<eventType>", "data": { "eventId": "<uuid v4>",
  "eventType": "<eventType>", "data": { …payload… } } }`, published persistent with
  `messageId = eventId`. Reference publisher:
  `credit-service/src/infrastructure/outbox-relay.service.ts` `OutboxRelayService.publishPending`.

### Consumed by credit (`credit-service/src/api/credit-events.handler.ts` `CreditEventsHandler`)
| Event | Payload — **exactly these keys** | Effect |
|---|---|---|
| `errand.completed.v1` | `{errandId, requesterId, courierId, amount}` — UUID v4s, positive int ≤10M, `amount` = current reservation | settle: reserved → courier |
| `user.verified.v1` | `{userId}` | create account (nobody publishes this yet) |

- Queue `credit-service.events`, prefetch 10, manual ack after commit
  (`credit-service/src/api/credit-events.controller.ts` `CreditEventsController.consume`).
- Dedupe: `processed_events` by `eventId` + SHA-256 of `data`. Same id + same data →
  no-op. Same id + different data → `EVENT_REPLAY_CONFLICT`.
- Failure handling: 409 (except `CONCURRENT_OPERATION`) and 4xx (except 404) are
  **permanent** → nack to DLQ `credit-service.events.dlq` (exchange `foc.events.dlx`).
  Everything else, **including 404**, is requeued immediately — a missing courier
  account loops forever (C12).
- Extra keys (e.g. `correlationId`, `completionMethod`) make the event invalid. Put the
  correlation id in an AMQP header instead.
- There is **no** `errand.cancelled` consumer; release stays HTTP (D-001).

### Published by credit (order does not consume these yet)
`credit.reserved.v1`, `credit.reservation-adjusted.v1`, `credit.transferred.v1`,
`credit.released.v1`, `credit.account-initialized.v1`
(`credit-service/src/infrastructure/prisma-credit.repository.ts`). Payloads carry
`correlationId`, `errandId`, `requesterId`, amounts; `credit.transferred.v1` adds
`courierId` and `causationEventId` when triggered by an event.

## 5. Account provisioning
Accounts are created by `POST /v1/credit-accounts` (caller: user-service token) — in
practice by web-app's `/api/credits` route on first balance read. Order cannot create
accounts. Reserving for a user without an account → 404 `ACCOUNT_NOT_FOUND`.
