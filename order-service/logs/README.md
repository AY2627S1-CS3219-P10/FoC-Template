# order-service pass logs

One file per working pass: a summary for humans at the top, then one entry per commit
(what changed and why). Written by agents following
`.agents/skills/order-commit-log` and `.agents/skills/order-change-summary`.

| Log | Slice | Status |
|---|---|---|
| [2026-10-18-S0-agent-docs.md](2026-10-18-S0-agent-docs.md) | S0 | done — docs and agent tooling, no code |
| [2026-10-18-D3-order-lifecycle.md](2026-10-18-D3-order-lifecycle.md) | S1, N1, S3–S6b, D3 queries, Docker, Postman | done — lifecycle, accept race, outbox + relay, 4 h timer, Postman; cancel/expiry blocked (Q-006/7/8) |
| [2026-10-18-S7-cancel-expiry.md](2026-10-18-S7-cancel-expiry.md) | S7, S8 | done — requester/courier cancel, 30-min reopen, item-type expiry, IN_PROGRESS removed, 4 h timer fix; Q-020/Q-021 parked |
| [2026-10-18-UI-courier-username.md](2026-10-18-UI-courier-username.md) | UI | done — `courierUsername` in order-service, shown in web-app instead of the courier id |
