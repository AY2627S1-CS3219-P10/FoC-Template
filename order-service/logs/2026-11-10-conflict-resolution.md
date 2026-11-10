# Conflict resolution pass — 2026-11-10

## Summary

### Questions for you

None. The requested outcomes and eligibility rules resolve Q-014 in D-021.

### What changed

Requesters now submit a required statement atomically with DELIVERED → DISPUTED, and
the assigned courier can finalize one response. After both statements exist, an
administrator can refund the requester or pay the courier. Resolution uses the durable
operation journal and records RESOLVED only after Credit Service confirms its terminal
release or settlement. Statements, actors, timestamps and the final outcome remain
available; disputed and resolved audit records cannot be deleted.

### How it works

The API validates statements and outcomes, `PrismaOrderRepository` stores both parties'
statements, and `resolveDisputeIntent` locks one pending financial decision. `execute`
retries the Credit Service call idempotently, then `finishDisputeResolution` records the
outcome and history in one Order database transaction. Credit Service remains the only
balance and ledger writer.

### Try it

Use the errand detail page as requester and courier, then open Admin → Disputed errands.
Choose one outcome after both statements appear and confirm the irreversible decision.

### Tests

- `pnpm --filter @foc/order-service test`: 435 passed.
- Order typecheck, lint, format check and build: passed.
- Credit unit tests via the Windows-compatible direct Jest command: 66 passed.
- Focused conflict/dispute/lifecycle Playwright: 30 passed on desktop/mobile.
- Admin, errand, reporting and suspension regressions: 54 passed on desktop/mobile.
- Order database integration suite: attempted; Testcontainers could not find a running
  Docker runtime. The new PostgreSQL/Credit cases are committed but not executed here.

### Assumptions and risks

- A-021 Statements are trimmed and capped at 2,000 characters.
- D-021 permits synchronous internal settlement only for dispute resolution so Order can
  remain open until Credit confirms success; ordinary completion remains outbox-only.
- The database-backed race and recovery cases must be run after Docker Desktop starts.

### Next

Run `pnpm --filter @foc/order-service test:integration` with Docker Desktop running.

## Commits

No commits were created during this pass.
