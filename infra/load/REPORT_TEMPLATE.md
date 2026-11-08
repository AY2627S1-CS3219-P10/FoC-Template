# AWS load and concurrency test report

## Run metadata

| Field               | Value                                              |
| ------------------- | -------------------------------------------------- |
| Date and time (SGT) |                                                    |
| Tester              |                                                    |
| Git commit deployed | `7eb98a6` initially; confirm before testing        |
| CloudFront target   | `https://d1jp4ocurldf39.cloudfront.net`            |
| AWS region          | `ap-southeast-1`                                   |
| ECS profile         | Demo: 1–3 tasks per service                        |
| Dataset             | Dedicated verified users and disposable errand IDs |
| k6 version          |                                                    |

## Safety and coordination

- [ ] Deployment owner notified before the run.
- [ ] No deployment or migration occurred during the run.
- [ ] CloudWatch dashboard and alarm state captured before the run.
- [ ] Disposable test accounts were used; no real student data was used.
- [ ] Credential files remained ignored and were not committed.
- [ ] AWS budget and alarm recipients were confirmed.

## Preflight

| Check                       | Result/evidence |
| --------------------------- | --------------- |
| Login page                  |                 |
| Test-account login          |                 |
| Authenticated errand read   |                 |
| Existing alarms             |                 |
| ECS task counts before load |                 |

## Read stress results

| Peak VUs | Duration | Requests | Error rate | p95 | p99 | Peak web tasks | Peak order tasks | Outcome |
| -------: | -------- | -------: | ---------: | --: | --: | -------------: | ---------------: | ------- |
|       10 |          |          |            |     |     |                |                  |         |
|       50 |          |          |            |     |     |                |                  |         |
|      100 |          |          |            |     |     |                |                  |         |
|      250 |          |          |            |     |     |                |                  |         |
|      500 |          |          |            |     |     |                |                  |         |

Pass targets: error rate below 1%, p95 below 1 second, and p99 below 2
seconds. A limit below 500 users is still a valid result if the bottleneck is
identified and evidenced.

## Concurrent acceptance result

| Field                          | Value                     |
| ------------------------------ | ------------------------- |
| Errand ID                      |                           |
| Competitors                    |                           |
| Successful accepts             | Expected: 1               |
| HTTP 409 conflicts             | Expected: competitors − 1 |
| Unexpected responses           | Expected: 0               |
| Assigned courier after test    |                           |
| Duplicate assignments observed | Expected: no              |

## CloudWatch evidence

Attach or link screenshots for:

- request count and ALB p95 latency;
- web-app and Order Service desired/running ECS task counts;
- CPU and memory utilization;
- HTTP 4xx/5xx counts;
- PostgreSQL connections;
- RabbitMQ queue and dead-letter queue depth;
- scale-out and scale-in timestamps;
- alarm state before, during, and after the run.

## Findings

### Maximum demonstrated workload

### First bottleneck and evidence

### Autoscaling behaviour

### Concurrency invariant

### Recommended follow-up
