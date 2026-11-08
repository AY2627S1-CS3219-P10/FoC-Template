# Load and concurrency tests

This suite uses the repository-standard **k6** tool to verify readiness,
response time under load, and the two concurrency invariants that protect the
platform's core workflows:

- up to 500 active users can browse errands and suppliers with sub-second p95
  response time;
- exactly one courier can win a simultaneous errand-acceptance race;
- repeated concurrent delivery of the same credit reservation creates one
  reservation and returns idempotent replays for every duplicate.

The k6 tests do not insert accounts or fixtures. Test identities must be
created through service-owned APIs or the dedicated User Service staging
seeder, never by writing another service's database from load-test code.

## Prepare staging identities

Generate one requester/stress identity and ten courier identities locally:

```bash
pnpm --dir infra load:prepare-fixtures
```

The command creates `test-account-seed.json`, `stress-user.json`, and
`couriers.json` under the ignored `infra/load/secrets/` directory with file
mode `0600`. Supply `test-account-seed.json` to the User Service one-off test
account seeder through the deployment secret manager. The other two files are
read directly by k6. The generated password is never printed.

The command refuses to overwrite existing credentials. Use `-- --force` only
when intentionally rotating all fixture credentials and reseeding a clean
staging database.

## Install k6

macOS:

```bash
brew install k6
```

Or use the official container from the repository root:

```bash
docker run --rm -i --network host -v "$PWD:/work" -w /work grafana/k6 run infra/load/smoke.js
```

Docker Desktop on macOS does not support host networking in every version. In
that case use `host.docker.internal` in the base URLs or install k6 locally.

## 1. Smoke test

Start the local stack, then verify that the public web route and its Order
Service dependency are reachable:

```bash
k6 run infra/load/smoke.js
```

For AWS, use the deployed CloudFront endpoint. Backend services are private and
must not be exposed for load testing:

```bash
k6 run \
  -e WEB_BASE_URL=https://d1jp4ocurldf39.cloudfront.net \
  infra/load/smoke.js
```

The currently deployed public preview route may return 404 if the deployment
does not include `GET /api/errand-previews`. That is a deployment finding, not
a reason to expose Order Service directly. Use the authenticated preflight and
stress workflow below without changing service boundaries.

## Authenticated AWS preflight

After creating `infra/load/secrets/stress-user.json`, verify CloudFront,
web-app authentication, User Service, and authenticated Order Service access:

```bash
k6 run \
  -e WEB_BASE_URL=https://d1jp4ocurldf39.cloudfront.net \
  --summary-export=infra/load/results/preflight.json \
  infra/load/preflight.js
```

Do not proceed to load generation unless every preflight threshold passes.

## 2. Browse stress test (500 active users)

Copy `infra/load/secrets/stress-user.example.json` to the ignored file
`infra/load/secrets/stress-user.json` and add one dedicated verified test
account. k6 logs in once, reuses that short-lived session, and exercises
CloudFront, the load balancer, web-app, Order Service, and PostgreSQL without
creating data or consuming credits. The explicit flag prevents an accidental
run against an unknown target.

```bash
k6 run \
  -e ENVIRONMENT=staging \
  -e ALLOW_STRESS=true \
  -e WEB_BASE_URL=https://d1jp4ocurldf39.cloudfront.net \
  -e MAX_VUS=500 \
  --summary-export=infra/load/results/read-500.json \
  infra/load/read-stress.js
```

The default profile ramps through 100 users to 500, holds the peak for five
minutes, then ramps down. Override `RAMP_UP`, `WARM_DURATION`, `RAMP_TO_PEAK`,
`PEAK_DURATION`, and `RAMP_DOWN` with k6 duration strings for a smaller dry run.
Start with `MAX_VUS=10` locally before using the full profile in AWS staging.

## 3. Concurrent errand acceptance

Prepare one OPEN errand and multiple verified courier accounts. Copy
`infra/load/secrets/couriers.example.json` to
`infra/load/secrets/couriers.json`, then place the dedicated test-account
credentials in that ignored file. Do not include the requester's account. The
test logs in once per courier through the public web app and passes only when
one request succeeds and all others receive HTTP 409 conflicts.

```bash
k6 run \
  -e ENVIRONMENT=staging \
  -e ALLOW_MUTATIONS=true \
  -e WEB_BASE_URL=https://d1jp4ocurldf39.cloudfront.net \
  -e ERRAND_ID='<open-errand-uuid>' \
  -e COMPETITORS=10 \
  --summary-export=infra/load/results/accept-race.json \
  infra/load/errand-accept-race.js
```

This fixture is single-use because the winning request changes the errand.

## 4. Credit reservation idempotency (local only)

Credit Service is private in AWS, and its internal token must not be copied out
or used from a developer machine. Run this probe only against the local stack.
Prepare a credit account with enough available balance and generate a new UUID
v4 for `ERRAND_ID`. The internal token must be the local Order Service token.
Twenty simultaneous identical requests should yield one HTTP 201 creation and
nineteen HTTP 200 replays without reserving the amount more than once.

```bash
k6 run \
  -e ENVIRONMENT=local \
  -e ALLOW_MUTATIONS=true \
  -e CREDIT_BASE_URL=http://localhost:3003 \
  -e CREDIT_ORDER_SERVICE_TOKEN='<local internal token>' \
  -e REQUESTER_ID='<test-user-uuid>' \
  -e ERRAND_ID='<new-uuid-v4>' \
  -e AMOUNT=1 \
  -e ATTEMPTS=20 \
  infra/load/credit-idempotency.js
```

After the test, verify the user's available balance decreased by exactly
`AMOUNT` and reserved balance increased by exactly `AMOUNT` through the normal
authenticated Credit Service balance endpoint.

## AWS preparation checklist

- Run only in a dedicated staging environment with production-like instance,
  database, connection-pool, and autoscaling settings.
- Keep load generators outside the application host and preferably in the same
  AWS region to measure the service rather than internet latency.
- Create dedicated test users and disposable errands; never use real student
  accounts, passwords, JWTs, or production service tokens.
- Store tokens in the shell or CI secret store. Do not put them in `.env` files,
  command logs, screenshots, or Git.
- Watch application p95/p99 latency, HTTP 5xx, CPU, memory, event-loop lag,
  PostgreSQL connections/locks, Redis, RabbitMQ queue depth, and container
  restarts while k6 runs.
- Set AWS budgets and alarms before sustained tests. Start at 10, then 50, 100,
  250, and finally 500 users.
- Export results to a time-series backend or save a k6 summary artifact for the
  project report. Record the commit SHA, environment size, dataset, profile,
  thresholds, and observed bottleneck for every run.
- Stop and investigate if error rate exceeds 1%, p95 exceeds one second, queues
  grow without recovery, or database connections approach their configured
  maximum.
- Copy `infra/load/REPORT_TEMPLATE.md` for the submission evidence and complete
  it during the run rather than reconstructing timestamps afterwards.

## Interpreting failures

A failed k6 threshold makes the process exit non-zero, which is suitable for a
manual GitHub Actions workflow later. Do not put the 500-user test on every pull
request: keep smoke tests lightweight and make stress/concurrency runs manually
triggered against staging.
