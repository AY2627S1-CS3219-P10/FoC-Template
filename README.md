# CS3219 - Friend on Campus (FoC)

Friend on Campus is a peer-to-peer campus errand platform. A student can
request an item from a campus supplier, another student can fulfil the errand,
and credits circulate within the platform as a closed, non-monetary economy.

## Current milestone

The React frontend is available in `web-app/`, with account registration,
verification, login, and supplier browsing connected to the existing services.
There is no mock-data fallback. Both backends must be running. See
[web-app/README.md](web-app/README.md) for startup and verification commands.
The original scaffold notes below describe the initial milestone and may not
reflect services implemented since then.

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
| Teng Yu Sheng Arthur | To be assigned |
| Michelle | To be assigned |
| Nur Hidayah Binte Zulkifli (Hazel) | To be assigned |
| Hasan Ahmed Nasif | To be assigned |
| Toh Jun Yee | To be assigned |

Nice-to-have capabilities should remain inside an existing service when they
share its domain. Add another top-level service only when it has independent
data ownership and deployment needs.
