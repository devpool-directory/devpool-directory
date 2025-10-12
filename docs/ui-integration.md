# UI Integration Guide — DevPool Directory Analytics

This guide explains how a UI can consume the directory’s analytics artifacts published on the `__STORAGE__` data branch. It focuses on what to fetch, how to cache, and how to render common views.

## Overview
- Data source: GitHub Contents API against the `__STORAGE__` branch.
- Atomic updates: artifacts are written together per run; read `summary.json` first to detect changes.
- Identity: partner issues are keyed by GraphQL `node_id`; use `index.json`/`mirror-state.json` for directory links.
- Backwards compatibility: new fields/files may appear; treat unknown fields as optional.

## Core Artifacts
- `summary.json` — run summary; use for quick change checks and dashboards.
- `partner-open-issues.json` — open + priced items only (primary list for UIs).
- `partner-open-proposals.json` — open + unpriced items (proposals) to avoid reading the large `issues-map.json`.
- `mirror-state.json` — per partner `node_id`: directory issue linkage and assignment state.
- `index.json` — quick map `node_id -> { number, url }` for directory links.
- `statistics.json` — aggregate counts; includes `lifetime` rollups.
- `owners-avatars.json` — `{ owner, type, avatar_url }[]` for owner badges.
- `partner-pull-requests.json` — PRs for visibility/analytics.
- `twitter-map.json` — `node_id -> tweetId` for lifecycle integrations.
- `issues-map.json` — persistent map of all known issues (state=all) across runs.
- `lifetime-map.json` — `node_id -> amountUSD` for closed (priced) rollups.
- `sync-metadata.json` — per‑repo sync metadata (observability, incremental since markers).
- `last-run.json` — latest run watermark and commit SHA.

## Fetch Strategy (Recommended)
1) Request `summary.json` with `If-None-Match` using the last known `ETag`.
2) If 304 (Not Modified): keep your cached data.
3) If 200: fetch the artifacts you need in parallel with `If-None-Match` per file.
4) Render from the new data; persist `ETag`s for the next poll.

> Tip: GitHub’s Contents API returns a per-file `ETag` and `content` in base64.

Base URL pattern:
- `GET /repos/{owner}/{repo}/contents/{path}?ref=__STORAGE__`

## Security & Auth
- Do not embed Personal Access Tokens in a browser app.
- Public reads usually work unauthenticated, but rate limits are lower; consider a lightweight server/SaaS proxy to add an OAuth app token or cache.
- For server-side reads, use a limited‑scope token and cache responses aggressively via `ETag`.

## Minimal Browser Example
```ts
async function getJson(owner: string, repo: string, path: string, etag?: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=__STORAGE__`;
  const res = await fetch(url, { headers: etag ? { 'If-None-Match': etag } : {} });
  if (res.status === 304) return { data: null, etag: etag!, unchanged: true };
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const newEtag = res.headers.get('ETag') || undefined;
  const body = await res.json();
  const raw = atob(body.content || '');
  return { data: raw ? JSON.parse(raw) : null, etag: newEtag, unchanged: false };
}

// Polling loop (example)
let etags: Record<string, string | undefined> = {};
const owner = 'devpool-directory';
const repo = 'devpool-directory';

async function refresh() {
  const sum = await getJson(owner, repo, 'summary.json', etags['summary.json']);
  if (sum.unchanged) return; // nothing to do
  etags['summary.json'] = sum.etag;

  const files = [
    'partner-open-issues.json', 'partner-open-proposals.json', 'mirror-state.json', 'index.json',
    'statistics.json', 'owners-avatars.json', 'twitter-map.json'
  ];
  const results = await Promise.all(
    files.map((f) => getJson(owner, repo, f, etags[f]))
  );
  results.forEach((r, i) => { etags[files[i]] = r.etag; /* store r.data */ });
}
```

## Minimal Node/Server Example
```ts
import fetch from 'node-fetch';

async function getJsonServer(owner: string, repo: string, path: string, etag?: string, token?: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=__STORAGE__`;
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
  if (etag) headers['If-None-Match'] = etag;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 304) return { data: null, etag: etag!, unchanged: true };
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const newEtag = res.headers.get('ETag') || undefined;
  const body = await res.json();
  const raw = Buffer.from(body.content || '', 'base64').toString('utf8');
  return { data: raw ? JSON.parse(raw) : null, etag: newEtag, unchanged: false };
}
```

## Linking & Identity
- Use `index.json` or `mirror-state.json` to build the directory issue link for each partner `node_id`:
  - `index.json[node_id] -> { number, url }`
  - `mirror-state.json[node_id].directory_issue_url`
- Mirror creation policy: open + priced issues only. Mirrors close when the partner closes.
- To show assignment, prefer `mirror-state.json[node_id].assigned` and `assignees`.

## Price/Time Labels
- Price labels are raw strings like `"Price: $500"`.
- Time labels are raw strings like `"Time: 1 week"`.
- Simple parsing helpers:
```ts
function parsePriceUSD(labels: string[]): number | null {
  const m = (labels || []).find((l) => /^Price:\s*/.test(String(l)));
  if (!m) return null;
  const n = parseInt(String(m).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
```

## Rendering Patterns
- Header stats: use `statistics.json` for open+priced counts and `statistics.lifetime` for completed totals.
- Task list: start from `partner-open-issues.json`; enrich per row with:
  - `mirror-state.json[node_id]` for assignment and directory link.
  - `owners-avatars.json` for owner badge.
  - `twitter-map.json[node_id]` to link the lifecycle tweet.
- Repo/owner grouping: group by `owner/repo` or owner for collections.
- Sorting: by price (parsed), updated date, or assigned state.

## Update Cadence & Resilience
- Poll `summary.json` every 1–5 minutes; skip downstream fetches if unchanged.
- Treat missing files as optional; show partial UI where possible.
- Handle 403/429 rate limits by backing off and extending poll interval.

## Change Tolerance
- Unknown fields may be added; do not break on extra properties.
- New artifact files may appear; keep your fetch list as a set you control.
- Use `summary.json.committedFiles` to display which files were updated in a run.

## Troubleshooting
- No changes detected: verify you’re using the `__STORAGE__` ref, not default branch.
- Empty arrays: some shards may have failed; aggregator merges prior state—retry after next run.
- Missing avatars: they’re merged over time; keep your cache between runs.

## Lite Types (Reference)
```ts
// partner-open-issues.json (open + priced subset)
interface PartnerIssue {
  owner: string; repo: string; number: number; node_id: string;
  title: string; url: string; body?: string;
  labels: string[]; assignees: string[];
  state: 'open' | 'closed'; // always 'open' here
  created_at: string; updated_at: string;
}

// mirror-state.json
type MirrorEntry = {
  directory_issue_number?: number;
  directory_issue_url?: string;
  assigned: boolean;
  assignees: string[];
  price_label?: string | null;
  time_label?: string | null;
  category?: string;
};

// statistics.json
interface Statistics {
  rewards: { notAssigned: number; assigned: number; completed: number; total: number };
  tasks: { notAssigned: number; assigned: number; completed: number; total: number };
  lifetime?: { rewardsCompletedUSD: number; tasksCompletedPriced: number };
}
```

---
For questions or API stability concerns, check the repo’s README and `docs/spec.md`. If you need example queries or a small SDK wrapper, open an issue or PR.
