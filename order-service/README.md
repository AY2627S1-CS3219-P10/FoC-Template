# Order Service

FR4 creation, authenticated open browsing and requester editing. Uses Node 24, TypeScript, NestJS/Fastify, Prisma 7, PostgreSQL, and Redis/BullMQ recovery. Services own separate databases; credit changes use the Credit Service HTTP API.

## PowerShell startup

From the repository root, with existing User, Supplier and Credit Services configured:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
pnpm install
docker compose up -d --wait order-db order-redis
Copy-Item order-service/.env.example order-service/.env # first setup only
```

Set Order's `CREDIT_ORDER_SERVICE_TOKEN` to the matching caller-scoped value used by Credit Service. Credit accounts must already be provisioned after user verification; Order Service cannot create them. Apply the Credit migrations and restart Credit Service:

```powershell
Set-Location credit-service
pnpm db:generate
pnpm db:migrate
pnpm start:dev
```

In another terminal, from the repository root:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
Set-Location order-service
pnpm db:generate
pnpm db:migrate
pnpm start:dev
```

User (3001), Supplier (3002), Credit (3003) and Order (3004) must run. Include `$env:NODE_OPTIONS = "--use-system-ca"` before starting User Service on Windows for verification email certificates. Order PostgreSQL uses 5436, Redis 6380. OpenAPI: http://localhost:3004/docs.

Launch the frontend in another terminal from the repository root:

```powershell
pnpm --filter @foc/web-app dev
```

Visit http://localhost:3000/errands. The web server uses ORDER_SERVICE_URL, default http://127.0.0.1:3004. It displays actual OPEN, unassigned errands with pagination, empty and retry states. Creation is available through the web Errands page; editing currently uses the backend API.

## API

All routes require a bearer access token. Identity is derived from the live User Service session; inactive, suspended and unverified accounts are rejected.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/errands?limit=50&offset=0 | Published OPEN errands |
| GET | /api/errands/:id | Open errand or your own errand |
| POST | /api/errands | Create after credit reservation |
| PATCH | /api/errands/:id | Edit your OPEN unassigned errand |
| GET | /api/errand-operations/:id | Your operation outcome |

POST/PATCH require a UUID v4 Idempotency-Key header. Retry with the same key and normalized payload; conflicting reuse returns 409. Create requires pickupLocationId (available Supplier location UUID), description, deliveryDestination, instructions and positive whole offeredCredits. Unknown fields, including requester IDs, are rejected. PATCH requires expectedVersion and at least one editable field: description, deliveryDestination, instructions, offeredCredits. Pickup cannot be edited. Non-owner edits return 403; stale versions or assigned/later states return 409. Increases reserve additional credits; decreases release excess.

## Consistency

PostgreSQL persists an operation intent before calling Credit Service. Only successful reservation permits publishing an OPEN errand. Credit adjustments use immutable operation IDs and send the complete desired reservation amount. Pending edits are locked and hidden until fields and reserved credits agree.

This is a recoverable workflow across independent databases, not a global ACID transaction. Definitive insufficient-credit failures return 422 and publish no errand/edit. Uncertain responses or a failed local commit return 202 with a PENDING operation ID. Poll the operation or retry the same key; BullMQ resumes the PostgreSQL journal without double charging. Redis outages delay recovery but do not lose persisted intents. Readiness checks PostgreSQL. No RabbitMQ events are introduced.

Acceptance, assignment and settlement are outside this implementation. Future acceptance must atomically check OPEN, no courier and no pending operation.

## Tests

```powershell
pnpm --filter @foc/order-service build
pnpm --filter @foc/order-service lint
pnpm --filter @foc/order-service test
pnpm --filter @foc/order-service test:integration
pnpm --filter @foc/web-app exec playwright test errands.spec.ts
```

Integration tests require Docker and use isolated PostgreSQL databases with the real Credit HTTP API. Cover validation, ownership, versions, concurrency, insufficient funds, bounty edits, lost responses and failed-commit recovery.

## Detail views and request management

GET /api/errands/manage lists the acting user's requests; administrators receive all nondeleted requests. GET /api/errands/:id also allows administrators to inspect requests in later states. PATCH is restricted to nonadministrator owners of OPEN unassigned requests. Administrators cannot edit even their own requests.

DELETE /api/errands/:id requires a UUID Idempotency-Key. Owners can delete OPEN unassigned requests; administrators can delete any request. Pending changes return 409. Deletion persists a DELETE operation, idempotently releases reserved credits, then sets deletedAt and increments the version in an Order transaction. Completed credit transfers are preserved. Deleted requests disappear from listing/detail APIs; PostgreSQL retains the record and operation history for auditing. Network uncertainty returns 202, recovered by the same worker as creation/editing.

Apply the new migration with `pnpm --filter @foc/order-service db:migrate`, then restart Order Service. Swagger documents the management and DELETE endpoints.

Creator editing includes administrator creators of OPEN unassigned requests. Administrators cannot edit requests belonging to other users. This replaces the earlier blanket prohibition on administrator editing.

Catalogue GET routes accept sort=newest (default), oldest, credits-highest or credits-lowest. Sorting happens in PostgreSQL before limit/offset, with deterministic tie breakers. Other values return 400.
