# Web client integration with existing services

The web app uses Next.js Route Handlers as a small, same-origin HTTP adapter to
the existing User and Supplier Services. This allows the requested integration
before the planned NestJS API gateway is implemented. It does not own accounts,
supplier records, authorization rules, or databases. When the gateway is ready,
point the server-side adapters at its routes.

`USER_SERVICE_URL` and `SUPPLIER_SERVICE_URL` are server-only origins. The browser
never receives refresh/access tokens in JSON; the adapter stores them in HttpOnly,
SameSite=Lax cookies scoped to `/api`, using Secure cookies for HTTPS. Production
deployments must set `APP_ORIGIN` to their exact public HTTPS origin. Mutating
routes validate the Origin header and require JSON. Responses are not cached.

User Service remains responsible for password policy, account status, session
revocation and refresh rotation. Browser requests serialize login, refresh and
logout using Web Locks across tabs (with a same-tab fallback). Expired access
tokens trigger at most one refresh attempt per request, followed by a retry.
Logout is only reported as successful after backend revocation succeeds.

The supplier catalog calls `GET /api/suppliers` with the issued bearer token.
It displays only records returned by that service. Filtering is client-side over
the returned active catalog. The UI does not infer current availability from
opening hours or invent missing records. Both backend services need the same
`JWT_ACCESS_TOKEN_SECRET`; the frontend neither needs nor receives that secret.

The first integration covers registration, email verification/resend, login,
session renewal, logout, current profile, supplier browsing and pickup details.
Administration, profile edits and the Order Service are separate workflows.
The old mock errand routes and fixtures have been removed. No mock fallback is
used when a service is unavailable.
