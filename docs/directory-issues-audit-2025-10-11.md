# DevPool Directory — Issues Audit (2025-10-11)

## Summary
- Open issues analyzed (PRs excluded): 462
- Unique target links extracted: 392
- Non‑App authored open issues: 108 (violates App‑Only Writes policy)
- Duplicate mirrors (same target URL): 69 pairs
- Bodies with `www.` prefix: 138
- Non‑URL body: 1 (issue #2651)
- Linked target status: 307 open, 72 closed, 10 unknown, 3 not found
- Open but assigned targets: 15 (should be unassigned)

## Method
- Queried GitHub REST API for all open issues in `devpool-directory/devpool-directory` (excluding PRs) using `GITHUB_TOKEN` for reads.
- Parsed authorship, body text, labels, and extracted unique target issue URLs (normalized to remove optional `www.` prefix).
- Fetched each target issue to record `state` and assignment count.
- No writes performed; this was a read-only audit.

## Findings

### 1) Authorship (App‑Only Writes)
- Compliant author `devpool-directory-superintendent[bot]`: 354
- Non‑compliant authors: 108
  - `ubiquibot[bot]`: 55
  - `ubiquity-devpool`: 51
  - `ubiquibot-devpanther[bot]`: 1
  - `ubiquity-os-simulant`: 1
- Notable spike: 51 issues opened on 2025‑10‑10 by `ubiquity-devpool` (e.g., #3894…#3845).

### 2) Duplicates
- 69 duplicate sets (each set has 2 mirrors with the exact same body URL).
- Common pattern: one App-authored mirror and a duplicate by `ubiquity-devpool`.
- Examples (target → directory issues):
  - https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/433 → #3613 (App) and #3850 (ubiquity-devpool)
  - https://github.com/ubiquity-os-marketplace/command-start-stop/issues/176 → #2969 (App) and #3896 (ubiquity-devpool)
  - https://github.com/ubiquity-os-marketplace/daemon-pricing/issues/71 → #2025 and #3900

### 3) Body Format
- Bodies are expected to be a single GitHub issue URL without `www.`.
- Bodies with `www.` prefix: 138 (e.g., #2973, #2972, #2970, #2968, #2967).
- Non‑URL body: 1 (issue #2651 body is `/wallet ubq.eth`).
- No bodies point to PRs, to self (`devpool-directory/devpool-directory`), or use `http://`.

### 4) Linked Issue Health
- Across 392 unique target issues:
  - Open: 307
  - Closed: 72
  - Unknown/insufficient access: 10
  - Not found: 3
- Open but assigned: 15 (targets should be open and unassigned).
  - Examples:
    - #3907 → https://github.com/ubiquity-os/plugin-template/issues/13 (assigned=2)
    - #3896 → https://github.com/ubiquity-os-marketplace/command-start-stop/issues/176 (assigned=2)
    - #3850 → https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/433 (assigned=2)
    - #3516 → https://github.com/ubiquity/pay.ubq.fi/issues/421 (assigned=2)
- Closed target examples:
  - #3448 → https://github.com/ubiquity-os/ubiquity-os-kernel/issues/288
  - #2946 → https://github.com/ubiquity-os/deno-plugin-adapter/issues/4
  - #2968 → https://www.github.com/ubiquity-os/ubiquity-os-kernel/issues/285
- Not found/unknown target examples:
  - Not found: #2884 → https://github.com/ondecentral/LandingPage/issues/31
  - Unknown (likely permission): #2855/#2854 (internal task repos)

### 5) Labels & Consistency
- “Unavailable” label coverage is low relative to closed/assigned targets:
  - Closed targets with “Unavailable”: 5/72
  - Open-but-assigned targets with “Unavailable”: 5/19
- Label taxonomy inconsistency: both `Price:` (242 occurrences) and `Pricing:` (15 occurrences) appear.

### 6) Guardrail Checks (sanity)
- No `http://` bodies; all `https://`.
- No self-referential bodies to `devpool-directory/devpool-directory`.
- No `…/pull/…` bodies (all are `…/issues/…`).
- No multi-line bodies; bodies are single-line.

## Interpretation
- Unauthorized mirrors (non‑App authors) currently exist and are recent, violating “App‑Only Writes”.
- Duplicates are largely caused by those unauthorized mirrors duplicating App-authored mirrors.
- A significant fraction of mirrors point to targets that are closed or assigned.
- Many App-authored mirrors use `https://www.github.com/…`, diverging from the uniform format requirement.
- One open issue has a non-URL body and should be corrected.

## Enforcement & Remediation
1) Enforce App‑Only Author
   - Verify `APP_ID` and `APP_PRIVATE_KEY` secrets and recent runs for `.github/workflows/enforce-app-author.yml`.
   - Confirm it executes on `issues: [opened, edited, reopened]` with `permissions.issues: write` (present in repo).
2) Sweep Unauthorized Mirrors
   - Run `.github/workflows/cleanup-unauthorized.yml` with `owner=devpool-directory`, `repo=devpool-directory`, `dry_run=false` to delete all non‑App authored mirrors.
3) Remove Duplicates
   - The sweep above should remove non‑App duplicates. Re-audit to confirm duplicates drop to zero.
4) Normalize Bodies
   - One-time App-auth job to rewrite bodies from `https://www.github.com/…` → `https://github.com/…`.
5) Enforce Target Health
   - Scheduled App-auth job to validate that linked issues are open and unassigned; delete mirrors for closed/assigned/not-found targets, or at least apply “Unavailable” and optionally auto-close.
6) Label Hygiene
   - Standardize on a single label prefix (`Price:` or `Pricing:`) and normalize existing labels accordingly.
7) Fix Outliers
   - Correct or delete #2651 (non-URL body).

## Notes
- Audit date/time: 2025‑10‑11 (UTC).
- Data collected via GitHub API; read-only. No changes were made to repo issues during this audit.
