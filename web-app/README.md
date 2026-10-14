# Friend on Campus web app

Responsive React client built with Next.js App Router, TypeScript, and Tailwind
CSS. Integrates with the existing User and Supplier Services for registration,
email verification/resend, login, session renewal, logout, profile display,
supplier search/filtering, and pickup-location details. No mock data or fallback
catalog is included. Order creation and acceptance are not implemented.

## Run locally

On Windows, start Docker Desktop and launch all databases and application services
from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Add `-Install` on first setup to install all dependencies. The script generates
missing local secrets, shares the User Service JWT secret with the other services,
configures server-only credit provisioning, and applies migrations. Configure
working SMTP credentials in `user-service/.env` for registration. Service logs
are written to `.local/`. Open http://localhost:3000, log in, and click the gold
coin and balance in the top bar to open `/credits`.
The credit database uses host port 5435, separate from the user database on 5433.

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
database directly.

## Account settings

The dedicated `/credits` page displays available and reserved credits from the Credit Service,
with refresh, retry, and unprovisioned-account states. Set the server-only
`CREDIT_SERVICE_URL` (default `http://127.0.0.1:3003`, without `/v1`). Start the
service and its database using [its setup guide](../credit-service/README.md).
Its JWT secret, issuer, and audience must match the User Service configuration.
The web app needs the matching server-only `CREDIT_USER_SERVICE_TOKEN` to provision
missing accounts. It does not need the JWT signing secret.

The shared credit provider loads after login and when an existing session is
restored, sending a same-origin `POST /api/credits`. The top bar shows available
credits beside a gold coin, linking to `/credits`. Refreshing that page updates
both the top bar and the available/reserved balance details. Guests see a login
prompt; loading and unavailable balances never display an invented zero.
The adapter resolves the active, verified user from their live User Service
session and reads their balance. If that account is missing, it provisions it
through the internal Credit Service API. The Credit Service assigns its configured
initial balance exactly once; retries and existing accounts never receive extra
credits. No account ID or credit amount is accepted from the browser. The read-only
`GET /api/credits` remains available without provisioning. Verification itself
does not provision accounts; the first login after verification handles both
existing and new users automatically, including retries after a service outage.
Reservations, releases, and settlement remain internal errand operations.
Credit browser tests use intercepted responses to check desktop/mobile behavior;
they do not replace live backend integration tests.

The account page supports phone-number updates and password changes through
the user service's authenticated profile endpoints. Phone numbers must contain
8–15 digits. Password changes require the current password and a new password
of at least eight characters with uppercase, lowercase, and a special character.
Successful password changes revoke all sessions, clear the browser's session
cookies, and prompt the user to sign in again. Other open tabs are notified.
Username and email remain read-only, matching the available backend operations.
Forgotten-password recovery is not currently provided by the user service.

Profile browser tests cover desktop/mobile forms, validation, service errors,
sign-out after password changes, and adapter access checks. Workflow tests use
intercepted responses and do not change real users' passwords or phone numbers.

## Administrator dashboard

Administrators land on `/admin` after login and can also open it from navigation
or their account page. The dashboard supports all current administrative HTTP
operations: create suppliers with a first pickup location, edit supplier names
and categories, edit pickup details and hours, permanently delete suppliers, search
accounts, and grant or remove administrator privileges. Privilege changes and
deletion require confirmation. Self privilege changes are disabled; the
user service enforces the remaining administrator protections and revokes the
affected account's sessions.

The server adapter checks the current user-service session and administrator
status before forwarding any dashboard request. Mutations use same-origin
checks and HttpOnly cookies. Backend services remain authoritative. The catalog
only includes active suppliers; there is currently no backend operation for
reactivation or adding extra locations to an existing supplier. Initial admin
seeding remains a service deployment operation.

`tests/e2e/admin.spec.ts` exercises desktop and mobile administrator workflows
using intercepted API responses, plus real adapter origin and unauthenticated
access checks. These UI contract tests do not replace live service integration
tests or database tests.

## Errands

The /errands page browses authenticated OPEN, unassigned requests from Order Service, including pickup, delivery, instructions and offered credits. Configure ORDER_SERVICE_URL (default http://127.0.0.1:3004). See ../order-service/README.md for PowerShell setup. Users can create errands from the Errands page. Choose a pickup location, complete delivery details and offer credits; successful creation updates the list and credit balance. Pending requests can be checked and uncertain requests retried safely. An empty database displays an empty state.

Create errands at /errands/create. A floating Create errand shortcut appears on every page, supports mouse/touch dragging and arrow keys when focused, and remembers its position in browser storage. Guests are prompted to log in on the creation page.

Errand browse cards show only the title, pickup location and delivery destination. View details opens /errands/:id with a flexible full-information card. My requests lists the owner's requests; All requests is available to administrators. Owners can edit/delete OPEN unassigned requests. Administrators can delete any request and cannot edit. Deletion requires confirmation and refreshes credits; uncertain mutations retain their request keys for safe retries.

Administrator creators can edit their own OPEN unassigned requests. Requester usernames come from User Service. Edit/save buttons are green; delete/confirm buttons are red.

Catalogue cards show offered credits using the header balance gold coin badge. Sort errands offers latest/oldest creation time and highest/lowest credits; changing the sort returns to page 1.
