---
name: order-api-endpoint
description: Add or change an HTTP route in order-service additively, with auth, validation, status codes, error codes and web-app compatibility. Use when a slice adds an endpoint such as pickup, deliver, confirm, dispute or accept.
---

# order-api-endpoint

## Before you start
1. Read `docs/contracts/web-app.md`. The web-app cannot be edited, so existing behaviour is frozen.
2. The slice brief must list the new route. A change to an existing web-app-visible contract is a **hard stop**: ask the user first.

## Frozen (never change)
- Existing Errand JSON field names.
- `ErrandOperation {operationId, status, errand?, errorCode?}`.
- Status codes 201 (created), 202 (accepted, operation pending), 200 (ok).
- `DELETE` ("Errand deleted"), `scope=manage`, the `limit/offset/sort` query, and the UI rule `status==='OPEN' && !courierId`.

You may add fields, routes, enum values and optional query parameters. Check that an added enum value does not break the web-app's handling of unknown statuses (note it in the brief).

## Route shape
- State-changing actions: `POST /api/errands/:id/<action>` (pickup, deliver, confirm, dispute, accept, ...).
- The frontend requests an action; order-service decides the resulting status. Never accept a target status from the client.

## Layering
Controller (api) validates input and maps errors, then calls an application service, which calls the domain and ports. No business rules in the controller. No Nest or Prisma imports in `src/domain`.

## Auth
- Verify the JWT (HS256, claims `sub`, `sid`, `isAdmin`).
- Call user-service `/api/accounts/me` **once per request**. Session revocation is enforced only there. If you find a route that calls it twice, do not copy it; note it under N2.
- Take the actor from the token, never from the body.
- Admin-only routes check `isAdmin` from `/me`.

## Validation and responses
- Follow the existing DTO validation pattern in the controllers. Look at one before writing.
- Success: 200 for a completed state change; 202 with an `ErrandOperation` only when a credit operation is still pending; 201 only for creation.
- Errors use a stable `errorCode` string. Classify a failed conditional update as 404 (missing or soft-deleted), 403 (wrong actor) or 409 (wrong state or lost race) by re-reading the row.
- Never put tokens, emails or other personal data in responses or logs.

## Idempotency
A repeated request must give the same outcome. For lifecycle actions, a repeat after success returns the current state or 409 as the contract doc says; it must never apply the effect twice.

## Tests (at minimum)
Happy path, unauthenticated, wrong role, wrong state, repeat request, and a response-shape check against the web-app contract. Follow the pattern in `tests/integration/errands.spec.ts`.

## Docs
Update `docs/contracts/web-app.md` (new route, additive only) and the requirement's evidence in `docs/requirements.md`.

Hand off to: order-lifecycle-transition (for state changes), order-verify.
