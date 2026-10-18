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
coding pass ends with a committed summary (location amended by D-012); a claude.ai
Artifact of it is optional (Claude agents only) and the markdown is authoritative.

### D-011 · 2026-10-18 · ACCEPTED
**Root lockfile exception.** When a slice adds a dependency to order-service, the root
`pnpm-lock.yaml` may change, but only inside its `order-service` importer section.
`check-scope.sh --allow-lockfile` enforces this. First use: `amqplib@0.10.9` and
`@types/amqplib@0.10.8` (same versions as credit-service) for the RabbitMQ relay.
Source: user answer on 2026-10-18.

### D-012 · 2026-10-18 · ACCEPTED
**Logs.** After every commit an agent appends a short entry (what changed, why, how it was
verified) to the pass log in `order-service/logs/`; the end-of-pass summary is written at
the top of the same file (`order-commit-log`, `order-change-summary`). Replaces the
`docs/changes/` location from D-010. Source: user request on 2026-10-18.

### D-013 · 2026-10-18 · ACCEPTED
**There is no IN_PROGRESS state; expiry ends in EXPIRED.** `IN_PROGRESS` is removed from
the `ErrandStatus` enum, code, tests, DTOs and docs; any row in it moves to `PICKED_UP`.
An errand nobody accepts in time ends as `EXPIRED`, a terminal state distinct from
`CANCELLED`. User: "there is no IN_PROGRESS state. Rename it to PICKED_UP … An errand
nobody accepts in time ends as EXPIRED." Resolves C6 / Q-006.

### D-014 · 2026-10-18 · ACCEPTED
**Owner DELETE cancels; `POST /api/errands/:id/cancel` is the canonical route.** When the
requester calls `DELETE /api/errands/:id`, the errand becomes `CANCELLED` on the same
route with the same response shape (web-app keeps working and keeps showing its own
"Errand deleted" text); the record stays visible to the requester. `POST …/cancel` does
the same. Admin DELETE is unchanged (still soft-delete, Q-011 parked). User: Q-007
"option B". Resolves C7 / Q-007.

### D-015 · 2026-10-18 · ACCEPTED
**Requester cancel is allowed from OPEN and ACCEPTED only.** From PICKED_UP onward it is
409. Cancel releases the whole reserved amount to the requester over HTTP through the
`ErrandOperation` journal (D-001). Cancelling an ACCEPTED errand also releases the
courier: `courier_id`/`accepted_at` are cleared so they can no longer act on it, and the
history row keeps who they were. User: "a requester can cancel after acceptance but not
after PICKED_UP"; asked to clarify, chose "OPEN and ACCEPTED" and "full release to
requester". Overrides the earlier default of cancelling from OPEN only. Amends D1 FR8.1
(OPEN only).

### D-016 · 2026-10-18 · ACCEPTED
**Courier cancel: ACCEPTED → OPEN, and that courier can never accept this errand again.**
The credit reservation stays (the errand is still open). The courier is recorded in
`errand_excluded_couriers`; they can still accept other errands. Courier cancel from
PICKED_UP is 409 and the rules after pickup are parked as Q-020. User: "if the assigned
courier cancels, the errand goes back to OPEN and that courier can never accept this
errand again." Resolves C3 / Q-003. Amends D1 FR9.1.2 (which says CANCELLED).

### D-017 · 2026-10-18 · ACCEPTED
**Timers.**
- An ACCEPTED errand not picked up within **30 minutes** of `accepted_at` reopens (back
  to OPEN). It has the same effect as a courier cancel, including the exclusion. User:
  "30 minute reopening does in fact block that particular courier from taking that
  particular errand again, but they can pick other errands".
- Expiry deadlines are counted from `createdAt` and **never reset** on reopen; a reopened
  errand has less time left. Only OPEN errands expire.
- There is **no 1-hour** PICKED_UP timer.
- The 4-hour DELIVERED auto-complete (D-008) is unchanged.
Resolves C4 / Q-004.

### D-018 · 2026-10-18 · ACCEPTED
**Errand item type, chosen by the requester at creation, sets the expiry length.**
`itemType` ∈ `FOOD` (perishable, expires 2 h after `createdAt`) | `NON_PERISHABLE`
(generic item, 24 h). Optional on create; default `NON_PERISHABLE`. Stored on the errand
with `expires_at` computed once at creation. It is **not** derived from the supplier
category anywhere. User: "the 2 hour and 24 hour split is based on user input for the
errand type (and this is decided by the user when they are making the item, they get to
choose an option on whether it is food, or whether it is just a generic non-perishable
item, default is the non perishable item, so the default expiry is 24 hours)". Resolves
C8 / Q-008 (option B). The 2 h exists so food does not spoil; 24 h because a requester
cannot wait longer.

### D-019 · 2026-10-18 · ACCEPTED
**Cancel and expiry release credits over HTTP; settlement stays outbox-only.** Expiry
releases the whole reservation the same way as cancel (journal, HTTP). User: "Expiry
does in fact release credits". Cancellation releases credits "for now" (user wording).
D-001 is unchanged: never both paths for one errand.

### D-020 · 2026-10-18 · ACCEPTED
**Dispute only from DELIVERED; DISPUTED stays a dead end.** Confirm and dispute both
happen within the 4 h window; if neither happens the errand auto-completes. DISPUTED
holds the credits and has no way out until Q-014 is answered. No resolution is built.
Restates D-007/D-008 for this pass.
