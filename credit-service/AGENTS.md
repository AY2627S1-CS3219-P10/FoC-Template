# Credit-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service is the sole authority for available and reserved balances,
reservations, releases, settlements, and the transaction trail. Operations must
be transactional and idempotent, and no balance may become negative.
