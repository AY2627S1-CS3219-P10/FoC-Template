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

Supplier APIs, administrator operations, validation, and application code are
not implemented yet.

## Local database commands

Run these commands from `supplier-service/`:

```text
corepack pnpm install
docker compose up -d database
corepack pnpm db:migrate:deploy
```

Copy `.env.example` to `.env` before running Prisma commands. PostgreSQL is
exposed on port `5434` by default, avoiding the user service's `5433` port.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: supplier and pickup-location use cases
- `src/domain/`: supplier, location, and availability rules
- `src/infrastructure/`: repositories and external providers
- `migrations/`: supplier-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

The order service may store supplier and pickup-location identifiers needed for
an errand, but this service remains the authority for their availability.
