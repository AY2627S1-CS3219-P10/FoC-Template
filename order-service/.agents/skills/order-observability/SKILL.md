---
name: order-observability
description: Add structured logging, correlation ID propagation across HTTP and AMQP, and the health endpoint to order-service (NFR8). Use for the N1 slice and whenever a slice adds a new flow that crosses a service boundary.
---

# order-observability

## Requirement (NFR8)
Structured logs with timestamp, service, severity and `correlationId`. One correlation ID across the create and complete flows. A health endpoint.

## Log format
- One JSON object per line with at least: `timestamp`, `service` (`order-service`), `severity`, `message`, `correlationId`, and where known `errandId`, `operationId`, `eventId`.
- Never log secrets, tokens, passwords or personal data (emails, names). IDs are fine.
- Log state transitions (from, to, actor id), credit calls (path, outcome, retry class) and relay publishes.

## Correlation ID
1. **Inbound HTTP:** read the correlation header if present, otherwise generate a UUID. The header name is a parked question until the other services agree. Check what the other services and the web-app already send first, and use that if it exists. Record the choice as a decision.
2. **Request scope:** keep it in request-scoped context (for example AsyncLocalStorage) so every log line includes it.
3. **Outbound HTTP:** send it on every call to credit, user and supplier.
4. **Journal and outbox:** store it on the `ErrandOperation` and on the outbox row so retries and background workers reuse the same ID.
5. **AMQP:** send it as a message header. **Never put it in the `errand.completed.v1` body.** Credit requires exactly `{errandId, requesterId, courierId, amount}`; extra fields can fail its handler.
6. **Background jobs** (recovery worker, relay, timers): take the ID from the stored row, or generate one and log that you did.

## Health endpoint
- Report liveness and readiness. Readiness checks Postgres. It must **not** depend on RabbitMQ (events are gated by `ORDER_EVENTS_ENABLED`).
- Keep the existing endpoint's path and response shape if one exists; add fields only.

## Tests
- A request with a correlation header produces log lines and outbound calls carrying that ID.
- A request without one gets a generated ID.
- The AMQP message has the header and the body still has exactly four fields.

Hand off to: order-verify.
