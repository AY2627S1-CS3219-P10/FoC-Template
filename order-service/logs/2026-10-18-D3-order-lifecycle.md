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

### f2c4b61 feat(order): propagate x-correlation-id through logs, credit calls and retries
- **When:** 2026-10-18 06:28 · **Slice:** N1 · **Refs:** NFR8, Q-017
- **Changed:**
  - `src/infrastructure/correlation.ts`, `src/api/correlation.middleware.ts` — reuse a valid inbound `x-correlation-id` or generate one, keep it in AsyncLocalStorage, echo it in the response
  - `src/app.module.ts` — middleware on all controllers; pino logs now include `service`, ISO `timestamp`, `severity`, `correlationId`
  - `src/infrastructure/service-clients.ts` — forwards the id on every user/supplier/credit call
  - `prisma/schema.prisma`, `migrations/202610180002_operation_correlation`, `order.repository.ts` — id stored on journal operations; recovery-worker retries reuse it
  - `tests/unit/correlation.spec.ts`, one integration test — id reaches credit's ledger row and the stored operation
- **Why:** NFR8 wants one id across the create and complete flows, and the demo needs a single id to follow a request from order into credit logs and ledger. Using credit's existing header name avoids a new convention.
- **Verified:** `typecheck`, `lint` clean; 16 unit and 23 integration tests passed.
- **Follow-up:** header name still to be confirmed with the team (Q-017); the AMQP-header half arrives with the outbox (S6a).

### 474865f docs(order): add handoff for the next agent session and N1 log entry
- **When:** 2026-10-18 06:32 · **Slice:** — · **Refs:** D-012
- **Changed:**
  - `logs/HANDOFF-2026-10-18.md` — state, decisions, next steps and parked questions for the next agent session
  - `logs/2026-10-18-D3-order-lifecycle.md` — entry for `f2c4b61`
  - `.agents/README.md` — start-of-task step now reads the newest handoff
- **Why:** the pass continues in a fresh session; one file gives it the facts without re-deriving them from the diffs.
- **Verified:** docs only.
- **Follow-up:** none.
