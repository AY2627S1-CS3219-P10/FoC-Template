# Technology stack decision

- Status: Accepted
- Decision date: 2026-09-19
- Applies to: All FoC application components and coding agents

This document is the canonical technology decision for Friend on Campus. Use
these technologies unless the team explicitly approves a change and records
the reason in this document or a superseding architecture decision.

## Selected stack

| Area | Selected technology | Intended use |
| --- | --- | --- |
| Language | TypeScript | Shared language across client, services, tests, and contracts |
| Runtime | Node.js 24 LTS | Stable application runtime |
| Package management | pnpm workspaces | Repository-wide dependency and script management |
| Web client | Next.js App Router + React | Responsive requester, courier, and administrator interface |
| Styling | Tailwind CSS | Responsive design and shared visual tokens |
| Backend | NestJS with Fastify | API gateway and independently deployable services |
| Synchronous APIs | REST + OpenAPI | Browser-to-gateway and request/response service contracts |
| Primary database | PostgreSQL | Transactional service-owned data |
| ORM and migrations | Prisma ORM | Type-safe access and schema migrations |
| Asynchronous messaging | RabbitMQ | Reliable cross-service domain events |
| Jobs and temporary state | Redis + BullMQ | Delayed jobs, retries, rate limits, and ephemeral coordination |
| Real-time transport | Socket.IO via NestJS gateways | Status notifications, future chat, and future location updates |
| Authentication | JWT access tokens, rotating refresh tokens, Argon2id | Authentication and password protection |
| Backend tests | Jest + Supertest + Testcontainers | Unit and real-infrastructure integration tests |
| Browser tests | Playwright | Desktop and mobile end-to-end workflows |
| Load tests | k6 | Concurrency, throughput, and response-time verification |
| Logging and tracing | Pino + OpenTelemetry | Structured logs and cross-service correlation |
| Metrics | Prometheus + Grafana | Health and performance visibility when required |
| Local orchestration | Docker Compose | Reproducible local environment |
| Continuous integration | GitHub Actions | Lint, type-check, test, build, and image checks |

Use the current stable framework releases compatible with Node.js 24 when each
component is initialized. Pin exact versions in `package.json` and the pnpm
lockfile. A major-version upgrade requires deliberate team review.

## Repository topology

The repository remains one deployable component per top-level folder:

- `web-app`: Next.js client
- `user-service`: NestJS user and authentication service
- `supplier-service`: NestJS supplier and pickup-location service
- `order-service`: NestJS errand lifecycle service
- `credit-service`: NestJS balance and ledger service
- `api-gateway`: recommended NestJS entry point when gateway work begins

Use a pnpm workspace to coordinate tooling without combining service ownership.
Each backend service retains its own package manifest, tests, migrations,
Dockerfile, and PostgreSQL database or schema.

## Communication rules

Use REST/OpenAPI when the caller requires an immediate response. The web client
should normally call the API gateway rather than individual services.

Use RabbitMQ for asynchronous domain events such as:

- `UserVerified`
- `ErrandCreated`
- `ErrandAccepted`
- `ErrandDelivered`
- `ErrandCompleted`
- `ErrandCancelled`
- `CreditsReserved`
- `CreditsReleased`
- `CreditsTransferred`

Critical publishers must use a transactional outbox. Consumers must tolerate
redelivery and process messages idempotently. Do not use distributed database
transactions across services.

Use Socket.IO for client-facing live updates. A pushed event is a notification,
not the authoritative record; clients should retrieve current state after a
reconnect or when correctness matters.

## Data and concurrency rules

PostgreSQL is the authoritative store. Each service owns its data and database
credentials, and no service may query another service's database.

Prisma should handle normal persistence and migrations. Targeted SQL is allowed
for operations where explicit PostgreSQL behaviour is clearer or safer.

Concurrency-sensitive operations must be atomic:

- Accept an errand with a conditional update or a short row-locking transaction.
- Reserve, release, and transfer credits within credit-service transactions.
- Enforce non-negative balances and one-time settlement with database
  constraints and idempotency keys.
- Re-check authoritative state when a delayed job runs before changing it.

Redis is never the source of truth for errands, users, suppliers, or balances.

## Background processing

Use BullMQ for email verification, errand expiry, courier release, automatic
completion, notification delivery, and retryable background work. Jobs must be
safe to retry and must not assume that the state remains unchanged between
scheduling and execution.

## Testing expectations

- Unit-test domain rules and every valid and invalid state transition.
- Run integration tests against real PostgreSQL, RabbitMQ, and Redis containers.
- Test concurrent errand acceptance and concurrent credit reservation directly.
- Use Playwright for critical requester, courier, and administrator journeys at
  desktop and mobile viewports.
- Use k6 for the specified 500-active-user workload and race-condition tests.

Do not replace real infrastructure with mocks in tests whose purpose is to
verify transactions, locking, message redelivery, or concurrency.

## Deliberately excluded

Do not add these without an approved architectural reason:

- MongoDB as the primary database
- Kubernetes for the course deployment
- Kafka for the initial messaging layer
- separate native iOS and Android applications
- a shared database used directly by multiple services
- GraphQL as an additional API surface
- one microservice per minor feature

## Adoption order

1. Establish the pnpm workspace, TypeScript configuration, linting, and CI.
2. Initialize the Next.js client and NestJS services.
3. Add PostgreSQL and Prisma to the first implemented services.
4. Introduce the API gateway and OpenAPI contracts.
5. Implement transactional order and credit behaviour.
6. Add Redis/BullMQ when delayed work is required.
7. Add RabbitMQ and the outbox pattern for cross-service workflows.
8. Add WebSockets, observability, and load tests when their features begin.

Only introduce infrastructure when the corresponding requirement enters the
active sprint. Selecting a technology here does not require implementing it
prematurely.
