**Twitter Sync — Handoff Spec**

- Owner: Directory v2 pipeline
- Scope: Synchronize the Twitter profile with current “open + priced + unassigned” tasks; hide/delete legacy tweets
  not mapped to desired items. Sized for fast implementation in this repo (TypeScript, Node 20, twitter-api-v2).

**Goal**

- Keep the Twitter profile exactly synchronized with “open and available” tasks.
- Remove legacy tweets we don’t map to any current/open/available task.
- Post tweets for tasks that should be visible but aren’t yet, and delete tweets that should no longer be visible.

**Source Of Truth**

- Read aggregated artifacts from the data branch `__STORAGE__` (same repository). Expected files:
  - `partner-open-issues.json`: array of partner issues that are currently open and priced (subset of all issues).
  - `mirror-state.json`: map keyed by partner issue `node_id` with per-issue state (e.g., { assigned: boolean, directory mapping }).
  - `issues-map.json`: persistent full set (all repos), used for historical consistency if needed.
  - `twitter-map.json`: current mapping: partner `node_id` → `tweet_id`.
- “Available” = open + priced + unassigned, where:
  - “Priced” is any label matching `/^Price:\\s*/`.
  - “Unassigned” means `mirrorState[node_id]?.assigned === false`.

**Desired End State**

- Twitter timeline contains only current “open + priced + unassigned” tasks — one tweet per task.
- No duplicates (by `node_id` or tweet text).
- `twitter-map.json` contains a 1:1 mapping for all visible tweets.
- Tweets for closed, assigned, or de‑priced issues are deleted.
- Legacy unmanaged tweets (no mapping and not matching a desired item) are deleted.

**Tweet Content Format**

- Text (single tweet, no threads, no media):
  - `<amount> for <time_label or ‘this task’>\n\n<issue_title>\n<issue_url>`
  - Example: `$500 for 1–3 days\n\nAdd pagination to feed\nhttps://github.com/owner/repo/issues/123`
- Parsing inputs:
  - `amount`: parse from the `Price:` label; extract the leading integer amount, ignore symbols/commas.
  - `time_label`: optional from label `Time: …` (fallback: `this task`).
  - `issue_title`: partner issue title.
  - `issue_url`: partner `html_url` (prefer non-www; www acceptable).
- Idempotency signature: identity is the partner issue `node_id`. We never rely on tweet text for idempotency.

**Architecture & Files**

- Add the following modules (TypeScript):
  - `src/twitter/client.ts`
    - Wrap `twitter-api-v2` client.
    - Expose: `getUserId()`, `listUserTweets(opts)`, `createTweet(text)`, `deleteTweet(id)`.
  - `src/twitter/desired.ts`
    - `buildDesiredSet({ partnerOpenIssues, mirrorState }) => Map<node_id, { text, issue_url, updated_at }>`.
  - `src/twitter/plan.ts`
    - `plan({ desiredMap, currentTweets, twitterMap, opts }) => { creates: Record<node_id, tweetText>, deletes: string[] /*tweet_ids*/, keep: string[] /*tweet_ids*/ }`.
  - `src/twitter/apply.ts`
    - `applyPlan({ creates, deletes, budgets, client, twitterMap }) => { created: Record<node_id, tweet_id>, deleted: string[] }`.
  - `src/artifacts/storage.ts`
    - `readJson(path: string, ref = "__STORAGE__")` via raw GH HTTP fetch (consistent with `src/utils/last-run.ts`).
    - `writeJsonBatch(changes[])` by reusing `gitCommit`/`gitPush` in `src/git.ts` (file paths are root-level JSON in `__STORAGE__`).
  - `src/cli/twitter-plan.ts`
    - Loads artifacts + scans tweets + computes plan; writes `twitter-plan.json` and `twitter-current.json`.
  - `src/cli/twitter-apply.ts`
    - Loads plan + map; applies with budgets and backoff; merges/writes `twitter-map.json` and `twitter-delta.json`.
  - `src/cli/twitter-audit.ts`
    - Verifies consistency between desired and current live state.
- Integrate with existing helpers:
  - Use `DEVPOOL_OWNER_NAME` and `DEVPOOL_REPO_NAME` (from `src/directory/directory.ts`).
  - Use `gitCommit`/`gitPush` (`src/git.ts`) to write JSON to `__STORAGE__`.
  - Keep existing `twitter-map.json` handling, but switch initialization to read from this repo rather than a hardcoded owner.

**CLI Commands**

- `twitter:plan`
  - Inputs (env): `DIRECTORY_OWNER`, `DIRECTORY_REPO`, `DATA_BRANCH` (default `__STORAGE__`), `MAX_TWEETS_SCAN` (default 1000), `TWEET_REGEX` (optional override).
  - Flags: `--include-assigned` (default false), `--dry-run` (default true).
  - Reads artifacts, fetches current tweets, computes a plan object:
    - `{ creates: Record<node_id, tweetText>, deletes: string[] /*tweet_ids*/, keep: string[] /*tweet_ids*/ }`.
  - Writes:
    - `twitter-plan.json` (the plan).
    - `twitter-current.json` (cache of scanned tweets: id, text, created_at, pinned?: boolean).

- `twitter:apply`
  - Inputs: same env + `TWEET_BUDGET_CREATE`, `TWEET_BUDGET_DELETE` (defaults 10/200), Twitter secrets.
  - Applies plan with budgets and backoff:
    - Create in stable order (newest issues first by `updated_at`).
    - Delete unwanted tweets (oldest first; unmanaged before managed; skip pinned).
  - Writes:
    - `twitter-map.json` (merged mapping).
    - `twitter-delta.json` ({ created: Record<node_id, tweet_id>, deleted: string[] }).
    - `summary-twitter.json` (optional run summary).

- `twitter:audit`
  - Verifies consistency:
    - Every desired `node_id` has a corresponding live `tweet_id` (and tweet exists via API).
    - No live managed tweets map to non‑desired items.
  - Produces a JSON report with actionable diffs.

Add npm scripts:

- In `package.json`:
  - `"twitter:plan": "tsx src/cli/twitter-plan.ts"`
  - `"twitter:apply": "tsx src/cli/twitter-apply.ts"`
  - `"twitter:audit": "tsx src/cli/twitter-audit.ts"`

**Reconciliation Algorithm**

- Build desired set:
  - Load `partner-open-issues.json` and `mirror-state.json` from `__STORAGE__`.
  - Filter: state === open AND has price label AND `assigned === false` unless `--include-assigned` is set.
  - For each desired item, compute tweet text via formatter (see “Tweet builder” below). Key by `node_id`.

- Scan current tweets:
  - Use twitter-api-v2 client:
    - `userTimeline(userId, { exclude: ['replies','retweets'], max_results: 100, pagination_token })`.
    - Stop at `MAX_TWEETS_SCAN` or `TWEET_SCAN_MAX_AGE_DAYS` (default 365) if provided.
    - Also fetch the user object once to detect `pinned_tweet_id`; mark pinned for skip.
  - Collect `{ tweet_id, text, created_at, pinned?: boolean }`.

- Identify managed vs unmanaged:
  - Managed = tweet ids present as values in `twitter-map.json`.
  - Unmanaged = not in map; attempt to detect GitHub issue links by regex:
    - Default: `/https?:\/\/(?:www\.)?github\.com\/[^\/]+\/[^\/]+\/issues\/\d+/i` (configurable via `TWEET_REGEX`).
    - Optional: resolve to `node_id` by calling `GET /repos/:owner/:repo/issues/:number` and using `node_id`.

- Diff:
  - Creates: desired `node_id` not in `twitter-map.json` OR mapped `tweet_id` missing from current timeline (deleted by hand).
  - Deletes:
    - Managed tweet where its `node_id` is no longer desired (closed/assigned/de‑priced).
    - Unmanaged tweet that matches an issue URL whose `node_id` is not desired (legacy).
    - Respect `DELETE_WINDOW_DAYS` (default 0 = delete immediately; >0 to keep recent tweets briefly).

- Budgets & ordering:
  - Apply `TWEET_BUDGET_CREATE` and `TWEET_BUDGET_DELETE` per run.
  - Create ordering: newest desired issues first (`updated_at` desc).
  - Delete ordering: oldest tweets first; unmanaged before managed.

- Apply:
  - Create: `client.v2.tweet(text)`; capture `tweet_id`; record `node_id → tweet_id` in delta.
  - Delete: `client.v2.deleteTweet(id)`; ignore 404; skip pinned.

- Merge:
  - Load existing `twitter-map.json`.
  - Apply delta creates/deletes.
  - Write back via `gitCommit`/`gitPush`.

**Tweet Builder (formatter)**

- Implement `formatTweet(issue)` used by `desired.ts`:
  - Extract amount from the `Price:` label: match leading number (e.g., `"$1,200` → `1200`).
  - `time_label`: from `Time:` label; if absent, use `this task`.
  - Return single tweet text: `<amount> for <time_label>\n\n<issue_title>\n<issue_url>`.
- Idempotency: identity is `node_id` (not text). Changing the formatter later will not break identity.

**Artifacts IO**

- Read (raw fetch):
  - Base: `https://raw.githubusercontent.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}/__STORAGE__/<file>`.
  - Files: `partner-open-issues.json`, `mirror-state.json`, `issues-map.json`, `twitter-map.json` (create if missing).
- Write:
  - Use `gitCommit(data, filename)` followed by `gitPush()` (existing `src/git.ts`).
  - Update `twitter-map.json` and produce `twitter-delta.json`, `twitter-plan.json`, `twitter-current.json`, optional `summary-twitter.json`.

**Environment & Secrets**

- GitHub
  - `DEVPOOL_OWNER_NAME`, `DEVPOOL_REPO_NAME` (already in repo code).
  - `DATA_BRANCH` (default `__STORAGE__`).
  - GitHub App token via existing envs: `GITHUB_TOKEN` or `DEVPOOL_GITHUB_API_TOKEN` (repo read/write).
- Twitter
  - `TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`.
- Flags
  - `DRY_RUN` (default true for plan).
  - `TWEET_BUDGET_CREATE` (default 10), `TWEET_BUDGET_DELETE` (default 200).
  - `MAX_TWEETS_SCAN` (default 1000), `TWEET_SCAN_MAX_AGE_DAYS` (default 365).
  - `DELETE_WINDOW_DAYS` (default 0), `INCLUDE_ASSIGNED` (default false).

**Rate Limiting & Backoff**

- Twitter
  - Implement exponential backoff with jitter on 429; up to 5 attempts per op.
  - Enforce create/delete budgets per run to respect daily caps; leftover items naturally carry over next run.
- GitHub
  - Reuse existing Octokit client with throttling/retry.
  - Back off on 403/secondary rate limits.

**Idempotency & Safety**

- Identity is the GitHub partner issue `node_id`.
- Create for an already-tweeted node rechecks live `tweet_id`:
  - If tweet exists, mark keep; if missing, re‑create and update map.
- Delete skips pinned tweets if we lack unpin permissions; log and continue.
- Always support `--dry-run`; log clear summary of creates/deletes.

**Workflow (GitHub Actions)**

- File: `.github/workflows/twitter-sync.yml`
- Trigger: `workflow_dispatch` (manual); optional `schedule` (off by default).
- Jobs:
  - Checkout and setup Node 20.
  - Obtain GitHub App token (reuse existing pattern) for committing `twitter-map.json`.
  - Plan phase:
    - Run `npm run twitter:plan` with GitHub env (owner/repo) and branch; upload `twitter-plan.json` and `twitter-current.json` as artifacts.
  - Apply phase (conditional):
    - Provide Twitter secrets + App token; run `npm run twitter:apply` with budgets and `DRY_RUN=false`.
    - Commit updated `twitter-map.json` to `__STORAGE__`.
  - Summary:
    - Append counts to `$GITHUB_STEP_SUMMARY`: desired_count, current_managed, creates_planned/applied, deletes_planned/applied, skipped_pinned, errors.

Minimal example step snippet:

```yaml
      - name: Plan Twitter Sync
        run: npm run twitter:plan
        env:
          DEVPOOL_OWNER_NAME: ${{ github.repository_owner }}
          DEVPOOL_REPO_NAME: ${{ github.event.repository.name }}
          DATA_BRANCH: __STORAGE__

      - name: Apply Twitter Sync
        if: ${{ inputs.apply == 'true' }}
        run: |
          TWEET_BUDGET_CREATE=10 TWEET_BUDGET_DELETE=200 \
          DRY_RUN=false npm run twitter:apply
        env:
          DEVPOOL_OWNER_NAME: ${{ github.repository_owner }}
          DEVPOOL_REPO_NAME: ${{ github.event.repository.name }}
          DATA_BRANCH: __STORAGE__
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_KEY_SECRET: ${{ secrets.TWITTER_API_KEY_SECRET }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
          GITHUB_TOKEN: ${{ steps.app_token.outputs.token }}
```

**Discrepancy Check**

- API method (preferred):
  - Use `twitter:plan` to fetch the live timeline (exclude replies/retweets, detect `pinned_tweet_id`) and compute `{ keep, deletes, creates }` versus desired.
  - `twitter:audit` re-fetches and verifies that every desired `node_id` maps to an existing `tweet_id`, and that no managed tweet corresponds to a non-desired `node_id`.
- Scrape fallback (no API):
  - Capture HTML for manual or heuristic parsing: `curl -sL -H "User-Agent: Mozilla/5.0" https://x.com/<handle> > twitter-raw.html`.
  - Optional heuristic: try extracting `status/<id>` references using a headless or pre-rendered source (e.g., Nitter mirror) when available; store as `twitter-current-scraped.json` for comparison. Treat this as best-effort and do not delete based solely on scraped signals if ambiguity remains.
  - Always attach `twitter-raw.html` to the run artifacts for audit.

Example manual check:

- `curl -sL -H 'User-Agent: Mozilla/5.0' https://x.com/UbiquityDevPool > twitter-raw.html`
- Inspect locally for the latest few tweets and compare to `twitter-plan.json` creates/deletes.

**E2E Test Plan**

- Dry-run end-to-end:
  - Populate mock artifacts in `__STORAGE__` (or use current data) and run `npm run twitter:plan` → verify `twitter-plan.json` and `twitter-current.json` artifacts.
  - Run `npm run twitter:audit` to ensure consistency surfaces as expected (should exit non-zero if mismatches exist).
- Apply against test credentials (recommended):
  - Set `TWITTER_*` creds for a test account; run `npm run twitter:apply` with small budgets (e.g., `TWEET_BUDGET_CREATE=1`, `TWEET_BUDGET_DELETE=0`) and verify that exactly one tweet is created and `twitter-map.json` is updated and committed.
  - Delete pass: flip to `TWEET_BUDGET_CREATE=0`, `TWEET_BUDGET_DELETE=1` and verify deletes and map updates.
- Production validation:
  - Run `twitter:plan` on the main account, review the plan artifacts. Then apply with conservative budgets and re-run audit; repeat until converged.

**GH Actions Dispatch (gh)**

- Trigger the workflow manually from CLI:
  - `gh workflow run "Twitter Sync" -R <owner>/<repo> -f apply=true -f create_budget=5 -f delete_budget=50`
  - Watch status: `gh run watch --exit-status` and fetch artifacts: `gh run download --name twitter-plan`.
- Inputs you may expose in the workflow_dispatch form:
  - `apply` (boolean), `create_budget` (number), `delete_budget` (number), `include_assigned` (boolean), `max_scan` (number), `dry_run` (boolean).

**Testing**

- Unit
  - `desired.ts`: price parsing (Price:), assigned gating, text formatting.
  - `plan.ts`: diffing correctness; unmanaged detection by regex; `DELETE_WINDOW_DAYS` handling.
  - `apply.ts`: budget enforcement; idempotency (recreate missing); delete 404 tolerance; backoff on 429.
- Integration (dry)
  - Mock artifacts + mock Twitter client (MSW pattern already present) to return synthetic timeline; verify plan decisions and apply deltas.
- E2E (optional)
  - With test credentials (or DRY_RUN with recorded fixtures); validate that `twitter-map.json` commits to `__STORAGE__` via `git.ts`.

**Rollout**

- Step 1: Run `twitter:plan` in DRY_RUN; review artifact plan.
- Step 2: Enable apply with small budgets (e.g., create=5, delete=50).
- Step 3: Increase budgets gradually until profile converges.
- Step 4: Optionally schedule daily run or chain after main aggregation job.

**Deletion Rules (Legacy Tweets)**

- Eligible to delete if:
  - Mapped but the `node_id` is not desired (closed/assigned/de‑priced), OR
  - Unmanaged and contains a GitHub issue link resolvable to `node_id` that isn’t desired.
- Pinned tweets: skip if API cannot unpin with current token.

**Observability**

- Emit `twitter-summary.json` with:
  - counts: desired, managed, scanned, creates_planned/applied, deletes_planned/applied, skipped_pinned, errors.
  - sample IDs (first 10 per category).
- Append succinct summary to `$GITHUB_STEP_SUMMARY`.
- On errors, fail the job but keep `twitter-plan.json` and partial summary for inspection.

**Appendix A — JSON Shapes**

- `twitter-map.json` (managed mapping):
  - `{ [node_id: string]: tweet_id: string }`
- `twitter-current.json` (scan cache):
  - `[{ id: string, text: string, created_at: string, pinned?: boolean }]`
- `twitter-plan.json` (plan artifact):
  - `{ creates: Record<string, string>, deletes: string[], keep: string[] }`
- `twitter-delta.json` (apply results):
  - `{ created: Record<string, string>, deleted: string[] }`

**Appendix B — Regex**

- Issue URL default regex: `https?:\/\/(?:www\.)?github\.com\/[^\/]+\/[^\/]+\/issues\/\d+`

**Appendix C — Notes on API & Library**

- Endpoints used (Twitter v2):
  - List user tweets: `GET /2/users/:id/tweets` with `exclude=replies,retweets`.
  - Create: `POST /2/tweets`.
  - Delete: `DELETE /2/tweets/:id`.
  - Pinned tweet id: obtain via user lookup (pinned_tweet_id) and exclude from deletes if pinned.
- Library: `twitter-api-v2` (repo currently pins `^1.16.0`). Confirm latest (`~1.24+`) and adjust minor API differences if upgrading.
- References (as of 2025‑10): Twitter/X developer docs for v2 timelines and tweet create/delete; Tweepy docs reflect v2 params (exclude, fields, expansions).

**Open Items**

- Switch `src/twitter/initialize-twitter-map.ts` to use `${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}` for reading the map (currently hardcoded owner).
- Confirm whether you want to adopt the new tweet text format globally (formatter differs slightly from the existing `getSocialMediaText`). Identity remains node_id, so safe to change.
- Decide whether to attempt legacy unmanaged resolution to `node_id` (extra GitHub calls vs. stricter cleanup).

**Acceptance Criteria**

- Timeline contains only desired tasks (open + priced + unassigned), one tweet per task.
- `twitter-map.json` maps 1:1 for all visible tweets; no orphans; deletions reflect non‑desired items.
- `twitter-plan.json`, `twitter-current.json`, `twitter-delta.json`, and `twitter-summary.json` are produced as specified.
- `twitter:audit` flags any inconsistency and exits non‑zero on mismatches.
