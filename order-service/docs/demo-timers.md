# Showing the timers live (D3 demo)

The three lifecycle timers run in order-service itself. No endpoint skips or triggers
them, and there is no test-only code path. To show one without waiting, move the
errand's timestamps into the past in order-service's own database. The sweeper in
`src/infrastructure/timer.worker.ts` runs every **30 s**, finds the errand, and its job
applies the transition with the database clock, exactly as it would after the real wait.

| Timer | Rule | Applies to | Effect |
|---|---|---|---|
| Reopen (D-017) | 30 min after `accepted_at`, not picked up | ACCEPTED | → OPEN, courier cleared and excluded from this errand, credits stay reserved |
| Expiry (D-017, D-018, D-019) | `expires_at` = `created_at` + 2 h (FOOD) or 24 h (NON_PERISHABLE) | OPEN | → EXPIRED, whole reservation released over HTTP |
| Auto-complete (D-008) | 4 h after `delivered_at` | DELIVERED | → COMPLETED (`AUTO_TIMEOUT`), `errand.completed.v1` written to the outbox |

Needs order-service running with its Postgres and Redis (root `compose.yaml`), and
credit-service for expiry (it releases credits). Get the errand id from Postman or
`GET /api/errands/manage`.

## Connect
```bash
docker compose exec order-db psql -U foc_order -d foc_order
# or from the host: psql postgresql://foc_order:local_order_password@127.0.0.1:5436/foc_order
```
```sql
\set id '00000000-0000-4000-8000-000000000000'   -- the errand id
SELECT status, item_type, created_at, expires_at, accepted_at, picked_up_at, delivered_at
FROM errands WHERE id = :'id';
```

## 30-minute reopen (errand is ACCEPTED)
```sql
UPDATE errands SET accepted_at = accepted_at - interval '31 minutes' WHERE id = :'id';
```
Within 30 s: `status = OPEN`, `courier_id` NULL. The same courier's `POST …/accept`
now returns 403 `ERRAND_COURIER_EXCLUDED`; another courier can accept. `expires_at`
has not changed.

## Expiry (errand is OPEN)
`created_at` and `expires_at` move together: the CHECK `errands_expiry_deadline` keeps
them exactly 2 h / 24 h apart, so moving only one is rejected.
```sql
UPDATE errands
SET created_at = created_at - interval '24 hours 1 minute',
    expires_at = expires_at - interval '24 hours 1 minute'
WHERE id = :'id';
```
Use `'2 hours 1 minute'` for a FOOD errand. Within 30 s: `status = EXPIRED`,
`expired_at` set, and the requester's reserved credits are back in their balance. An
ACCEPTED or PICKED_UP errand never expires, however old.

## 4-hour auto-complete (errand is DELIVERED)
Move all three lifecycle stamps together, because the CHECK `errands_lifecycle_order`
requires `accepted_at` ≤ `picked_up_at` ≤ `delivered_at`.
```sql
UPDATE errands
SET accepted_at = accepted_at - interval '4 hours 1 minute',
    picked_up_at = picked_up_at - interval '4 hours 1 minute',
    delivered_at = delivered_at - interval '4 hours 1 minute'
WHERE id = :'id';
```
Within 30 s: `status = COMPLETED`, `completion_method = AUTO_TIMEOUT`, and one
`outbox_events` row for `errand.completed.v1`. A confirm or dispute sent before the
sweep wins instead, and the job then changes nothing.

## Check what happened
```sql
SELECT action, from_status, to_status, actor_role, courier_id, occurred_at
FROM errand_history WHERE errand_id = :'id' ORDER BY occurred_at;
SELECT courier_id FROM errand_excluded_couriers WHERE errand_id = :'id';
```
Timer rows have `actor_role = SYSTEM`.

## Check the credits
credit-service is the source of truth for balances, so read them there, not from
order-service. Each user may read only their own balance (or an administrator any):
```bash
curl -s http://127.0.0.1:3003/v1/credit-accounts/<userId> -H "Authorization: Bearer <that user's access token>"
```
Take the token and `sub` from `POST http://127.0.0.1:3001/api/auth/login` (or from
Postman's `0 Setup`). Expected, compared with the balances before the ageing:

| Timer | Requester | Courier |
|---|---|---|
| Reopen | unchanged: the reservation stays (errand is OPEN again) | unchanged |
| Expiry | `availableCredits` + offer, `reservedCredits` − offer | unchanged |
| Auto-complete | `reservedCredits` − offer | `availableCredits` + offer, once, within a few seconds (needs `ORDER_EVENTS_ENABLED=true`) |

The courier is paid by credit-service consuming `errand.completed.v1`, so a second
read a few seconds later must show the same balance (no double payment). Integration tests do the same ageing in SQL
(`age()` and `ageCreated()` in `tests/integration/errands.spec.ts`).
