# User Service

The User Service owns student and administrator identities, profiles, NUS email
verification, authentication sessions, refresh tokens, and privilege data.
Other services refer to users by stable identifiers and must not read this
service's persistence store directly.

## Current scope

### User reports and temporary suspensions

Reporting and moderation stay inside this service. All routes below require a
live bearer session; the administrator routes reuse `@AdministratorOnly()`.
Reporter and administrator identities come from that session, never the body.

| Method | Path | Authorization and purpose |
| --- | --- | --- |
| POST | `/api/reports` | Any usable user reports another existing user |
| GET | `/api/admin/reports` | Administrator lists reports |
| GET | `/api/admin/reports/:reportId` | Administrator views one report |
| PATCH | `/api/admin/reports/:reportId/resolve` | Administrator resolves a report |
| PATCH | `/api/admin/accounts/:accountId/suspension` | Administrator sets a temporary timeout |

Create a report with `{ "reportedUserId": "<user UUID>", "description": "Missed an agreed pickup." }`.
Descriptions are trimmed and must contain 1–500 characters. Self-report returns
403, a missing target returns 404, and malformed IDs/descriptions or additional
body properties return 400. Creation returns 201 with OPEN status, timestamps,
and safe reporter/target identities (IDs and usernames). Creating or resolving
a report never changes the user's account status.

Report lists support `status=OPEN|RESOLVED`, `limit=1..100` (default 50), and
`offset=0..10000` (default 0), ordered newest first with an ID tie-breaker.
Responses omit password hashes, refresh tokens, sessions, and phone numbers.
Resolving a report records `resolvedAt` and the authenticated resolver. Repeating
resolution returns the existing result without rewriting that audit timestamp.
Missing reports return 404; non-administrators receive 403.

Set a suspension with `{ "suspendedUntil": "2027-01-01T12:00:00Z" }`, using a
future ISO 8601 timestamp with an explicit UTC timezone or offset. Invalid/past
expiry returns 400, self-suspension returns 403, a missing target returns 404,
and incompatible permanent statuses or last-usable-admin violations return 409.
The response contains the target ID, username, effective SUSPENDED status and
expiry. Every non-revoked session is revoked in the same database transaction.

Temporary suspension is an overlay on the base ACTIVE account status, stored
as `users.suspended_until`. While the timestamp is in the future, login returns
403 and refresh/protected User Service routes return 401. At or after expiry,
fresh login and protected access work automatically without clearing the field
or running a scheduled job. Revoked sessions remain revoked; the user must sign
in again. BANNED, PENDING_VERIFICATION, and legacy SUSPENDED statuses remain
blocked independently of the timeout, and are never silently converted to ACTIVE.
Profile/admin account responses expose the effective status and suspension expiry.

Suspension and administrator privilege changes share the existing PostgreSQL
advisory transaction lock. Both count only usable administrators. The database
last-admin trigger also protects status/expiry changes and deletions. Login
session creation and refresh rotation lock the target user row, preventing an
in-flight session from escaping suspension revocation.

Apply the additive schema migration before starting the updated service:

```powershell
pnpm prisma:generate
pnpm db:migrate:deploy
pnpm start:dev
```

Existing users receive a nullable expiry; reports use their own table, foreign
keys, length/self-report constraints, indexed status/identity/timestamps, and
resolution metadata. Report identities use RESTRICT on account deletion to
preserve the report; a deleted resolver becomes null. For recovery, prefer a
forward fix. A schema rollback must first stop moderation writes, back up report
history, restore the previous last-admin function/trigger, and then remove the
new table/indexes/column in a reviewed migration. Removing reports would lose
audit history, so do not drop them as part of an application-only rollback.

`pnpm test` covers use-case validation, expiry boundaries, and existing controllers.
`pnpm test:integration` uses isolated real PostgreSQL/Redis containers and exercises
the moderation controllers with real JWTs and sessions, permissions, resolution,
expiry, revocation, permanent statuses, last-admin checks, and concurrency races.
OpenAPI schemas and error descriptions are available at `/api/docs`.

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

`POST /api/accounts/check-email` accepts an NUS email address and returns only
`{"available": true}` or `{"available": false}` for registration-form feedback.
It uses the same normalization and NUS-domain validation as registration. The
result is advisory: registration still performs its own uniqueness checks, and
the PostgreSQL unique constraint remains authoritative if requests race.

To reduce account-enumeration abuse, availability checks are limited atomically
in Redis to 30 valid checks per client address per minute and five checks per
normalized email per minute. Client addresses and emails are SHA-256 hashed
before being used in Redis keys. A limited request returns HTTP 429 with a
`Retry-After` header. Successful responses use `Cache-Control: no-store` and
never include account IDs, profiles, status, or other account data.

`POST /api/accounts/verify-email` consumes a six-digit code and atomically
activates the account. `POST /api/accounts/verify-email/resend` issues and queues
a replacement code for a pending account. Its response does not reveal whether
an account exists or is already verified.

### User verification integration event

A successful first-time verification also records `user.verified.v1` in the
User Service PostgreSQL transactional outbox. Code consumption, account
activation, and outbox insertion are one database transaction: none of them is
committed if the event cannot be recorded. Invalid, expired, exhausted, or
already-completed verification attempts do not create an event. The database
also permits only one `user.verified.v1` outbox row per user.

The outbox relay publishes the following stable envelope to the durable
`foc.events` topic exchange using `user.verified.v1` as the routing key:

```json
{
  "eventId": "<UUID v4>",
  "eventType": "user.verified.v1",
  "data": {
    "userId": "<verified user UUID>"
  }
}
```

The outbox row ID is the envelope `eventId`; it is generated once before the
verification transaction and remains unchanged across relay retries. Delivery
is at least once, so consumers must deduplicate by `eventId`. The Credit Service
uses this event to provision the user's initial credit account idempotently.
There is no synchronous Credit Service call in the verification request.

Set `USER_EVENTS_ENABLED=true` when RabbitMQ is available. `RABBITMQ_URL`,
`USER_EVENTS_EXCHANGE` (default `foc.events`), and
`USER_OUTBOX_POLL_INTERVAL_MS` (default 1000) configure delivery. A row is
marked published only after RabbitMQ confirms it; failures are logged without
payloads or connection credentials and are retried on a later poll. PostgreSQL
remains authoritative while RabbitMQ is unavailable.

The outbox migration is additive. An application rollback may safely leave the
table in place so pending events can still be recovered. Before a schema
rollback, stop the relay and verification writes, preserve any unpublished
rows, then drop `outbox_events` in a reviewed migration; dropping it first can
lose provisioning signals for already-activated users.

`POST /api/auth/login` authenticates an active account and creates a session.
`POST /api/auth/refresh` atomically rotates its single-use refresh token, and
`POST /api/auth/logout` revokes it without revealing whether the token existed.
Access tokens are HS256 JWTs valid for 15 minutes. Refresh sessions are valid
for 30 days, while only SHA-256 refresh-token hashes are stored in PostgreSQL.
Reusing a revoked refresh token revokes the account's remaining active sessions
as a defensive response. Pending, suspended, and banned accounts cannot create
or refresh sessions.

### Cross-service access-token contract

The access token is the stable authentication contract for synchronous calls to
other backend services. Its JOSE header and JWT claims are:

| Field | Required value | Meaning |
| --- | --- | --- |
| `alg` | `HS256` | The only accepted signing algorithm. |
| `typ` | `JWT` | Token type. |
| `iss` | `foc-user-service` | Issuing service. |
| `aud` | `foc-api` | Intended backend API audience. |
| `sub` | non-empty string | Current user's stable `userId`. |
| `sid` | non-empty string | Current authentication `sessionId`. |
| `isAdmin` | boolean | Current administrator status when the token is issued. |
| `iat` | NumericDate | Issued-at time. |
| `exp` | NumericDate | Expiry, exactly 15 minutes after `iat`. |

The names and types in this table are part of the cross-service contract.
Changing them requires coordinated updates to every token consumer. In
particular, `isAdmin` is a JSON boolean, not the strings `"true"` or `"false"`.
Refresh tokens are opaque User Service credentials and must never be accepted
as bearer access tokens by another service.

Another service can validate an access token independently with `jose` and the
same deployment-provided signing secret:

```ts
import { jwtVerify } from 'jose';

const { payload, protectedHeader } = await jwtVerify(
  bearerToken,
  new TextEncoder().encode(jwtAccessTokenSecret),
  {
    algorithms: ['HS256'],
    audience: 'foc-api',
    issuer: 'foc-user-service',
  },
);

if (
  protectedHeader.typ !== 'JWT' ||
  typeof payload.sub !== 'string' ||
  payload.sub.length === 0 ||
  typeof payload.sid !== 'string' ||
  payload.sid.length === 0 ||
  typeof payload.isAdmin !== 'boolean'
) {
  throw new Error('Access token contains invalid claims.');
}

const principal = {
  userId: payload.sub,
  sessionId: payload.sid,
  isAdmin: payload.isAdmin,
};

// Return 403 from an administrator-only endpoint when this is false.
if (!principal.isAdmin) {
  throw new Error('Administrator privileges required.');
}
```

Consumers must return 401 for a missing, expired, incorrectly signed, or
invalidly claimed token, and 403 when a valid principal lacks administrator
privileges. Provide `JWT_ACCESS_TOKEN_SECRET` to verifier services through the
deployment secret manager; never commit or log it.

Independent verification deliberately avoids a User Service database query.
Consequently, other services learn about logout, session revocation, promotion,
or demotion when the existing access token expires, at most 15 minutes later.
The User Service's own protected routes retain their stronger behavior below
and re-check the session and current privilege in PostgreSQL on every request.

Authenticated profile operations validate the access token and its backing
PostgreSQL session on every request. `GET /api/accounts/me` returns the current
account profile, and `PATCH /api/accounts/me/phone-number` changes the private
phone number after format and uniqueness checks.
`PATCH /api/accounts/me/username` changes only the authenticated account's
username, applying the same alphanumeric validation and case-insensitive
uniqueness rule as registration. It returns the updated profile and does not
revoke existing sessions. `PATCH /api/accounts/me/password` requires the current
password, applies the registration password policy to the new password, stores
a fresh Argon2id hash, and revokes every session for the account so the user
must sign in again.

Administrator-only HTTP controllers or handlers must use the
`@AdministratorOnly()` decorator. It applies bearer authentication before the
administrator guard. Authentication reloads the active session and current
`isAdmin` value from PostgreSQL before authorization, so a stale privilege
claim in a JWT cannot grant access. Non-administrators receive HTTP 403 with
`ADMINISTRATOR_PRIVILEGES_REQUIRED`.

After initialization, an administrator can promote or demote another existing
account with `PATCH /api/admin/accounts/{accountId}/administrator` and an
`isAdmin` boolean body. An administrator cannot change their own status. A real
status change and revocation of all the target account's active sessions occur
in one PostgreSQL transaction, forcing the target to sign in again. Repeating
the already-current status is idempotent and does not revoke sessions.

`GET /api/admin/accounts` provides the administrator UI with account discovery.
It returns at most 50 accounts ordered by username and exposes only `id`,
`username`, `email`, `isAdmin`, and `status`. An optional `search` query performs
a case-insensitive substring match against username or email. The endpoint uses
the same `@AdministratorOnly()` authorization flow and never returns passwords,
contact numbers, verification codes, or session data.

The database also rejects demotion or deletion of the last administrator. This
protects the invariant even outside the HTTP workflow; there is currently no
account-deletion API. Privilege changes use the same PostgreSQL advisory lock,
so concurrent opposing demotions cannot reduce the administrator count to
zero. To roll back this database guard, drop the
`users_protect_last_administrator` trigger and then the
`protect_last_administrator()` function.

Initial administrator creation is deliberately unavailable through the public
registration API. Set `ADMIN_SEED_ACCOUNTS` to a JSON array containing exactly
five distinct objects with `operator`, `username`, `email`, `phoneNumber`, and
`password`, then build and run the one-off deployment initializer:

```text
corepack pnpm build
corepack pnpm db:seed:admins
```

All five emails must be NUS addresses, and every identity and password follows
the normal account rules. The command creates active, email-verified accounts
with Argon2id password hashes in one serializable transaction. It is safe to
rerun for the same administrators and never resets their passwords. Any clash
with an existing student or partial identity match aborts the entire seed. Keep
the JSON value in deployment secrets; do not commit administrator passwords.

Verification codes expire after 10 minutes, allow five failed attempts, and are
stored only as HMAC-SHA-256 hashes. Issuing a replacement invalidates the prior
unused code. The partial unique index enforcing one unused code per user can be
rolled back by dropping
`email_verification_codes_one_unused_per_user_key`.

Verification-email resend is limited atomically in Redis to one request per
email address per 60 seconds and five requests per hour. Email addresses are
SHA-256 hashed before they are used in Redis keys. Redis remains temporary
coordination state; PostgreSQL remains authoritative for account eligibility.

### Gmail SMTP verification

Gmail delivery uses `smtp.gmail.com` with explicit STARTTLS on port 587. For
this host, configuration validation rejects other ports and rejects
`SMTP_SECURE=true`. Nodemailer uses `secure=false` to begin the SMTP connection
normally and `requireTLS=true` to require a successful STARTTLS upgrade before
authentication or message delivery.

Never put a Gmail password or app password in `.env.example`, source control,
commands, screenshots, or logs. Keep it only in the ignored local `.env` file
or the deployment secret manager. For Gmail SMTP, configure:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM=your-gmail-address
```

The Gmail account must have 2-Step Verification enabled before an app password
can be created. Use the complete Gmail or Google Workspace address for
`SMTP_USER`. Keep `SMTP_FROM` equal to that account unless Gmail has already
been configured to send from the chosen alias.

To test the complete registration and verification flow:

1. Copy `.env.example` to the ignored `.env` file and replace every placeholder
   locally. Do not paste secret values into a terminal command or commit them.
2. Confirm outbound connectivity without credentials by running
   `Test-NetConnection smtp.gmail.com -Port 587` in PowerShell.
3. Start PostgreSQL and Redis with `docker compose up -d database redis`.
4. Start the service with `corepack pnpm start:dev`. The same process starts the
   BullMQ verification-email worker.
5. Send `POST /api/accounts/register` with a unique username, NUS email, phone
   number, and valid password. A successful request returns HTTP 201 and queues
   the email.
6. Read the six-digit code from the recipient inbox. Also check spam if needed.
   The code expires after 10 minutes.
7. Send `POST /api/accounts/verify-email` with the same email and code. Success
   returns HTTP 204.
8. Send `POST /api/auth/login` with the email and password to confirm the now
   active account can authenticate.

Example request bodies are available in the OpenAPI UI at `/api/docs`. An SMTP
failure rejects the BullMQ job, which is retried up to five times with
exponential backoff. Worker logs report only a safe error category such as
`EAUTH`; they do not include SMTP response text, credentials, verification
codes, or recipient addresses.

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

Set `FRONTEND_ORIGIN` to the web application's exact origin, such as
`http://localhost:3000`. The value must be one HTTP or HTTPS origin without a
path; wildcard CORS is not accepted.

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
`FRONTEND_ORIGIN`, `JWT_ACCESS_TOKEN_SECRET`, `REDIS_URL`, and the `SMTP_*`
settings shown in `.env.example`. Secrets must not be committed or reused
between purposes. The verification code is placed in Redis only as short-lived
job payload and successful or exhausted jobs are removed. Prisma migrations
live under `prisma/migrations/`. The generated client is written to
`src/generated/prisma/`, regenerated during checks and builds, and is not
committed.

Authenticated GET /api/accounts/:id/identity returns only ID and username. Missing accounts return 404. Private contacts and security data are excluded.
