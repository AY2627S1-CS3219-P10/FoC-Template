---
name: order-commit-log
description: After every order-service commit, append a short log entry (what changed and why) to the current pass log in order-service/logs/. Use immediately after each `git commit`, including docs-only commits.
---

# order-commit-log

Every commit gets a log entry, so the user can follow what changed and why without
reading diffs. One log file per pass (a working session on one slice or topic).

## 1. Find or create the pass log
- File: `order-service/logs/<YYYY-MM-DD>-<slice>-<slug>.md`, e.g.
  `logs/2026-10-18-S4-accept.md`. Reuse today's file if you are still on the same slice.
- New file header:

  ```markdown
  # <YYYY-MM-DD> · <slice> · <title>
  Branch `order-system` · Agent: <tool + model>

  ## Summary
  _Written at the end of the pass by `order-change-summary`._

  ## Commits
  ```
- Add a line for the new file to the table in `logs/README.md`.

## 2. Gather the facts (do not guess them)
```bash
git log -1 --format='%h %s' && git log -1 --format='%ad' --date=format:'%Y-%m-%d %H:%M'
git show --stat --format= HEAD
```

## 3. Append the entry under `## Commits` (oldest first, ≤15 lines)
```markdown
### <short-hash> <commit subject>
- **When:** <date time> · **Slice:** <S-id> · **Refs:** <FR/D/Q/A ids or "—">
- **Changed:**
  - `<path>` — <what changed, one line>
- **Why:** <1–3 sentences: the reason, the alternative you rejected, the requirement it serves>
- **Verified:** <exact commands and results, or "docs only">
- **Follow-up:** <parked Q-ids, known gaps, or "none">
```
Rules:
- Group files by purpose; at most ~6 bullets under **Changed**.
- **Why** explains intent and trade-offs, not a restatement of the diff.
- Report only checks you actually ran, with their real results.
- No secrets, tokens, `.env` values or personal data.

## 4. Commit the entry
- Never amend the commit to include its own log entry; that changes the hash.
- Stage the log file together with your **next** commit. The last log entry of a pass is
  committed by `order-change-summary` (`docs(order): add pass summary <slice>`).
- `check-scope.sh` must still pass.

Hand off to: the next step of the slice, or `order-change-summary` at the end of the pass.
