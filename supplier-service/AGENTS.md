# Supplier-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service owns suppliers, pickup locations, categories, and availability.
It is the authority for whether a supplier or pickup location can be selected.
It must not own errand lifecycle or credit data.
