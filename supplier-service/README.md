# Supplier Service

Owns suppliers, campus pickup locations, categories, and availability state.
The existing seed CSV and location images under `data/` are future inputs to
this service; they are not loaded by the current scaffold.

## Current scope

The database foundation is initialized with PostgreSQL 18, Prisma ORM 7, and a
service-owned migration. The migration creates suppliers and supplier pickup
locations, then loads the 21 fixed NUS-campus entries from
`../data/csv/supplier-seed-data.csv`.

Each location stores a stable UUID for service-to-service references and a
case-insensitive `supplier@location` string for future user input. For example,
`NUS Co-op@Central Library`. The label is intentionally a catalog attribute,
not an order-service foreign key or a user-entered free-text source of truth.

The first API slice is implemented as `GET /api/suppliers`. It returns active
suppliers that have at least one active pickup location, with inactive records
filtered by the repository. Both students and administrators may use this
read-only operation.

Create, update, deactivate/reactivate, and administrator catalog operations are
not implemented yet.

## Authentication and RBAC contract

Supplier Service verifies short-lived JWT access tokens issued by User Service.
The client must send the token as `Authorization: Bearer <token>`. Verification
is restricted to HS256 and checks the configured issuer, audience, signature,
and expiry. The token payload must include:

```json
{
  "userId": "4a84f480-b1cb-4b81-b632-8bb49034b9e7",
  "sessionId": "e414b596-4ba2-4c43-841b-0fa699164faa",
  "isAdmin": false
}
```

Supplier Service converts `isAdmin` into its own `STUDENT` or `ADMIN` role and
enforces route permissions locally. The current read endpoint permits both
roles. Future catalog mutation endpoints will require `ADMIN`.

The User Service and Supplier Service must use the same signing secret and
issuer, while the access token audience must include `foc-supplier-service`.
The secret is deployment configuration and must never be committed.

## Local database commands

Run these commands from `supplier-service/`:

```text
corepack pnpm install
docker compose up -d database
corepack pnpm db:migrate:deploy
corepack pnpm start:dev
```

Copy `.env.example` to `.env` before running Prisma commands. PostgreSQL is
exposed on port `5434` by default, avoiding the user service's `5433` port.
The OpenAPI UI is available at `/api/docs` when the service is running.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: supplier and pickup-location use cases
- `src/domain/`: supplier, location, and availability rules
- `src/infrastructure/`: repositories and external providers
- `migrations/`: supplier-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

The order service may store supplier and pickup-location identifiers needed for
an errand, but this service remains the authority for their availability.
