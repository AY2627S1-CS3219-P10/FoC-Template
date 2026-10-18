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
   behaviour change visible to the user — get the user's go-ahead. (Given: D-014.)
6. Regression check (run only, never edit): web-app Playwright `tests/e2e/errands.spec.ts`.

## Additive routes (no web-app UI yet)
| Route | Actor | Success | Errors |
|---|---|---|---|
| `POST /api/errands/:id/accept` | any user except the requester | 200 `Errand` (ACCEPTED, `courierId`, `acceptedAt`); repeat by the same courier returns the current state | 401; 403 `ERRAND_ACTION_FORBIDDEN` (own errand); 404 `ERRAND_NOT_FOUND`; 409 `ERRAND_INVALID_TRANSITION` (taken / not OPEN), `ERRAND_OPERATION_PENDING` |
| `POST /api/errands/:id/pickup` | assigned courier | 200 `Errand` (PICKED_UP, `pickedUpAt`) | 401; 403 `ERRAND_ACTION_FORBIDDEN`; 404; 409 `ERRAND_INVALID_TRANSITION` (not ACCEPTED) |
| `POST /api/errands/:id/deliver` | assigned courier | 200 `Errand` (DELIVERED, `deliveredAt`) | same; 409 unless PICKED_UP |
| `POST /api/errands/:id/dispute` | requester | 200 `Errand` (DISPUTED, `disputedAt`); credits stay reserved | same; 409 unless DELIVERED |
| `POST /api/errands/:id/confirm` | requester | 200 `Errand` (COMPLETED, `completedAt`, `completionMethod: REQUESTER_CONFIRMED`); courier paid via `errand.completed.v1` | same; 409 unless PICKED_UP or DELIVERED |
| `POST /api/errands/:id/cancel` (no body, no header) | requester | 200 `ErrandOperation` (`errand.status` CANCELLED, `cancelledAt`, `courierId` null), 202 while the release is pending; whole reservation released; a repeat returns the same `operationId` | 401; 403 `ERRAND_OWNER_REQUIRED`; 404; 409 `ERRAND_INVALID_TRANSITION` (PICKED_UP or later), `ERRAND_OPERATION_PENDING` |
| `POST /api/errands/:id/courier-cancel` | assigned courier | 200 `Errand` (OPEN, `courierId` null); credits stay reserved; this courier can never accept it again; repeat returns the current state | 401; 403 `ERRAND_ACTION_FORBIDDEN`; 404; 409 `ERRAND_INVALID_TRANSITION` (not ACCEPTED; after pickup is Q-020) |

| `GET /api/errands/assigned?limit&offset&sort` | any user | 200 `Errand[]` the caller accepted as courier, any status | 401 |
| `GET /api/errands/manage?requesterId=<uuid>` (optional param) | administrators, or the requester themself | 200 `Errand[]` of that requester | 400 bad uuid; 403 `ADMINISTRATOR_REQUIRED` |

Details (`GET /api/errands/:id` and every action response) also carry
`availableForAcceptance` (OPEN, unassigned, not past `expiresAt`, and the caller was
not released from it).

Accept also returns 403 `ERRAND_COURIER_EXCLUDED` (the caller courier-cancelled this
errand or missed its 30-minute pickup window) and 409 `ERRAND_EXPIRED`.

## Changed behaviour of existing routes (D-014, D-018), same shapes
- **Owner `DELETE /api/errands/:id`** now cancels: allowed from OPEN **and ACCEPTED**,
  sets `status: "CANCELLED"` (the record stays and still appears in
  `GET /api/errands/manage`), releases the credits, returns the same `ErrandOperation`
  200/202. web-app's "credits have been released" stays true, but its "The request has
  been removed" (`errand-detail.tsx`) is now slightly off: the errand stays in the
  requester's list as CANCELLED. Suggest to the web-app owner: "Errand cancelled".
  web-app's Playwright test mocks order-service, so it is unaffected. Its delete
  button rule (`owner && status === "OPEN" && !courierId`) still hides it for ACCEPTED,
  so cancelling an accepted errand is API-only for now. Administrator DELETE is
  unchanged (soft delete, any state; Q-011).
- **`POST /api/errands`** accepts optional `itemType`: `"FOOD"` (expires 2 h after
  creation) or `"NON_PERISHABLE"` (24 h, default). Any other value → 400. `PATCH` does
  not accept it (400).
- **The web-app UI has no control for `itemType` yet**, so every errand it creates is
  NON_PERISHABLE and expires after 24 h until the web-app owner adds one. For D3, FOOD
  errands are shown with Postman (`postman/README.md`, folder 4).
- Errands that nobody accepts in time become `EXPIRED` (terminal); web-app shows the
  status as text and offers no actions for it.

Lifecycle actions are idempotent per actor: repeating one whose effect is already the
current state returns 200 with the current errand and changes nothing.

`Errand` also carries optional `acceptedAt`, `pickedUpAt`, `deliveredAt`, `disputedAt`,
`completedAt`, `cancelledAt`, `expiredAt`, `completionMethod` (null until set), and
always `itemType` and `expiresAt`. Statuses: OPEN, ACCEPTED, PICKED_UP, DELIVERED,
DISPUTED, COMPLETED, CANCELLED, EXPIRED (no IN_PROGRESS, D-013). The assigned courier
can `GET /api/errands/:id`.

