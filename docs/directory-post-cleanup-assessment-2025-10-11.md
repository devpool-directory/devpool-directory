# Directory Post‑Cleanup Assessment (2025-10-11)

## Summary
- Manual cleanup completed using admin `GITHUB_TOKEN`:
  - Deleted 394 non‑App authored mirrors.
  - Deleted 17 newer duplicates among App-authored open mirrors (kept oldest in each group).
  - Deleted outlier #2651 (non‑URL body by non‑App author).
  - Normalized 138 App-authored bodies (`www.github.com` → `github.com`).
- Current open mirrors: 337.

## Compliance Snapshot (Open Issues)
- Authorship: 100% `devpool-directory-superintendent`.
- Body format: 100% single URL, no `www.` prefix.
- Duplicates (by target URL): 0.
- Non‑URL bodies: 0.

## Resync Status
- CI resync run failed earlier due to missing build artifacts. I prepared a workflow fix locally to:
  - Install deps (`npm ci`) and build (`npm run build`).
  - Use `dist/cli/*.js` entrypoints instead of `dist/bin/*.cjs`.
- Action required: open a PR with the updated `.github/workflows/matrix-sync.yml` and re-run “Matrix Sync” with `full_resync=true` to refresh mirrors.

## Recommended Follow‑ups
- Merge workflow fix for Matrix Sync and re-run a full resync.
- After resync, re-run a light audit for:
  - Partner target health (closed or assigned targets → delete or label “Unavailable”).
  - Label hygiene (“Price:” vs “Pricing:”).
- Ensure `enforce-app-author.yml` uses delete or close fallback depending on org/App permissions.

## Artifacts
- Candidate/changes logs: `manual-del-*.tsv`, `app-duplicate-plan.json`, `app-dups-to-delete.tsv` in repository root.
- Reports:
  - `docs/directory-deletion-status-2025-10-11.md` (workflow-based sweep outcome)
  - `docs/directory-manual-deletion-report-2025-10-11.md` (this cleanup’s details)
  - `docs/directory-resync-assessment-2025-10-11.md` (CI failure analysis and fix plan)

