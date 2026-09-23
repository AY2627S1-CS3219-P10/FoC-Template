# Friend on Campus web app

Responsive React client built with Next.js App Router, TypeScript, and Tailwind
CSS. Integrates with the existing User and Supplier Services for registration,
email verification/resend, login, session renewal, logout, profile display,
supplier search/filtering, and pickup-location details. No mock data or fallback
catalog is included. Order creation and acceptance are not implemented.

## Run locally

Use Node.js 24.11 or newer within Node.js 24 and pnpm 12.5.1. From the repository
root:

```powershell
pnpm install
pnpm web:dev
```

Open http://localhost:3000. If pnpm is unavailable or bundled Corepack cannot
launch it, use the pinned package without a global installation:

```powershell
npm exec --yes --package=pnpm@12.5.1 -- pnpm install
npm exec --yes --package=pnpm@12.5.1 -- pnpm web:dev
```

This uses npm only to launch pnpm; pnpm manages workspace dependencies and the
root lockfile.

## Start the real backend services

Both services must be running. The frontend defaults to User Service at
`http://127.0.0.1:3001` and Supplier Service at `http://127.0.0.1:3002`.
For deployed services, copy `web-app/.env.example` to `web-app/.env.local` and
change `USER_SERVICE_URL` and `SUPPLIER_SERVICE_URL` (origins without `/api`).
These variables stay on the server, not in the browser bundle.

For local backends, install Docker and start its engine, then in each service
folder copy `.env.example` to `.env` and follow its README. Both services must
use the same randomly generated `JWT_ACCESS_TOKEN_SECRET`. User Service also
needs its independent verification-code secret and working SMTP credentials
for registration/verification. Do not commit any secrets.

From `user-service/`, in its own terminal:

```powershell
npm exec --yes --package=pnpm@12.4.2 -- pnpm install
docker compose up -d database redis
npm exec --yes --package=pnpm@12.4.2 -- pnpm prisma:generate
npm exec --yes --package=pnpm@12.4.2 -- pnpm db:migrate:deploy
npm exec --yes --package=pnpm@12.4.2 -- pnpm start:dev
```

From `supplier-service/`, in another terminal:

```powershell
npm exec --yes --package=pnpm@12.4.2 -- pnpm install
docker compose up -d database
npm exec --yes --package=pnpm@12.4.2 -- pnpm prisma:generate
npm exec --yes --package=pnpm@12.4.2 -- pnpm db:migrate:deploy
npm exec --yes --package=pnpm@12.4.2 -- pnpm start:dev
```

The supplier migration loads the service's real initial catalog. The UI only
displays active records returned by `GET /api/suppliers`. Register at `/register`,
verify the emailed code at `/verify-email`, and log in at `/login`.
Existing active accounts can log in directly. Registration does not log you in.

Unavailable services produce a retryable error instead of sample results.
No frontend signing secret is required. Supplier browsing requires login.
See [integration design](../docs/web-service-integration.md) for the API boundary.

For production, set `APP_ORIGIN` to the exact public HTTPS origin. This enables
Secure session cookies and validates mutating requests against the public origin.

## Check the app

```powershell
pnpm web:lint
pnpm web:typecheck
pnpm web:build
pnpm --filter @foc/web-app exec playwright install chromium
pnpm web:test
```

Browser tests use the production build on port 3100. Build first. Guest navigation,
forms, unauthenticated access, and origin checks run without backend services.
Live login/profile/refresh/catalog/logout tests require both services and an
existing verified test account. Set `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` in
the test process environment before `pnpm web:test`. Without credentials, these
tests are explicitly skipped; they never substitute mock responses. Keep test
credentials out of source control. Use a dedicated test account because failure
traces can contain form values and authenticated network traffic.

Leave `APP_ORIGIN` unset for local tests, or set it to `http://127.0.0.1:3100`.

## Structure

- `src/app/`: routes, shared layout, loading/error/not-found views
- `src/components/`: shared navigation and icons
- `src/features/auth/`: account forms, session context, profile
- `src/features/suppliers/`: authenticated supplier catalog and pickup details
- `src/services/`: typed HTTP contracts, browser client, server-only adapters
- `src/styles/globals.css`: Tailwind entry point and responsive styles
- `tests/e2e/`: Playwright user journeys

Backend services remain authoritative for account eligibility and supplier
availability. Authentication tokens are kept in HttpOnly cookies; no tokens or
profile data are persisted in localStorage. The frontend never reads a service's
database directly. Supplier administration and profile editing are separate work.
