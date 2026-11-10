# Friend on Campus (FoC) — AI Usage Declaration Log

**Project:** CS3219 Friend on Campus (FoC)  
**Compilation date:** 10 November 2026  
**Contributors:** Teng Yu Sheng Arthur, Michelle, Hazel, Nasif, Junyee  
**Documented interactions:** 23

## Record scope and integrity

This document consolidates the original AI declaration material supplied by the five contributors. Each entry retains its contributor-specific original ID, as well as its stated prompt, response excerpt, affected files, validation evidence and policy assessment. AI-reported checks are recorded as reported rather than independently certified by this compilation.

**Source completeness:** Arthur, Hazel, Nasif and Junyee supplied five entries each. The supplied Michelle material contains only entries FOC-AI-003 through FOC-AI-005. The first two Michelle entries were not provided in accessible source material. They are therefore not reconstructed or represented as confirmed records. No invented prompts or quotations have been added.

**Policy note:** This document reproduces contributor-supplied policy assessments. Entries marked “Allowed” are not an independent determination of course compliance; the applicable course AI policy was not supplied here. Other entries retain the stated need for course-staff clarification or undetermined status.

**Contribution overlap:** Nasif FOC-AI-001 and Junyee FOC-AI-005 both address courier username display but correspond to different described changes/commits. Arthur FOC-AI-004/005 and Nasif FOC-AI-002 concern related credit-settlement configuration. Entries describe separate interactions, not necessarily wholly separate functionality.

## Contributor overview

| Contributor | Main contribution area | Entries documented | Tool/model as recorded |
|---|---|---:|---|
| Teng Yu Sheng Arthur | User Service / local orchestration | 5 | Codex GPT-6.1 Sol |
| Michelle | Supplier Service classification / catalog | 3 | Codex GPT-6.1 (Sol variant unverified) |
| Hazel | Credit Service and related services/UI | 5 | Codex GPT-5.6 Sol |
| Nasif | Order Service, UI and AWS CDK | 5 | Claude Code claude-opus-5-5 |
| Junyee | Order Service and web app | 5 | Codex GPT-6.1 Sol |
| **Total** | | **23** | |

---

## A. Teng Yu Sheng Arthur — User Service

### FOC-AI-001 — Publish verified-user outbox event

- **Date:** 2026-10-17
- **Team member:** Teng Yu Sheng Arthur
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Generate implementation code
- **Exact prompt:**
  > Update the User Service email-verification flow so successful verification emits a `user.verified.v1` integration event through the transactional outbox.
  >
  > Current issue:\
  > `verify-email.use-case.ts` calls `verifyAndActivate(...)` and completes the user activation, but no integration signal is produced. Credit Service therefore does not know when to provision a credit account, causing `ACCOUNT_NOT_FOUND` errors and missed initial credit allocation.
  >
  > Required flow:
  >
  > User Service verifies and activates user\
  >   -> writes `user.verified.v1` to transactional outbox\
  >   -> Credit Service consumes event\
  >   -> Credit Service provisions initial credit account
  >
  > Requirements:
  >
  > - Keep the existing verification behaviour.
  > - When `verifyAndActivate(...)` succeeds, write a `user.verified.v1` event to the User Service transactional outbox.
  > - The user activation and outbox insert MUST occur in the same PostgreSQL transaction so we cannot activate a user without recording the event.
  > - Do not make a direct Credit Service HTTP call unless the existing architecture already requires it; prefer the outbox approach.
  > - Reuse any existing transaction/outbox abstractions in the repository instead of introducing a parallel pattern.
  >
  > Event payload:
  >
  > {\
  >   "eventId": "\<stable UUID>",\
  >   "eventType": "user.verified.v1",\
  >   "data": {\
  >     "userId": "\<verified user ID>"\
  >   }\
  > }
  >
  > - Generate the `eventId` once for the event and persist it with the outbox record.
  > - Ensure retries/idempotent verification do not create duplicate provisioning events for the same successful activation.
  > - If the account is already verified, preserve the existing behaviour and do not emit another `user.verified.v1` event.
  > - Keep PostgreSQL as the source of truth.
  > - Add/update Prisma schema and migration only if the transactional outbox does not already exist.
  > - Do not redesign the existing account verification architecture.
  >
  > Add tests covering:
  >
  > - successful verification activates the user and writes exactly one `user.verified.v1` outbox event
  > - activation and outbox write are atomic
  > - failed verification writes no event
  > - repeated/already-completed verification does not produce duplicate events
  > - event payload contains the correct `userId`, `eventType`, and stable UUID `eventId`
  >
  > Update README/OpenAPI only where relevant to document the integration event contract.
  >
  > Run the relevant unit/integration tests and full checks.
  >
  > Suggested commit:\
  > `feat(user-service): publish user verified outbox event`
- **Key response (verbatim excerpt):**
  > Implemented and committed:
  >
  > `ee2020f feat(user-service): publish user verified outbox event`
  >
  > Key changes:
  >
  > - Atomic user activation and `user.verified.v1` outbox insertion.
  > - Stable UUID event IDs and database uniqueness protection.
  > - RabbitMQ relay with publisher confirmations and retry-safe delivery.
  > - No duplicate event for already-verified accounts.
  > - Unit, integration, E2E, configuration, and relay tests added.
- **Locations affected:** Commit `ee2020f`, including:
  - `user-service/prisma/schema.prisma`
  - `user-service/prisma/migrations/20261017000100_add_transactional_outbox/migration.sql`
  - `user-service/src/modules/accounts/application/use-cases/verify-email.use-case.ts`
  - `user-service/src/modules/accounts/application/ports/email-verification-repository.port.ts`
  - `user-service/src/modules/accounts/infrastructure/persistence/prisma-email-verification.repository.ts`
  - `user-service/src/modules/accounts/infrastructure/messaging/user-outbox-relay.service.ts`
  - `user-service/src/modules/accounts/accounts.module.ts`
  - `user-service/src/platform/config/environment.schema.ts`
  - `user-service/tests/integration/accounts/prisma-account.repository.integration-spec.ts`
  - `user-service/tests/e2e/account-lifecycle.integration-spec.ts`
  - `user-service/tests/unit/modules/accounts/application/email-verification.use-cases.spec.ts`
  - `user-service/tests/unit/modules/accounts/infrastructure/user-outbox-relay.spec.ts`
  - `user-service/README.md`
  - `scripts/start-local.ps1`
  - `.env.example`
- **How team validated the result:** `pnpm.cmd run check` passed Prisma validation/generation, formatting, ESLint, TypeScript, 28 Jest suites with 178 tests, and the Nest build. The separate database-backed integration command was attempted but could not start because no Docker-compatible container runtime was available in that execution environment.
- **Policy review:** Needs course-staff clarification — no course-specific AI usage policy was supplied in the conversation.

### FOC-AI-002 — Provide five-terminal startup commands

- **Date:** 2026-10-18
- **Team member:** Teng Yu Sheng Arthur
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Documentation
- **Exact prompt:**
  > We have 4 microservice for our project. And then the UI too. So we need 5 terminals in total to launch the app and get it running. Give me the commands that I need.
- **Key response (verbatim excerpt):**
  > Start Docker Desktop first. From the repository root, run this once for automatic configuration, dependency installation, infrastructure, migrations, and all five applications:
  >
  > ```
  > powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Install
  > ```
  >
  > After the first setup, omit `-Install`:
  >
  > ```
  > powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
  > ```
- **Locations affected:** No files changed. Commands were derived from:
  - `README.md`
  - `web-app/README.md`
  - `order-service/README.md`
  - `scripts/start-local.ps1`
  - `package.json`
  - `web-app/package.json`
  - `user-service/package.json`
  - `supplier-service/package.json`
  - `credit-service/package.json`
  - `order-service/package.json`
- **How team validated the result:** The user subsequently confirmed, “Ok, I used the one-command startup script.” This verifies that the launcher was executable, but it did not validate the complete event-driven workflow; a missing Order Service event setting was discovered later.
- **Policy review:** Needs course-staff clarification — no course-specific AI usage policy was supplied in the conversation.

### FOC-AI-003 — Stop locally launched services

- **Date:** 2026-10-18
- **Team member:** Teng Yu Sheng Arthur
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Explain
- **Exact prompt:**
  > Ok, I used the one-command startup script. But now i dont know how to turn off the services, is there a command
- **Key response (verbatim excerpt):**
  > There is no shutdown script yet. Run this from the repository root to stop the five application processes:
  >
  > ```
  > $servicePids = 3000..3004 | ForEach-Object {
  >     (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue).OwningProcess
  > } | Sort-Object -Unique
  >
  > $servicePids | ForEach-Object {
  >     Stop-Process -Id $_ -Force
  > }
  > ```
  >
  > This preserves database data. Avoid adding `-v`, because that would also delete the Docker volumes and local database contents.
- **Locations affected:** No files changed. The response referred to:
  - `scripts/start-local.ps1`
  - `compose.yaml`
  - `user-service/compose.yaml`
  - `supplier-service/compose.yaml`
- **How team validated the result:** Not verified. Later `.local` logs contained `EADDRINUSE` errors for ports 3003 and 3004, suggesting that watcher or parent processes may have remained alive. Therefore, the shutdown guidance should not be treated as fully validated.
- **Policy review:** Needs course-staff clarification — no course-specific AI usage policy was supplied in the conversation.

### FOC-AI-004 — Diagnose missing courier credit settlement

- **Date:** 2026-10-18
- **Team member:** Teng Yu Sheng Arthur
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Debug
- **Exact prompt:**
  > FOr the starting script, when I launch it using it, i went through a test where I create a errand on one account, then i accept the errand on another account. Even after the errand has been marked as completed, the courier didnt get his creds. I suspect the starting script might have some form of issue. My friedn say when he launch the 4 microservices manually he didnt get this issue. Look thru the script for me
- **Key response (verbatim excerpt):**
  > You are correct: the startup script has a configuration bug.
  >
  > The Order Service only publishes `errand.completed.v1` when:
  >
  > ```
  > ORDER_EVENTS_ENABLED=true
  > ```
  >
  > However, `scripts/start-local.ps1` enables events only for User Service and Credit Service. It never enables the Order Service publisher. Consequently:
  >
  > 1. The errand becomes `COMPLETED`.
  > 2. Order Service writes the completion event to its PostgreSQL outbox.
  > 3. The Order outbox relay remains disabled.
  > 4. Credit Service never receives `errand.completed.v1`.
  > 5. The courier receives no credits.
- **Locations affected:** No files changed during this diagnostic interaction. Evidence was inspected in:
  - `scripts/start-local.ps1`
  - `order-service/.env.example`
  - `order-service/src/infrastructure/outbox.relay.ts`
  - `order-service/src/domain/events.ts`
  - `order-service/src/infrastructure/order.repository.ts`
  - `credit-service/src/api/credit-events.handler.ts`
  - `credit-service/README.md`
  - `.local/order-service.log`
  - `.local/order-service.error.log`
  - `.local/credit-service.log`
  - `.local/credit-service.error.log`
- **How team validated the result:** Static configuration inspection confirmed that `ORDER_EVENTS_ENABLED` defaulted to `false` while the startup script did not override it. Logs also showed port-conflict errors. Repository history later corroborated the diagnosis through commits `278000d`, `d111218`, and `5427c16`, although no end-to-end settlement test was run during this specific interaction.
- **Policy review:** Needs course-staff clarification — no course-specific AI usage policy was supplied in the conversation.

### FOC-AI-005 — Enable Order events in local launcher

- **Date:** 2026-10-18
- **Team member:** Teng Yu Sheng Arthur
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Debug
- **Exact prompt:**
  > How about we update script instead. Make the necessary changes
- **Key response (verbatim excerpt):**
  > Updated the startup configuration:
  >
  > - `scripts/start-local.ps1` now sets:
  >   - `ORDER_EVENTS_ENABLED=true`
  >   - `ORDER_EVENTS_EXCHANGE` to the shared exchange
  >   - `RABBITMQ_URL` to the local RabbitMQ instance
  > - `.env.example` now documents the Order event settings.
  > - PowerShell syntax validation passed.
  > - No service implementation was changed.
  > - The unrelated `.vscode/` directory remains untouched.
- **Locations affected:** Initially modified:
  - `scripts/start-local.ps1`, around the shared event configuration currently at lines 80–87
  - `.env.example`, currently around lines 33–38\
    Repository cross-reference:
  - Commit `278000d` contains the launcher changes produced in this interaction.
  - Commit `5427c16` later records the shared `.env.example` settings and integrated local settlement configuration.
- **How team validated the result:** PowerShell parsing completed with `PowerShell syntax: OK`, and `git diff --check` passed. The launcher itself was deliberately not executed during the change to avoid disrupting running services. Therefore, end-to-end courier settlement was not verified in this interaction.
- **Policy review:** Needs course-staff clarification — no course-specific AI usage policy was supplied in the conversation.

---

## B. Michelle — Supplier Service

### FOC-AI-003 — Correct cafe food and beverage classifications

- **Date:** 2026-11-09
- **Team member:** Michelle
- **Tool and model:** Codex (GPT-6.1; Sol variant not verified)
- **Mode:** Generate implementation code / testing
- **Exact prompt:**

> these are under beverages only where they should also be  under the food filter tag, wonderful cafe mainly sells food so i think it should be under food only

- **Key response (verbatim excerpt):**

> Food + Beverages: Starbucks, Poonsti Cafe, The Coffee Bean & Tea Leaf, TOMORO COFFEE.
>
> Food only: Wonderful Cafe at CDE and S16.

- **Locations affected:** `supplier-service/prisma/migrations/20261109000100_correct_cafe_categories/migration.sql`, `data/csv/supplier-seed-data.csv`, `supplier-service/tests/integration/outlet-identity.spec.ts`, and `supplier-service/README.md`. Included in shared commit `f298449`.
- **How team validated the result:** All 11 PostgreSQL integration tests passed. Local database queries confirmed the classifications. Inspection established that the first four brands already had both tags locally; Wonderful Cafe required correction. Human review was subsequently confirmed by the team.
- **Policy review:** Allowed — data correction implementing classifications supplied by the user.

### FOC-AI-004 — Refine food-court and beverage-only tags

- **Date:** 2026-11-09
- **Team member:** Michelle
- **Tool and model:** Codex (GPT-6.1; Sol variant not verified)
- **Mode:** Generate implementation code / testing
- **Exact prompt:**

> made these changes please:
>
> - cool spot should also be in beverages
> - mixue, chagee, cafe+ robot should be in beverages not food
> - mr bean and nine fresh should be in both food and beverages (now only in food)
> - fine food, flavours, central square  should be in both food and bev (now only in food)

- **Key response (verbatim excerpt):**

> Food + Beverages: Cool Spot, Mr Bean / Do Qoo, Nine Fresh, Fine Food, Flavours @ UTown, Central Square @ YIH.
>
> Beverages only: Mixue, CHAGEE, Cafe+ Robot Cafe.

- **Locations affected:** `supplier-service/prisma/migrations/20261109000200_refine_food_beverage_categories/migration.sql`, `supplier-service/scripts/seed-csv-locations.mjs`, `data/csv/supplier-seed-data.csv`, `supplier-service/tests/integration/outlet-identity.spec.ts`, and `web-app/src/features/suppliers/guest-supplier-previews.ts`. Included in shared commit `f298449`.
- **How team validated the result:** Lint, TypeScript, CSV validation, and all 11 PostgreSQL integration tests passed. A disposable-database CSV import and subsequent queries confirmed all nine classifications. The local migration was applied and its results queried. Human review was subsequently confirmed by the team.
- **Policy review:** Allowed — implementation and verification of user-specified catalog corrections.

### FOC-AI-005 — Add Techno Edge and confirm He Brews tags

- **Date:** 2026-11-09
- **Team member:** Michelle
- **Tool and model:** Codex (GPT-6.1; Sol variant not verified)
- **Mode:** Generate implementation code / testing / other: factual lookup
- **Exact prompt:**

> i think the he by He Brews should also be under beverages
>
> and can u add Techno Edge as well under both food and beverages?

- **Key response (verbatim excerpt):**

> he by He Brews: confirmed under Food + Beverages.
>
> Techno Edge: added under Food + Beverages, using NUS pickup-location details.

- **Locations affected:** `supplier-service/prisma/migrations/20261109000300_add_techno_edge/migration.sql`, `data/csv/supplier-seed-data.csv`, `supplier-service/tests/integration/outlet-identity.spec.ts`, and `supplier-service/README.md`. Included in shared commit `f298449`.
- **How team validated the result:** All 11 PostgreSQL integration tests passed. CSV validation covered 75 rows; importing twice created no duplicate pickup locations. Local queries confirmed both suppliers had both tags and one outlet each. Techno Edge details were checked against the linked official NUS directory; unverified floor and coordinates remained null. Human review was subsequently confirmed by the team.
- **Policy review:** Allowed — adding a user-requested catalog entry, checking factual source information, and testing persistence.


---

## C. Hazel — Credit Service and related work



### FOC-AI-001 — Credit Service security and concurrency hardening

- **Date:** 2026-09-27
- **Team member:** Hazel
- **Tool and model:** Codex (GPT-5.6 Sol — recorded historical model)
- **Mode:** Generate implementation code / refactor
- **Exact prompt:** 

> Role: Senior Backend Engineer & Security Auditor Task: Audit and harden the NestJS/Prisma Credit Service microservice for a campus peer-to-peer errand platform (CS3219). Ensure production-grade reliability, atomicity, idempotency, and strict adherence to service boundaries. Please review the current codebase against the following criteria, identify any gaps, and provide code fixes or structural improvements where necessary: Escrow & State Machine Integrity   Verify that credit operations strictly follow the lifecycle: Account Initialization (one-time allocation) -> Reservation (escrow) -> Settlement OR Release. Ensure that settling or releasing an errand correctly modifies the `reserved` and `available` balances without double-charging or double-rewarding. Check that invalid state transitions (e.g., trying to settle an already released/settled reservation, or reserving with an existing `errandId`) are explicitly blocked and return appropriate HTTP status codes (e.g., 400/409).   Concurrency, Atomicity & Zero-Balance Guardrails   Confirm that all balance mutations (reserve, settle, release) execute inside an atomic PostgreSQL transaction with proper isolation levels and row-level locking (`SELECT ... FOR UPDATE`) to prevent race conditions under concurrent requests. Verify that conditional database constraints or application-level checks prevent user accounts from dropping below zero (`available >= 0`). Ensure that negative or zero credit amounts in payloads are rejected by DTO validation.   Idempotency & Duplicate Protection   Verify that the `errandId` on the `Reservation` model has a `@unique` constraint in Prisma. Ensure that if an order service retries a settlement or release call due to network timeouts, the Credit Service catches duplicate/existing keys or states and responds idempotently without moving funds a second time.   Service Boundaries & Authentication   Confirm that business decision-making (determining if an errand is completed or cancelled) remains strictly within the Order Service, and the Credit Service only acts on instructions. Validate that all mutation endpoints (`/reserve`, `/settle`, `/release`) require and verify an internal bearer service token, while user-facing balance endpoints enforce User Service JWT validation (users can only read their own balance unless they are administrators).   Edge Case Handling & Input Validation   Check how non-existent user accounts or missing reservation IDs are handled (should return 404 rather than unhandled Prisma null pointer exceptions). Ensure self-fulfillment protection (validating that a user cannot act as both requester and courier for the same errand ID if applicable).

**Key response (verbatim excerpt):**

> The Credit Service has been audited and hardened. No critical escrow, atomicity, or idempotency gaps remain in the reviewed implementation. Improvements implemented Added User Service JWT authentication for balance lookups. Users can read only their own balance; administrators can read any balance. Mutation endpoints retain the internal service-token guard. Added explicit `SELECT ... FOR UPDATE` account locking. Accounts are locked in sorted order to reduce deadlock risk. Added PostgreSQL deadlock (`40P01`) retry handling. Blocked requester-to-self settlement with HTTP `409`. Added a database constraint preventing requester and courier from being identical.

**Locations affected:** Commit `a6d67d6`; `.env.example`; `compose.yaml`; `credit-service/README.md`; `credit-service/migrations/202609270001_harden_settlement_invariants/migration.sql`; `credit-service/src/api/balance-authorization.guard.ts`; `credit-service/src/api/credit.controller.ts`; `credit-service/src/api/user-access-token.guard.ts`; `credit-service/src/domain/idempotency.ts`; `credit-service/src/infrastructure/configuration.ts`; `credit-service/src/infrastructure/prisma-credit.repository.ts`; `credit-service/tests/integration/credit-api.spec.ts`; related unit tests and `pnpm-lock.yaml`.
- **How team validated the result:** Build and Prisma validation passed; 46/46 unit tests and 13/13 PostgreSQL integration tests passed; reported coverage was 99.23% statements, 98.48% branches, 100% functions and 99.17% lines; `git diff --check` passed. Commit presence and changed-file scope were reverified from repository history.
- **Policy review:** Needs course-staff clarification — this involved substantial AI-generated security and transaction code, and no authoritative course AI policy was found in the repository. 

### FOC-AI-002 — Guest errand fallback and supplier previews

- **Date:** 2026-10-23
- **Team member:** Hazel
- **Tool and model:** Codex (GPT-5.6 Sol — recorded historical model)
- **Mode:** Generate implementation code / debug
- **Exact prompt:** 

> make it so that if there are no errands to show, make it say that there are no errands instead of an error show a preview of the suppliers, similar to the errands page

**Key response (verbatim excerpt):** 

> Implemented locally on `hazel-UI`, touching only `web-app`. Missing guest errand-preview endpoint now shows “No open errands right now” instead of an error. Logged-out users can preview six real suppliers from the initial catalog. Supplier details, pickup points, hours, and directions remain login-gated. Supplier search, categories, and List/Card controls remain available. Desktop and mobile tests pass. TypeScript, linting, production build, and formatting checks pass.

**Locations affected:** Commits `913040a` and `f65f10d`; `web-app/src/features/errands/errands-page.tsx`; `web-app/tests/e2e/errands.spec.ts`; `web-app/src/features/suppliers/guest-supplier-previews.ts`; `web-app/src/features/suppliers/supplier-catalog.tsx`; `web-app/src/styles/globals.css`; `web-app/tests/e2e/outlet-cards.spec.ts`.
- **How team validated the result:** Type checking and linting passed. The targeted guest-flow Playwright command passed four desktop/mobile cases. The production build completed after retrying past a Next.js security-version warning; that warning remained unresolved. The changes were subsequently committed and reviewed in PR #31.
- **Policy review:** Needs course-staff clarification — the interaction generated application code and tests, and no authoritative course AI policy was found in the repository. 

### FOC-AI-003 — Resolve the UI pull-request merge conflict

- **Date:** 2026-10-23
- **Team member:** Hazel
- **Tool and model:** Codex (GPT-5.6 Sol — recorded historical model)
- **Mode:** Debug
- **Exact prompt:** 

> currently my PR has merge conflict issues, fix ti

**Key response (verbatim excerpt):**

> Fixed and pushed the merge conflict resolution. Merged the latest `main` into `hazel-UI` Resolved the conflict in `web-app/src/services/contracts.ts` Preserved upstream’s new courier username field Preserved the UI’s errand preview contract TypeScript and lint checks pass PR diff remains limited to `web-app` files GitHub now reports the PR as **mergeable and clean**

**Locations affected:** `web-app/src/services/contracts.ts`; merge commit `8ba1a4b` (`merge: resolve main updates in UI contracts`); PR #31.
- **How team validated the result:** `pnpm --filter @foc/web-app typecheck` and lint passed. The branch diff against `origin/main` was checked as `web-app`-only. GitHub reported PR #31 as `CLEAN` and `MERGEABLE`.
- **Policy review:** Needs course-staff clarification — AI resolved a source-level merge conflict, and no authoritative course AI policy was found in the repository. 

### FOC-AI-004 — Remove duplicate Create Errand heading

- **Date:** 2026-10-23
- **Team member:** Hazel
- **Tool and model:** Codex (GPT-5.6 Sol — recorded historical model)
- **Mode:** Refactor
- **Exact prompt:** 

> redundant, remove

**Key response (verbatim excerpt):** 

> Removed the redundant “Create errand” heading. The page now has one clear heading: “Create a new errand.” Logged-out users still receive an appropriate page heading. Type checking, linting, and relevant desktop/mobile tests pass. Only `web-app` files were modified. Changes remain uncommitted and unpushed on `hazel-UI`.

**Locations affected:** `web-app/src/features/errands/create-errand-page.tsx`; `web-app/src/features/errands/create-errand.tsx`; `web-app/src/styles/globals.css`; commit `2af3649` (`fix(ui): remove duplicate create errand heading`).
- **How team validated the result:** The historical response records successful type checking, linting and relevant desktop/mobile tests. Commit `2af3649` and its three-file scope were reverified from Git history. The exact historical test command was not independently rerun while preparing this declaration.
- **Policy review:** Needs course-staff clarification — AI performed a UI and accessibility refactor, and no authoritative course AI policy was found in the repository. 

### FOC-AI-005 — Staging-only load-test account seeder

- **Date:** 2026-11-08
- **Team member:** Hazel
- **Tool and model:** Codex (GPT-5.6 Sol — recorded historical model)
- **Mode:** Generate implementation code
- **Exact prompt:** 

> implement the seeding accounts

**Key response (verbatim excerpt):** 

> Implemented a staging-only test-account seeder in User Service. It now: Creates verified, active, non-admin accounts without email verification. Hashes passwords using Argon2id. Is idempotent and never resets existing passwords. Rejects identity conflicts. Creates `user.verified.v1` outbox events for Credit Service provisioning. Requires `NODE_ENV=staging` and `ALLOW_TEST_ACCOUNT_SEED=true`. Refuses production use. Supports up to 100 accounts.

**Locations affected:** Current-history commit `f084ca0` (equivalent earlier branch commit `4c24aa1`); `user-service/README.md`; `user-service/package.json`; `user-service/src/seed-test-accounts.ts`; `user-service/src/modules/accounts/application/errors/test-account-seed.error.ts`; `user-service/src/modules/accounts/application/ports/test-account-seed-repository.port.ts`; `user-service/src/modules/accounts/application/use-cases/seed-test-accounts.use-case.ts`; `user-service/src/modules/accounts/infrastructure/config/test-account-seed-config.ts`; `user-service/src/modules/accounts/infrastructure/persistence/prisma-test-account-seed.repository.ts`; `user-service/tests/integration/accounts/prisma-test-account-seed.repository.integration-spec.ts`; related unit tests.
- **How team validated the result:** User Service type checking, linting and build passed; all 201 unit tests passed. A PostgreSQL Testcontainers integration test was added but did not run because no working container runtime was available. At the end of this interaction, the accounts had not been inserted into AWS and the changes had not yet been deployed.
- **Policy review:** Needs course-staff clarification — this generated a staging-only account-provisioning path and associated tests, and no authoritative course AI policy was found in the repository.

---

## D. Nasif — Order Service, UI and infrastructure

## FOC-AI-001 — Show courier username instead of account ID on the errand page
- Date: 2026-10-18
- Team member: Nasif
- Tool and model: Claude Code (`claude-opus-5-5`, from the session transcript)
- Mode: Debug / generate implementation code
- Exact prompt:
> We will be mainly working on the UI and the order service. Currently, the order service does not correctly display the couriers name, but displays some sort of hash value. Fix it, make no mistakes
- Key response (verbatim excerpt):
> The errand page now shows the courier's username instead of the account ID. It was showing the ID because order-service only looked up the requester's name. The courier's account ID was passed through unchanged, and the web app displayed it as-is.
- Locations affected:
  - Commit `9ac33a1`:
    - `order-service/src/application/order.service.ts` (around lines 366-383)
    - `order-service/src/api/dto.ts`
    - `order-service/tests/integration/errands.spec.ts`
    - `order-service/docs/contracts/web-app.md`
  - Commit `8fdb5c9`:
    - `web-app/src/features/errands/errand-detail.tsx`
    - `web-app/src/services/contracts.ts`
    - `web-app/tests/e2e/errand-lifecycle.spec.ts`
- How team validated the result:
  - The transcript shows the checks being run: order-service typecheck, lint, format and unit tests (349 passed), web-app lint and typecheck, and the Playwright lifecycle tests.
  - The assistant's report also gives integration tests as 61/61 passing, but I did not see that raw output.
  - One unrelated Playwright test (create-errand) failed, and the assistant reported it fails the same way on `origin/main`.
  - Human code review: not verified.
- Policy review: Not determined. I found no course AI policy in the repo, so please confirm.

---

## FOC-AI-002 — Fix completed errands not settling credits (outbox relay and consumer logging)
- Date: 2026-10-18
- Team member: Nasif
- Tool and model: Claude Code (`claude-opus-5-5`, from the session transcript)
- Mode: Debug / generate implementation code
- Exact prompt:
> Using git worktrees as there is another agent owrking ont he current branch, go onto a new branch, and fix an issue where once an errand is completed, the credits are not properly transferred. Limit the code changes to order service, and credit service, let me know if there is some issue that needs changing code somewhere else.
>
> The goal is to make sure that the order service and the credit service is working properly
- Key response (verbatim excerpt):
> **Cause:** couriers get paid when order-service publishes an `errand.completed.v1` event to RabbitMQ and credit-service settles it. That publishing step only runs if `ORDER_EVENTS_ENABLED=true`, and nothing set it: not `.env.example`, not either start-local script, not `compose.yaml`. So completed errands sat in order-service's outbox (the table of events waiting to be sent).
- Locations affected:
  - Commit `d111218`:
    - `order-service/src/infrastructure/outbox.relay.ts`
    - `order-service/.env.example`
    - `order-service/docs/events.md`
    - `order-service/tests/integration/errands.spec.ts`
  - Commit `2769385`:
    - `credit-service/src/api/credit-events.controller.ts`
    - `credit-service/src/main.ts`
    - `credit-service/tests/unit/credit-events.controller.spec.ts`
  - Commit `9cd91f5`: `order-service/logs/2026-10-18-fix-credit-settlement.md`
- How team validated the result:
  - The transcript shows these results:
    - order-service typecheck, lint and format checks were clean, with 349 unit tests passing.
    - order-service integration tests: 64 passed, 4 of them new.
    - credit-service: `tsc` clean, 66 unit tests and 31 integration tests passing.
  - The assistant also queried the local order and credit databases and RabbitMQ to find the cause. It ran a script against the real broker to confirm unroutable messages are returned before the publisher confirm.
  - The order-service scope check failed only on the hard-coded branch name.
  - Teammate hazelhidayah separately merged `5427c16` ("enable event-driven credit settlement locally", PR #29). The two fixes overlap, and I haven't compared them.
  - Human code review: not verified.
- Policy review: Not determined. I found no course AI policy in the repo, so please confirm.

---

## FOC-AI-003 — Run the order-service Postman collection with Newman and add credit-balance assertions
- Date: 2026-10-18
- Team member: Nasif
- Tool and model: Claude Code (`claude-opus-5-5`, from the session transcript)
- Mode: Testing / documentation
- Exact prompt:
```text
I should currently be on the courier-username branch. My goal until tomorrow is to not push any code to remote, but to make sure everything is working porperly on this branch for tomorrows demonstration.

One thing I need to do is to use postman to mock the APIs.

Here are some instructions made by another agent:

<pasted_content>
Run the order-service Postman collection headless with Newman against the local stack and report real results.

Setup (do not skip any):
1. Read order-service/postman/README.md and the two JSON files. Use `npx newman` (add no dependency to package.json; run it with npx -y or from the scratchpad).
2. Make sure the local stack is up: Postgres, Redis and RabbitMQ containers, and the user, supplier, credit and order services running with migrations applied. If order-service migrate fails with P1000 (login rejected for foc_order), diagnose it (compare order-service/.env DATABASE_URL port/user/password with the order-db mapping in compose.yaml and `docker ps`), fix only order-service/.env, and tell me if compose.yaml needs a teammate's change. Set ORDER_EVENTS_ENABLED=true for the order service so the outbox relay publishes to RabbitMQ.
3. Test accounts: requester, courier, second courier, admin. If they do not exist, create and verify them through user-service's real API or the same seed path the repo already uses, never through a bypass in service code. Make the admin an administrator the way user-service supports it. Make sure the requester has credits and every courier has a credit account (Q-012). If you cannot find how credit is topped up, stop and ask me rather than guessing.
4. Passwords: pass them with `--env-var` from shell variables or a git-ignored env file. Never write a password or token into a committed file, the change summary, a log entry or your output.

Run:
5. `npx newman run order-service/postman/order-service.postman_collection.json -e order-service/postman/foc-local.postman_environment.json --env-var ... --reporters cli,json --reporter-json-export <scratch path>`, folder order as in the collection.
6. For every failure decide whether it is a bug in the service, in the collection (wrong expectation, stale status name, a new route missing) or in the setup. Fix collection and setup problems yourself. For a service bug, write a failing test first, then fix it in order-service only.
7. Extend the collection with requests and tests for what was added since it was written: item type (FOOD = 2 h, default NON_PERISHABLE = 24 h, invalid value = 400), requester cancel (OPEN and ACCEPTED allowed, PICKED_UP onward 409, credits released), courier cancel (ACCEPTED -> OPEN, excluded courier gets 403 on re-accept, PICKED_UP 409), plus the status and permission matrix. Mark anything the web-app UI lacks as "tested manually" in postman/README.md.
8. Timers: do not wait. Use docs/demo-timers.md (create it if missing: a SQL snippet that ages accepted_at, delivered_at and created_at/expires_at) to age an errand, wait one sweeper interval, and assert the 30-minute reopen, the 4-hour auto-complete and expiry, including the courier's credit balance after auto-complete.
9. Also check the credit side: after confirm, the courier balance rose exactly once; after cancel or expiry, the requester balance is restored. Query the credit API, do not assume.

Report:
10. Give me the exact commands, assertions passed and failed, and anything not run, with the reason. Do not claim a pass you did not see. Commit only collection, README and docs changes under order-service/ with check-scope.sh passing; do not push. Add a log entry and update the handoff.
</pasted_content>

If any of these instructions do not make sense, or may be missing something important, feel free to ask me to clarify everything
```

- Key response (verbatim excerpt):
> The Postman collection passes end to end against your local stack, now including credit-balance checks, and the three timers work. Nothing was pushed. I made two local commits on `courier-username`, and the working tree is clean.
- Locations affected:
  - Commit `3dd7c37`:
    - `order-service/postman/order-service.postman_collection.json`
    - `order-service/postman/foc-local.postman_environment.json`
    - `order-service/postman/README.md`
    - `order-service/docs/demo-timers.md`
  - Commits `3d785ce` and `199de40`:
    - `order-service/logs/2026-10-18-D3-postman-newman.md`
    - `order-service/logs/HANDOFF-2026-10-18T1745.md`
    - `order-service/logs/README.md`
  - Commit `bb20fad`: `order-service/postman/README.md`
- How team validated the result:
  - The transcript's Newman summary shows 67 requests, 0 failed, and 121 assertions, 0 failed.
  - The assistant also reported timer checks (18/18) done by ageing timestamps with SQL. I did not see the raw output of those checks.
  - Human review: not verified.
- Policy review: Not determined. I found no course AI policy in the repo, so please confirm.

---

## FOC-AI-004 — Fix unstyled local web UI caused by `upgrade-insecure-requests` in the CSP
- Date: 2026-10-18
- Team member: Nasif
- Tool and model: Claude Code (`claude-opus-5-5`, from the session transcript)
- Mode: Debug
- Exact prompt:
> Why does it look like this? the Ui seems to be messed up? Feel free to look through the relevant parts of the codebase now to solve this issue, we do not have to restrict ourselves to order service
- Key response (verbatim excerpt):
> The UI was broken by a security header, not by our merge. The teammate's security commit (0493be2) added `upgrade-insecure-requests` to web-app's Content-Security-Policy. That tells the browser to load every file over `https://`, but the local dev server only runs plain `http://localhost:3000`. So the CSS and all the JavaScript failed to load, which is why the page is unstyled and stuck on "Connecting…".
- Locations affected:
  - `web-app/next.config.ts`.
  - The assistant said the change was not committed. The same `next.config.ts` change appears in commit `f5b892f` ("bugfix", on `main`), which also contains unrelated files. I matched the commit to this fix by its content and timing, not from the transcript.
- How team validated the result:
  - The transcript shows the assistant:
    - curled the CSS to confirm it was served, so the CSP was the suspect;
    - checked the live dev-server header after the edit;
    - confirmed the production policy string is unchanged;
    - ran ESLint and the TypeScript check.
  - Browser confirmation by the user: not verified. The next prompt only asks "why was the website working before?".
  - Human code review: not verified.
- Policy review: Not determined. I found no course AI policy in the repo, so please confirm.

---

## FOC-AI-005 — AWS CDK infrastructure code (Phase 2: network, data, app, jobs stacks and tests)
- Date: 2026-11-03 (prompt); the response is dated 2026-11-04, when the session reached Checkpoint 2.
- Team member: Nasif
- Tool and model: Claude Code (`claude-opus-5-5`, from the session transcript)
- Mode: Generate implementation code
- Exact prompt:
```text
<pasted_content>
Continue Nasif's N4 cloud-deployment work on the FoC repo: the short pre-flight steps, then Phase 2 (CDK code, synth/diff only, $0).

Read first, in order:
1. /Users/nasif/.claude/plans/n4-phase2-handoff.md (current state, decisions, machine facts, steps, Checkpoint 2; wins over the plan where they differ)
2. /Users/nasif/.claude/plans/is-it-possible-to-abundant-crane.md (approved plan: Context, Target architecture, Phase 2, Checkpoint 2, Cost)
3. The repo's AGENTS.md, docs/architecture.md, docs/tech-stack.md, infra/AGENTS.md, and before touching order-service, order-service/AGENTS.md and order-service/.agents/README.md

Ground rules:
- Do Step A (AWS access check, merge origin/main, re-run the order-service checks), then Phase 2 only. At Checkpoint 2, report exact commands and results (failures with output), then stop and wait for my go-ahead.
- No cdk deploy and no resource creation. AWS access is read-only (docs, pricing, synth, diff). If AWS calls fail with expired credentials, ask me to sign in again.
- Newman and the live timer checks are optional: skip them unless I ask.
- Scaffold infra/ first, then ask the handoff's open decisions in one batched question before writing the data and app stacks.
- Keep the repo free of plans, handoffs, notes, overrides, scratch files and cdk.out; temp files go in your scratch directory.
- Stage explicit paths only; never push or open PRs without asking; don't edit teammates' services or the shared compose files.
- Fetch and merge origin/main into the working branch before starting and before every commit.
- Never print .env files, ~/foc-newman.env, Newman JSON reports or secret values.
- Use Node 24 for all repo commands and pass --no-watchman to Jest; ask me to start Docker Desktop if it isn't running.
</pasted_content>

aws sso login --profile foc was successful
```

- Key response (verbatim excerpt):
> # Checkpoint 2: Phase 2 is finished, all checks pass, and I've stopped for your go-ahead
>
> Nothing is deployed and nothing is pushed. A read-only check of AWS shows only `CDKToolkit` and the sandbox's own stack, with no VPC, cluster or database. The work is in 5 local commits on `n4-cloud-deployment` (`2390e00` to `7eb98a6`).
- Locations affected:
  - Commit `2390e00`: `infra/package.json`, `infra/cdk.json`, `infra/tsconfig.json`, `infra/jest.config.cjs`, `infra/eslint.config.mjs` and related scaffold files.
  - Commit `0633913`: `infra/lib/config.ts`, `infra/lib/network-stack.ts`, `infra/lib/registry-stack.ts`.
  - Commit `9c49f4a`: `infra/lib/data-stack.ts`, `infra/lib/db-bootstrap.ts`, `infra/lib/one-off-task.ts`, `infra/lib/rabbitmq-broker.ts`.
  - Commit `e538c77`: `infra/bin/foc.ts`, `infra/lib/app-stack.ts`, `infra/lib/foc-service.ts`, `infra/lib/jobs-stack.ts`, `infra/lib/observability.ts`, `infra/lib/stacks.ts`.
  - Commit `7eb98a6`: `infra/tests/*.spec.ts` (6 suites) and `infra/tests/support.ts`.
  - Later fix, commit `2da4ac0`: `infra/lib/config.ts`, `infra/lib/network-stack.ts`, `infra/tests/network.spec.ts`.
- How team validated the result:
  - The response's tables report these results:
    - infra typecheck, lint and format checks pass;
    - infra unit tests 119/119 (6 suites);
    - `pnpm synth` passes for both the demo and scale profiles;
    - `cdk diff --method=template` shows 5 new stacks;
    - order-service unit tests 391/391 and integration tests 95/95.
  - The assistant also reported running the bootstrap script on Postgres 17, applying migrations as non-superuser owners, and booting the RabbitMQ container. I saw these claims in the report but did not check the raw outputs for them.
  - The deployed system later went live (per the project notes). Whether a human reviewed the code before merge: not verified.
- Policy review: Not determined. I found no course AI policy in the repo, so please confirm.


---

## E. Junyee — Order Service and web app

### FOC-AI-001 — Implement order creation and credit reservation

- **Date:** 2026-10-12
- **Team member:** Junyee
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Generate implementation code
- **Exact prompt:**

> no need just backend, update the webapp to have a new page titled errands, where users can see open errands

- **Key response (verbatim excerpt):**

> Implemented the Order Service and added **Errands** to the web app’s top navigation.
>
> - Users can browse open errands with pickup, delivery, instructions and offered credits.
> - Backend APIs support creation, editing and credit reservation with safe retries.
> - PostgreSQL migrations are applied; Order Service is running on port **3004**.

- **Locations affected:** `order-service/prisma/schema.prisma`; `order-service/migrations/202610120001_initial_errands/migration.sql`; `order-service/src/api/order.controller.ts`; `order-service/src/api/dto.ts`; `order-service/src/api/auth.guard.ts`; `order-service/src/application/order.service.ts`; `order-service/src/application/ports.ts`; `order-service/src/domain/errand.ts`; `order-service/src/infrastructure/order.repository.ts`; `order-service/src/infrastructure/service-clients.ts`; `order-service/src/infrastructure/recovery.worker.ts`; `order-service/tests/integration/errands.spec.ts`; `order-service/tests/unit/errand.spec.ts`; `web-app/src/app/api/errands/route.ts`; `web-app/src/features/errands/errands-page.tsx`. Incorporated into commit `6055767`.
- **How team validated the result:** Recorded automated results: 17 order integration tests, 9 unit tests, and 8 desktop/mobile browser checks passed; build, lint, and type checks passed. Human validation: **Not verified**.
- **Policy review:** Needs course-staff clarification; generated work included schema and interface definitions alongside implementation.

### FOC-AI-002 — Implement owner editing and owner/admin deletion

- **Date:** 2026-10-12
- **Team member:** Junyee
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Generate implementation code
- **Exact prompt:**

> nice, now i need you to finetune somestuff. Currently, theres too much information for each errand card. restric the information on each card to title, pickup location, deliver to. Then, interested users can have a link to click to that will bring bring up a card with all the information in a card that is variable length to suit information of varying lengths. refer to the supplier service for a reference on how to do this. Also, give each user the option to edit and delete their own errand requests. Lastly, allow admins to delete all errand requests, but not edit

- **Key response (verbatim excerpt):**

> - **My requests** lets owners edit/delete open, unassigned errands.
> - Admins get **All requests** and can delete any errand, but cannot edit.
> - Deleting releases reserved credits; completed transfers remain intact.

- **Locations affected:** `order-service/migrations/202610120003_errand_deletion/migration.sql`; `order-service/prisma/schema.prisma`; `order-service/src/api/order.controller.ts`; `order-service/src/application/order.service.ts`; `order-service/src/application/ports.ts`; `order-service/src/domain/errand.ts`; `order-service/src/infrastructure/order.repository.ts`; `order-service/src/infrastructure/service-clients.ts`; `order-service/tests/integration/errands.spec.ts`; `web-app/src/app/api/errands/[id]/route.ts`; `web-app/src/app/api/errands/route.ts`; `web-app/src/app/errands/[id]/page.tsx`; `web-app/src/features/errands/errand-detail.tsx`; `web-app/src/features/errands/errands-page.tsx`; `web-app/src/styles/globals.css`; `web-app/tests/e2e/errands.spec.ts`. Incorporated into commit `6055767`.
- **How team validated the result:** Recorded automated results: 21 integration tests and 20 desktop/mobile browser checks passed, plus build, lint, and type checks. Migration application was recorded. Human validation: **Not verified**.
- **Policy review:** Needs course-staff clarification; changes included persistence and authorization behavior.

### FOC-AI-003 — Preserve exact pickup-location database labels

- **Date:** 2026-10-12
- **Team member:** Junyee
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Debug
- **Exact prompt:**

> can you clean up the location in the display? im seeing some repeats and weird spaces, such as @com2@com2, show the locations exactly the same as what is in the database

- **Key response (verbatim excerpt):**

> Fixed. Pickup locations now display the stored database label once, without added supplier names, building names or spacing. Existing errands were updated too.
>
> Printer @ Com 2@Com 2 is already stored that way in the database, so it remains unchanged.

- **Locations affected:** `order-service/migrations/202610120004_exact_pickup_labels/migration.sql`; `order-service/src/infrastructure/service-clients.ts`; `order-service/tests/integration/errands.spec.ts`; `web-app/src/features/errands/create-errand.tsx`; `web-app/src/features/errands/errand-detail.tsx`; `web-app/src/features/errands/errands-page.tsx`; `web-app/tests/e2e/errands.spec.ts`. Incorporated into commit `6055767`.
- **How team validated the result:** User reported duplicated location text. Recorded automated results after the fix: 21 integration tests and 20 browser checks passed. Human verification of the fix: **Not verified**.
- **Policy review:** Needs course-staff clarification; course permission for this AI-assisted bug fix has not been verified.

### FOC-AI-004 — Implement server-side errand sorting

- **Date:** 2026-10-12
- **Team member:** Junyee
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Generate implementation code
- **Exact prompt:**

> give the number of credits for each of each errand as well for the errand catalogue, use the same UI as the UI for the credits each user can see. also add the ability to filter the errands in the catalogue. the options for filter are by time creation, where there is the option to go from latest to oldest and oldest to latest, and another option will be the number of credits for each errand, again ranging from max to min, and min to max

- **Key response (verbatim excerpt):**

> The **Sort errands** menu offers:
>
> - Latest → oldest
> - Oldest → latest
> - Credits: max → min
> - Credits: min → max
>
> Sorting applies across the whole catalogue. Refresh the web app to see it.

- **Locations affected:** `order-service/src/api/dto.ts`; `order-service/src/api/order.controller.ts`; `order-service/src/application/order.service.ts`; `order-service/src/application/ports.ts`; `order-service/src/infrastructure/order.repository.ts`; `order-service/tests/integration/errands.spec.ts`; `web-app/src/app/api/errands/route.ts`; `web-app/src/features/errands/errands-page.tsx`; `web-app/src/styles/globals.css`; `web-app/tests/e2e/errands.spec.ts`. Incorporated into commit `6055767`.
- **How team validated the result:** Recorded automated results: 22 integration tests and 22 desktop/mobile browser checks passed, plus build and lint checks. Human validation: **Not verified**.
- **Policy review:** Needs course-staff clarification; course permission for AI-assisted API and query implementation has not been verified.

### FOC-AI-005 — Display courier usernames throughout the delivery workflow

- **Date:** 2026-10-18
- **Team member:** Junyee
- **Tool and model:** Codex (GPT-6.1 Sol)
- **Mode:** Generate implementation code / explain
- **Exact prompt:**

> two things, how can i open and show the databse of order and credit service. second, help me tweak the web app such that after an errand has been accepted the errand page will reflect the username of the courier rather than the courier id

- **Key response (verbatim excerpt):**

> **The courier display is fixed.** Errand details now show the courier’s username after acceptance, including after refresh and lifecycle actions. If their identity is unavailable, it shows “Unavailable user” rather than a UUID.

- **Locations affected:** `web-app/src/services/errand-identity.server.ts`; `web-app/src/services/contracts.ts`; `web-app/src/app/api/errands/[id]/route.ts`; `web-app/src/app/api/errands/[id]/[action]/route.ts`; `web-app/src/app/api/errand-operations/[id]/route.ts`; `web-app/src/features/errands/errand-detail.tsx`; `web-app/tests/e2e/errand-lifecycle.spec.ts`. Repository cross-reference: `ddce7b1` (UI fix). This interaction implemented identity resolution in the web layer; the separate backend enhancement in `9ac33a1` is not attributed to this prompt.
- **How team validated the result:** Recorded automated results: all 10 desktop/mobile delivery checks passed, plus type checking, lint, and production build. Human validation: **Not verified**.
- **Policy review:** Needs course-staff clarification; course permission for this AI-assisted implementation has not been verified.
