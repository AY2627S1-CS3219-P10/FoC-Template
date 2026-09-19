# Order-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service owns errands, requester/courier assignments, lifecycle state,
expiry, and cancellation. Errand acceptance must be an atomic conditional
operation so no more than one courier can succeed. Credit changes must be
requested through the credit service, never written directly.
