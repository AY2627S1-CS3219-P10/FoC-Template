# Project structure and service boundaries

## Boundary principles

1. Each backend service owns its source, tests, migrations, container build,
   and future persistence store.
2. A service must not read or write another service's database.
3. Cross-service behaviour should use explicit API or event contracts once the
   communication approach is selected.
4. Shared code must be limited to technical contracts or tooling; domain logic
   stays with the service that owns it.
5. Nice-to-have features do not automatically require new services. Split one
   out only when independent ownership and deployment justify it.

## Ownership map

| Component | Owns | Does not own |
| --- | --- | --- |
| Web app | Presentation, navigation, client-side interaction | Authoritative business data |
| User service | Accounts, profiles, verification, sessions, privileges | Errands or balances |
| Supplier service | Suppliers, pickup locations, availability | Errand lifecycle |
| Order service | Errands, assignment, lifecycle, expiry | User credentials or credit ledger |
| Credit service | Available/reserved balances and transaction trail | Errand lifecycle |

## Dependency direction inside a backend service

```text
api -> application -> domain
             ^
             |
      infrastructure
```

The domain layer should not depend on transport, database, or vendor-specific
code. The application layer coordinates domain behaviour through interfaces;
infrastructure supplies those interfaces later.

## Deferred decisions

The following choices are intentionally outside this setup sprint:

- frontend and backend frameworks
- language and package-management tooling
- database technology and schema design
- synchronous versus asynchronous service communication
- API gateway and authentication-token strategy
- notification, email, observability, and deployment providers

Record each material choice as an architecture decision before adding
stack-specific files across the repository.
