DevPool Directory — Local Agent Guidelines

Policy: All writes to the directory repository (creating/updating issues, labels, and committing artifacts) MUST be authenticated as the GitHub App `devpool-directory-superintendent[bot]`.

Rules
- Never use a Personal Access Token (`GH_TOKEN`) for writes to the directory repo; use the App token (`GITHUB_TOKEN` from `actions/create-github-app-token`) for all writes.
- Read operations may use `GH_TOKEN` (preferred) or anonymous to maximize cross‑org access and rate limits.
- The `WRITE_TARGET_REPO` env must match the intended target (e.g., `devpool-directory/devpool-directory`) to prevent accidental writes.
- Unauthorized issue creation is auto‑enforced by workflow: any new issue not authored by the App is deleted (or closed as fallback).

Operational Notes
- Shard jobs: write client uses the App token; read client uses PAT/anonymous.
- Aggregate commits to `__STORAGE__` use the App token with retry-on-non-fast-forward.
- Dedupe and cleanup workflows use `GH_TOKEN` only for deletions via GraphQL.

