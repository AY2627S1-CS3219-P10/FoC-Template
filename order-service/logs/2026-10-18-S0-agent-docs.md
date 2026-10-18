# 2026-10-18 · S0 · Agent docs and tooling
Branch `order-system` · Agent: Claude Code (Claude Opus 5.5)

## Summary
### Questions for you
None for this docs pass. The open questions are batched in the D3 coding pass log
(`2026-10-18-D3-order-lifecycle.md`).

### What changed
No code changed. order-service now has a local, cited copy of its requirements
(`docs/requirements.md`), the decisions you made (`docs/decisions.md`), every known
conflict between D1, the Responsibilities doc and the existing code
(`docs/conflicts.md`, `docs/open-questions.md`), the contracts of credit, user, supplier
and web-app (`docs/contracts/`), the event design (`docs/events.md`) and an ordered
roadmap (`docs/roadmap.md`). Agents get a short entry point (`.agents/README.md`), ten
skills, a scope-check script, and this `logs/` folder.

### How it works
An agent opens `AGENTS.md` (or `CLAUDE.md`/`GEMINI.md`, which point to it) → reads
`.agents/README.md` → reads decisions, then the roadmap slice → builds only what is not
blocked by an open question → runs `check-scope.sh` → commits → writes a log entry here.

### Tests
Docs only. `check-scope.sh --no-code` passed before every commit; cited error codes and
files were grep-checked against the other services.

### Assumptions and risks
- A-001 Pass summaries live at the top of the pass log, not in a separate `docs/changes/`
  folder (D-012), to keep one place to read.
- A-002 The lifecycle, events and timer skills will be written after their code exists,
  so they point at real patterns.

### Next
D3 readiness: S1 (credit cap), N1 (correlation ids), S3–S6 (lifecycle, accept, outbox),
requester cancel, Docker, Postman.

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

### 0860e37 docs(order): add agent skills, commit logs and entry-file pointers
- **When:** 2026-10-18 06:23 · **Slice:** S0 · **Refs:** D-009, D-011, D-012
- **Changed:**
  - `.agents/README.md` — one-page entry: gates, workflow, skill table, code map, toolchain
  - `.agents/skills/order-commit-log`, `order-change-summary` — log after every commit; summary at the end of a pass
  - `.agents/skills/*` (8, written by Nasif) — committed; fixed the migrations path in `order-schema-migration`
  - `.agents/scripts/check-scope.sh` — `--allow-lockfile` accepts root `pnpm-lock.yaml` only if just the order-service section changed
  - `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md` — point agents and humans to `.agents/`, `docs/`, `logs/`
- **Why:** keep agent context small (one index instead of many skills) while making the hard rules executable (scope script) and every change explainable (logs).
- **Verified:** `check-scope.sh --no-code` passed; lockfile strip logic checked by reading the awk rule against the lockfile layout.
- **Follow-up:** lifecycle/events/timer skills after the code exists (A-002).
