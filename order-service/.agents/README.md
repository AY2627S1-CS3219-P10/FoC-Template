# order-service agent guide

Start here. Skills are plain Markdown procedures in `skills/<name>/SKILL.md`.
**Load only the skills your task needs, plus `order-open-questions`.**

## Gates (never break)
1. Change only files under `order-service/`. Exception: the root `pnpm-lock.yaml`
   `order-service` importer section when adding a dependency the slice needs (D-011).
2. Branch `order-system`. Stage explicit paths, never `git add -A`, never push without
   the user's explicit go-ahead.
3. Before every commit run `bash order-service/.agents/scripts/check-scope.sh`
   (`--no-code` for docs-only commits, `--allow-lockfile` when adding a dependency).
4. After every commit write its log entry (`order-commit-log`).
5. Never break what web-app relies on (`docs/contracts/web-app.md`); API changes are additive.
6. Credit balances change only via credit-service: reserve/adjust/release over HTTP through
   the `ErrandOperation` journal; settlement only via the outbox event (D-001).
7. Never guess an OPEN conflict or unclear requirement — park it (`order-open-questions`).

## Start of a task
1. `git status`; confirm branch `order-system`.
2. Read `docs/decisions.md` (wins over everything), then the slice in `docs/roadmap.md`,
   its rows in `docs/requirements.md`, and `docs/open-questions.md`.
3. Read `logs/HANDOFF-*.md` if one exists (current state, next steps, parked questions), then skim the newest pass log in `logs/`.
4. Write a 5–10 line brief (in chat or the log): goal, FRs, files, API/schema/event
   changes, new deps, tests, what is parked.

## Workflow per slice
failing test → domain (`src/domain`, no Nest/Prisma imports) → ports (`src/application/ports.ts`)
→ infrastructure → API (`src/api`) → migration → integration test → verify → commit
→ `order-commit-log` → … → at the end `order-self-review`, `order-requirements-sync`,
`order-change-summary`.

## Skills
| Skill | Use when |
|---|---|
| `order-open-questions` | always: tiers, parking, batching questions |
| `order-api-endpoint` | adding/changing an HTTP route |
| `order-schema-migration` | schema / SQL migration changes |
| `order-lifecycle-transition` | adding a status transition, its outbox event or timer |
| `order-race-testing` | proving one winner under concurrency |
| `order-failure-injection` | proving recovery after crashes/outages |
| `order-observability` | logs, correlation ids, health |
| `order-self-review` | Definition-of-Done check before the summary |
| `order-requirements-sync` | updating requirements/roadmap/contracts after a slice |
| `order-commit-log` | after **every** commit |
| `order-change-summary` | end of a pass |

Lifecycle, events and timers: `order-lifecycle-transition` (patterns) and `docs/events.md`
(wire format).

## Code map
| Path | Role |
|---|---|
| `src/api/` | controllers, DTOs (class-validator), `AuthGuard` (calls user-service `/me`), `HttpFilter` |
| `src/application/order.service.ts` | use cases; `ports.ts` defines repository and service-client interfaces |
| `src/domain/` | pure rules: `errand.ts` (types, edit rules), `lifecycle.ts` (transition table), `events.ts` (event names, payloads) |
| `src/infrastructure/order.repository.ts` | Prisma persistence; `execute()` runs journal operations; `transition()` is the single-statement lifecycle UPDATE + history + outbox |
| `src/infrastructure/service-clients.ts` | HTTP clients for user, supplier, credit (`UpstreamFailure`) |
| `src/infrastructure/recovery.worker.ts` | BullMQ + sweeper that resumes PENDING operations |
| `src/infrastructure/outbox.relay.ts` | publishes `outbox_events` to RabbitMQ (`ORDER_EVENTS_ENABLED`) |
| `src/infrastructure/timer.worker.ts` | `order-timers` sweeper + BullMQ jobs (4 h auto-complete) |
| `postman/` | Postman collection proving API authorization |
| `prisma/schema.prisma`, `migrations/` | schema; hand-written SQL migrations |
| `tests/unit`, `tests/integration` | Jest; integration uses Testcontainers Postgres + in-process credit app |
| `dist/`, `coverage/`, `src/generated/` | gitignored build output; regenerate, never edit or commit |

## Toolchain (this Mac)
- Node must be ≥24.11 (`package.json` engines). If `node -v` is older, prefix commands:
  `npx -y -p node@24 -- <cmd>`.
- pnpm 12.5.1. Run from the repo root: `pnpm --filter @foc/order-service <script>`.
- Always `db:generate` first (the generated Prisma client may be stale).
- Integration tests and the compose demo need Docker Desktop running.
- Ports: order 3004, credit 3003, user 3001, supplier 3002; order Postgres 5436,
  order Redis 6380, RabbitMQ 5672 (UI 15672).

## Verify (before committing code)
`db:generate`, `typecheck`, `lint`, `format:check`, `test`, `test:integration`
(+ `test:coverage` once it exists). Report the exact commands and results; never claim a
test ran when it did not.
