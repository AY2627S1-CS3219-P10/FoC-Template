# Decisions log (append-only)

This file is the **highest source of truth** for order-service. It wins over D1, the
Responsibilities doc, and anything an agent infers. Never edit an existing entry;
supersede it with a new one.

Source order when things disagree:

1. `docs/decisions.md` (this file)
2. D1 — CS3219 Project Milestone 1 Product Backlog (latest version), the graded document
3. "Order Service Responsibilities & Integration Contract" — fills gaps D1 leaves; a
   contradiction with D1 becomes a conflict in `conflicts.md`
4. Other services' source code (read-only) — authority on their contracts

Format: `D-NNN` · date · status · decision · reason · resolves.

---

### D-001 · 2026-10-15 (amended 2026-10-18) · ACCEPTED
**Settlement goes only through the outbox; reserve/adjust/release only through HTTP.**

- When an errand reaches COMPLETED, order-service writes `errand.completed.v1` to its
  own transactional outbox in the same DB transaction as the status change. A relay
  publishes it to RabbitMQ (`foc.events`). Credit Service consumes it and settles.
- Reserve, adjust and release are HTTP calls through the existing `ErrandOperation`
  journal (`src/infrastructure/order.repository.ts` `PrismaOrderRepository.execute`).
- Order-service **never** calls `POST /v1/credit-reservations/:errandId/settlement`.
- Never use both paths for the same credit effect on one errand.

**Why:** Credit already consumes `errand.completed.v1` idempotently
(`credit-service/src/api/credit-events.handler.ts` `CreditEventsHandler`), and the team
rule is "transactional outbox for critical cross-service events" (root `AGENTS.md`).
Credit has **no** `errand.cancelled` consumer, so release must stay HTTP. Two paths
for one effect could double-apply or race (HTTP release vs event settle). Do not
"unify" them.

### D-002 · 2026-10-15 · ACCEPTED
**Branch and commit rules.** Work directly on `order-system`. Small, conventional
commits (`feat|fix|test|docs|chore(order): …`) staging explicit `order-service/…`
paths only. Never `git add -A`. Never push without the user's explicit confirmation.
Only files under `order-service/` may change.

### D-003 · 2026-10-15 · SUPERSEDED by D-009
Conflicts decided per conflict by stopping and asking.

### D-004 · 2026-10-15 · PROPOSED
**Event naming** `errand.<kebab-case-event>.v<N>` (e.g. `errand.picked-up.v1`), matching
credit's `credit.reservation-adjusted.v1`. `docs/tech-stack.md` shows PascalCase
examples (`ErrandCompleted`), but the only working implementation (credit) uses dotted
lowercase. Needs team confirmation (see Q-016).

### D-005 · 2026-10-18 · ACCEPTED
**The assigned courier marks PICKED_UP → DELIVERED** and `deliveredAt` is recorded.
Amends D1 FR7.2 / FR7.2.1 (which give this to the requester). Resolves C1.

### D-006 · 2026-10-18 · ACCEPTED
**The requester confirms DELIVERED → COMPLETED.** The requester may also confirm early,
PICKED_UP → COMPLETED. Resolves C13 (D1 has no confirm step).

### D-007 · 2026-10-18 · ACCEPTED
**The requester can dispute DELIVERED → DISPUTED.** Entering DISPUTED moves no
credits; the reservation stays RESERVED. How a dispute is resolved is still open (C14).
Resolves C2.

### D-008 · 2026-10-18 · ACCEPTED
**4-hour auto-complete.** If an errand is still DELIVERED 4 hours after `deliveredAt`,
the system moves it to COMPLETED. Store `completionMethod` = `REQUESTER_CONFIRMED` |
`AUTO_TIMEOUT`. `completionMethod` lives in the DB, never in the `errand.completed.v1`
payload. Resolves the 4-hour part of C4.

D-005..D-008 follow §5 of the Responsibilities doc; the user confirmed on 2026-10-18
that this lifecycle is the correct one.

### D-009 · 2026-10-18 · ACCEPTED
**Park-and-continue.** Agents do not stop on every uncertainty. Three tiers (hard stop /
park / decide-and-note), defined in `.agents/skills/order-open-questions/SKILL.md`.
Parked items go to `docs/open-questions.md`; the agent keeps working on unblocked
parts and asks the user in a batch at the end of the pass. Supersedes D-003.

### D-010 · 2026-10-18 · ACCEPTED
**Agent tooling location.** Skills and agent references live in `order-service/.agents/`.
`order-service/AGENTS.md` is canonical; `CLAUDE.md` and `GEMINI.md` point to it. Every
coding pass ends with a committed summary in `docs/changes/`; a claude.ai Artifact of
it is optional (Claude agents only) and the markdown is authoritative.
