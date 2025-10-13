DevPool Directory — Local Agent Guidelines

Critical Policy: App‑Only Writes
- All writes (creating/updating issues and labels, committing artifacts) MUST be authenticated as the GitHub App `devpool-directory-superintendent[bot]`.
- Never use a Personal Access Token (`GH_TOKEN`) for writes. Use the App token obtained via `actions/create-github-app-token` (`GITHUB_TOKEN`) for every write path.
- Guard: `WRITE_TARGET_REPO` must equal the intended repo (e.g., `devpool-directory/devpool-directory`) before any write executes.

Enforcement (Hard Delete, Not Close)
- Any issue created in the directory repo that is NOT authored by `devpool-directory-superintendent[bot]` is INVALID and must be DELETED immediately.
- This is enforced by CI: `.github/workflows/enforce-app-author.yml` runs on issue opened/edited/reopened and deletes unauthorized issues using the App token.
- A manual sweeper exists: `.github/workflows/cleanup-unauthorized.yml` deletes all non‑App authored mirrors across the repo.

Status Mirror Invariant (Critical)
- The directory MUST be an accurate mirror of partner issue status. Duplicate mirrors MUST be removed by hard deletion — never by closing — so open counts exactly match the set of open, priced partner issues.
- Closing duplicates is prohibited because it corrupts the signal (closed mirrors still exist and inflate counts/history). Hard delete ensures a single canonical mirror per partner URL.

Read vs Write Auth
- Reads may use `GH_TOKEN` (preferred) or anonymous to maximize cross‑org access/rate limits.
- Writes MUST use the App token. Shards and aggregate are configured accordingly.

Operational Notes
- Shards: read client = PAT/anon, write client = App token; mirrors created by shards will be authored by the App.
- Aggregate: commits to `__STORAGE__` use the App token and retry on non‑fast‑forward to avoid ref races.
- Dedupe: if you must remove duplicates, prefer deletion (not closing) for invalid/unauthorized mirrors.

Automation
- Cleanup Deduplicates (App): `.github/workflows/cleanup-dedup.yml` runs automatically on pushes to `development` and can also be dispatched manually. It uses the GitHub App token to:
  - Delete duplicate mirrors (keeping the oldest per target URL).
  - Normalize kept mirrors’ body format to canonical `https://github.com/...`.
  - This provides fast feedback during active development and prevents dupe bursts from lingering.
  - Close fallback is disabled by default. If deletion is not permitted by the App token, do NOT auto‑close. Escalate to fix permissions or run an owner‑approved deletion (see Runbook below).

Artifacts and Labeling (UI integration)
- Only the `Price:` label is valid for pricing. The legacy `Pricing:` prefix is deprecated and treated as unpriced.
- The aggregate publishes both priced and unpriced artifacts for the UI:
  - `partner-open-issues.json` — open + priced (`Price:`) partner issues only.
  - `partner-open-proposals.json` — open partner issues without `Price:` (unpriced proposals).

Do/Don’t
- DO ensure new mirrors’ body is the exact partner issue URL (identity), and let the post‑create sweep collapse concurrent duplicates.
- DO run the cleanup workflow after large auth/token changes to remove historical non‑App mirrors.
- DON’T ever post or update directory issues with `GH_TOKEN` or a user PAT.

Incident: Redundant Issues During Matrix Sync (2025‑10‑12)
- Symptom: After dispatching Matrix Sync with `full_resync=true` on branch `fix/shard-empty-json`, a large number of redundant directory issues were created.
- Scope: Duplicates were authored by the GitHub App (not unauthorized users), so CI’s “Enforce App Author” did not delete them.

Root Cause
- Pre‑create dedup relied on the GitHub Search API and/or a stale/absent `index.json` from the data branch. Under concurrency and search latency, shards sometimes observed no existing mirror and proceeded to create a new one.
- Post‑create logic only closed duplicates, which still resulted in many “posted” issues even if quickly closed.
- Historically, some duplicates also came from unauthorized actors (e.g., `ubiquity-devpool`), which CI later deletes, but that was not the primary cause here.

Permanent Fixes (Implemented)
- Strong pre‑create dedupe via repository listing (not Search):
  - Before creating, `reconcileMirror` now scans the most recent repository issues (up to 300, state=all) and reuses the oldest issue whose body exactly matches the partner URL (matches both `https://github.com/...` and `https://www.github.com/...`).
  - This removes the dependency on Search API consistency and greatly reduces race‑condition windows across shards.
- Post‑create hard‑delete of duplicates:
  - If, despite pre‑checks, multiple mirrors exist for the same partner URL, keep the oldest and delete the rest via GraphQL `deleteIssue` (fallback to close only if deletion fails). This aligns with “Hard Delete, Not Close”.
- Guardrails preserved/enforced:
  - App‑only writes: `getOctokitWrite()` always uses the GitHub App token. `WRITE_TARGET_REPO` guard blocks accidental cross‑repo writes.
  - Recursion guard: Partner issues whose body is already a directory‑style GitHub issue URL are skipped.
  - Shards load `index.json`/`sync-metadata.json`/`issues-map.json` from `__STORAGE__` when available to maximize idempotency.

Operational Guidance
- After credentials or logic changes, run the sweeper to remove historical unauthorized mirrors:
  - Workflow: `.github/workflows/cleanup-unauthorized.yml` with `owner=devpool-directory`, `repo=devpool-directory`, `dry_run=false`.
- If ever needed, run `src/cli/cleanup.ts` (App token) to delete duplicate mirrors and normalize kept entries to the canonical body format.
- When manually dispatching Matrix Sync, prefer avoiding unnecessary `full_resync=true` unless you intend a cold‑start or bootstrap; incremental runs reduce surface for races.

Runbook: Duplicate Mirrors
- Primary: trigger `Cleanup Deduplicates (App)` or the Matrix Sync `final-cleanup` job (uses App token) to hard delete newer duplicates (keeps the oldest per URL).
- Targeted (App): use `Delete Specific Issues (App)` workflow with a comma‑separated list of directory issue numbers to hard delete specific duplicates. Use only for duplicates or invalid mirrors.
- Permissions: if GraphQL `deleteIssue` is rejected for the App token, DO NOT close issues. Escalate to grant the App the required permission, or perform a one‑time owner‑run deletion. As a last resort, consider a transfer‑to‑trash strategy (requires explicit approval).
- Prohibition: Do not use the “Close Specific Issues (App)” workflow to resolve duplicates; closing duplicates violates the Status Mirror Invariant.

Invariants We Rely On
- Identity: Mirror issues are identified solely by body equality with the exact partner issue URL. Canonical form is `https://github.com/<owner>/<repo>/issues/<n>` (no trailing slash; `www.` is tolerated for matching but not preferred for new writes).
- Authorization: All write paths use the GitHub App token; any non‑App authored directory issue is invalid and will be deleted by CI.
- Concurrency: The workflow may run many shards in parallel; code must be idempotent and safe under concurrent creation attempts.

Implementation Notes (current behavior)
- Pre‑create de‑dup: `src/mirror/reconcile.ts` scans recent repo pages and falls back to Search to reuse existing mirrors by exact URL match (`https://github.com/...` or `https://www.github.com/...`).
- Post‑create de‑dup: duplicates are hard‑deleted via GraphQL; the in‑run index is updated to the kept issue.
- Cleanup tool: `src/cli/cleanup.ts` performs hard deletions only by default; `CLOSE_FALLBACK=true` can be set for exceptional maintenance, but is disabled in CI.

Verification Checklist
- After a run completes:
  - Audit duplicates by target URL: expect 0 open duplicates; closed/deleted enforced within the run.
  - Confirm new mirrors are authored by `devpool-directory-superintendent[bot]` only.
  - Spot check that mirror bodies are single‑line canonical URLs without `www.`.

What Changed in Code (Summary)
- `src/mirror/reconcile.ts`:
  - Added pre‑create dedupe using `issues.listForRepo` over recent pages with strict body match (canonical + www variant).
  - Switched post‑create duplicate handling to hard delete via GraphQL `deleteIssue` (fallback to close), keeping the oldest issue.

Lessons Learned — Oct 2025

- Hard delete or escalate; never close duplicates
  - Closing dupes corrupts the mirror signal and leaves stale entries in history. Only hard deletion preserves the invariant that the directory equals the set of priced, open partner issues.
  - Our cleanup tooling is now hard‑delete only by default. The optional close fallback is disabled and must not be enabled for duplicates.

- Verify deletion, don’t assume
  - GitHub’s GraphQL `deleteIssue` may return without `data.deleteIssue` even when the HTTP request succeeds if the token lacks permission. Always verify by re‑fetching the issue (expect 404/not found).
  - The CLI `src/cli/delete-issues.ts` and `src/cli/cleanup.ts` now treat a missing `deleteIssue` field as a failure and surface it.

- App token permissions matter
  - The GitHub App token currently cannot delete issues in this repo. GraphQL calls are accepted but perform no deletion. Do not "close" as a substitute.
  - If deletion is required and the App cannot do it, escalate for App permission updates (allow deleteIssue), or run an owner‑approved one‑time deletion using a local `$GITHUB_TOKEN` (see Runbook below).

- Pre‑create de‑dup beats Search under concurrency
  - Scanning recent pages (3×100) of repo issues and matching the exact body is dramatically more reliable than Search API during hot concurrency. Keep this as the primary method; only fall back to Search for older mirrors.

- Rate limits are real; backoff lightly
  - Deletions and lists can hit 403 core limits. We back off using `x-ratelimit-reset` when available, with small delays otherwise. Prefer the dedicated cleanup workflow after aggregate, not during shard bursts.

- Label standards are strict
  - Only `Price:` is considered a priced label. Any legacy `Pricing:` label is handled as unpriced and must not drive mirroring decisions.

Operational Runbook — Duplicates

1) Standard path (CI, App token)
   - Run “Cleanup Deduplicates (App)” (auto on development pushes) or re‑dispatch “Matrix Sync” and let `final-cleanup` run. This keeps the oldest per URL and hard‑deletes newer ones.
   - If the job logs show `graphql-no-deleteIssue`, the App lacks delete permission; proceed to step 2 or 3.

2) Owner one‑liner (local shell, immediate)
   - Use an org‑owner `$GITHUB_TOKEN` to hard‑delete by node_id:
     - For n in <issue numbers>: get node_id via `gh api repos/<owner>/<repo>/issues/n -q .node_id` then
       `gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id=$NODE_ID`.
   - This is the fastest way to purge dupes when the App cannot.

3) Fix App permissions (preferred long‑term)
   - Grant the GitHub App the permission required to execute `deleteIssue` on repo issues; verify by running the delete workflow and confirming issues are 404 afterwards.

4) Prohibited
   - Do not use the “Close Specific Issues (App)” workflow to resolve duplicates. Closing is not deletion and violates the Status Mirror Invariant.

Verification Snippets

- Detect duplicate groups by body:
  - `gh api --paginate 'repos/<owner>/<repo>/issues?state=all&per_page=100' | jq -r '.[] | select(.pull_request|not) | {number,body} | @json' | jq -s 'group_by(.body) | map(select(length>1) | {url: .[0].body, nums: map(.number)|sort})'`

- Confirm open directory issues match priced open partners:
  - Fetch `__STORAGE__/index.json` and `partner-open-issues.json`, map node_id→number from index for the priced set, and compare to `gh issue list --state open`. Any extra numbers are invalid.

- Post‑cleanup sanity:
  - `summary.json` should show `issuesOpenPriced == gh issue list --state open | length` and `duplicate groups == 0`.

Workflows/Tools Quick Map

- Cleanup Deduplicates (App): hard‑delete duplicates, normalize kept bodies, runs on push to `development` and manual dispatch.
- Matrix Sync: single‑writer aggregate; optional `final-cleanup` after aggregate. Avoid enabling in‑run FINAL_DEDUP except as a one‑off.
- Delete Specific Issues (App): targeted hard deletion by numbers. Use for confirmed duplicates only. Requires App delete permission or owner fallback.
- Close Specific Issues (App): maintenance only; never for duplicates (violates invariants).
