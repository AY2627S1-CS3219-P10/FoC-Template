# Order Service

Owns errands: creation, browsing, assignment, lifecycle transitions,
cancellation, expiry, and the requester/courier relationship for each errand.

## Milestone boundary

This folder is structure only. Errand endpoints, state transitions, scheduled
jobs, concurrency controls, notifications, and persistence are not implemented.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: errand workflow orchestration
- `src/domain/`: errand state and assignment rules
- `src/infrastructure/`: repositories, schedulers, and integrations
- `migrations/`: order-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

Cross-service credit reservation and settlement must be coordinated through an
explicit contract; the order service must not modify credit records directly.
