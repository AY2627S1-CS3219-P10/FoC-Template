---
name: order-open-questions
description: Park unclear requirements, open conflicts and risky choices instead of stopping, keep working on unblocked tasks, and ask the user in one batch. Load on every task, together with order-orient.
---

# order-open-questions

The goal is to keep moving without guessing. Stop only for hard stops. Park everything else.

## 1. Classify every uncertainty

| Tier | Examples | What you do |
|---|---|---|
| **Hard stop** | Pushing to a remote; touching anything outside `order-service/`; irreversible git or DB actions; breaking a web-app-visible API; adding a dependency not named in the slice brief | Stop and ask the user now |
| **Park** | An OPEN conflict in `docs/conflicts.md`; unclear or contradictory requirements; an ambiguous contract; anything touching credit amounts or settlement semantics | Record it, build only what does not depend on the answer, continue elsewhere |
| **Decide and note** | Naming, file layout, test structure, helper design | Pick the most reversible default, log it as `A-nnn` in the change summary |

If unsure between tiers, choose the stricter one.

## 2. How to park

1. Add an entry to `docs/open-questions.md`:

   ```
   ### Q-NNN <short title>
   - Status: OPEN
   - Related: C<n> / FR<n> / slice S<n>
   - Question: <one sentence the user can answer>
   - Options: A) ... B) ...
   - Recommendation: <A or B and why, one line>
   - Blocks: <slice or part of a slice>
   - Done meanwhile: <what you built that does not depend on the answer>
   ```
2. Do not write code whose behaviour depends on the answer. Put the rule behind one function, one table row or one config value so the answer can be plugged in later.
3. Mark the affected roadmap slice PARTIAL (what can proceed) or BLOCKED (nothing can). Pick the next READY or PARTIAL slice from `docs/roadmap.md`.
4. If the user already answered something in `docs/decisions.md`, do not ask again. Decisions win.

## 3. Never park these by guessing

Credit amounts, who gets paid, when credits are released, and anything that changes what the credit service receives. Park them and build around them.

## 4. Batch the questions

- At the end of the pass, the change summary starts with **Questions for you**: numbered, each with options and your recommendation.
- Repeat the same list in chat, short enough for the user to answer like "1 A, 2 B, 3 skip".
- Do not interrupt a pass with a question unless it is a hard stop.

## 5. Resume after the user answers

1. Append `D-NNN` to `docs/decisions.md` (date, decision, source = user message, affected FRs).
2. Mark the conflict DECIDED → D-NNN in `docs/conflicts.md` and the question ANSWERED → D-NNN.
3. Update `docs/roadmap.md` status and `docs/requirements.md` if a requirement changed. If the answer amends D1, add it to the "D1 amendments needed" section.
4. Resume the parked work from the slice brief.

## 6. Assumptions

Each decide-and-note item is `A-nnn: <what you chose> (alternative: <x>)`. List them in the change summary under assumptions. The user can veto any of them; a veto becomes a normal parked question.

Hand off to: order-orient (to pick the next READY slice) or order-change-summary (at the end of the pass).
