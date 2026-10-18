---
name: order-change-summary
description: At the end of every coding pass (including partial or aborted ones), write the human summary at the top of the pass log in order-service/logs/ and batch the open questions for the user. Use after order-requirements-sync.
---

# order-change-summary

The user reads this to understand what was built. Write it for them: plain language,
the *why*, how to try it. ≤80 lines.

## 1. Replace the `## Summary` placeholder in the pass log with
```markdown
## Summary
### Questions for you
1. <Q-id> <question> — A) … B) … · **Recommend:** A, because …
(or "None.")

### What changed
<3–6 sentences: what a user/teammate can now do, which FRs moved, what is still missing>

### How it works
<walk the main code path in order, with relative links, e.g.
[accept](../src/infrastructure/lifecycle.repository.ts) runs one conditional UPDATE …>

### Try it
<curl or Postman steps with placeholders, never real tokens>

### Tests
<exact commands and pass/fail counts you actually ran>

### Assumptions and risks
- A-nnn <what you chose> (alternative: …)
- <known risks / limitations>

### Next
<the next READY slice from docs/roadmap.md>
```

## 2. Then
1. Make sure every commit of the pass has its entry under `## Commits` (`order-commit-log`).
2. Update the row for this pass in `logs/README.md` (status, one-line result).
3. Commit the log as the last commit of the pass: `docs(order): add pass summary <slice>`,
   after `check-scope.sh --no-code`.
4. Paste the **Questions for you** list in chat, numbered, so the user can answer in one
   message ("1 A, 2 B").
5. Optional (Claude only): publish the summary as a private Artifact page and add its link
   under the title. The committed markdown stays authoritative.
