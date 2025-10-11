# Directory Resync Assessment — Full Resync Attempt (2025-10-11)

## Summary
- Intended action: run a full resync to refresh mirrors, dedupe, and align labels.
- Method: triggered GitHub Actions workflow `.github/workflows/matrix-sync.yml` with `full_resync=true`.
- Result: failed during the planning phase. The compiled artifacts expected by the workflow are missing from the repository.

## What We Ran
- Triggered via CLI: `gh workflow run matrix-sync.yml -R devpool-directory/devpool-directory -f full_resync=true`
- Run ID: `18427161703`

## Evidence (Logs)
- Failure in job `plan` when executing: `node dist/bin/plan.cjs > plan.json`
- Error: `Error: Cannot find module '.../dist/bin/plan.cjs'`
- This indicates the repo does not currently contain built artifacts under `dist/`, and the workflow does not build them before use.

## Root Cause
- The sync workflows assume prebuilt distributables (`dist/bin/*.cjs`) are available in the repository.
- The repository does not include `dist/`, and `matrix-sync.yml` does not run a build step (`npm ci && npm run build`) before invoking the binaries.

## Recommendations
1) Add a build step to `matrix-sync.yml` before calling any `dist/bin/*.cjs` entrypoints:
   - `npm ci`
   - `npm run build`
   This ensures `dist/` is available in CI.
2) Alternatively, commit the built `dist/` artifacts as part of the repo (release discipline) and keep them updated on changes. This avoids CI builds but increases review noise.
3) After fixing the workflow, re‑run the full resync with `full_resync=true`.
4) Note: with unauthorized mirrors still present (deletions blocked), pre‑create duplicate checks will prevent creating a second mirror when a non‑App issue already exists with the exact body. However, canonicalization and label normalization will be limited until the cleanup completes.

## Next Steps
- Implement one of the build strategies above.
- Re‑run the full resync.
- Re‑audit the directory and publish an updated findings report (authorship/duplicates/body format/target health/labels).

