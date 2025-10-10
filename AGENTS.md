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

