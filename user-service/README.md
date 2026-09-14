# User Service

Owns student and administrator identities, account profiles, NUS email
verification, authentication sessions, and privilege information.

## Milestone boundary

This folder is structure only. Registration, login, validation, email delivery,
password hashing, persistence, and authorization are not implemented.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: account and authentication use cases
- `src/domain/`: identity and profile rules
- `src/infrastructure/`: repositories and external providers
- `migrations/`: user-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

This service owns user data. Other services should refer to users by identifier
instead of duplicating credentials or profile records.
