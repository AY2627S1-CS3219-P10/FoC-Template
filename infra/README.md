# Friend on Campus on AWS

**Last updated:** 2026-11-04. **Owner:** Nasif (`infra/` and CI/CD).

This is the current source of truth for how the app runs on AWS. If an older plan
or note disagrees with it, this document wins. `docs/tech-stack.md` is still the
record of which technologies the project uses.

**Where to start:**

- **Everyone:** [Current status](#current-status) and [If you change code](#if-you-change-code).
- **Running the load test:** [Load testing](#load-testing).
- **Presenting:** [Decisions and reasons](#decisions-and-reasons) and [Likely questions](#likely-questions).

This repository is public. Never add passwords, tokens, the AWS account ID, or
personal email addresses to it. Ask Nasif if you need any of them.

## Current status

The app is live at **https://d1jp4ocurldf39.cloudfront.net**.

| Area | Status |
| --- | --- |
| AWS deployment | Live: 5 services, broker, database and cache all running |
| Code running | Commit `7eb98a6`, which contains `main` up to `e02d200` |
| Monitoring | All 15 `foc-*` alarms OK, and alarm emails are confirmed |
| Full errand flow | Partly tested (see below) |
| CI/CD | Not built yet, so pushing to `main` does **not** change AWS |
| Load test | Not done yet |
| Redundancy | Single instances, by decision (see [Accepted limitations](#accepted-limitations)) |

### What has been tested

| Check | Result | Evidence |
| --- | --- | --- |
| Public site loads over HTTPS | Pass | `/login` returns 200 through CloudFront |
| Register and verify a new account | Pass | Nasif's browser run; `credit-service` logged 3 `user.verified.v1` events |
| Events reach `credit-service` through RabbitMQ | Pass | The same 3 events, sent by `user-service`'s outbox |
| Log in | Pass | Nasif's browser run |
| Create an errand that another account can see | Pass | Nasif's browser run |
| Bookmark an errand | Requests reached the service | `order-service` logged the requests; the result wasn't checked |
| Errors in service logs | None found | Searched all 5 services after the run |
| Dead-letter queue | Empty | Every `dlq_depth` reading is 0 |
| Accept, pick up, deliver, confirm | **Not tested yet** | Nasif plans to test this next |
| Courier is paid once, by the offer amount | **Not tested yet** | Depends on the row above |
| 74 suppliers and 77 locations | **Not confirmed** | The seed processed all 74 CSV rows, but the totals weren't checked |
| Newman API suite on AWS | **Not run** | Nasif chose to skip it for now |
| Autoscaling under load | **Not tested yet** | This is the load test's job |

## Architecture

Only `web-app` can be reached from the internet. Every other service is in a
private subnet.

```text
Browser
  │ HTTPS
CloudFront      public address; caches only /_next/static
  │ HTTP; the load balancer accepts only CloudFront's addresses
Load balancer   public subnets
  │
web-app         private subnets from here on
  │ http://<service>.foc.internal
  ├─ user-service ───── email out through NAT to Gmail
  ├─ supplier-service
  ├─ credit-service
  └─ order-service ──── also calls user, supplier and credit

Data: RDS (4 databases) · Valkey (user, order) · RabbitMQ (user, credit, order)
```

ECS has three terms worth knowing. A **task definition** is the recipe for running
something, a **task** is a running copy of it, and a **service** keeps a set number
of tasks alive.

### AWS services in use

Region: `ap-southeast-1` (Singapore).

| Service | What it runs | Why it's there |
| --- | --- | --- |
| ECS Fargate | 6 services, 1 task each: `web-app` (0.5 vCPU, 1 GB), 4 backends (0.25 vCPU, 0.5 GB each), RabbitMQ (0.25 vCPU, 1 GB) | Runs containers with no servers to manage |
| RDS | PostgreSQL 17.9, `db.t4g.small`, 20 GB, encrypted, private, one zone, 1 day of backups | The authoritative data |
| ElastiCache | Valkey 8.2, one `cache.t4g.micro` node, TLS on | BullMQ jobs and rate limits |
| EC2 | One `t4g.micro` NAT instance | Lets private services reach Gmail, ECR and Secrets Manager |
| Load balancer (ALB) | One target: `web-app` | Health checks and spreading traffic across tasks |
| CloudFront | The public URL | HTTPS without a custom domain |
| ECR | 7 image repositories, immutable tags, last 10 images kept | Stores the built images |
| Secrets Manager | 18 secrets | Injected into containers when they start |
| Cloud Map | `foc.internal` DNS | Lets services find each other |
| CloudWatch and SNS | 15 alarms, a dashboard named `foc`, logs kept 1 week, email alerts | Monitoring |
| CloudFormation | 5 stacks | Applies the CDK code to AWS |
| Application Auto Scaling | The 5 app services, 1 to 3 tasks | Adds copies under load |
| AWS Budgets | Spend alerts | Protects the credits |

Gmail is the only outside service in use. RabbitMQ is **not** an AWS managed
service here: we run the official container ourselves on Fargate.

## Decisions and reasons

### Why RabbitMQ runs on Fargate, not Amazon MQ

The original plan was Amazon MQ on `mq.t3.micro`, but that option no longer exists.
AWS's documentation says it can't be used for new brokers and that support ended on
October 1, 2026. Nasif chose to self-host for the demo.

| | Self-hosted on Fargate | Cheapest Amazon MQ (`mq.m7g.medium`) |
| --- | --- | --- |
| Cost (estimate) | About $0.44/day | About $4.10/day |
| Patching, failover options | Ours to handle | AWS provides them |
| Queued messages when the broker is replaced | **Lost** | Kept on durable storage |
| Metrics | We built them | Provided by AWS |
| Version | 4.2.9, same as local Compose | 4.2 available |

**Don't say we couldn't afford Amazon MQ.** The extra $3.66/day is about $40 over
11 days, which the credits cover. The real argument is that a single-node demo broker
didn't justify a 60% higher daily bill, because the application already handles most
broker failures.

A courier gets paid like this:

1. `order-service` saves the event in an outbox table, in its own database.
2. A relay publishes it every second and marks it published only after the broker confirms.
3. `credit-service` consumes it and ignores duplicates by event ID.

| Where the message was when the broker died | Result |
| --- | --- |
| Not yet published | Safe, because it stays in the outbox |
| Published before `credit-service` re-created its queue | Safe for order events: the broker returns the message and the relay retries |
| The same, for `user.verified` | Can be lost, because the user relay doesn't use that retry. The web app creates a missing credit account after login, and the logs from the browser run are consistent with this |
| Confirmed and still queued | **Lost, so a courier may not be paid.** There's no automatic recovery. The window should be small while `credit-service` keeps up, but it hasn't been measured |

Self-hosting also meant building a few things Amazon MQ would have provided:

- The broker runs as the `rabbitmq` user, because a root health check during boot crashed it.
- A sidecar container restores the dead-letter queue after a restart and logs its depth, which becomes a CloudWatch metric.
- Memory is capped at 512 MB explicitly, because RabbitMQ ignored the container limit in testing.
- The old broker stops before a new one starts, so messages don't split across two brokers. That means a short outage if the broker is redeployed.

**A version you can say out loud:** "Our original Amazon MQ tier was retired, and the
next one cost about ten times more. Because we use a transactional outbox, publisher
confirms and idempotent consumers, unpublished events survive a broker failure. We
accept that messages already queued could be lost, and our scale profile moves to a
clustered Amazon MQ."

### Other decisions

| Decision | Why | What it costs us |
| --- | --- | --- |
| ECS, not Kubernetes | `docs/tech-stack.md` excludes Kubernetes for the course | Less portable |
| AWS CDK in TypeScript | Same language as the app, repeatable, unit tested (120 tests) | Tied to AWS |
| 5 stacks | Different lifetimes: `FocApp` can be destroyed without touching data | A strict deploy order |
| CloudFront in front of the load balancer | Free HTTPS without a domain, and the load balancer can't be reached directly | CloudFront to the load balancer is plain HTTP |
| 1 RDS instance, 4 databases, 4 logins | Cost, while a `REVOKE` stops a service's login connecting to another service's database | One outage affects all four |
| PostgreSQL 17 | One instance needs one version, and root Compose already uses 17 (user and supplier use 18 locally) | A version difference for those two services |
| `sslmode=no-verify` | RDS's CA isn't in Node's trust store, and the database is in isolated subnets | Encrypted, but the server's identity isn't verified |
| Valkey with `noeviction` | Cheapest option, works with `rediss://` and no code change, and BullMQ needs `noeviction` | None significant at this size |
| NAT instance, not NAT gateway | Cheaper | One more thing we maintain |
| Secrets Manager, not SSM | CloudFormation can't create SSM SecureStrings | About $0.24/day, and a changed value needs tasks restarted |
| Immutable image tags (git SHA) | You always know exactly what's running | A new tag for every build |
| Min 1, max 3 tasks, extras on Spot | Cheap at idle, and the baseline task never runs on Spot | Limited capacity under heavy load |

The NAT instance gives a good real-failure story. On `t4g.nano`, `yum` ran out of
memory at boot, so forwarding was never set up and the broker couldn't fetch its
secrets. The instance's console log showed the cause, and moving to `t4g.micro` fixed it.

### Accepted limitations

**Single instances are a deliberate decision by Nasif for this project, and they stay
as they are.** There is one task per service at idle, one broker, one cache node, one
NAT instance and a single-zone database. Describe this as "production-style at minimum
size", not as highly available.

The `scale` profile in `infra/lib/config.ts` shows what the larger version would be:
Multi-AZ, per-service databases, RDS Proxy, a clustered Amazon MQ and a NAT gateway per
zone. It's covered by unit tests but has **never been deployed**.

### Not decided

**Custom domain:** the site stays on its CloudFront address for now. A name like
`foc.cloudfront.net` isn't possible, because CloudFront assigns those addresses.
A custom name means buying a domain, which promo credits usually don't cover.

## How deployment works

Deployment has three layers:

1. **Infrastructure:** CDK generates templates, and CloudFormation creates or updates the AWS resources.
2. **Code:** Docker builds images, which are pushed to ECR tagged with the commit (for example `7eb98a6`).
3. **Data:** one-off tasks run migrations and seeds.

The stacks must be deployed in this order:

| Step | What happens | Why at this point |
| --- | --- | --- |
| `FocNetwork`, `FocRegistry` | VPC, cluster, security groups, image repositories | Everything else needs them |
| Build and push images | All 7 images go to ECR | Tasks can't start without them |
| `FocData`, then database bootstrap | Database, cache, broker, secrets, then 4 logins and databases | Services need somewhere to connect |
| Set 2 secrets by hand | SMTP and admin accounts | Keeps the values out of the repo |
| `FocJobs`, then migrations and seeds | User and supplier migrations, supplier locations, 5 admins | Those two services don't migrate at startup |
| `FocApp` | 5 services, load balancer, CloudFront, alarms | Order and credit run their own migrations as they start |

**Updating code:** a new image tag creates a new task definition. ECS starts new tasks
alongside the old ones and removes the old ones once the new ones are healthy. If new
tasks keep failing, a circuit breaker rolls back automatically. It can't catch a logic
bug that passes health checks, and it doesn't undo migrations.

**Today:** Nasif deploys by hand from a laptop.

**Planned CI/CD:** the goal is that a push to `main` updates AWS. `ci.yml` will test
pull requests, and `deploy.yml` will build images, run migrations and roll out `FocApp`.
Secret values and changes to the network or data stacks stay manual. This depends on
the sandbox allowing GitHub to sign in to AWS, which hasn't been tested yet.

Once it's live, **every push to `main` goes to the live site**, as long as the tests pass.

## If you change code

**Everyone on the team can push to `main` directly**, with no approval needed. The points
below are what your change needs in order to work on AWS.

1. **Until CI/CD is live, pushes don't reach AWS.** Anything after `e02d200` isn't live yet, so ask Nasif if you need something deployed sooner.
2. **New environment variable or secret:** add it in `infra/lib/app-stack.ts`, or `infra/lib/data-stack.ts` for a secret. Otherwise your service won't get it on AWS, even though it works locally. Many services fall back to `127.0.0.1` defaults, which fail in the cloud.
3. **Migrations must keep the previous code working.** Old and new tasks run side by side during a rollout, and a rollback doesn't undo a migration. Add first, and remove in a later release.
4. **New call between services:** add it to `CALLERS` in `infra/lib/config.ts`. Security groups block anything not listed.
5. **Keep health endpoints working:** `/login` on `web-app`, `/api/health/ready` on user and supplier, `/health/ready` on credit and order. A failing health check rolls your deployment back.
6. **Keep images building for `linux/amd64`.** Before a change that affects a Dockerfile or lockfile, make sure the image still builds.

## Load testing

This section is here to help you find your way around. How you design the test is up to you.

**The goal:** show that ECS scales out under load and back in afterwards, and record
latency and error rate. `docs/tech-stack.md` names k6 and a 500-active-user workload, and
scripts belong in `infra/load/`. If the demo size can't hold 500 users, that's still a
useful result, so report what it does hold.

### Where to look

| You want | Look at |
| --- | --- |
| The routes to call | `web-app/src/app/api/`. All traffic enters through `web-app`, and `GET /api/errands` works without logging in, so it's an easy place to start |
| How login and sessions work | `web-app/src/app/api/auth/[action]/route.ts` and `web-app/src/services/backend.server.ts` |
| Scaling settings | `infra/lib/foc-service.ts`, `infra/lib/app-stack.ts` and `infra/lib/config.ts` |
| Rate limits | `user-service/src/modules/accounts/infrastructure/messaging/redis-public-endpoint-rate-limiter.ts` |
| Graphs | The CloudWatch dashboard `foc`, with requests, p95 response time, running tasks, CPU, Postgres connections and broker backlog. Ask Nasif for access or screenshots |

### Worth knowing first

- **Scaling:** each service runs 1 to 3 tasks. `web-app` scales at 60% CPU or 300 requests per task per minute, and backends at 60% CPU. Scale-in is slow, typically 15 minutes or more after load ends.
- **Use the public URL.** The load balancer accepts traffic only from CloudFront. Requests under `/_next/static/*` come from CloudFront's cache, so they don't load the services.
- **Avoid register.** It sends real email through Gmail, which has a daily limit.
- **Logins are rate limited:** 100 per minute per client and 10 per minute per account. The "client" is probably the `web-app` task, not each visitor, which comes from reading the code and hasn't been tested. Logging in once and reusing the session gets around this, and 429 responses mean the limiter is working, not that a service failed.
- **Writes stay in the live database,** and there's no cleanup tool. Each errand also reserves the requester's credits, and accounts start with 100.
- **Keep test credentials out of the repo,** because it's public.
- **Let Nasif know when you run a test.** Alarm emails go to Nasif, and a deployment during a test would skew the numbers. Every request is logged, so very long runs add to the CloudWatch bill.

## Cost and credits

These are estimates. Real billing data hadn't arrived when this was written.

| Item | $/day |
| --- | --- |
| Fargate, 5 services | 2.22 |
| RDS and 20 GB storage | 1.32 |
| Load balancer* | 0.64 |
| Valkey | 0.46 |
| Fargate, broker | 0.44 |
| 3 public IPs | 0.36 |
| NAT instance and disk* | 0.29 |
| 18 secrets | 0.24 |
| CloudWatch* | 0.13 |
| Route 53 zone and ECR* | 0.04 |
| **Total** | **About 6.14** |

`*` partly estimated.

- **Budget:** $250 of credits. About $68 from now to the presentation around November 15.
- **Budget alerts:** at $25, $50, $100 and $150 of actual spend, and $200 forecast.
- **Gmail** is free.
- **GitHub Actions** is free on standard runners for public repositories (from memory).
- **Saving money:** destroying `FocApp` overnight saves about half, but this isn't needed at the current rate.
- **Teardown:** right after the presentation. The sandbox account and credits end in December.

## Likely questions

**Why not Kubernetes?** The project's tech stack excludes it for the course. ECS gives us autoscaling and rolling deployments with far less to operate.

**Doesn't one database instance break "database per service"?** Each service has its own database and its own login, and a `REVOKE` stops a login connecting to another service's database. The instance is shared to save money. The `scale` profile gives each service its own instance.

**What happens if the broker crashes?** ECS restarts it. Unpublished events stay in the outbox and are retried. Messages already queued are lost, which is the risk we accepted for the demo.

**Can a courier be paid twice?** `credit-service` ignores duplicates by event ID, so a republished event shouldn't pay twice. With 2 or more `order-service` tasks an event may be published twice, and this is what handles it. The full payment flow still needs its end-to-end test on AWS.

**How are secrets handled?** They're in Secrets Manager and injected when containers start. CDK generates most of them, and the SMTP and admin values were set by hand so they never entered the repo.

**Can someone reach the services directly?** No. Only CloudFront can reach the load balancer, and only the load balancer can reach `web-app`. Backends accept calls only from their listed callers.

**Is it highly available?** No, by design. It runs at minimum size to fit the credits, and the `scale` profile shows the larger version.

**Why does it say `cloudfront.net`?** We didn't buy a domain, and CloudFront's default address gives us free HTTPS.

## Next steps

| Task | Owner | Status |
| --- | --- | --- |
| Finish the errand flow on AWS: accept, pick up, deliver, confirm, and check the courier is paid once | Nasif | Next |
| Build CI/CD | Nasif, with a coding agent | Next |
| Load test and scaling evidence | Teammate | Not started |
| Check real billing against the estimate | Nasif | Due the morning after deployment |
| Write the deployment decision record, `docs/adr/0002-aws-deployment.md` | Nasif | Not started |
| Tear everything down | Nasif | After the presentation |
