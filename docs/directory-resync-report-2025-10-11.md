# Directory Full Resync — Run Report (2025-10-11)

## Summary
- Triggered Matrix Sync with `full_resync=true` after cleanup and CI fixes.
- Workflow succeeded end-to-end (plan, shards, aggregate, summary).
- Run ID: `18427564327` (development branch).

## Key Checks Post-Resync (Open Issues)
- Open mirrors: 337
- Authorship: 100% `devpool-directory-superintendent`
- Body format: 100% single URL; 0 with `www.` prefix; 0 non-URL
- Duplicate groups (by target URL): 0

## Notes
- CI fix: switched Matrix Sync to use `tsx` entrypoints and added `npm i` fallback, removing dependency on prebuilt `dist` artifacts.
- Storage artifacts (plan, plan-summary, aggregates) uploaded by the workflow as usual.

## Next
- Optional: schedule periodic target-health pruning (delete/label mirrors whose partner issues are closed/assigned/not-found).
- Optional: standardize label taxonomy (e.g., normalize `Pricing:` → `Price:`) in a dedicated job.

