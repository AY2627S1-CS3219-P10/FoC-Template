# Conflict register

A conflict is a place where the sources disagree, or where existing code contradicts a
requirement. Agents **never guess** an OPEN conflict: they park it (see
`open-questions.md`) and keep working on what does not depend on it.

Abbreviations: **D1** = latest Product Backlog; **Resp** = Order Service
Responsibilities & Integration Contract.

Status values: `OPEN` · `PARTIAL` (some of it decided) · `DECIDED → D-NNN` ·
`OPEN (team)` (needs the whole team, not just the user).

| ID | Topic | Status | Question |
|---|---|---|---|
| C1 | Who marks DELIVERED | DECIDED → D-005 | — |
| C2 | Does DISPUTED exist | DECIDED → D-007 | — |
| C3 | Courier cancellation outcome | OPEN | Q-003 |
| C4 | Timers | PARTIAL (4h → D-008) | Q-004 |
| C5 | One active errand per courier | OPEN | Q-005 |
| C6 | Existing status enum vs new lifecycle | OPEN (narrowed) | Q-006 |
| C7 | Existing DELETE vs FR8 cancel | OPEN | Q-007 |
| C8 | Errand categories vs supplier categories | OPEN | Q-008 |
| C9 | Pickup-location filter fields | OPEN (re-check) | Q-009 |
| C10 | Who owns notifications | OPEN | Q-010 |
| C11 | Admin DELETE beyond OPEN vs settlement | OPEN | Q-011 |
| C12 | Courier credit account at accept | OPEN | Q-012 |
| C13 | D1 lacks a confirm step | DECIDED → D-006 | — |
| C14 | How DISPUTED is resolved | OPEN | Q-014 |
| C15 | D1 numbering duplicated | OPEN (team) | Q-015 |

---

## C1 — Who marks DELIVERED · DECIDED → D-005
- **D1 FR7.2 / FR7.2.1:** the requester marks PICKED_UP → DELIVERED.
- **Resp §5:** the assigned courier confirms delivery PICKED_UP → DELIVERED.
- **Decision:** courier (D-005). D1 needs amending (see requirements.md "D1 amendments").

## C2 — Does DISPUTED exist · DECIDED → D-007
- **D1:** no DISPUTED status anywhere.
- **Resp §2, §5:** DELIVERED → DISPUTED by the requester; no automatic settle/release.
- **Decision:** yes (D-007). Resolution rules are C14.

## C3 — Courier cancellation outcome · OPEN
- **D1 FR9.1.2:** a courier cancellation request sets the errand to **CANCELLED**.
  FR9.1.3 (first) releases credits to the requester and frees the courier.
- **D1 FR9.1.3 (second):** the cancelling courier may not accept "that same request if
  it is re-created or re-listed" — which only makes sense if the errand can come back.
- **Resp §5, §7:** courier cancel is ACCEPTED → **OPEN** (re-listed), reason required,
  assignment history kept, same courier blocked from re-accepting.
- **Impact:** S8. CANCELLED means a credit release (HTTP journal); OPEN means no credit
  effect and a block-list of couriers per errand.
- **Recommendation (non-binding):** ACCEPTED → OPEN with reason + history + block-list;
  the requester can then cancel via FR8 if they want their credits back. It satisfies
  both "re-listed" and Resp, and avoids an unrequested refund.

## C4 — Timers · PARTIAL
- **4-hour DELIVERED → COMPLETED:** DECIDED → D-008.
- **Still OPEN:**
  - Resp §7 "30-min no pickup": ACCEPTED → OPEN after 30 minutes. Not in D1.
  - Resp §7 "1h after pickup without delivered": PICKED_UP → CANCELLED. Not in D1.
  - Resp §15 overlap: the 30-minute release vs D1 FR8.2 2h/24h category expiry. FR8.2 only
    applies to OPEN errands, so they do not collide directly, but the 30-minute reopen
    restarts the OPEN period — does expiry count from `createdAt` (FR8.2 says creation
    time) or from re-opening?
- **Impact:** S8.
- **Recommendation:** adopt 30-minute reopen (keeps errands moving), drop the 1-hour
  cancel (it would refund the requester while the courier may be holding goods —
  needs a dispute path first), keep FR8.2 measured from `createdAt`.

## C5 — One active errand per courier · OPEN
- **Resp §5, §6.3, §13:** a courier cannot accept while they have another
  non-COMPLETED ongoing errand.
- **D1:** silent; FR9.1.3 "free the courier from assignment to accept other tasks"
  hints at the same rule.
- **Impact:** S4 (a partial unique index on `courier_id` for active statuses).
- **Recommendation:** adopt it; enforce with a partial unique index, not app logic.

## C6 — Existing status enum vs new lifecycle · OPEN (narrowed)
- **Current code** (`prisma/schema.prisma` `enum ErrandStatus`): OPEN, ACCEPTED,
  IN_PROGRESS, DELIVERED, COMPLETED, CANCELLED, EXPIRED.
- **Needed regardless:** PICKED_UP and DISPUTED must be added (D-005..D-007). Adding
  values is not blocked.
- **Still open:**
  1. Rename `IN_PROGRESS` → `PICKED_UP`, or keep both? (No rows use IN_PROGRESS yet.)
  2. Does category expiry end in **CANCELLED** (D1 FR8.2 "automatically cancel", Resp §7)
     or **EXPIRED** (D1 FR8.1.2 and FR4.1.2 name an EXPIRED status; FR10.3.2 says
     "completed, cancelled or expired errand")?
- **Impact:** S3 (enum migration), S7 (expiry).
- **Recommendation:** rename IN_PROGRESS → PICKED_UP; keep EXPIRED as a distinct
  terminal status for system expiry (it is what D1 names and it keeps history clear),
  treated like CANCELLED for credit release and history.

## C7 — Existing DELETE vs FR8 cancel · OPEN
- **Current code:** `DELETE /api/errands/:id` soft-deletes (`deletedAt`) and releases
  credits (`PrismaOrderRepository.deleteIntent`, `OrderService.remove`). Owners: OPEN
  only. Admins: any state. The record disappears from all reads.
- **D1 FR8.1 / FR8.1.1:** requester cancels an OPEN errand → status **CANCELLED** +
  release. FR11.1 history must show CANCELLED errands.
- **web-app** calls DELETE and shows "Errand deleted" (`docs/contracts/web-app.md`);
  web-app cannot be edited by us.
- **Impact:** S7, S10 (history needs cancelled errands to remain visible).
- **Options:** (a) keep DELETE as-is and add `POST /api/errands/:id/cancel`;
  (b) change DELETE for owners to set CANCELLED (record stays, appears in history) while
  keeping the same route and response shape.
- **Recommendation:** (b) for owners (same route, so web-app keeps working, and FR8/FR11
  are satisfied), plus `POST …/cancel` as the canonical route; admin hard-hide stays
  but is governed by C11.

## C8 — Errand categories vs supplier categories · OPEN
- **D1 FR8.2.1:** auto-cancel after 2 h for **food and beverages**, 24 h for **parcels and
  fragiles**.
- **Supplier service** (`supplier-service/prisma/schema.prisma` `enum SupplierCategory`):
  FOOD, FOOD_COFFEE, PRINTING, SHOPPING. Category is on the supplier, not the location.
- **Errand today:** no category field at all.
- **Impact:** S7. Adding a *required* create field would break web-app's create call.
- **Options:** (a) derive from the supplier category at create time with a fixed map
  (FOOD, FOOD_COFFEE → 2 h; PRINTING, SHOPPING → 24 h); (b) optional `category` field on
  create, defaulted from (a).
- **Recommendation:** (a) now, snapshot the derived category on the errand; (b) later if
  web-app adds a picker.

## C9 — Pickup-location filter fields · OPEN (re-check)
- **D1 FR4.1.1:** filter open errands by pickup location = vendor name, address line,
  postal code. **D1 FR2.1.2:** locations have address line, postal code, unit number.
- **Supplier reality** (`supplier-service/src/api/http/dto/supplier-location.response.ts`
  `SupplierLocationResponse`): id, supplierAtLocation, building, floor,
  locationDescription, latitude, longitude, opensAt, closesAt, isOpenOvernight, imageUrl.
  No address line / postal code / unit number.
- **Errand today** snapshots only `pickupSupplierName` and `pickupLocationLabel`.
- **Impact:** S2 filter part.
- **Recommendation:** additive optional query params `pickupLocationId` and `q`
  (case-insensitive match on supplier name / location label); add `building` to the
  snapshot later. Re-check if supplier-service adds address fields.

## C10 — Who owns notifications · OPEN
- **D1 FR10-notif:** notify requester and courier on ACCEPTED, PICKED_UP, DELIVERED,
  COMPLETED, CANCELLED; list own; mark read.
- **Resp §2, §8:** order-service generates/persists or emits; transport may be internal
  or a future service.
- **`docs/architecture.md`:** no notification service listed.
- **Impact:** S9.
- **Recommendation:** order-service owns a `notifications` table written in the same
  transaction as each transition, a list/mark-read API, and a Socket.IO hint after
  commit.

## C11 — Admin DELETE beyond OPEN vs settlement · OPEN
- **Current code:** admins can delete an errand in any state; `ServiceClients.release`
  silently ignores `RESERVATION_STATE_CONFLICT`.
- **Risk R1:** an admin DELETE after COMPLETED (before credit consumed
  `errand.completed.v1`), or in DELIVERED / DISPUTED, releases the reservation. The
  settlement event then hits `RESERVATION_STATE_CONFLICT` → dead-letter queue → the
  courier is never paid.
- **Impact:** S6a.
- **Recommendation:** forbid release once status ≥ PICKED_UP; admin delete of
  ACCEPTED/PICKED_UP/DELIVERED/DISPUTED/COMPLETED only hides (no credit call), and
  money for those states is resolved through C14.

## C12 — Courier credit account at accept · OPEN
- Credit accounts are created lazily by web-app (`web-app/src/app/api/credits/route.ts`)
  when a user opens their balance. Nothing publishes `user.verified.v1`.
- Credit's consumer requeues 404s forever
  (`credit-service/src/api/credit-events.controller.ts` `CreditEventsController.consume`:
  404 is not "permanent"). A courier without an account turns `errand.completed.v1`
  into an infinite redelivery loop.
- **Impact:** S4 (accept check), S6a.
- **Options:** (a) at accept, call `GET /v1/credit-accounts/{courierId}` with the
  courier's own JWT; 404 → reject with 409 `COURIER_CREDIT_ACCOUNT_REQUIRED`;
  (b) ask the credit owner to treat ACCOUNT_NOT_FOUND on settlement as permanent or to
  auto-create; (c) ask user-service to publish `user.verified.v1`.
- **Recommendation:** (a) now (inside our scope), and raise (c) with the team.

## C13 — D1 lacks a confirm step · DECIDED → D-006
- **D1:** FR7 ends at DELIVERED; FR10.3 transfers on COMPLETED but nothing says how an
  errand becomes COMPLETED.
- **Resp §5:** requester confirms DELIVERED → COMPLETED, or early from PICKED_UP.
- **Decision:** D-006. D1 needs amending.

## C14 — How DISPUTED is resolved · OPEN
- **Resp:** DELIVERED → DISPUTED, "do not settle/release automatically". Nothing more.
- **Open:** who resolves (admin? requester withdraws?), outcomes (pay courier →
  `errand.completed.v1`; refund requester → HTTP release → CANCELLED), deadline.
- **Until decided:** a DISPUTED errand holds its reservation indefinitely. That is safe.
- **Impact:** a later dispute-resolution slice; does not block S5.
- **Recommendation:** admin-only `POST /api/errands/:id/resolve-dispute`
  `{outcome: PAY_COURIER | REFUND_REQUESTER, note}`; no deadline in this project.

## C15 — D1 numbering duplicated · OPEN (team)
- D1 uses **FR10** twice ("closed-credit economy" and "real-time order-status
  notifications") and **FR9.1.3** twice (credit release / anti-re-accept).
- In these docs: `FR10-credit.*`, `FR10-notif.*`, `FR9.1.3a`, `FR9.1.3b`.
- **Action:** team renumbers D1.
