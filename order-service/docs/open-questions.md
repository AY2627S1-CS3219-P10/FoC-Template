# Open questions (parking lot)

Procedure: `.agents/skills/order-open-questions/SKILL.md`.

- Add a question here instead of guessing. Write **no code that depends on the answer**.
- Each entry: Q-id, question, options + recommendation, what it blocks, what the agent
  did meanwhile, owner, status `OPEN` → `ANSWERED → D-NNN` (or `CLOSED` with a reason).
- Q-ids for conflicts reuse the conflict number (C3 → Q-003). New questions take the
  next free number from Q-016 upward.
- The change summary's "Questions for you" section lists every Q that is OPEN and owned
  by the user.

| Q | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| Q-003 | Courier cancel → CANCELLED or back to OPEN? | S8 | Nasif | ANSWERED → D-016 |
| Q-004 | 30-min reopen, 1-h pickup cancel, expiry clock | S8 | Nasif | ANSWERED → D-017 |
| Q-005 | One active errand per courier? | S4 (constraint only) | Nasif | OPEN |
| Q-006 | Rename IN_PROGRESS; expiry → EXPIRED or CANCELLED? | S3 (rename), S7 | Nasif | ANSWERED → D-013 |
| Q-007 | What does owner DELETE do once CANCELLED exists? | S7, S10 | Nasif | ANSWERED → D-014, D-015 |
| Q-008 | How is the errand category derived? | S7 | Nasif | ANSWERED → D-018 |
| Q-009 | Which pickup-location filters? | S2 (filter part) | Nasif | OPEN |
| Q-010 | Does order-service own notifications? | S9 | Nasif | OPEN |
| Q-011 | What may admin DELETE do after acceptance? | S6a (guard) | Nasif | OPEN |
| Q-012 | How to avoid the courier-no-credit-account loop? | S4 (check), S6a | Nasif | OPEN |
| Q-014 | How is a DISPUTED errand resolved? | S12 | Nasif | OPEN |
| Q-015 | Renumber D1 (FR10 ×2, FR9.1.3 ×2) | none (docs) | Team | OPEN |
| Q-016 | Confirm event naming `errand.<kebab>.v1` (D-004) | S6a | Team | OPEN |
| Q-017 | Correlation-ID header name across services | N1 | Nasif / team | OPEN |
| Q-018 | compose.yaml: give order-service RabbitMQ | S6a end-to-end run | Teammate (compose) | OPEN |
| Q-019 | Add dev dep `@testcontainers/rabbitmq@12.1.0` (lockfile `packages:` change)? | automated real-broker test | Nasif | OPEN |
| Q-020 | May a courier cancel after pickup, and what happens to goods and credits? | courier cancel from PICKED_UP | Nasif | OPEN |

---

### Q-003 — Courier cancellation outcome (C3)
- **Status:** ANSWERED → D-016 (option A, plus: courier cancel from PICKED_UP is 409, see Q-020).
- **Options:** (A) ACCEPTED → OPEN, reason + history, the cancelling courier is blocked
  from re-accepting (Resp). (B) ACCEPTED → CANCELLED + credit release (D1 FR9.1.2).
- **Recommendation:** A.
- **Blocks:** S8. **Meanwhile:** nothing built for courier cancel.

### Q-004 — Remaining timers (C4)
- **Status:** ANSWERED → D-017 (30-min reopen with exclusion, no 1-h timer, expiry from `createdAt`, never reset).
- **Options:** for each — 30-min ACCEPTED → OPEN: adopt / drop; 1-h PICKED_UP →
  CANCELLED: adopt / drop; FR8.2 expiry measured from `createdAt` / from last reopen.
- **Recommendation:** adopt 30-min, drop 1-h, measure from `createdAt`.
- **Blocks:** S8.

### Q-005 — One active errand per courier (C5)
- **Options:** (A) enforce with a partial unique index on `courier_id` for
  ACCEPTED/PICKED_UP/DELIVERED/DISPUTED. (B) no limit.
- **Recommendation:** A.
- **Blocks:** only the constraint in S4. **Meanwhile:** S4 builds the race-safe accept
  without it; the rule stays one isolated check.

### Q-006 — Status enum (C6)
- **Status:** ANSWERED → D-013 (rename to PICKED_UP; expiry ends in EXPIRED).
- **Options:** (1) rename `IN_PROGRESS` → `PICKED_UP` / keep both; (2) expiry ends in
  `EXPIRED` / `CANCELLED`.
- **Recommendation:** rename; `EXPIRED`.
- **Blocks:** the rename in S3; S7. **Meanwhile:** S3 may add PICKED_UP and DISPUTED as
  new values.

### Q-007 — DELETE vs cancel (C7)
- **Status:** ANSWERED → D-014 (option B), D-015 (cancel from OPEN and ACCEPTED).
- **Options:** (A) keep DELETE as soft-delete, add `POST …/cancel`. (B) owner DELETE sets
  CANCELLED (same route/response), plus `POST …/cancel`.
- **Recommendation:** B.
- **Blocks:** S7, S10.

### Q-008 — Category (C8)
- **Status:** ANSWERED → D-018 (option B: requester-chosen `itemType`, FOOD 2 h / NON_PERISHABLE 24 h, default NON_PERISHABLE; not derived from supplier category).
- **Options:** (A) derive from supplier category (FOOD, FOOD_COFFEE → 2 h; PRINTING,
  SHOPPING → 24 h) and snapshot it. (B) new optional request field.
- **Recommendation:** A now.
- **Blocks:** S7.

### Q-009 — Pickup-location filter (C9)
- **Options:** (A) optional `pickupLocationId` and `q` (supplier name / label). (B) wait
  for supplier-service to expose address line / postal code.
- **Recommendation:** A.
- **Blocks:** the filter part of S2. **Meanwhile:** availability/exclusion parts proceed.

### Q-010 — Notifications owner (C10)
- **Options:** (A) order-service table + API + Socket.IO hint. (B) separate service later.
- **Recommendation:** A.
- **Blocks:** S9.

### Q-011 — Admin DELETE after acceptance (C11)
- **Options:** (A) admins may only hide (no credit call) once status ≥ PICKED_UP; release
  allowed only for OPEN/ACCEPTED. (B) forbid admin DELETE after OPEN entirely.
- **Recommendation:** A.
- **Blocks:** the guard in S6a. **Meanwhile:** S6a builds outbox/relay/confirm.

### Q-012 — Courier credit account (C12)
- **Options:** (A) check `GET /v1/credit-accounts/{courierId}` with the courier's JWT at
  accept; 404 → 409 `COURIER_CREDIT_ACCOUNT_REQUIRED`. (B) ask credit owner to change
  404 handling. (C) ask user-service to publish `user.verified.v1`.
- **Recommendation:** A now, raise C with the team.
- **Blocks:** the check in S4; S6a end-to-end.

### Q-014 — Dispute resolution (C14)
- **Options:** (A) admin `POST …/resolve-dispute` with PAY_COURIER / REFUND_REQUESTER.
  (B) requester withdraws the dispute → COMPLETED. (C) both.
- **Recommendation:** C, no deadline.
- **Blocks:** S12 only. **Meanwhile:** disputed errands hold credits.

### Q-015 — D1 numbering (C15)
Team action: renumber the second FR10 block and the second FR9.1.3.

### Q-016 — Event naming (D-004)
- **Options:** `errand.picked-up.v1` (credit's style) / `ErrandPickedUp` (tech-stack.md).
- **Recommendation:** dotted lowercase; credit already consumes `errand.completed.v1`.

### Q-017 — Correlation-ID header
- **Options:** `x-correlation-id` (credit already reads and echoes it in
  `credit-service/src/api/correlation-id.interceptor.ts`) / W3C `traceparent`.
- **Recommendation:** `x-correlation-id` over HTTP and as an AMQP message header.
- **Blocks:** N1.

### Q-018 — compose.yaml RabbitMQ wiring (external)
Owner: whoever maintains the root `compose.yaml`. The ready-to-send message is in
`docs/events.md` → "External dependency". Blocks only running S6a end-to-end in
Docker; local dev can point `RABBITMQ_URL` at `127.0.0.1:5672`.

### Q-019 — RabbitMQ testcontainer dependency
- **Status:** OPEN · **Related:** S6a, D-011
- **Question:** may order-service add the dev dependency `@testcontainers/rabbitmq@12.1.0`?
  Unlike `amqplib` it is new to the workspace, so the root `pnpm-lock.yaml` would also
  change in its shared `packages:`/`snapshots:` sections, outside what D-011 allows.
- **Options:** (A) approve it and widen D-011 for this package; (B) keep the fake-channel
  relay tests plus the manual real-broker check (current state).
- **Recommendation:** A. A committed real-broker test is stronger evidence for D3.
- **Blocks:** only an automated real-broker test.
- **Done meanwhile:** relay tested against an in-memory confirm channel (envelope, headers,
  confirm-before-mark, retry with the same eventId); verified once by hand against
  `rabbitmq:4.2-management-alpine`.

### Q-020 — Courier cancel after pickup
- **Status:** OPEN · **Related:** D-016, Q-014
- **Question:** may the assigned courier cancel a PICKED_UP errand, and if so what happens
  to the goods already collected and to the reserved credits?
- **Options:** (A) never; the courier must deliver, and problems go through a dispute.
  (B) allow PICKED_UP → OPEN with exclusion, credits stay reserved (goods problem left to
  the users). (C) allow PICKED_UP → CANCELLED with a full release to the requester.
- **Recommendation:** A until dispute resolution (Q-014) exists; B and C both move goods
  or credits without anyone confirming what happened.
- **Blocks:** only courier cancel from PICKED_UP.
- **Done meanwhile:** courier cancel works from ACCEPTED; from PICKED_UP it returns 409
  `ERRAND_INVALID_TRANSITION`.
