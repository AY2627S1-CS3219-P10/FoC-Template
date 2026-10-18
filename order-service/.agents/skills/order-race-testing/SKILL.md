---
name: order-race-testing
description: Write concurrency tests that fire N parallel requests at real Postgres and prove exactly one winner and no side effects for losers. Use for accept, confirm vs dispute vs auto-complete, cancel and timer races.
---

# order-race-testing

Concurrency is graded (FR6, NFR9). These tests must run against **real Postgres**, never a mock, because the guarantee comes from the conditional UPDATE.

## Harness
- Use the same in-process app and Postgres setup as `tests/integration/errands.spec.ts`.
- Create the errand and the actors first, then fire the requests together with `Promise.all`. Use N between 10 and 20.
- No `sleep`. Synchronise with `Promise.all`. For timers, call the job handler directly instead of waiting.

## Assertions (all of them)
1. **Exactly one** request succeeds.
2. Every loser gets the documented error (409 for a lost race or wrong state, 403 for a wrong actor).
3. The final row has the expected status, the winner's courier (for accept), and `version` increased by exactly 1.
4. The history table has exactly one new row for the transition.
5. The outbox has exactly one new row (when the transition emits an event), with the expected `eventId` and payload.
6. **Losers changed nothing**: no credit balance change (query the credit app), no extra history or outbox rows, no job enqueued.

## Mixed races (S5/S6)
For DELIVERED, run confirm, dispute and the 4-hour job handler together. Exactly one wins, the others see a changed status and do nothing. Repeat for PICKED_UP: early confirm vs deliver.

## Reliability
- Run the race a few times in a loop (for example 5 rounds with fresh errands) so a flaky guard shows up.
- If the test is flaky, the code is wrong. Do not add retries or sleeps to the test.

## Also cover
- Same user sending the same request twice in parallel (idempotency).
- A soft-deleted errand or one with a pending operation is not transitioned.

Hand off to: order-failure-injection (for crash cases) or order-verify.
