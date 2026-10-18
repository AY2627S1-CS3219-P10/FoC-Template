# Order-service agent instructions

Follow the repository-wide instructions in `../AGENTS.md` and the canonical
stack in `../docs/tech-stack.md`.

This service owns errands, requester/courier assignments, lifecycle state,
expiry, and cancellation. Errand acceptance must be an atomic conditional
operation so no more than one courier can succeed. Credit changes must be
requested through the credit service, never written directly.

**Before any work, read `.agents/README.md`** (gates, workflow, skills, code map,
toolchain). In short:

- Edit only `order-service/` (D-011 lockfile exception), on branch `order-system`.
  Stage explicit paths; never `git add -A`; never push without the user's go-ahead.
- Run `.agents/scripts/check-scope.sh` before every commit and write a log entry in
  `logs/` after every commit (`order-commit-log`).
- `docs/decisions.md` beats every other source. Unclear or conflicting requirements
  are parked in `docs/open-questions.md`, never guessed (`order-open-questions`).
- Web-app-visible API is frozen except for additive changes (`docs/contracts/web-app.md`).
