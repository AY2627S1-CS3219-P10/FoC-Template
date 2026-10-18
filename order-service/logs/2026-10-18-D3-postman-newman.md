# 2026-10-18 · D3 · Postman collection run with Newman, credit and timer checks
Branch `courier-username` · Agent: Claude Code (Claude Opus 5.5)

## Summary
Ran the Postman collection headless with Newman against the full local stack before
the D3 demo, then extended it with credit-service balance checks. No service bug was
found, so no order-service code changed. Nothing pushed.

- **Stack:** all containers healthy, all five services up, 14/14 order migrations
  applied. order-service was restarted with `ORDER_EVENTS_ENABLED=true` (git-ignored
  `.env`; it had been `false`, leaving one `errand.completed.v1` unpublished, which the
  relay then delivered and credit-service settled once).
- **Accounts:** requester `nasif.hasan`, courier `e1366622`, stranger / second courier
  `e1454249` (registered and verified by the user; credit-service opened its account
  from `user.verified.v1`), admin `admin1` from user-service's admin seed. Credentials
  were passed with `--env-var` from a file outside the repo.
- **Baseline (collection unchanged):** 53 requests, 91/91 assertions passed.
- **After this pass:** 65 requests (67 executed with two settlement-poll retries),
  121/121 assertions passed.
- **Timers** (not in the collection, it cannot run SQL): a scratch script aged three
  errands with the SQL in `docs/demo-timers.md` and checked order and credit APIs,
  18/18 checks passed: 30-min reopen (courier cleared, `expiresAt` unchanged, same
  courier 403 `ERRAND_COURIER_EXCLUDED`, another courier 200), expiry (reservation
  released), 4 h auto-complete (`AUTO_TIMEOUT`, one outbox row, courier paid once).
- `check-scope.sh --no-code` fails only on the branch name (it expects `order-system`).
- Not run this pass: `test:integration`, lint (no code changed). `typecheck` and
  `test` (349/349) passed.

## Commits
### 3dd7c37 test(order): assert credit balances in the Postman collection
- **When:** 2026-10-18 17:41 · **Slice:** D3 · **Refs:** Q-012, D-001
- **Changed:**
  - `postman/order-service.postman_collection.json` — balance snapshot in 0 Setup; checks in folders 2 and 4; new folder 5 reconciliation
  - `postman/foc-local.postman_environment.json` — `creditUrl`
  - `postman/README.md` — folder 5, account and credit setup, Newman command with credentials outside the repo
  - `docs/demo-timers.md` — how to check balances after ageing, expected deltas per timer
- **Why:** the collection proved order-service responses but not that credits moved.
  Balances come from credit-service, the source of truth, as deltas from a snapshot so
  existing errands do not matter. Settlement is asynchronous, so the courier checks
  poll (up to 15 × 1 s) instead of sleeping a fixed time.
- **Verified:** Newman 6.2.3 (`npx -y newman@6.2.3 run … --env-var …`): 67 executed,
  121/121 assertions; the committed file matches the run request for request.
- **Follow-up:** each run spends 10 of the requester's credits and there is no top-up
  route; swap requester and courier in the environment when it runs low.
