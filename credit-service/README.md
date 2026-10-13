# Credit Service

The Credit Service is the sole authority for available and reserved balances,
errand escrow, settlement, release, and the immutable transaction trail. It is
an independently deployable NestJS/Fastify service backed by its own PostgreSQL
database. No other service should access that database directly.

## Guarantees

- Account initialization is idempotent and always uses the server-configured
  starting balance.
- A reservation atomically moves credits from available to reserved and cannot
  make either balance negative.
- Account balances cannot exceed the supported 10,000,000-credit product limit;
  settlement rejects an overflowing courier credit without partial changes.
- Settlement atomically removes requester escrow and credits the courier.
- Release atomically returns escrow to the requester.
- Exact reservation, adjustment, settlement, and release retries are idempotent
  and return the prior successful outcome without changing a balance twice.
  Conflicting reuse of an errand or adjustment key returns HTTP `409`.
- Serializable PostgreSQL transactions are retried on serialization conflicts.
- `UserVerified` and `ErrandCompleted` deliveries are deduplicated by immutable
  event ID and payload hash in the same transaction as their credit mutation.
  RabbitMQ messages are acknowledged only after that transaction commits.
- Credit domain events are written to a transactional outbox with the account
  allocation or settlement that caused them.
- Every successful balance mutation writes a ledger entry in the transaction.
- Ledger entries use positive operation magnitudes and record both resulting
  balance buckets. Adjustment direction is represented by `ADJUST_RESERVE` or
  `ADJUST_RELEASE`; settlement direction is determined by the linked requester
  or courier account. Entries persist the request correlation identifier, and
  PostgreSQL rejects updates and deletes to keep the audit trail immutable.
- Container startup applies pending service-owned migrations before listening.
- Mutating endpoints require caller-scoped internal Bearer tokens. User Service
  can provision accounts, Order Service can operate reservations, and neither
  credential can access the other caller's endpoints. Missing, malformed, and
  invalid credentials are rejected before any database access.
- Balance reads require a valid User Service JWT. Students may read only their
  own balance, while administrators may read any balance.
- Requester and courier identities must differ. This is enforced in both domain
  logic and PostgreSQL as defense in depth.
- Database startup and migration retries are bounded to 55 seconds, keeping the
  service within the 60-second recovery objective when PostgreSQL returns.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/credit-accounts` | Initialize a verified user's account |
| `GET` | `/v1/credit-accounts/:userId` | Read available and reserved balances |
| `GET` | `/v1/credit-accounts/:userId/transactions` | Read newest-first immutable ledger history |
| `POST` | `/v1/credit-reservations` | Reserve an errand bounty |
| `POST` | `/v1/credit-reservations/:errandId/adjustment` | Change an open errand bounty to a target amount |
| `POST` | `/v1/credit-reservations/:errandId/settlement` | Pay the courier |
| `POST` | `/v1/credit-reservations/:errandId/release` | Return cancelled-errand escrow |
| `GET` | `/health/live` | Process liveness |
| `GET` | `/health/ready` | PostgreSQL readiness |
| `GET` | `/metrics` | Prometheus transaction, failure, conflict, and retry counters |

## Integration boundary

The service owns only its `credit-service` container, the `foc_credit`
PostgreSQL database, and its credit account, reservation, reservation-adjustment,
and ledger tables. The reservation primary key is `reservation_id`; each errand
has at most one reservation. Non-initialization ledger entries contain both
`reservation_id` and `errand_id` so an operation can be traced without querying
another service.

The service never reads or writes the Order, User, or Supplier databases and
does not implement their domain rules. In particular, Order Service decides
whether an errand is completed or cancelled; Credit Service only validates and
applies the corresponding credit state transition.

Order Service (or the API gateway acting as a trusted backend) invokes the
three mutation endpoints below over HTTP. The Web App must call them through
that trusted backend and must not settle or release credits directly:

| Caller action | Endpoint | JSON body |
| --- | --- | --- |
| Reserve bounty | `POST /v1/credit-reservations` | `errandId`, `requesterId`, `amount` |
| Edit open bounty | `POST /v1/credit-reservations/:errandId/adjustment` | `requesterId`, `targetAmount`, `idempotencyKey` |
| Complete errand | `POST /v1/credit-reservations/:errandId/settlement` | `requesterId`, `courierId`, `amount` |
| Cancel errand | `POST /v1/credit-reservations/:errandId/release` | `requesterId`, `amount` |

`targetAmount` is the complete desired reservation amount, not a caller-computed
delta. Credit Service calculates and atomically applies only the difference.
Order Service must reuse the same adjustment idempotency key when retrying one
edit operation.

Reservation mutation requests require `Authorization: Bearer
<CREDIT_ORDER_SERVICE_TOKEN>`. Account provisioning requires
`CREDIT_USER_SERVICE_TOKEN`, and metrics scraping requires
`CREDIT_MONITORING_TOKEN`. These are distinct service credentials, not
end-user JWTs, and must not share a value. Requests may also provide
`x-correlation-id`; when omitted, Credit Service generates one and returns it
in the response. End-user balance and transaction-history reads use
`Authorization: Bearer <JWT>` on the corresponding account endpoint.

OpenAPI documentation is served at `/docs`. All DTOs reject unknown fields,
invalid UUIDs, fractional amounts, zero amounts, and values outside the safe
database range.

### Asynchronous event contract

When `CREDIT_EVENTS_ENABLED=true`, the durable `credit-service.events` queue is
bound to `user.verified.v1` and `errand.completed.v1` on the configured topic
exchange. Messages use the Nest RMQ packet wrapper and this event envelope:

```json
{
  "pattern": "user.verified.v1",
  "data": {
    "eventId": "UUID",
    "eventType": "user.verified.v1",
    "data": { "userId": "UUID" }
  }
}
```

Order completion replaces the inner data with `errandId`, `requesterId`,
`courierId`, and `amount`. Publishers must preserve one stable `eventId` across
all delivery attempts. Credit stores that ID and a SHA-256 payload hash in the
same serializable transaction as the balance and ledger changes. Exact
redelivery is acknowledged as a replay; reuse of an ID with changed content is
rejected to the dead-letter queue. Transient and ordering failures are requeued.

User Service and Order Service must create their source event in their own
transactional outbox alongside verification or completion. Direct publish after
commit is not sufficient: a process crash or broker outage in that gap would
otherwise permanently lose the credit operation.

Every response includes an `x-correlation-id` header. A caller may supply that
header (up to 128 characters), otherwise the service generates a UUID. Errors
return the identifier in their JSON body and logs are structured JSON.

### Authentication

Reservation `POST` endpoints require this internal service header:

```http
Authorization: Bearer <CREDIT_ORDER_SERVICE_TOKEN>
```

Use independently generated random secrets of at least 32 characters and inject
them through the deployment secret manager. A valid credential for the wrong
caller also returns `403`. Missing or malformed credentials return `401`; a
well-formed but incorrect token returns `403`.

The `GET /v1/credit-accounts/:userId` balance and `/transactions` endpoints
instead accept the short-lived User Service JWT. They validate the HS256
signature, issuer, audience, expiry, `sub`, `sid`, and `isAdmin` claims. A
student may read only the account identified by their `sub`; an administrator
may read any account. History is ordered newest first and accepts bounded
`limit` (1-100) and `offset` (0-100,000) query parameters. Health checks remain
public.

### Database indexes and expected scale

PostgreSQL indexes cover the account primary key (`user_id`), unique errand
lookup (`errand_id`), requester/courier foreign keys, reservation status plus
update time, per-account ledger history, reservation-ledger joins, and global
ledger chronology. These indexes avoid table scans for the service's hot query
paths at the 20,000-user and 100,000-history-record target. Production latency
must still be monitored because hardware, connection saturation, and query mix
also affect sub-second performance.

## Local development

Requirements: Node.js 24 LTS, pnpm 12.5.1, Docker, and PostgreSQL 17.

From the repository root:

```bash
pnpm install
docker compose up -d credit-db
export DATABASE_URL=postgresql://foc_credit:local_credit_password@localhost:5433/foc_credit
export CREDIT_USER_SERVICE_TOKEN=replace-with-a-random-secret-of-at-least-32-characters
export CREDIT_ORDER_SERVICE_TOKEN=replace-with-a-different-random-secret-of-at-least-32-characters
export CREDIT_MONITORING_TOKEN=replace-with-another-random-secret-of-at-least-32-characters
pnpm --filter @foc/credit-service db:migrate
pnpm --filter @foc/credit-service start:dev
```

Configuration:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | Service-owned PostgreSQL connection |
| `CREDIT_USER_SERVICE_TOKEN` | required | User Service token for account provisioning; minimum 32 characters |
| `CREDIT_ORDER_SERVICE_TOKEN` | required | Order Service token for reservation mutations; minimum 32 characters |
| `CREDIT_MONITORING_TOKEN` | required | Monitoring token for `/metrics`; minimum 32 characters |
| `JWT_ACCESS_TOKEN_SECRET` | required | User Service HS256 signing secret; minimum 32 characters |
| `JWT_ISSUER` | `foc-user-service` | Required issuer for user access tokens |
| `JWT_AUDIENCE` | `foc-api` | Required audience for user access tokens |
| `PORT` | `3003` | HTTP listener port |
| `CREDIT_INITIAL_BALANCE` | `100` | Credits assigned exactly once; range 0–10,000,000 |
| `CREDIT_TRANSACTION_RETRIES` | `5` | Serializable conflict retry limit |
| `LOG_LEVEL` | `info` | Pino log level |
| `DATABASE_POOL_MAX` | `20` | Maximum PostgreSQL pool connections |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Per-connection timeout |
| `DATABASE_IDLE_TIMEOUT_MS` | `30000` | Idle pooled-connection timeout |
| `DATABASE_STARTUP_TIMEOUT_SECONDS` | `55` | Maximum startup/recovery wait; capped at 55 |
| `DATABASE_RETRY_INTERVAL_SECONDS` | `2` | Delay between startup attempts |
| `CREDIT_EVENTS_ENABLED` | `false` | Start the RabbitMQ event consumer |
| `RABBITMQ_URL` | `amqp://localhost:5672` | RabbitMQ connection URL |
| `CREDIT_EVENTS_QUEUE` | `credit-service.events` | Durable consumer queue |
| `CREDIT_EVENTS_EXCHANGE` | `foc.events` | Durable exchange for published credit events |
| `CREDIT_EVENTS_DEAD_LETTER_EXCHANGE` | `foc.events.dlx` | Exchange for rejected poison events |
| `CREDIT_EVENTS_DEAD_LETTER_QUEUE` | `credit-service.events.dlq` | Queue retaining rejected poison events |
| `CREDIT_EVENTS_DEAD_LETTER_ROUTING_KEY` | `credit-service.events.dead` | Dead-letter routing key |
| `CREDIT_EVENTS_PREFETCH` | `10` | Maximum unacknowledged deliveries per consumer |
| `CREDIT_OUTBOX_POLL_INTERVAL_MS` | `1000` | Outbox relay polling interval |

`GET /metrics` uses the internal Bearer token and exports only bounded labels;
user IDs, errand IDs, idempotency keys, and correlation IDs are never metric
labels. Serializable retry logs retain the correlation ID for request tracing.

The 10,000,000-credit account ceiling is intentionally below PostgreSQL's
32-bit integer limit. It covers the 20,000-user target at the default 100-credit
allocation (2,000,000 total credits) with substantial headroom. Changing the
issuance model or supported population requires reviewing this ceiling first.

## Tests

```bash
pnpm --filter @foc/credit-service test
pnpm --filter @foc/credit-service test:coverage
pnpm --filter @foc/credit-service test:integration
```

Unit tests cover authorization, configuration bounds, application orchestration,
and idempotency rules. Integration tests use Testcontainers and a real
PostgreSQL instance to verify that unauthorized mutations leave no state,
required indexes exist, transactions roll back, balances cannot be overspent
concurrently, bounty adjustments apply only their delta, settlement and release
race safely, duplicated deliveries remain idempotent, and balance/history reads
enforce account ownership with bounded pagination.
