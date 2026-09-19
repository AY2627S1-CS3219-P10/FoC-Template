# User Service

The User Service owns student and administrator identities, profiles, NUS email
verification, authentication sessions, refresh tokens, and privilege data.
Other services refer to users by stable identifiers and must not read this
service's persistence store directly.

## Current scope

The service foundation is initialized with NestJS, Fastify, TypeScript, strict
static analysis, PostgreSQL 18, Prisma ORM 7, configuration validation, a smoke
test, and a production-oriented container build. Its initial database structure
contains users, email-verification codes, and authentication sessions.
The account domain defines framework-independent validation for usernames, NUS
email addresses, phone numbers, passwords, and safe new-account defaults.
The registration application use case coordinates validation, uniqueness
checks, password hashing, ID generation, and account persistence through ports.
Infrastructure adapters implement those ports with Prisma, PostgreSQL,
Argon2id, and native UUIDs. HTTP transport, authentication workflows, and email
delivery remain deferred to later commits.

## Architecture

The service uses feature-first modules with clean boundaries inside each
feature:

```text
src/
|-- main.ts                 Process bootstrap only
|-- app.module.ts           Composition root only
|-- modules/
|   `-- <feature>/
|       |-- domain/         Entities, value objects, and domain rules
|       |-- application/    Use cases and ports
|       |-- infrastructure/ Port implementations and persistence adapters
|       `-- presentation/   HTTP controllers, DTOs, and message handlers
|-- platform/               Process-level database, configuration, and messaging
`-- shared/                 Small service-local technical or domain primitives
```

Dependency direction is inward:

```text
presentation -> application -> domain
infrastructure ------^          ^
```

The domain layer must not import NestJS, Prisma, Fastify, RabbitMQ, or other
framework code. Application code depends on interfaces (ports); infrastructure
implements those ports. Feature modules must not reach into another feature's
infrastructure directory.

## Local commands

Run these commands from `user-service/`:

```text
corepack pnpm install
corepack pnpm start:dev
corepack pnpm check
corepack pnpm build
corepack pnpm test:integration
```

The integration suite starts an isolated PostgreSQL 18 container and therefore
requires a running Docker-compatible container runtime.

Copy `.env.example` to `.env` for local development. The service listens on port
`3001` by default, while the local PostgreSQL container is exposed on `5433` to
avoid colliding with a system PostgreSQL installation.

Start only the User Service database:

```text
docker compose up -d database
```

Prisma commands:

```text
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm db:migrate:dev
corepack pnpm db:migrate:deploy
corepack pnpm db:studio
```

The application uses `DATABASE_URL`. Prisma migrations live under
`prisma/migrations/`. The generated client is written to
`src/generated/prisma/`, regenerated during checks and builds, and is not
committed.

## Deferred milestones

1. Registration use case and endpoint
2. NUS email verification
3. Login, JWT access tokens, and rotating refresh tokens
4. Profile and credential updates
5. Administrator authorization and initial account seeding
