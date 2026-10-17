# ADR 0001: Local JWT validation for credit reads

- Status: Accepted
- Date: 2026-10-17

## Context

Credit balance and transaction-history reads need to authenticate User Service
access tokens without making routine reads depend on User Service availability.
Access tokens expire after 15 minutes.

## Decision

Credit Service validates read tokens locally. It verifies the HS256 signature,
token type, issuer, audience, expiry, and required `sub`, `sid`, and `isAdmin`
claims. A student may read only the balance identified by `sub`; an administrator
may read any balance.

## Consequences

Revocation and role changes take effect in Credit Service when the current
access token expires, so a stale authorization window of up to 15 minutes is
accepted for these reads.

HS256 requires Credit Service to hold `JWT_ACCESS_TOKEN_SECRET`. Any service
holding that shared secret can mint valid tokens, including tokens with
`isAdmin: true`; this is a known trade-off for this milestone. Moving to RS256
would let verifier services hold only a public key and remove that capability,
but it is a larger, optional change.

## Rejected alternatives

- Live User Service validation: rejected because it couples read availability
  and latency to User Service.
- Cached live validation: rejected because invalidation and failure behavior add
  complexity with little benefit for a 15-minute token lifetime.
- Revocation or role-change events: rejected as overkill for this milestone.
