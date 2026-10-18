# 2026-10-18 · UI · Courier username on errand details
Branch `courier-username` (from `origin/main`) · Agent: Claude Code (Claude Opus 5.5)

## Summary
The errand detail page showed the courier as a raw account UUID. order-service now
returns `courierUsername` next to `requesterUsername`, and web-app displays it. The user
lifted the order-service-only rule for UI work, so this pass also changes `web-app/` and
runs on its own branch rather than `order-system`; `check-scope.sh` therefore reports
the branch name as its only failure.

Known gap, not caused by this pass: `web-app/tests/e2e/errands.spec.ts` "create an
errand and refresh its listing" fails on `origin/main`, because `7a6022b` added the
building to the pickup option label but the test still expects "Cafe · Floor 1".

## Commits
### 9ac33a1 feat(order): return courierUsername on errand details and lifecycle actions
- **When:** 2026-10-18 17:20 · **Slice:** UI · **Refs:** contract `docs/contracts/web-app.md`
- **Changed:**
  - `src/application/order.service.ts` — `find()` resolves requester and courier names in parallel
  - `src/api/dto.ts` — `courierUsername` on `ErrandResponse`; both names typed `string` in OpenAPI
  - `tests/integration/errands.spec.ts` — identity stub echoes the requested id, 404s unknown accounts; new null-case test
  - `docs/contracts/web-app.md` — field and display rule
- **Why:** couriers were shown by id. Resolving in order-service mirrors the existing
  requester lookup and keeps the browser away from user-service identity calls. A
  deleted courier account yields null instead of failing the whole read.
- **Verified:** `db:generate`, `typecheck`, `lint`, `format:check` clean; `test` 349/349;
  `test:integration` 61/61.
- **Follow-up:** lists and `ErrandOperation.errand` still carry no usernames (not needed by the UI today).

### 8fdb5c9 fix(web-app): show the courier's username instead of their account id
- **When:** 2026-10-18 17:20 · **Slice:** UI · **Refs:** —
- **Changed:**
  - `web-app/src/features/errands/errand-detail.tsx` — Courier row: own name, `courierUsername`, or "Unavailable user"
  - `web-app/src/services/contracts.ts` — `courierUsername` on `Errand`
  - `web-app/tests/e2e/errand-lifecycle.spec.ts` — asserts the three cases and that the id is never shown
- **Why:** matches the Requester row's existing fallback rule.
- **Verified:** web-app `lint`, `typecheck`, `build` clean; Playwright `errand-lifecycle.spec.ts`
  10/10 (desktop + mobile); `errands.spec.ts` 22/24 — the 2 failures are the pre-existing
  label mismatch above.
- **Follow-up:** none.
