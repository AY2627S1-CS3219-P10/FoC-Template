# User-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service owns accounts, profiles, NUS email verification, authentication
sessions, refresh tokens, and administrator privileges. It must not own errands,
suppliers, or credit balances. Never expose password hashes, tokens, or private
contact details in API responses or logs.
