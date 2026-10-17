# 2026-10-18 · D3 · Order lifecycle, events, containers and Postman
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: S1 (credit cap), N1 (correlation ids), S3–S6b (lifecycle, accept,
pickup/deliver/dispute, confirm + outbox, auto-complete), requester cancel, Docker,
Postman.

## Summary
_Written at the end of the pass by `order-change-summary`._

## Commits

### a77af2f fix(order): cap offered credits at credit-service's 10M limit
- **When:** 2026-10-18 06:26 · **Slice:** S1 · **Refs:** K1, FR3.1.1, NFR9
- **Changed:**
  - `src/domain/errand.ts` — `MAX_OFFERED_CREDITS = 10_000_000`, used by `CreateErrandDto`/`EditErrandDto`
  - `migrations/202610180001_credit_cap` — DB CHECK narrowed from 2e9 to 10M
  - `tests/unit/dto.spec.ts` — 10M accepted, 10M+1 rejected on create and edit
  - `tests/jest-coverage.json`, `package.json` — `test:coverage` runs unit + integration, 80% gate on domain/application
- **Why:** credit-service rejects amounts above 10M, so larger bounties always ended as FAILED operations after a round trip; rejecting at the edge gives a clear 400 instead.
- **Verified:** `typecheck`, `lint`, `format:check` clean; `test:coverage` → 35/35 passed, statements 95.8%, branches 82.8%.
- **Follow-up:** none.
