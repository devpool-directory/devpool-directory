# Directory Deletion Status — Unauthorized Mirrors Sweep (2025-10-11)

## Summary
- Intended action: delete all non‑App authored directory issues per policy.
- Method: triggered GitHub Actions workflow `.github/workflows/cleanup-unauthorized.yml` with `dry_run=false` so deletions are performed by the GitHub App token.
- Result: failed. No issues were deleted.
- Likely cause: GitHub App lacks permission to delete issues in this org/repo, or org setting to allow issue deletions is disabled.

## What We Ran
- Triggered via CLI: `gh workflow run cleanup-unauthorized.yml -R devpool-directory/devpool-directory -f owner=devpool-directory -f repo=devpool-directory -f dry_run=false`
- Run ID: `18427140734`

## Evidence (Logs)
- Job printed: `Total unauthorized mirrors: 474`
- Immediately after, the job exited with `Process completed with exit code 1` before any `Deleted #<n>` lines were emitted.
- This is consistent with the first attempt to execute `deleteIssue` failing under `set -e`, causing the step to terminate.

## Probable Root Cause
- GitHub’s GraphQL `deleteIssue` mutation requires elevated permissions that typical `issues:write` App scopes don’t satisfy; in organization repos, deletion also depends on the org‑level setting allowing issue deletions by admins/owners.
- The App token created by `actions/create-github-app-token` is valid (token was created), but deletion is blocked by permission/policy, explaining both:
  - This sweep failure, and
  - Recent failures in the enforcement workflow `.github/workflows/enforce-app-author.yml` (issue‑opened hook) that also attempts to delete unauthorized issues.

References:
- Allowing people to delete issues in your organization (GitHub Docs)
- Deleting an issue (GitHub Docs)

## Recommendations
1) Enable issue deletion for the organization (policy decision): ensure org setting permits issue deletion by admins.
2) Grant/verify the App’s permissions and installation:
   - Confirm the App is installed on `devpool-directory/devpool-directory`.
   - If org policy requires admin to delete, consider delegating through a maintainer with admin role, or update App permissions if applicable.
3) Short‑term fallback (if deletion cannot be enabled): change enforcement to “close unauthorized issues” instead of hard delete. This keeps the directory clean without violating policy; once deletion is allowed, the sweeper can hard‑delete closed unauthorized mirrors.
4) Re‑run `cleanup-unauthorized.yml` with `dry_run=false` once permissions are corrected and confirm deletions proceed.

## Next Steps
- Pending: org/App permission change for deletion.
- After enabling, re‑run the cleanup and re‑audit to confirm:
  - All non‑App authored mirrors are gone (open and closed states).
  - Duplicate sets collapse to a single App‑authored mirror.
- Track rerun in a follow‑up report once permissions are updated.

