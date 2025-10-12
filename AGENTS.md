DevPool Directory — Local Agent Guidelines

Critical Policy: App‑Only Writes
- All writes (creating/updating issues and labels, committing artifacts) MUST be authenticated as the GitHub App `devpool-directory-superintendent[bot]`.
- Never use a Personal Access Token (`GH_TOKEN`) for writes. Use the App token obtained via `actions/create-github-app-token` (`GITHUB_TOKEN`) for every write path.
- Guard: `WRITE_TARGET_REPO` must equal the intended repo (e.g., `devpool-directory/devpool-directory`) before any write executes.

Enforcement (Hard Delete, Not Close)
- Any issue created in the directory repo that is NOT authored by `devpool-directory-superintendent[bot]` is INVALID and must be DELETED immediately.
- This is enforced by CI: `.github/workflows/enforce-app-author.yml` runs on issue opened/edited/reopened and deletes unauthorized issues using the App token.
- A manual sweeper exists: `.github/workflows/cleanup-unauthorized.yml` deletes all non‑App authored mirrors across the repo.

Read vs Write Auth
- Reads may use `GH_TOKEN` (preferred) or anonymous to maximize cross‑org access/rate limits.
- Writes MUST use the App token. Shards and aggregate are configured accordingly.

Operational Notes
- Shards: read client = PAT/anon, write client = App token; mirrors created by shards will be authored by the App.
- Aggregate: commits to `__STORAGE__` use the App token and retry on non‑fast‑forward to avoid ref races.
- Dedupe: if you must remove duplicates, prefer deletion (not closing) for invalid/unauthorized mirrors.

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

Invariants We Rely On
- Identity: Mirror issues are identified solely by body equality with the exact partner issue URL. Canonical form is `https://github.com/<owner>/<repo>/issues/<n>` (no trailing slash; `www.` is tolerated for matching but not preferred for new writes).
- Authorization: All write paths use the GitHub App token; any non‑App authored directory issue is invalid and will be deleted by CI.
- Concurrency: The workflow may run many shards in parallel; code must be idempotent and safe under concurrent creation attempts.

Verification Checklist
- After a run completes:
  - Audit duplicates by target URL: expect 0 open duplicates; closed/deleted enforced within the run.
  - Confirm new mirrors are authored by `devpool-directory-superintendent[bot]` only.
  - Spot check that mirror bodies are single‑line canonical URLs without `www.`.

What Changed in Code (Summary)
- `src/mirror/reconcile.ts`:
  - Added pre‑create dedupe using `issues.listForRepo` over recent pages with strict body match (canonical + www variant).
  - Switched post‑create duplicate handling to hard delete via GraphQL `deleteIssue` (fallback to close), keeping the oldest issue.
