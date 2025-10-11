# Directory Cleanup — Manual Deletion Report (2025-10-11)

## Summary
- Action: Manually deleted all non‑App authored directory mirrors using the current shell’s `GITHUB_TOKEN` (admin).
- Scope: All issues in `devpool-directory/devpool-directory` whose body is a partner issue URL and whose author is not `devpool-directory-superintendent[bot]`. Also removed one non‑URL unauthorized issue (#2651).
- Outcome: 394 issues deleted, 0 closed fallback, 0 failures. App‑authored open duplicates reduced to 0 by pruning newer copies in 17 groups. Bodies normalized to remove `www.` prefix.

## Commands Executed
- Build unauthorized candidate list and delete/close:
  - GraphQL query over OPEN+CLOSED issues, filter `author != superintendent` and body regex `^https://(www\.)?github\.com/.+/issues/\d+$`.
  - Mutation: `deleteIssue(issueId)`; on failure (none observed), fallback `closeIssue(issueId)`.
- Remove non‑URL unauthorized outlier:
  - Issue #2651 (author=`ubiquity-os-simulant`, body=`/wallet ubq.eth`) deleted by node_id.
- Deduplicate App‑authored open mirrors:
  - 17 duplicate groups detected (same target URL); kept oldest, deleted newer 17 issues.
- Normalize App‑authored bodies:
  - Updated 138 open issues: `https://www.github.com/...` → `https://github.com/...`.

Artifacts written in repo root:
- `manual-del-candidates.tsv` — pre‑deletion candidate list
- `manual-del-deleted.tsv` — deleted entries
- `manual-del-closed.tsv` — closed fallback (empty)
- `manual-del-failed.tsv` — failures (empty)
- `manual-del-errors.log` — API error output (empty)
- `app-duplicate-plan.json`, `app-dups-to-delete.tsv` — App duplicate plan (consumed)

## Before vs After (Open Issues)
- Before (from audit): 462 open (PRs excluded); 108 non‑App; 69 duplicate pairs; 138 `www` bodies; 1 non‑URL body.
- After manual cleanup (current):
  - Open mirrors: 337
  - Authorship: 337 App (`devpool-directory-superintendent`), 0 non‑App
  - Body format: 337 URL bodies, 0 with `www.`, 0 non‑URL
  - Open duplicates (by target URL): 0

## Notes
- Deletions used `GITHUB_TOKEN` (admin) per instruction; this bypassed the App‑only delete constraint that blocked the previous workflow‑based sweep.
- The enforcement workflow (`enforce-app-author.yml`) still attempts to delete on unauthorized issue creation; it may keep failing until org/App permissions for deleteIssue are addressed.

## Next Steps
- Keep `enforce-app-author` enabled; once org/App delete permissions are resolved, unauthorized issues will be auto‑deleted at creation time.
- Proceed to a full resync via CI after fixing the workflow runner (see Resync Assessment report).

