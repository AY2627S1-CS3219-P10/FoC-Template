<!-- AI-assisted disclosure draft: OpenAI Codex, GPT-6.1; author review required before submission. -->
# CS3219 - Friend on Campus (FoC)

Friend on Campus is a peer-to-peer campus errand platform. A student can
request an item from a campus supplier, another student can fulfil the errand,
and credits circulate within the platform as a closed, non-monetary economy.

## AI Use Summary

This is a project-level disclosure for **all FoC team members** listed in the
[team members section](#team-members). It covers AI-assisted contributions across
the shared repository, rather than serving as one member's personal declaration.

**Recorded tool and model:** OpenAI Codex with GPT-6.1, confirmed on
10 November 2026. Each team member is responsible for recording any additional
tools or models they used in the shared log. 

**Team authorship:** The team confirms that requirements elicitation,
architecture diagrams, and architecture decisions were human-authored. The
established architecture and technology choices are documented in
[architecture.md](docs/architecture.md) and [tech-stack.md](docs/tech-stack.md).
AI assisted portions of implementation, debugging, refactoring, testing, and
documentation within that project context. This does not mean the entire
codebase was AI-generated, or that every line was written without assistance.
The team remains responsible for all submitted work.

**Scope of assistance:** Our team uses this disclosure to distinguish human
authorship from AI assistance in selected implementation tasks. The recorded
examples below illustrate assisted work; they are not an exhaustive account of
every member's contributions.

- **Implementation:** Generating or adapting selected code portions within the
  established stack. Recorded examples include courier-review validation and
  endpoints, supplier category tags, migrations, API filters, CSV import updates,
  frontend filters, and administrator controls.
- **Debugging and refactoring:** Suggestions for validation, duplicate handling,
  formatting, and build/test failures.
- **Testing:** Generating and refining unit, database integration, and browser
  test cases, with the authors evaluating their relevance and results.
- **Documentation and development workflow:** Drafting documentation, explaining
  code, suggesting commit messages, and providing Git guidance.

**Review and verification:** The ed team confirms that all retainAI-assisted
code was reviewed by the responsible authors. Each member is accountable for
understanding, correcting, and verifying their retained AI-assisted contributions.
Relevant unit tests, PostgreSQL integration
tests, desktop/mobile Playwright tests, lint, TypeScript checks, and builds were
used for the recorded changes; see the [shared AI usage log](ai/usage-log.md).
Historical test results apply to their recorded versions, so the authors must
also verify the final submitted commit. Every member remains accountable for
understanding the entire codebase.

**Prompts, key outputs, and attribution:** [ai/usage-log.md](ai/usage-log.md)
is maintained as one shared record for the whole team. Each contributor must add
their exchanges, affected files, retained outputs, sources, and checks, including
assistance outside the currently documented examples.
Retrospective entries identify where exact prompt times were not preserved.
Known AI-assisted source portions are labelled with provenance comments. CSV
data and already-applied migrations use explicit file-level log entries to
preserve valid data formats and migration checksums; confirm this handling with
the teaching team. Implementation-level suggestions about feature placement,
schemas, and API shapes remain in the log for the team's review against the
course's prohibited-phase rules, rather than being omitted from disclosure.

**Academic integrity and licensing:** All team members must check retained outputs for
plagiarism, incompatible licenses, and uncredited third-party material. Credit
sources used for copied or adapted material. Where reuse rights are unclear,
replace the material with an implementation from the specification or an
independently worded description. Passing tests does not establish licensing
compliance. Sources for supplier catalog facts are credited in the usage log.

**Team norms and submission:** All members share responsibility for restricting
AI assistance to permitted work, reviewing and understanding retained outputs,
maintaining the log, and keeping this disclosure accurate. Each contributor records
their own usage; the team reviews the combined disclosure before submission.
Every member must confirm these norms,
complete the [submission audit](ai/usage-log.md#team-submission-audit), and link
this README's [AI Use Summary](#ai-use-summary) from the submission slide deck.
Keep all tracked [AGENTS.md files and repository skills](ai/usage-log.md#agent-instructions-and-skills)
in the submission and add any other instructions or skills actually used.

## Current milestone

The React frontend is available in `web-app/`, with account registration,
verification, login, supplier browsing, credit balances and open errands connected to the existing services.
There is no mock-data fallback. User, Supplier, Credit and Order Services must be running. See
[web-app/README.md](web-app/README.md) for startup and verification commands.
The original scaffold notes below describe the initial milestone and may not
reflect services implemented since then.

On Windows, start Docker Desktop, then run from this folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Add `-Install` on first setup. Open http://localhost:3000, log in, and click
the gold coin and balance in the top bar to open the credits page. Missing credit
accounts receive the configured starting credits exactly once after login.
Existing balances are preserved.

This repository currently contains structure only. The implementation stack
has been selected, but no application runtime, dependency, API, persistence
model, or business logic has been installed or implemented yet. See
[docs/tech-stack.md](docs/tech-stack.md) for the accepted technology decision.

## Repository layout

```text
.
|-- web-app/                 Responsive student and administrator client
|-- user-service/            Accounts, profiles, authentication, privileges
|-- supplier-service/        Suppliers and campus pickup locations
|-- order-service/           Errand creation, discovery, and lifecycle
|-- credit-service/          Credit balances, reservations, and settlement
|-- data/                    Non-production seed assets
|-- docs/                    Cross-service architecture decisions
|-- compose.yaml             Future local orchestration manifest
`-- .env.example             Shared environment-variable catalogue
```

Each backend service uses the same layered internal layout:

```text
<service>/
|-- src/
|   |-- api/                 Transport adapters (HTTP, events, jobs)
|   |-- application/         Use-case orchestration
|   |-- domain/              Business rules and domain types
|   `-- infrastructure/      Persistence and external integrations
|-- migrations/              Service-owned persistence migrations
|-- tests/
|   |-- unit/
|   `-- integration/
|-- Dockerfile               Container-build placeholder
`-- README.md                Scope and ownership boundary
```

The web client follows a similarly neutral feature-oriented layout. See
[docs/architecture.md](docs/architecture.md) for ownership rules and allowed
dependencies, and [docs/tech-stack.md](docs/tech-stack.md) for the technology
choices all contributors and coding agents must follow.

## Setup status

- Service and client boundaries are scaffolded.
- Empty directories are retained with `.gitkeep` files.
- Container and orchestration files remain placeholders until their respective
  implementation tasks begin.
- No endpoint, schema, UI component, or business workflow is implemented.

## Team members

| Name | Ownership |
| --- | --- |
| Teng Yu Sheng Arthur | User Service |
| Michelle | Supplier Service |
| Nur Hidayah Binte Zulkifli (Hazel) | Credit Service and UI |
| Hasan Ahmed Nasif | Order Service |
| Toh Jun Yee | Order Service and UI |

Nice-to-have capabilities should remain inside an existing service when they
share its domain. Add another top-level service only when it has independent
data ownership and deployment needs.

Order Service FR4 implementation and manual PowerShell launch commands: [order-service/README.md](order-service/README.md).

## Windows pnpm lockfile troubleshooting

Use the repository-pinned pnpm version (currently 12.11.2) and Windows system certificates:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
pnpm --version
pnpm install --frozen-lockfile
```

If a merge left missing dependency snapshots or manifest/lock mismatches, repair from the repository root, then verify reproducibility:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
pnpm install --fix-lockfile
pnpm install --frozen-lockfile
```

User Service and Supplier Service have independent lockfiles; run their frozen installs from their respective directories. Keep the root pnpm-lock.yaml changes in source control. Its package-manager environment and application dependency data are separate YAML documents in the same file; both are required. Do not disable certificate or package-manager signature verification to work around verification errors.
