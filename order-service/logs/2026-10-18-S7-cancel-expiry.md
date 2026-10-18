# 2026-10-18 · S7/S8 · Cancel, courier cancel, reopen timer and expiry
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

Slices in this pass: A status model (IN_PROGRESS removed), B requester cancel, C courier
cancel + exclusions, D 30-minute reopen, E item type + expiry, F race tests, plus
Postman requests and `docs/demo-timers.md` for the manual D3 demo.

## Summary
_Written at the end of the pass by `order-change-summary`._

## Commits

### 8e10e87 docs(order): record cancel, expiry and timer answers (D-013..D-020, Q-020)
- **When:** 2026-10-18 13:47 · **Slice:** — · **Refs:** D-013..D-020, Q-003/4/6/7/8, Q-020
- **Changed:**
  - `docs/decisions.md` — D-013..D-020 with the user's wording quoted
  - `docs/open-questions.md` — Q-003/4/6/7/8 ANSWERED; new Q-020 (courier cancel after pickup)
  - `docs/conflicts.md` — C3, C4, C6, C7, C8 DECIDED
  - `docs/roadmap.md` — S7 READY, S8 PARTIAL
- **Why:** decisions are recorded before any code so every later commit can point at them; D-018 replaces the brief's supplier-category default with the user's own answer (requester-chosen item type).
- **Verified:** docs only.
- **Follow-up:** Q-020.

### a2fcc3c feat(order): remove IN_PROGRESS, add cancel/expiry rows and CANCELLED/EXPIRED checks (D-013)
- **When:** 2026-10-18 13:53 · **Slice:** A · **Refs:** D-013..D-017, D-020
- **Changed:**
  - `migrations/202610180007_status_model` — IN_PROGRESS rows → PICKED_UP, enum rebuilt without it; new `expired_at`; CHECKs `errands_cancelled_state`, `errands_expired_state`, `errands_closed_unassigned`
  - `src/domain/lifecycle.ts` — rows for `cancel` (OPEN, ACCEPTED), `courier-cancel`, `reopen`, `expire`, with `releasesCredits` / `releasesCourier` / `excludesCourier` flags; DISPUTED has no row out
  - `src/infrastructure/order.repository.ts` — `transition()` refuses credit-releasing rows (they must use the journal); optional stamp
  - `src/api/dto.ts` — status enum from `ERRAND_STATUSES`, `expiredAt`
  - tests — 320-cell matrix, flag lists, CHECK cases for the new states
- **Why:** the brief asked for `RENAME VALUE`, but PICKED_UP already exists, so Postgres would refuse it; rebuilding the type is the only way to remove IN_PROGRESS (A-010). All rows go in the domain table first so later slices only add persistence.
- **Verified:** `typecheck`, `lint` clean; `pnpm test` 344 passed; `pnpm test:integration` 43 passed; migration applied by hand to a Postgres 17 DB holding an OPEN row, an IN_PROGRESS row and its history row → PICKED_UP, constraints and indexes recreated.
- **Follow-up:** none.
