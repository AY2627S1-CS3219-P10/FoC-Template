# CS3219 - Friend on Campus (FoC)

Friend on Campus is a peer-to-peer campus errand platform. A student can
request an item from a campus supplier, another student can fulfil the errand,
and credits circulate within the platform as a closed, non-monetary economy.

## Current milestone

This repository currently contains structure only. No application runtime,
API, persistence model, or business logic has been selected or implemented.
That decision is deliberate: the project brief defines system behaviour but
does not prescribe a language or framework.

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

Each backend service uses the same stack-neutral internal layout:

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
dependencies.

## Setup status

- Service and client boundaries are scaffolded.
- Empty directories are retained with `.gitkeep` files.
- Container and orchestration files are intentionally placeholders until the
  team selects its runtime, database, and messaging technologies.
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
