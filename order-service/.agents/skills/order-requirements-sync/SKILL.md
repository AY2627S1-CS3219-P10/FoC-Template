---
name: order-requirements-sync
description: After a slice, update requirement status with evidence, D1 amendments, conflicts, roadmap and contract docs so the docs match the code. Use after order-self-review and before order-change-summary.
---

# order-requirements-sync

Docs drift is the main way agents go off plan. Do this every slice, even a small one.

## 1. `docs/requirements.md`
- For each FR or NFR the slice touched, set the status: `done`, `partial`, `todo` or `superseded`.
- `done` and `partial` must cite evidence: a file path plus the function, class or route name (no line numbers), or the test name. Do not mark `done` without evidence that exists. Check it with `test -e` or a grep.
- Add derived rows for behaviour that comes from the Responsibilities doc or a decision rather than D1 (courier delivers, requester confirm, early confirm, dispute, auto-complete, `completionMethod`).
- If code now implements a decision that differs from D1 (for example D-005 courier delivers, instead of FR7.2), keep the D1 row, mark it `superseded by D-NNN`, and make sure it is listed under **D1 amendments needed**.
- Use the crosswalk aliases for the duplicated D1 numbers (`FR10-credit`, `FR10-notif`, and so on).

## 2. `docs/conflicts.md` and `docs/open-questions.md`
- Mark conflicts DECIDED only when a `D-NNN` exists in `docs/decisions.md`.
- Add any new conflict or question found during the slice. Each OPEN conflict needs a matching Q entry that names the slice it blocks.

## 3. `docs/roadmap.md`
- Update the slice status (READY, PARTIAL, BLOCKED, DONE) and what is parked.
- Name the next READY slice. The change summary's "next step" uses it.

## 4. Contract docs
- `docs/contracts/web-app.md`: list new routes and confirm nothing existing changed.
- `docs/contracts/<svc>.md`: if you read another service's source and found something not documented, add it, cited by file and symbol.
- `docs/events.md`: update the event catalogue if an event was added or changed.

## 5. Quick consistency check
- Every status you set matches the code you wrote.
- Every relative link in the files you touched resolves (`test -e`).

Hand off to: order-change-summary.
