# GitHub bounty marketing playbook

This playbook turns DevPool Directory data into a repeatable GitHub-first marketing workflow for finding maintainers and communities that already show demand for paid open-source tasks.

## Goal

Find public GitHub issues where a bounty marketplace, directory, or contributor marketplace is directly relevant, then engage only when the issue context makes the outreach useful.

## Daily workflow

1. Pull the latest DevPool artifacts from the `__STORAGE__` branch.
2. Build a short lead pool from open priced issues, partner repos, and recent bounty-related discussions.
3. Score each lead with the rubric below.
4. Keep the top five leads for human review or contributor action.
5. Engage only with a context-specific comment, PR, or maintainer note.
6. Log evidence, URL, score, and next action in the lead list.

## Query library

Use these GitHub searches as seed queries:

- `"Price:" "Time:" "Priority:" issue`
- `"bounty" "help wanted" "good first issue"`
- `"paid issue" OR "paid task" language:TypeScript`
- `"reward" "pull request" "open source"`
- `"GitHub bounty" "contributors"`
- `"issue bounty" "maintainer"`
- `"sponsor" "bug" "fix" "issue"`
- `"marketplace" "open source" "bounty"`

Add ecosystem filters when useful, for example `language:TypeScript`, `language:Python`, `org:ubiquity`, or `label:help-wanted`.

## Qualification rubric

Score each lead from 0-2 per category.

| Category | 0 | 1 | 2 |
|---|---|---|---|
| Payout clarity | No payout | Implied payout | Explicit USD/crypto label |
| Maintainer fit | No owner activity | Some activity | Active maintainer or bot workflow |
| Relevance | Generic issue | Related to contributors | Direct bounty/devpool fit |
| Competition | Crowded/raced | Some comments | Low competition or stale claim |
| Safety | Spam-prone | Needs caution | Natural, useful engagement |

Recommended actions:

- 8-10: prepare a specific PR/comment.
- 5-7: watch or ask one clarifying question.
- 0-4: skip.

## Non-spam engagement template

```md
I found this through a bounty/contributor-marketplace search and can help with a focused deliverable.

Proposed output:
- [specific artifact or PR]
- [evidence source]
- [verification step]

I will avoid broad promotion or generic outreach. If this scope is still open, I can submit a small reviewable PR first.
```

## Evidence log fields

Track these fields for every lead:

- source URL
- repository
- issue number
- payout label or USD estimate
- score
- reason for fit
- risk note
- proposed action
- status

## Guardrails

- Do not comment on unrelated issues.
- Do not mention a product unless it solves the issue context.
- Do not count revenue until assignment/payment is confirmed.
- Do not work security/bug-bounty targets outside authorized scope.
- Do not chase low-value or ambiguous pseudo-token payouts without USD normalization.
