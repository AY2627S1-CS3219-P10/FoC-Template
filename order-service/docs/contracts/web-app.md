# Contract: what web-app depends on (do not break)

`web-app/` belongs to a teammate and **cannot be edited** by order-service work. Any
change to an order-service response that web-app reads is a **hard stop** (ask the user
first). New routes and new optional fields are fine. Verified 2026-10-18.

## How requests reach order-service
Browser → web-app Route Handlers (same-origin proxy) → order-service directly (no
gateway). Helper: `web-app/src/services/backend.server.ts` `backend()`:
- `ORDER_SERVICE_URL` (default `http://127.0.0.1:3004`), path prefix `/api/`.
- Sends `Authorization: Bearer <foc_access cookie>` and `Idempotency-Key` when given.
- 8 s timeout. Upstream ≥500 becomes 503; otherwise status, `message` and `code` are
  passed through. 204 → `undefined`.

| web-app route | Forwards to order | Source |
|---|---|---|
| `GET /api/errands?limit&offset&sort&scope` | `GET /api/errands` or, with `scope=manage`, `GET /api/errands/manage`; only `limit`, `offset`, `sort` forwarded | `web-app/src/app/api/errands/route.ts` `GET` |
| `POST /api/errands` | `POST /api/errands`; body `{pickupLocationId, description, deliveryDestination, instructions, offeredCredits}`; `idempotencyKey` moved to the header | same file, `POST` |
| `GET/PATCH/DELETE /api/errands/:id` | same paths; PATCH body `{expectedVersion, description, deliveryDestination, instructions, offeredCredits}`; DELETE no body | `web-app/src/app/api/errands/[id]/route.ts` |
| `GET /api/errand-operations/:id` | same path | `web-app/src/app/api/errand-operations/[id]/route.ts` |

The UI sends `limit=21` and pages by 20; `sort` ∈ `newest`, `oldest`,
`credits-highest`, `credits-lowest`.

## Response shapes relied on (`web-app/src/services/contracts.ts`)
```
ErrandOperation { operationId, status: "PENDING" | "SUCCEEDED" | "FAILED", errand?, errorCode? }
Errand { id, requesterId, requesterUsername?, courierId | null, status, pickupLocationId,
         pickupSupplierName, pickupLocationLabel, description, deliveryDestination,
         instructions, offeredCredits, version, createdAt, updatedAt }
```

## Behaviour relied on
- Status codes: create 201 (SUCCEEDED) / 202 (PENDING); PATCH and DELETE 200 / 202.
  web-app maps PENDING → 202 itself, so keep `status` in the body.
- `web-app/src/features/errands/errand-detail.tsx`: edit shown when
  `owner && status === "OPEN" && !courierId`; delete when admin or the same owner
  condition; after DELETE it shows "Errand deleted … Any reserved credits have been
  released". If `courierId` is set it is displayed.
- Error handling: it shows `message`; 4xx other than 408/429 are final, otherwise retry.
  It does not branch on order's `code` values.
- Unauthenticated `GET /api/errands` → 401 with `cache-control: no-store` (e2e test).
- No Socket.IO and no automatic polling; PENDING operations are checked by a button.

## Rules for order-service changes
1. Never rename or remove a field above; never change its type.
2. Keep the five routes, their methods and their 201/202/200 semantics.
3. New lifecycle actions are new routes (`POST /api/errands/:id/<action>`); web-app
   has no UI for them until its owner adds it.
4. New statuses (PICKED_UP, DISPUTED, …) are fine: web-app treats `status` as a string
   and only checks `"OPEN"`.
5. Changing what DELETE does (C7) keeps the same route and response but is still a
   behaviour change visible to the user — get the user's go-ahead.
6. Regression check (run only, never edit): web-app Playwright `tests/e2e/errands.spec.ts`.

## Additive routes (no web-app UI yet)
| Route | Actor | Success | Errors |
|---|---|---|---|
| `POST /api/errands/:id/accept` | any user except the requester | 200 `Errand` (ACCEPTED, `courierId`, `acceptedAt`); repeat by the same courier returns the current state | 401; 403 `ERRAND_ACTION_FORBIDDEN` (own errand); 404 `ERRAND_NOT_FOUND`; 409 `ERRAND_INVALID_TRANSITION` (taken / not OPEN), `ERRAND_OPERATION_PENDING` |
| `POST /api/errands/:id/pickup` | assigned courier | 200 `Errand` (PICKED_UP, `pickedUpAt`) | 401; 403 `ERRAND_ACTION_FORBIDDEN`; 404; 409 `ERRAND_INVALID_TRANSITION` (not ACCEPTED) |
| `POST /api/errands/:id/deliver` | assigned courier | 200 `Errand` (DELIVERED, `deliveredAt`) | same; 409 unless PICKED_UP |
| `POST /api/errands/:id/dispute` | requester | 200 `Errand` (DISPUTED, `disputedAt`); credits stay reserved | same; 409 unless DELIVERED |
| `POST /api/errands/:id/confirm` | requester | 200 `Errand` (COMPLETED, `completedAt`, `completionMethod: REQUESTER_CONFIRMED`); courier paid via `errand.completed.v1` | same; 409 unless PICKED_UP or DELIVERED |

| `GET /api/errands/assigned?limit&offset&sort` | any user | 200 `Errand[]` the caller accepted as courier, any status | 401 |
| `GET /api/errands/manage?requesterId=<uuid>` (optional param) | administrators, or the requester themself | 200 `Errand[]` of that requester | 400 bad uuid; 403 `ADMINISTRATOR_REQUIRED` |

Details (`GET /api/errands/:id` and every action response) also carry
`availableForAcceptance` (OPEN and unassigned).

Lifecycle actions are idempotent per actor: repeating one whose effect is already the
current state returns 200 with the current errand and changes nothing.

`Errand` also carries optional `acceptedAt`, `pickedUpAt`, `deliveredAt`, `disputedAt`,
`completedAt`, `cancelledAt`, `completionMethod` (null until set). The assigned courier
can `GET /api/errands/:id`.

