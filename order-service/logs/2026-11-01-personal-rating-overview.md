# Personal courier rating overview — 2026-11-01

## Summary
### Questions for you
None.
### What changed
Added a compact signed-in home-page panel showing each user's own received
courier rating and three most recent written comments. All students/admins are
eligible; guests never fetch the data. Empty and retry states are included.
### How it works
Authenticated self-only GET `/api/couriers/me/review-overview` derives identity
from AuthGuard. The repository aggregates all ratings and retrieves at most
three non-empty comments, ordered createdAt/id descending, within a
repeatable-read snapshot. The Next adapter forwards the session; the React
panel clears when identity changes and uses no browser persistence.
### Try it
Restart Order and web-app, log in, and open Home. The panel appears below the
hero. It displays feedback received as courier, not reviews the user submitted.
No new migration is needed beyond the existing courier-reviews table.
### Tests
- Order TypeScript (tests config), ESLint src/tests, Nest build: passed.
- Jest unit: 378 passed.
- Jest integration: 94 passed, isolated PostgreSQL containers.
- Web next typegen, TypeScript and full ESLint: passed.
- Playwright `test my-courier-rating.spec.ts courier-reviews.spec.ts`: 32 passed
  across desktop/mobile. Screenshots inspected for both panel layouts.
- Web `next build --webpack`: compilation/type checking/static generation
  succeeded, command exited 1 afterward with Next's existing SecurityFatalError
  for the installed Next version. No dependency upgrade or bypass applied.
### Assumptions and risks
- "Top 3 most recent" means newest comments, not highest-rated comments.
- Average/count includes star-only reviews; comment cards do not.
- Comments expose no author identifiers/contact details; query parameters cannot
  choose another user's overview.
- No live database changes, commits or pushes. Existing feature branch retained.
- Self-review: additive API, no credit/lifecycle effects, bounded query, tests for
  private access/empty states/order, no new dependencies.
### Next
User checks local home page. Existing next READY Order slice is S1 Hygiene.
## Commits
None; left for user review.
