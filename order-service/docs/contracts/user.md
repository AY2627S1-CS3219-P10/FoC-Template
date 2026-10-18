# Contract: user-service (port 3001)

User Service owns identity, sessions, verification and administrator status. Order
must not own passwords, tokens or admin lifecycle. Verified against `user-service/`
on 2026-10-18.

## Endpoints order uses
Base URL `USER_SERVICE_URL` (default `http://127.0.0.1:3001`), global prefix `/api`.
Order forwards the caller's bearer token.

| Route | Source | Response | Used in order |
|---|---|---|---|
| `GET /api/accounts/me` | `user-service/src/modules/accounts/presentation/http/profile.controller.ts` `ProfileController` | `{id, username, email, phoneNumber, isAdmin, status, emailVerifiedAt, suspendedUntil, createdAt, updatedAt}`; `status` ∈ `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `BANNED` (`domain/account-status.ts`) | `ServiceClients.identity` (requires `ACTIVE` + `emailVerifiedAt`), `ServiceClients.isAdministrator` |
| `GET /api/accounts/:id/identity` | `…/account-identity.controller.ts` `AccountIdentityController` | `{id, username}`; `:id` must be UUID **v4**; 404 if unknown | `ServiceClients.username` (requester name on details) |

Invalid/expired token → 401 `ACCESS_TOKEN_INVALID_OR_EXPIRED`
(`…/security/bearer-authentication.guard.ts` `BearerAuthenticationGuard`). Order maps
401/403 to its own 401 (`src/api/auth.guard.ts` `AuthGuard`).

## Access tokens
- HS256 JWT signed with `JWT_ACCESS_TOKEN_SECRET`; issuer `foc-user-service`, audience
  `foc-api`, lifetime 15 min
  (`user-service/src/modules/accounts/application/contracts/access-token.contract.ts`).
- Claims: `sub` (user id), `sid` (session id), `isAdmin` (boolean), `iat`, `exp`
  (`…/infrastructure/security/jose-access-token.ts` `JoseAccessToken`). No `status`
  claim.
- supplier-service and credit-service verify tokens **locally**.

### Trade-off: `/me` per request vs local JWT verification
| | Call `/me` (current) | Verify JWT locally |
|---|---|---|
| Latency | +1 HTTP hop (sometimes 2 — defect K3) | none |
| Revoked session (logout, password change, suspension, admin change) | rejected immediately | accepted until token expiry (≤15 min) |
| `ACTIVE` + email-verified check | yes | no (not in token) |
| `isAdmin` freshness | live | up to 15 min stale |

Current choice: keep `/me` for correctness (NFR3.2) but call it **once** per request
(slice N2): `AuthGuard` should store the whole profile (`id`, `isAdmin`) on the request
so `isAdministrator` does not call again.

## Events
None. User-service publishes nothing (its only queue is the internal BullMQ
`verification-email`). Nobody publishes `user.verified.v1`, which is why credit
accounts are created lazily by web-app (see `credit.md` §5 and conflict C12).
