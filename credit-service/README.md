# Credit Service

Owns available and reserved credit balances, reservations, releases,
settlements, and the transaction trail associated with an errand.

## Milestone boundary

This folder is structure only. Wallet APIs, ledger schemas, atomic operations,
idempotency, persistence, and inter-service messaging are not implemented.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: reservation and settlement use cases
- `src/domain/`: balance and transaction rules
- `src/infrastructure/`: repositories and external integrations
- `migrations/`: credit-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

This service is the sole authority for balances. Other services should request
credit operations through a service contract rather than sharing its database.
