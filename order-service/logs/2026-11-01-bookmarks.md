# Courier bookmarks — 2026-11-01

## Summary

### Questions for you
None.

### What changed
Couriers can star/unstar errands and select Starred errands on the errands page.
Stars are private, persistent PostgreSQL records. Filtering happens before
sorting/pagination, and stars are restored across reloads. Saves have disabled
pending controls and errors that preserve the previous state.

### How it works
Next.js same-origin cookie-authenticated routes forward to the Order controller,
application service and repository. `errand_bookmarks` has a composite key and a
user index. Repeated saves/removals are idempotent. Hidden/deleted/pending errands
are omitted from the starred view using the existing public/participant access
rules. No credit effects, dependencies or lifecycle changes.

### Try it
Run `pnpm --filter @foc/order-service db:migrate` against the configured database
before starting the updated order service. Log in, open Errands, click Star on a
card, then Starred errands. Reload to restore stars; Unstar removes the entry.

### Tests
- `pnpm --filter @foc/order-service db:generate`: passed.
- `pnpm --filter @foc/order-service typecheck`: passed.
- `pnpm --filter @foc/order-service test`: 381 tests passed, eight suites.
- Order lint and format checks, web typecheck/lint: passed.
- `pnpm --filter @foc/web-app build`: passed outside sandbox (worker spawn EPERM inside).
- `pnpm --filter @foc/web-app test:e2e -- bookmarks.spec.ts errands.spec.ts`:
  28 passed across desktop and mobile, including six new bookmark checks.
  An initial run had two ambiguous alert selector failures; corrected to target
  the visible save error rather than Next.js's hidden route announcer.
- `pnpm --filter @foc/order-service test:integration --testNamePattern='persists private bookmarks'`:
  failed at infrastructure setup, no working container runtime. The pnpm script
  ran the integration suite; Docker Desktop's engine is unavailable.
  Migration application to fresh/existing databases remains unverified.

### Assumptions and review
- A-001: saved errands retain the existing public/participant visibility rules;
  inaccessible stars remain stored and can reappear if an errand reopens.
- A-002: current branch `N2H-Bookmarking` and frontend/backend scope follow the
  explicit user request, overriding older service-only branch/scope guidance.
- Additive API/schema reviewed; no unrelated changes or new dependencies.
- No commits or pushes made. Migration has not been applied to the local database.

### Next
Start Docker Desktop, run database integration tests, then apply the migration.
Unrelated next READY roadmap item remains S1 Hygiene.

## Follow-up — 2026-11-02

User requested no stars on expired errands or My deliveries, and automatic
removal of completed/expired errands from starred results. Server filtering
now excludes both terminal statuses before pagination; saving either returns
409. UI hides controls in deliveries and for completed/expired cards, and
filters terminal saved cards defensively. Existing 20-second polling updates
the starred view without clearing the board.

Validation: 383 unit tests passed; targeted real-PostgreSQL bookmark integration
test passed (94 unrelated tests skipped); ten desktop/mobile browser checks
passed. Type checks and lint passed. Migration was applied during startup.
The first integration attempt used an incomplete completed-state fixture;
corrected its assignment/timestamps and reran successfully.
