# DevPool Directory v2 — Storage Artifacts & Integration

This repository mirrors selected GitHub issues into a single “directory” repo and publishes derived JSON artifacts to a dedicated data branch for consumption by UIs and services. This document describes those artifacts, their shapes, and how to integrate with them reliably.

For a practical, UI‑focused integration walkthrough (fetch patterns, caching, and rendering tips), see `docs/ui-integration.md`.

The system is designed to be stateless at runtime: artifacts in the data branch are the source of truth for consumers.

**Data Branch**
- Default branch for artifacts: `__STORAGE__` (configurable via `data_branch`).
- Artifacts are updated atomically in a single commit per run by the aggregator step.
- Summary details are published in `summary.json` for quick run introspection.

**How To Fetch**
- REST Contents API (recommended for simplicity):
  - `GET /repos/{owner}/{repo}/contents/{path}?ref=__STORAGE__`
  - Response `content` is base64-encoded; decode and parse JSON.
- Caching:
  - Use ETag/If-None-Match to minimize bandwidth. The contents endpoint returns `ETag` per file.
  - Optionally poll `summary.json` first; if unchanged, you can skip reading other artifacts.

**Artifacts**
- `partner-open-issues.json`
  - Array of partner issues that are both open and “priced” (i.e., have a label beginning with "Price:").
  - Shape (TypeScript):
    - `{
         owner: string; repo: string; number: number; node_id: string;
         title: string; url: string; body?: string;
         labels: string[]; assignees: string[];
         state: "open" | "closed"; // always "open" in this file
         created_at: string; updated_at: string
       }`
  - Notes: Array order is not guaranteed; consumers should sort as needed.

- `partner-pull-requests.json`
  - Array of partner PRs (state=all) for visibility/analytics.
  - Shape: `{
      owner: string; repo: string; number: number;
      state: "open" | "closed"; url: string; title: string;
      created_at: string; updated_at: string
    }[]`

- `owners-avatars.json`
  - Array mapping owner name to avatar and account type (user/org).
  - Shape: `{ owner: string; type: "User" | "Organization"; avatar_url: string }[]`

- `mirror-state.json`
  - Map keyed by partner issue `node_id` with the directory linkage and derived state.
  - Shape: `Record<string, {
      directory_issue_number?: number;
      directory_issue_url?: string;
      assigned: boolean;
      assignees: string[];
      price_label?: string | null; // raw label string, e.g. "Price: $500"
      time_label?: string | null;  // raw label string, e.g. "Time: 1 week"
      category?: string
    }>`
  - Notes:
    - `directory_issue_*` present when a mirror exists. Mirrors are created/updated for partner issues only when they are open and priced; mirrors are closed when partner issues close.
    - `assigned`/`assignees` are derived from the partner issue’s assignees.

- `index.json`
  - Map from partner `node_id` to directory issue pointer for quick lookups.
  - Shape: `Record<string, { number: number; url: string }>`
  - Notes: Built from `mirror-state.json` and guaranteed to be consistent with it for the current run.

- `twitter-map.json`
  - Map from partner `node_id` → tweet ID (string) for lifecycle integrations.
  - Shape: `Record<string, string>`
  - Notes: Use URL pattern `https://twitter.com/i/web/status/{tweetId}` when linking.

- `sync-metadata.json`
  - Per‑repo sync metadata to support incremental fetches.
  - Shape: `{ perRepo: Record<string, { etag?: string; lastSyncISO?: string }> }`
  - Notes: Present for observability; values may be omitted or added over time without breaking consumers.

- `statistics.json`
  - Aggregate counts computed from the open+priced subset (same subset as `partner-open-issues.json`).
  - Shape: `{ rewards: { notAssigned: number; assigned: number; completed: number; total: number }, tasks: { notAssigned: number; assigned: number; completed: number; total: number } }`
  - Notes: `completed` is based on state in the supplied subset; current pipeline focuses stats on open+priced for clarity.

- `summary.json`
  - Human‑oriented run summary; useful for dashboards and update checks.
  - Shape: `{
      reposProcessed: number;
      shards: number;
      issuesOpen: number;             // across all processed partner issues
      issuesOpenPriced: number;       // equals partner-open-issues.json length
      issuesClosed: number;
      prs: number;
      mirrors: number;                // keys in mirror-state.json
      owners: number;                 // entries in owners-avatars.json
      tweetsCreated: number; tweetsDeleted: number;
      committedFiles: string[]        // artifact filenames written this run
    }`

**Identity & Semantics**
- Primary identity for partner issues is the GitHub GraphQL `node_id`.
- Mirrors are created in the directory repo with the body set to the exact partner issue URL. This guarantees a stable link and supports duplicate prevention.
- No label renames are performed; partner labels are mirrored as-is. “Unavailable” compatibility labeling is disabled by default to avoid label pollution.
- Creation policy: Only partner issues that are open AND have a `Price:` label are mirrored. Partner issues closed later will cause corresponding mirrors to close.

**Integration Patterns**
- Building a Task List UI
  - Read `partner-open-issues.json` for the core list of open, priced tasks.
  - For each task, use `mirror-state.json` keyed by `node_id` to show assignment info (`assigned`, `assignees`), price/time labels, and the directory mirror link if you want to deep‑link into the directory repo.
  - Join with `owners-avatars.json` on `owner` for avatars.
  - Optional: Use `twitter-map.json` to render a link to the promotional tweet if present.

- Cross‑referencing Mirrors
  - If you need the directory issue number/URL for a given partner item, consult `index.json` (node_id → directory issue pointer).

- Efficient Fetching
  - Poll `summary.json` first; if unchanged (ETag matches), you can skip fetching other files.
  - Otherwise, fetch the artifacts you need and cache via ETag/If‑None‑Match.

**Versioning & Stability**
- Artifacts are backward‑compatible and append‑only by default; new fields may be added.
- File names are stable. Legacy files prefixed with `devpool-*.json` have been removed and replaced by the above set.

**Configuration**
- Config file default: `config/devpool.config.json`
  - Keys: `include`, `exclude`, `explicit_urls`, `official_owners`, `data_branch`, `max_shards`
- Override path via env `CONFIG_PATH`.

**CLI & Workflows**
- npm scripts:
  - `npm run plan` — compute shards and write `plan.json` + `plan-summary.json`
  - `npm run sync:shard` — run a shard against its repo list
  - `npm run aggregate` — merge shard outputs and write artifacts to the data branch
  - `npm run summary` — print a run summary (also used to populate Actions job summary)
  - `npm run deduplicate` — detect and remove duplicate mirrors (manual workflow provided)
- Workflows: see `.github/workflows/matrix-sync.yml` (production) and `e2e.yml` (testing repo).

**Notes**
- Consumers should not rely on array order; apply their own sort/filter (e.g., by price/time labels, updated date).
- Price/time are mirrored as raw label strings for transparency; UIs may parse for display but should retain the original strings for accuracy.
- Artifacts are committed together; partial reads during a run are unlikely but consumers can guard by rechecking `summary.json` ETag before rendering critical views.

**Sharding Architecture (Concise Overview)**
- Plan
  - Discovers repos from `config/devpool.config.json` (`include`, `exclude`, `explicit_urls`).
  - Builds simple weights (e.g., open+priced density) and greedily balances them into `K` shards.
  - Caps `K` by `max_shards` (default 256). Emits `plan.json` with `matrix.include` and `maxParallel`.
  - Downloads prior artifacts (`index.json`, `twitter-map.json`, `sync-metadata.json`, and persistent maps) for shard reuse.
- Sync Shard
  - Processes its repo list with a per‑shard concurrency pool (`SHARD_CONCURRENCY`, default 4).
  - Incremental fetch: uses per‑repo `lastSyncISO` or a global watermark from `last-run.json`, minus a safety fudge (`SYNC_SINCE_FUDGE_MINUTES`, default 5) to avoid boundary misses.
  - Fetcher: GraphQL (ordered by `UPDATED_AT`, early stop) with automatic REST fallback; both paths exclude PRs and `state_reason: not_planned`.
  - Timeouts: each repo call is bounded by `REPO_TIMEOUT_MS` (default 180s). Shard steps are wrapped in an OS timeout (`SHARD_TIMEOUT_MINUTES`, default 12 in the workflow).
  - Mirrors: create/update only for open+priced issues; close mirrors when partner closes. Recursion guard skips mirrors that are just directory URLs.
  - Twitter deltas: post on create (priced) and delete on completion; deltas are merged centrally by the aggregator.
- Aggregate
  - Downloads all shard artifacts, merges them with prior data from the data branch (`DATA_BRANCH`, default `__STORAGE__`).
  - Union semantics: never drops entries for repos whose shard failed; previously published data persists.
  - Recomputes `partner-open-issues.json` (open+priced), `statistics.json` (open+priced; plus lifetime fields), merges `mirror-state.json`, rebuilds `index.json`, and commits in one shot.
  - Publishes `last-run.json` (watermark for the next plan/sync) and a human‑readable `summary.json`.

**Operational Knobs (Env)**
- Reads & Writes
  - `DIRECTORY_OWNER`, `DIRECTORY_REPO`: target repo for mirrors/artifacts.
  - `DATA_BRANCH`: data branch name (default `__STORAGE__`).
  - `GH_TOKEN`: Personal Access Token used for read calls (recommended for cross‑org reads).
  - `GITHUB_TOKEN`: GitHub App token (from the workflow) used for writes and safe repo‑scoped reads.
  - `WRITE_TARGET_REPO`: safety check to prevent writes to wrong repo (must equal `owner/repo`).
- Sync behavior
  - `USE_GRAPHQL` ("true"|"false"): enable GraphQL fetchers with REST fallback.
  - `FULL_RESYNC` ("true"|"false"): ignore since watermarks and fetch full history this run.
  - `FORCE_FULL_RESYNC` ("true"|"false"): force resync regardless of maps; useful for cold‑start/debug.
  - `SHARD_CONCURRENCY`: per‑shard in‑process parallelism (default 4).
  - `SYNC_SINCE_FUDGE_MINUTES`: backdate since watermark to avoid races (default 5).
  - `REPO_TIMEOUT_MS`: per‑repo API timeout (default 180000 ms).
  - `SHARD_TIMEOUT_MINUTES`: OS wrapper timeout for a shard step (default 12; set in workflow env).
- Backfill & Utilities
  - `BACKFILL_CONCURRENCY`: parallelism for historical backfill.
  - `DRY_RUN`: if "true", shards/aggregate avoid writes/tweets and only produce local outputs.

**Data Integrity & Partial Failures**
- Aggregation uses union/merge semantics against prior artifacts, so missing shards do not delete data from `issues-map.json`, `lifetime-map.json`, `mirror-state.json`, `index.json`, or `twitter-map.json`.
- `partner-open-issues.json` and `statistics.json` are derived from the persistent maps and merged mirror state; previously known items remain visible even if a shard fails.
- The matrix workflow sets timeouts and `continue-on-error: true` for shard jobs; the aggregator still runs and merges successfully completed shards with prior artifacts.

**Historical Backfill**
- Workflow: `.github/workflows/backfill.yml` (manual dispatch).
- Seeds `issues-map.json` and `lifetime-map.json` by fetching full issue history (`state=all`) for all included repos, then runs aggregate to publish consistent artifacts.
- Recommended when first enabling a new owner set or after large scope changes; day‑to‑day runs rely on incremental since‑watermarks.
