# Event-driven design for order-service

Status: **partly implemented.** `outbox_events`, the `errand.completed.v1` write on
confirm (`PrismaOrderRepository.transition`) and the relay (`src/infrastructure/outbox.relay.ts`
`OutboxRelay`) and the 4 h auto-complete (`TimerWorker`, queue `order-timers`) exist; S9 is
still to come. Timers: a 30 s sweeper reads deadlines from Postgres and enqueues one job per
errand (`jobId` dedupes); no delayed job is scheduled at deliver time (lateness ≤ 30 s).
Procedure for adding events: `.agents/skills/order-domain-events/SKILL.md`.

## 1. Which channel for which job

| Need | Channel | Why |
|---|---|---|
| Reserve / adjust / release credits | **HTTP** via the `ErrandOperation` journal (existing) | The user needs the answer now (e.g. "insufficient credits"); the journal already makes it durable and retryable. Credit has no event consumer for these. |
| Pay the courier on COMPLETED | **Outbox → RabbitMQ** `errand.completed.v1` | Credit already consumes it idempotently; the team rule is "transactional outbox for critical cross-service events". |
| Delayed transitions (4 h auto-complete, expiry, …) | **BullMQ** (`order-timers`) with Postgres as truth | Already in the stack; Redis is never authoritative. |
| Tell the browser something changed | **Socket.IO** hint after commit (S9) | `docs/architecture.md`: a push is a hint; clients re-fetch. |
| Notifications | rows in order's DB, same transaction as the transition (S9, if C10 → order) | No broker needed to notify ourselves. |

**Single settlement path (D-001).** Settlement only through the outbox. Reserve, adjust
and release only through HTTP. Order never calls `/settlement`. Never both for one
errand. A future agent must not "simplify" this into one path: credit has no
`errand.cancelled` consumer, and two paths for one effect can race (HTTP release vs
event settle) or double-apply.

## 2. Wire format (must match credit)

- Exchange `foc.events` (topic, durable). Routing key = `eventType`.
- Body: `{ "pattern": eventType, "data": { "eventId": <uuid v4>, "eventType": eventType, "data": <payload> } }`.
- Publish persistent, `messageId = eventId`, on a **confirm channel**; mark published only
  after the broker confirms. Reference: `credit-service/src/infrastructure/outbox-relay.service.ts`
  `OutboxRelayService`.
- Correlation id: AMQP header `x-correlation-id` (name pending Q-017), **never** in the
  body of `errand.completed.v1`.
- Naming `errand.<kebab>.v<N>` (D-004, proposed). A breaking payload change is a new
  `.v2`; keep publishing `.v1` until consumers move.
- Payloads carry ids and numbers only — no usernames, emails, descriptions (NFR4).

## 3. Event catalogue

| Event | When | Payload | Consumer | Status |
|---|---|---|---|---|
| `errand.completed.v1` | any transition into COMPLETED: requester confirm, early confirm, 4 h auto-complete | **exactly** `{errandId, requesterId, courierId, amount}`; `amount` = `offeredCredits` at completion (equals the reservation) | credit-service (settle) | required, S6a |
| `errand.accepted.v1` | OPEN → ACCEPTED | `{errandId, requesterId, courierId, status, version, occurredAt}` | none yet (notifications, future) | optional, add when needed |
| `errand.picked-up.v1` | → PICKED_UP | same shape | none yet | optional |
| `errand.delivered.v1` | → DELIVERED | same shape | none yet | optional |
| `errand.disputed.v1` | → DISPUTED | same shape | none yet | optional |
| `errand.cancelled.v1` | → CANCELLED / EXPIRED | same shape, `courierId` may be null | none (credit does **not** consume it) | optional |

`completionMethod` is stored on the errand row, not in the event.

## 4. Outbox

```
outbox_events (
  id            uuid primary key,          -- = eventId, generated once, stable across retries
  aggregate_id  uuid not null,             -- errandId
  event_type    varchar(100) not null,
  payload       jsonb not null,            -- the inner "data"
  headers       jsonb not null default '{}',  -- e.g. correlation id
  created_at    timestamptz(3) not null default now(),
  published_at  timestamptz(3)             -- null = pending
)
index on (created_at) where published_at is null
```
- Insert in the **same transaction** as the errand state change (the conditional UPDATE).
- One `errand.completed.v1` per errand: enforce with a partial unique index on
  `(aggregate_id, event_type)` for that type, so a replayed transition cannot create a
  second event with a new id.
- Relay: poll every 1000 ms, batch 50, oldest first; publish; set `published_at` after
  confirm. Duplicates are possible (crash between confirm and update) and harmless —
  credit dedupes by `eventId` + payload hash.
- If RabbitMQ is down, rows accumulate; nothing is lost. Readiness does **not** depend
  on RabbitMQ.

## 5. Configuration (added in S6a)
| Var | Default | Notes |
|---|---|---|
| `RABBITMQ_URL` | `amqp://foc:foc_local_password@127.0.0.1:5672` | local docker rabbit from root `compose.yaml` |
| `ORDER_EVENTS_ENABLED` | `false` | when false the relay does not start; rows still written |
| `ORDER_EVENTS_EXCHANGE` | `foc.events` | |

Dependencies (pinned to credit's versions): `amqplib@0.10.9`, `@types/amqplib@0.10.8`
(dev). `@testcontainers/rabbitmq@12.1.0` is waiting on Q-019. `@nestjs/microservices` only if order ever
consumes events.

## 6. Consuming events
Not needed now: every credit effect order cares about returns synchronously over HTTP.
Possible later: consume `credit.transferred.v1` to record `settledAt` and to detect
settlements stuck in the DLQ. If added: own queue `order-service.events`, an inbox table
`processed_events(event_id pk, payload_hash)` written in the same transaction as the
handling, ack after commit, DLQ for permanent failures.

## 7. Risks
- **C12 / R2:** courier without a credit account → credit requeues `errand.completed.v1`
  forever (404 is not permanent in `CreditEventsController.consume`).
- **C11 / R1:** admin DELETE releasing after acceptance → settlement hits
  `RESERVATION_STATE_CONFLICT` → DLQ → courier unpaid.
- Any extra key, wrong `amount`, or reused `eventId` with different data → DLQ.
- `ACCOUNT_BALANCE_LIMIT_EXCEEDED` (courier at 10M) → DLQ.
- Nobody monitors `credit-service.events.dlq` yet.

## 8. External dependency — compose.yaml (owner: compose maintainer)
Status: **OPEN** (Q-018). Order-service cannot edit the root `compose.yaml`.

Message to send:

> Hi! Order-service will publish `errand.completed.v1` to RabbitMQ (credit already
> consumes it). Could you update the `order-service` block in the root `compose.yaml`:
> - under `environment`: `RABBITMQ_URL: ${RABBITMQ_URL:-amqp://foc:foc_local_password@rabbitmq:5672}`
>   and `ORDER_EVENTS_ENABLED: "true"`
> - under `depends_on`: `rabbitmq: { condition: service_healthy }` (same as credit-service)
>
> No other changes needed. Thanks!

Until then, local runs outside Docker use the default `RABBITMQ_URL` above.
