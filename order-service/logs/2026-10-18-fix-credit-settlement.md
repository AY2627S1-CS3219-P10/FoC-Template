# 2026-10-18 · fix · Completed errands not settled
Branch `fix-credit-settlement` (worktree, off `origin/main`) · Agent: Claude Code + Claude Opus 5.5

## Summary
Couriers were not paid when an errand completed. The order DB showed `errand.completed.v1`
written at 09:22:45 but published at 09:32:33, 14 s after `order-service/.env` was edited
and the service restarted. Root cause: the outbox relay was off unless
`ORDER_EVENTS_ENABLED=true`, and nothing set it (`.env.example`, both start-local scripts
and root `compose.yaml`). Credit's settlement itself was correct: all six completions
settled once delivered, and the balances reconcile (courier 100 + 47 = 147; requester
100 − 47 settled − 9 still reserved = 44).
A second loss path was found and fixed: publishing to `foc.events` while no queue is
bound confirms and drops the message, so order marked it published and the courier was
never paid. The relay now publishes `mandatory` and keeps returned rows pending
(return-before-confirm ordering checked against the local RabbitMQ 4.2).
User-approved deviation: own branch instead of `order-system`, and one credit-service
commit; `check-scope.sh` fails only on the branch name.
Outside our scope (needs the compose maintainer, Q-018): the root `compose.yaml`
`order-service` block has no `RABBITMQ_URL` or `depends_on: rabbitmq`, and RabbitMQ has no
volume.

## Commits

### d111218 fix(order): stop completed errands from going unsettled
- **When:** 2026-10-18 17:45 · **Slice:** fix · **Refs:** D-001, Q-018
- **Changed:**
  - `src/infrastructure/outbox.relay.ts` — relay on unless `ORDER_EVENTS_ENABLED=false`; `mandatory: true`, unroutable returns keep the row pending; start/disabled/per-event logs
  - `.env.example` — `ORDER_EVENTS_ENABLED=true`
  - `tests/integration/errands.spec.ts` — in-app relay pinned off; unroutable retry test; default-on test
  - `docs/events.md` — §2 mandatory, §4 unroutable + logs, §5 default, §7 stale `.env`
- **Why:** settlement is the only path that pays couriers (D-001), so leaving it off by default silently broke the core flow. `mandatory` fixes the case where RabbitMQ confirms and then drops the event; declaring credit's queue from order was rejected because it couples order to credit's queue name.
- **Verified:** order `typecheck`, `lint`, `format:check` clean; `test` 349/349; `test:integration` 64/64 (60 existing + 4 new); amqplib probe on local RabbitMQ: `return` before `confirm`.
- **Follow-up:** Q-018 (compose), teammates' existing `.env` with `false`.

### 2769385 fix(credit): log processed events and warn when the consumer is off
- **When:** 2026-10-18 17:45 · **Slice:** fix · **Refs:** —
- **Changed:**
  - `credit-service/src/main.ts` — startup warning when `CREDIT_EVENTS_ENABLED` is off
  - `credit-service/src/api/credit-events.controller.ts` — `Credit event processed` log (eventId, eventType, replayed) after ACK
  - `credit-service/tests/unit/credit-events.controller.spec.ts` — duplicate settlement ACK test
- **Why:** a disabled consumer and successful or duplicate settlements were invisible in the logs, which made this bug hard to see and is needed for the D3 observability demo. Credit's default (`false`) is kept: order's relay now retries instead of dropping events, so nothing is lost while credit is off.
- **Verified:** `tsc --noEmit` clean; credit `test` 66/66; `test:integration` 31/31.
- **Follow-up:** none.
