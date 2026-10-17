# 2026-10-18 · S0 · Agent docs and tooling
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

## Summary
_Written at the end of the pass by `order-change-summary`._

## Commits

### 9a6bdb9 docs(order): consolidate requirements, conflicts, decisions and open questions
- **When:** 2026-10-18 00:37 · **Slice:** S0 · **Refs:** D-001…D-010, C1–C15
- **Changed:**
  - `docs/requirements.md` — every order-service FR/NFR from D1 + Responsibilities doc with status and evidence
  - `docs/conflicts.md` — 15 places where the sources disagree, with a recommendation each
  - `docs/decisions.md` — the user's decisions (lifecycle D-005…D-008, settlement path D-001, park-and-continue D-009)
  - `docs/open-questions.md` — one parked question per open conflict
- **Why:** agents need one accurate, local copy of the requirements (the PDFs are not in the repo) and a record of what is decided vs open, so they stop guessing.
- **Verified:** docs only; `check-scope.sh --no-code` passed.
- **Follow-up:** none.

### dbe9509 docs(order): document service and web-app contracts
- **When:** 2026-10-18 00:39 · **Slice:** S0 · **Refs:** D-001
- **Changed:**
  - `docs/contracts/credit.md` — HTTP routes, error codes and how order must treat each, RabbitMQ event contract
  - `docs/contracts/user.md`, `docs/contracts/supplier.md` — routes, token claims, snapshot strategy
  - `docs/contracts/web-app.md` — the fields, routes and status codes web-app relies on (frozen)
- **Why:** order-service must call other services exactly as they behave today; citing file + symbol lets the next agent re-check quickly. The web-app contract protects a teammate's UI we cannot edit.
- **Verified:** every cited error code and file grep-checked against the other services' source; `check-scope.sh --no-code` passed.
- **Follow-up:** none.

### 07f9893 docs(order): add event design and roadmap ready queue
- **When:** 2026-10-18 00:40 · **Slice:** S0 · **Refs:** D-001, D-004, Q-018
- **Changed:**
  - `docs/events.md` — HTTP journal vs outbox/RabbitMQ vs BullMQ split, event catalogue, outbox table, compose request message
  - `docs/roadmap.md` — slices ordered as a READY / PARTIAL / BLOCKED queue
  - `docs/conflicts.md`, `docs/open-questions.md` — link dispute resolution to slice S12
- **Why:** settlement must have exactly one path (outbox event) and release another (HTTP), and agents need a queue that tells them what they may build while questions are open.
- **Verified:** docs only; `check-scope.sh --no-code` passed.
- **Follow-up:** Q-018 (compose wiring) is for a teammate.
