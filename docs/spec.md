You are to implement, from scratch, a GitHub “DevPool Directory” mirror service that aggregates issues from many partner
repositories into a central “directory” repository, keeps them in sync, publishes sidecar JSON artifacts for a UI, and
optionally tweets new paid tasks. The service runs on a schedule in CI (no standalone DB — use Git commits to a data branch
for storage). Follow the specifications below exactly.

Objectives

- Mirror partner issues into a central directory repository, preserving exact partner labels and metadata (no renames).
- Keep mirror issues in sync: title, body (link to partner), labels (exactly), and state.
- Avoid label pollution; store derived/ephemeral metadata (e.g., assignment) in sidecar JSON artifacts for the UI.
- Publish aggregated JSON artifacts to a dedicated data branch via Git commits.
- Tweet new paid issues; delete tweets when issues are completed.
- Provide duplicate detection/removal and unauthorized-issue deletion automation.

Key Principles

- Mirror exactly, compute separately: do not alter partner labels (no “Price:”→“Pricing” renames). Do not add synthetic
labels.
- Sidecar artifacts are the source for UI-enhanced state (assigned, price/time normalization, etc.).
- Idempotent, incremental, efficient sync with robust rate-limit handling and retry logic.
- Lightweight storage: commit JSON artifacts to a dedicated branch; no external database.

Configuration

- Central repo context:
    - Env: DIRECTORY_OWNER (string), DIRECTORY_REPO (string).
- Auth:
    - Primary: GITHUB_TOKEN (installation token or PAT with repo read/write as needed).
    - Optional GH CLI for deletion: GH_TOKEN (PAT with repo write).
    - Twitter: TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET.
- Partner selection:
    - A config file with:
        - include: array of orgs or owner/repo strings.
        - exclude: array of orgs or owner/repo strings.
        - explicit_urls: array of full repo URLs (optional).
        - categories (optional): mapping { "<partner_issue_url>": "<CategoryLabel>" } to attach to artifacts (not as labels).
- Behavior toggles (feature flags, default values in parentheses):
    - FORK_SAFE_URLS (true): in mirror issue body, rewrite partner links to https://www.github.com/... when running outside
“official” owners to avoid mentions; OFFICIAL_OWNERS list required.
    - WRITE_UNAVAILABLE_LABEL (false): when true, add/remove “Unavailable” label based on assignment; otherwise derive
“assigned” state only in artifacts.
    - TWEET_ON_CREATE (true), DELETE_TWEET_ON_COMPLETE (true).
    - DRY_RUN (false): never write or tweet; log intended actions.

Functional Requirements

- Repository discovery:
    - Build partner repo set from include, union with explicit_urls, then subtract exclude. If an exclude is an org, remove
all its repos unless explicitly re-included.
- Fetch partner issues:
    - Use efficient incremental sync:
        - Prefer conditional requests with ETags (If-None-Match) per repo, or since timestamps, stored in sync-metadata.json.
        - Filter out pull requests (issues endpoint returns PRs; remove where PR fields exist).
        - Skip archived repos early.
        - Exclude partner issues closed with state_reason=not_planned.
- Mirror creation/update:
    - Identity: the unique key is the partner issue’s node_id. Maintain a directory-side index
artifact mapping partner node_id to directory issue number/url to avoid identity labels.
    - Create mirror issue when none exists:
        - Title = partner title.
        - Body = partner issue URL (apply fork-safe rewrite if enabled).
        - Labels = partner labels exactly (no renames, no conversions), optionally plus an identity label only if you opted
for the label-identity approach.
    - Update existing mirror when partner changes:
        - Title/body/labels/state kept in sync exactly with partner (body remains the partner URL).
        - State transitions: open↔closed match partner state precisely.
- Assignment state:
    - Do not assign users to mirrors (they may not be collaborators).
    - Always compute and write assignment to artifacts: assigned: boolean, assignees: string[] from partner issue.
- Statistics:
    - Compute counts and reward totals over the directory’s mirrors referencing partner-derived state:
        - notAssigned: partner open, no assignees.
        - assigned: partner open, has ≥1 assignee.
        - completed: partner closed (any reason except not_planned, which is excluded from mirroring).
    - Price parsing:
        - Extract from label named exactly like Price: <amount> <CURRENCY> (e.g., “Price: 100 USD”).
        - Ignore invalid numbers gracefully.
    - Totals: reward sums for each category and overall; task counts likewise.
    - Exclude issues whose partner URLs fall under exclude for statistics (allow UI to show suppression).
- PR and avatar collection:
    - PRs: fetch all PRs for partner repos with state=all.
    - Avatars: for each unique owner (org or user), fetch avatar URL via the appropriate endpoint; detect type properly.
- Twitter lifecycle:
    - On mirror creation for a partner issue with a valid Price: label:
        - Compose text: “<price> for <time or fallback text>\n\n<partner_url>”.
        - Post tweet when enabled.
        - Record mapping partner_node_id → tweet_id in a twitter-map.json artifact.
    - On completion (partner closes):
        - If a tweet mapping exists, attempt deletion; if 404, remove mapping anyway; persist updated map.
- Deduplication:
    - Identify duplicate mirrors representing the same partner issue (by partner node_id or identity label if used).
    - Keep the oldest mirror (by creation time), delete others when deletion is enabled and GH_TOKEN present; otherwise close
as duplicates or log actionable instructions. Provide --dry-run mode.
- Unauthorized-issue guard:
    - When issues are opened directly in the directory repo, delete them if the author is not authorized (e.g., not an
installed app or allowed user). Use GH CLI or App permissions depending on your chosen auth path. Must be opt-in and safe
by default.

Artifacts (committed to a dedicated branch)

- Target branch: configurable (default __STORAGE__). If missing, create from the repo’s default branch HEAD.
- Files (JSON):
    - partner-open-issues.json: array of partner issues that are currently open (raw or normalized shape; include key fields:
owner, repo, issue number, node_id, title, url, state, labels, assignees, created_at, updated_at).
    - partner-pull-requests.json: array of partner PRs (open/closed), with key fields.
    - owners-avatars.json: array of { owner: string, type: "User"|"Organization", avatar_url: string }.
    - mirror-state.json: map { [partner_node_id]: { directory_issue_number?: number, directory_issue_url?: string, assigned:
boolean, assignees: string[], price_label: string|null, time_label: string|null, category?: string } }.
    - statistics.json: { rewards: { notAssigned: number, assigned: number, completed: number, total: number }, tasks:
{ notAssigned: number, assigned: number, completed: number, total: number } }.
    - twitter-map.json: { [partner_node_id]: tweet_id }.
    - sync-metadata.json: { perRepo: { "<owner>/<repo>": { etag?: string, lastSyncISO?: string } } }.
    - index.json: optional small index mapping partner node_id → { directory_issue_number, directory_issue_url } if you
choose not to rely on identity labels.
- Git commit strategy:
    - Use the current tip commit’s tree as base_tree when creating new trees.
    - Chunk batched updates by payload size and file count to avoid API limits.
    - Semantic commit messages (e.g., “sync: issues for <n> repos”, “feat(twitter): delete completed tweet <id>”).
    - Ensure idempotency: no-op if nothing changed.

Sync Efficiency & Correctness

- Do not refetch directory issues inside inner loops. Load once, build maps in memory, and update maps as you create/update
mirrors.
- Use a concurrency limiter (e.g., 4–8 concurrent requests) to avoid burst rate limiting; implement exponential backoff on
403s and secondary rate-limits with jitter.
- Use conditional requests:
    - Store per-repo ETags and send If-None-Match. If 304, skip processing for that repo.
    - Alternatively or additionally, use since timestamps (last updated) per repo.
- Fetch only what you need:
    - Prefer per-repo pagination with per_page=100 and filter client-side; don’t over-request.
    - For PRs, always request state=all.
- Idempotency:
    - Before creating a mirror, recheck identity (via index artifact or identity label) to avoid races/duplicates.
    - All operations must be safe to rerun; partial failures should be recoverable in subsequent runs.

Error Handling & Observability

- Centralize API calls with retry/backoff; log concise, contextual messages.
- Fail-safe behavior: if a subset of repos fails, continue processing others; report errors at the end.
- Summaries:
    - At run end, print a structured summary of: repos processed, mirrors created/updated/closed, tweets created/deleted,
artifacts written, rate-limit usage.
- Never log secrets or full tokens.

Testing (high-level)

- Unit tests:
    - Label mirroring (no renames).
    - Price/time parsing robustness.
    - Assignment derivation and mirror-state.json population.
    - Identity mapping and dedup set detection.
    - Git artifact commit logic: branch creation, base tree usage, chunking.
    - Twitter lifecycle: create on open with price, delete on completion; resilient to 404.
    - Repo selection (include/exclude/org vs repo).
- Integration tests (optional, guarded by real token):
    - Create/update/label/close partner issues in a sandbox repo; assert mirror behavior and artifact updates.
    - Rate-limit/backoff behavior can be simulated/mocked.
- E2E dry-run:
    - End-to-end run with DRY_RUN and mocked APIs to validate logging/flow.

CI Workflows

- Scheduled sync (e.g., every 15 minutes) and manual dispatch.
- Optional dedup job with dry_run input.
- Test workflow (unit + optional integration behind a flag).
- Optional “delete unauthorized issues” job on issue opened events.

Deliverables

- A runnable CLI entry that performs a single full sync cycle:
    - Discover repos → fetch partner issues/PRs → create/update mirror issues → compute stats → update artifacts → tweet
lifecycle → commit artifacts.
- A dedup CLI that identifies duplicate mirrors and acts per config (delete/close/log).
- An optional CLI/script for unauthorized issue deletion.
- Configuration schema and example config.
- Documentation for:
    - Environment variables and required scopes.
    - Artifacts schema for the UI.
    - Operational limits and retry strategy.
    - Feature flags and migration guidance.

Acceptance Criteria

- When a partner issue is opened, a mirror is created with title/body/labels exactly matching the partner (no label renames),
and artifacts are updated.
- When a partner issue changes (title/body/labels/state), the mirror and artifacts reflect the change within the next run.
- Assignment is reflected in artifacts; no label pollution occurs unless explicitly enabled via WRITE_UNAVAILABLE_LABEL.
- Statistics reflect correct totals across notAssigned/assigned/completed categories, summing price values from “Price:”
labels; invalid amounts are ignored without crashing.
- Artifacts are committed to the data branch with proper branch initialization, base tree handling, and safe batching.
- Tweets are created only for issues with valid price labels; tweets are deleted when the issue is completed; the map is
consistent.
- Dedup detects mirrors for the same partner node_id, preserves the oldest, and removes the rest when deletion is enabled;
dry-run logs intended actions.

Implement with a modern TypeScript Node runtime. Choose well‑maintained libraries for GitHub API, concurrency limiting,
validation, and testing. Keep the code modular, with clear boundaries: discovery, fetch, mirror, artifacts, twitter, storage,
and CLI.