# Courier review frontend and saved-review read API — 2026-11-01

## Summary

### Questions for you
None within the requested scope.

### What changed
Added authenticated review retrieval so the web app restores submitted reviews
after reload. The frontend now proxies summary/review reads, shows courier
averages, and lets completed-errand requesters submit stars and an optional
comment. It retains input on failure, blocks duplicate submissions and reloads
the saved review when another submission already exists. Existing lifecycle
routes and credit operations are unchanged.

### How it works
`OrderController.review` delegates to `OrderService.review`, which reuses errand
view authorization before `PrismaOrderRepository.findReview`. HTTP 200 returns
`{review: null}` or `{review: savedReview}`. Participants/admins can read a
completed errand's review; inaccessible, missing or deleted errands return 404.
The frontend uses existing server-side session cookies and same-origin checks.

### Try it
Restart Order and the web app. Open a COMPLETED errand as its requester. Select
1–5 stars, optionally enter a comment, and submit. Reload: the saved review is
shown instead of the form. The summary refreshes after submission. No additional
schema migration is required beyond the existing courier-review migration.

### Tests
Commands run from their respective service folders:
- Order `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tests/tsconfig.json`: passed.
- Order `node node_modules/eslint/bin/eslint.js src tests`: passed.
- Order Jest `--config tests/jest-unit.json --runInBand`: 378 passed.
- Order Jest `--config tests/jest-integration.json --runInBand`: 92 passed, isolated PostgreSQL containers.
- Web Next `typegen`, TypeScript and targeted lint: passed.
- Web Next `build --webpack`: passed. Turbopack failed because its CSS worker
  could not bind a local port in this environment; no build config was changed.
- Web Playwright `test courier-reviews.spec.ts errand-lifecycle.spec.ts`:
  24 passed across desktop/mobile. UI tests mock API responses; real HTTP/DB
  authorization is covered separately by Order integration tests.
Initial browser run lacked Chromium; installed the matching Playwright browser.
A test assertion matched Next's route-announcer alert; scoped it and reran.

### Assumptions and risks
The requester alone gets the form. The summary is shown when a courier is
assigned; written-review listing and edits/deletion are outside scope.
No new dependencies, direct credit mutations, live DB changes, staging, commit
or push. Work remains on the user's existing rating/review feature branch.
Self-review: additive API only; permissions, empty results, rereads, retries,
duplicate handling and existing lifecycle journeys verified.

### Next
User checks the completed-errand page against local services. Existing next
READY Order roadmap slice remains S1 Hygiene.

## Commits
None; changes left for user review.
