# Supplier Service

Owns suppliers, campus pickup locations, categories, and availability state.
The existing seed CSV and location images under `data/` are future inputs to
this service; they are not loaded by the current scaffold.

## Milestone boundary

This folder is structure only. Supplier APIs, administrator operations,
validation, persistence, and seed loading are not implemented.

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: supplier and pickup-location use cases
- `src/domain/`: supplier, location, and availability rules
- `src/infrastructure/`: repositories and external providers
- `migrations/`: supplier-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

The order service may store supplier and pickup-location identifiers needed for
an errand, but this service remains the authority for their availability.
