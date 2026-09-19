# Coding-agent instructions

Before changing this repository, read:

1. `README.md`
2. `docs/architecture.md`
3. `docs/tech-stack.md`

`docs/tech-stack.md` is the canonical technology decision. Do not introduce a
different language, framework, database, ORM, message broker, job system, test
framework, or package manager without explicit team approval and an updated
architecture decision.

## Required technical direction

- Use Node.js 24 LTS and TypeScript across the application.
- Use pnpm workspaces for dependency management.
- Build the client with Next.js App Router, React, and Tailwind CSS.
- Build backend services and the API gateway with NestJS and Fastify.
- Use PostgreSQL with Prisma; use targeted SQL where concurrency semantics
  require database-specific operations.
- Use REST/OpenAPI for synchronous APIs, RabbitMQ for asynchronous domain
  events, and Redis/BullMQ for background and delayed jobs.
- Use Socket.IO through NestJS gateways for real-time client updates.
- Use Docker Compose locally and GitHub Actions for CI.

## Architecture guardrails

- Keep domain logic inside the service that owns it.
- Never access another service's database directly.
- Do not use Redis as authoritative storage.
- Make event consumers and credit operations idempotent.
- Use transactional outbox delivery for critical cross-service events.
- Protect errand acceptance and balance changes with database transactions,
  constraints, or atomic conditional updates.
- Add dependencies only when the assigned task needs them.
- Do not implement features outside the requested issue or sprint scope.
