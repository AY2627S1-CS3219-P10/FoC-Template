---
name: order-failure-injection
description: Test that order-service recovers when credit, the database, RabbitMQ or Redis fail mid-operation, with no dangling reservations and no duplicate effects. Use for create, edit, complete, release and timer slices.
---

# order-failure-injection

NFR5 says durably accepted critical state cannot be lost and retries stay consistent. These are the tests that prove it. Inject failures by wrapping the port or client, not by editing production code.

## Scenarios (from the Responsibilities doc, section 13)
1. **Crash after reserve, before the Order commit.** Reservation exists, errand row does not. Expect: the recovery worker either completes the creation or releases the reservation. No dangling reservation remains.
2. **Credit unavailable** (network error, 5xx). Expect: the operation stays PENDING and the API returns 202. After credit recovers, the recovery worker finishes it once.
3. **Credit returns 409 `CONCURRENT_OPERATION`.** Retryable. Expect: stays PENDING, then succeeds.
4. **Definitive 4xx from credit.** Expect: the operation is FAILED and the errand is not left half-created.
5. **Invalid response shape.** Expect `INVALID_SERVICE_RESPONSE` and a retry, never a crash or a wrong state.
6. **Broker down** (once the outbox exists). Expect: the state change commits, outbox rows stay unpublished, and a later relay run publishes them. `eventId` is unchanged.
7. **Redis wiped** (BullMQ). Expect: the sweeper re-enqueues overdue rows from Postgres.
8. **Service restart.** Expect: errand data persists and pending operations resume without manual repair.
9. **Retry the same command** (completion, release). Expect: no duplicate credit effect.

## Assertions
- No reservation without a matching errand, and no errand without its reservation, once recovery has run.
- Credit balances match the final errand state (query the credit app).
- Each external effect happened at most once.
- Logs show the failure and the recovery with the same correlation ID (see order-observability).

## Rules
- Test recovery through the real worker code path, not by calling internals directly.
- Never "fix" a failing test by catching the error and ignoring it. Ignoring an error code is only allowed where `docs/contracts/<svc>.md` says so.
- Settlement failures are different: settlement goes through the outbox, so test the broker-down and credit-dead-letter cases from order-domain-events, not an HTTP retry.

Hand off to: order-race-testing, order-verify.
