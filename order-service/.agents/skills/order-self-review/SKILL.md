---
name: order-self-review
description: Run a pre-summary checklist over the slice's changes against the Definition of Done and the non-negotiables. Use after order-verify passes and before order-requirements-sync and order-change-summary.
---

# order-self-review

Review your own diff (`git diff` against the branch start). For each item answer yes, no or n/a. Fix every no, or park it with a reason.

## Scope and git
- [ ] Only files in the slice brief changed. No unrelated refactors or reformatting.
- [ ] Everything staged is under `order-service/`. `.agents/scripts/check-scope.sh` passes.
- [ ] No `git add -A`, no push, no force operations.
- [ ] Commits are small and conventional (`feat|test|docs|chore(order): ...`).

## Architecture
- [ ] Layering holds: api → application → domain; infrastructure implements ports. No Nest or Prisma imports in `src/domain`.
- [ ] The frontend never dictates lifecycle state; order-service decides it.
- [ ] No direct reads or writes of another service's tables. Cross-service effects go through contracts.
- [ ] Credit: reserve, adjust and release via HTTP and the journal; settlement only via the outbox; never both for one errand.

## Correctness
- [ ] Transitions come from the single transition table. Invalid transitions are rejected with 403 or 409.
- [ ] Persistence uses one conditional UPDATE with a version bump. Losers change nothing.
- [ ] History and outbox rows are written in the same transaction as the state change.
- [ ] Jobs are enqueued and notifications sent only **after** commit.
- [ ] Timers re-check state in the same transaction as the transition and use DB `now()`.
- [ ] Mutations are idempotent. A repeat applies the effect once.
- [ ] Nothing depends on an unanswered parked question.

## API and data
- [ ] API changes are additive only. Web-app-visible fields, status codes and DELETE are untouched.
- [ ] Migrations are additive and match `schema.prisma`.
- [ ] No tokens, secrets or personal data in logs, payloads, docs or the summary.

## Tests
- [ ] Required categories for this slice exist: transition matrix, real-Postgres race, idempotent replay, upstream failure.
- [ ] Coverage on domain and application is at or above 80% (once the script exists).
- [ ] The commands and results you will report are the ones you actually ran.

## Dependencies
- [ ] Any new dependency is pinned exactly, was in the slice brief, and has a one-line justification.

Write the findings (fixed, parked, none) in two or three lines for the change summary.

Hand off to: order-requirements-sync.
