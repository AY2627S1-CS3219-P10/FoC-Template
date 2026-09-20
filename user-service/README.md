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
Argon2id, and native UUIDs. `POST /api/accounts/register` exposes the registration
workflow, queues a verification email, and returns only the account ID, username,
and pending status. BullMQ stores delivery jobs in Redis, and a service-local
worker delivers the email through a provider-neutral SMTP adapter. Failed SMTP
deliveries are retried up to five times with exponential backoff.
`POST /api/accounts/verify-email` consumes a six-digit code and atomically
activates the account. `POST /api/accounts/verify-email/resend` issues and queues
a replacement code for a pending account. Its response does not reveal whether
an account exists or is already verified.

`POST /api/auth/login` authenticates an active account and creates a session.
`POST /api/auth/refresh` atomically rotates its single-use refresh token, and
`POST /api/auth/logout` revokes it without revealing whether the token existed.
Access tokens are HS256 JWTs valid for 15 minutes. Refresh sessions are valid
for 30 days, while only SHA-256 refresh-token hashes are stored in PostgreSQL.
Reusing a revoked refresh token revokes the account's remaining active sessions
as a defensive response. Pending, suspended, and banned accounts cannot create
or refresh sessions.

Verification codes expire after 10 minutes, allow five failed attempts, and are
stored only as HMAC-SHA-256 hashes. Issuing a replacement invalidates the prior
unused code. The partial unique index enforcing one unused code per user can be
rolled back by dropping
`email_verification_codes_one_unused_per_user_key`.

Verification-email resend is limited atomically in Redis to one request per
email address per 60 seconds and five requests per hour. Email addresses are
SHA-256 hashed before they are used in Redis keys. Redis remains temporary
coordination state; PostgreSQL remains authoritative for account eligibility.

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

The integration suite starts isolated PostgreSQL 18 and Redis 8 containers and
therefore requires a running Docker-compatible container runtime.

When the service is running, its OpenAPI UI is available at `/api/docs`.

Copy `.env.example` to `.env` for local development. The service listens on port
`3001` by default, while the local PostgreSQL container is exposed on `5433` to
avoid colliding with a system PostgreSQL installation.

Start the User Service infrastructure:

```text
docker compose up -d database redis
```

Prisma commands:

```text
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm db:migrate:dev
corepack pnpm db:migrate:deploy
corepack pnpm db:studio
```

The application uses `DATABASE_URL`, `EMAIL_VERIFICATION_CODE_SECRET`,
`JWT_ACCESS_TOKEN_SECRET`, `REDIS_URL`, and the `SMTP_*` settings shown in
`.env.example`. Secrets must not be committed or reused between purposes. The
verification code is placed in Redis only as short-lived job payload and
successful or exhausted jobs are removed. Prisma migrations live under
`prisma/migrations/`. The generated client is written to
`src/generated/prisma/`, regenerated during checks and builds, and is not
committed.

## Deferred milestones

1. Profile and credential updates
2. Administrator authorization and initial account seeding
