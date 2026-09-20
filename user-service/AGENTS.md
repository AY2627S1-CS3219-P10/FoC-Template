# User-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service owns accounts, profiles, NUS email verification, authentication
sessions, refresh tokens, and administrator privileges. It must not own errands,
suppliers, or credit balances. Never expose password hashes, tokens, or private
contact details in API responses or logs.

Persistence rules:

- PostgreSQL is authoritative; Redis must never become the user record store.
- Access Prisma through `src/platform/database/` and feature infrastructure
  adapters. Domain and application layers must not import Prisma types.
- Keep Prisma schema and migrations under `prisma/`; generated client files are
  build artifacts and must not be committed.
- Do not share this service's database, schema, credentials, or Prisma client
  with another service.
- Every schema change requires a reviewed migration and a rollback/recovery
  consideration.
