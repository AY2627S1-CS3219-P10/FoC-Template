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
- Settlement atomically removes requester escrow and credits the courier.
- Release atomically returns escrow to the requester.
- Reservation, settlement, and release retries are idempotent. A retry with
  conflicting data or against the opposite terminal state returns HTTP `409`.
- Serializable PostgreSQL transactions are retried on serialization conflicts.
- Every successful balance mutation writes a ledger entry in the transaction.
- Container startup applies pending service-owned migrations before listening.
- All mutating endpoints require the configured internal Bearer token. Missing,
  malformed, and invalid credentials are rejected before any database access.
- Database startup and migration retries are bounded to 55 seconds, keeping the
  service within the 60-second recovery objective when PostgreSQL returns.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/credit-accounts` | Initialize a verified user's account |
| `GET` | `/v1/credit-accounts/:userId` | Read available and reserved balances |
| `POST` | `/v1/credit-reservations` | Reserve an errand bounty |
| `POST` | `/v1/credit-reservations/:errandId/settlement` | Pay the courier |
| `POST` | `/v1/credit-reservations/:errandId/release` | Return cancelled-errand escrow |
| `GET` | `/health/live` | Process liveness |
| `GET` | `/health/ready` | PostgreSQL readiness |

OpenAPI documentation is served at `/docs`. All DTOs reject unknown fields,
invalid UUIDs, fractional amounts, zero amounts, and values outside the safe
database range.

Every response includes an `x-correlation-id` header. A caller may supply that
header (up to 128 characters), otherwise the service generates a UUID. Errors
return the identifier in their JSON body and logs are structured JSON.

### Authentication

All `POST` endpoints require this header:

```http
Authorization: Bearer <CREDIT_INTERNAL_API_TOKEN>
```

Use a randomly generated secret of at least 32 characters and inject it through
the deployment secret manager. Missing or malformed credentials return `401`;
a well-formed but incorrect token returns `403`. The balance lookup and health
checks remain read-only and do not require the internal mutation token.

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
export CREDIT_INTERNAL_API_TOKEN=replace-with-a-random-secret-of-at-least-32-characters
pnpm --filter @foc/credit-service db:migrate
pnpm --filter @foc/credit-service start:dev
```

Configuration:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | Service-owned PostgreSQL connection |
| `CREDIT_INTERNAL_API_TOKEN` | required | Bearer token for all mutations; minimum 32 characters |
| `PORT` | `3003` | HTTP listener port |
| `CREDIT_INITIAL_BALANCE` | `100` | Credits assigned exactly once at initialization |
| `CREDIT_TRANSACTION_RETRIES` | `5` | Serializable conflict retry limit |
| `LOG_LEVEL` | `info` | Pino log level |
| `DATABASE_POOL_MAX` | `20` | Maximum PostgreSQL pool connections |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Per-connection timeout |
| `DATABASE_IDLE_TIMEOUT_MS` | `30000` | Idle pooled-connection timeout |
| `DATABASE_STARTUP_TIMEOUT_SECONDS` | `55` | Maximum startup/recovery wait; capped at 55 |
| `DATABASE_RETRY_INTERVAL_SECONDS` | `2` | Delay between startup attempts |

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
concurrently, and duplicated settlement/release delivery remains idempotent.
