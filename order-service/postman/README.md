# Postman: order-service authorization and lifecycle (D3)

`order-service.postman_collection.json` (53 requests) and `foc-local.postman_environment.json`.
Every request has tests, so a Collection Runner pass is the evidence. All checks are
enforced by order-service itself, never by the client.

| Folder | Shows |
|---|---|
| 0 Setup | logs in four users through user-service, picks a supplier location |
| 1 Authentication | 401 without a token or with a forged one |
| 2 Lifecycle | create (201) and idempotent replay; key reuse with other data 409; stranger edit 403; requester accepting own errand 403; courier accept 200; lost race 409; repeat accept 200 unchanged; pickup/deliver/confirm/dispute with wrong actor 403 and wrong state 409; confirm twice gives one completion |
| 3 Query patterns | courier's assigned list; stranger cannot read; per-requester view admin-only (403 / 200) |
| 4 Cancel, courier cancel and item type | `itemType` FOOD → 2 h, default NON_PERISHABLE → 24 h, bad value 400, PATCH of it 400; courier cancel → OPEN with the deadline unchanged, that courier excluded (403 `ERRAND_COURIER_EXCLUDED`), another courier may accept; requester cancel of an ACCEPTED errand releases credits and the courier; repeat cancel returns the same operation; DELETE cancels; cancel and courier cancel after pickup 409 |

## Tested manually (no web-app UI yet)
web-app has no control for these yet, so for D3 they are shown with this collection and
by hand, not through the UI. Backend authorization is the same either way.

| Route or field | Requests |
|---|---|
| `itemType` on `POST /api/errands` (web-app never sends it, so its errands are all 24 h) | folder 4 |
| `POST /api/errands/:id/pickup`, `/deliver`, `/confirm`, `/dispute` | folder 2 (and 4 for early confirm) |
| `POST /api/errands/:id/cancel` | folder 4 |
| `POST /api/errands/:id/courier-cancel` | folder 4 |
| `DELETE /api/errands/:id` as requester, now a cancel (web-app does call this one) | folder 4 |
| 30-minute reopen, expiry, 4 h auto-complete | no request: age the timestamps with SQL as in `../docs/demo-timers.md`, then `GET /api/errands/{id}` |

## Before running
1. Start user-service (3001), supplier-service (3002), credit-service (3003) and
   order-service (3004), e.g. root `compose.yaml` plus the services' own instructions.
2. Accounts (put emails and passwords in the environment, never in the collection):
   - `requester`, `courier`, `stranger`: three **active** NUS student accounts. Register with
     `POST /api/accounts/register`, then activate with the emailed code via
     `POST /api/accounts/verify-email`.
   - `admin`: an administrator, e.g. from `user-service/src/seed-administrators.ts`.
3. Credit accounts: log in to web-app once as `requester` and as `courier`. web-app
   provisions their credit accounts (`web-app/src/app/api/credits/route.ts`). The
   requester needs ≥ 20 credits (four errands of 5 can be reserved at once). The courier needs an account or credit cannot settle the
   completion event (Q-012).
4. At least one supplier with a location must exist in supplier-service.

## How the JWTs are obtained
`0 Setup` calls `POST {{userUrl}}/api/auth/login` with `{ email, password }` and stores
`accessToken` (HS256, 15 min, claims `sub`, `sid`, `isAdmin`) as `<role>Token`, plus `sub`
as `<role>Id`. Re-run `0 Setup` when tokens expire. order-service checks each token by
calling user-service `GET /api/accounts/me`, so a revoked session fails immediately.

## Run
Postman: import both files, select **FoC local**, run the collection in order.
CLI: `npx newman run order-service.postman_collection.json -e foc-local.postman_environment.json`
(environment filled in first).

Each run creates fresh errands (`createKey` and the folder 4 keys are regenerated), so
the collection can be re-run. It spends 10 of the requester's credits per run (the
folder 2 errand and the folder 4 early-confirmed one), paid to the courier once
`errand.completed.v1` is relayed (`ORDER_EVENTS_ENABLED=true`, see `docs/events.md`).
The two cancelled errands in folder 4 release their 5 credits each. Folder 4 uses the
`stranger` account as a second courier.
