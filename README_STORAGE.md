# DevPool Directory — UI Integration Guide (Data Branch)

This README lives on the `__STORAGE__` branch and explains how UIs can consume the directory’s analytics artifacts. The `__STORAGE__` branch is the data branch; artifacts are updated atomically per sync run.

Quick start
- Read `summary.json` first with `If-None-Match` (ETag). If unchanged, you can skip fetching others.
- Fetch the artifacts you need (JSON files below) with `If-None-Match` for efficient caching.
- Base URL: `GET /repos/{owner}/{repo}/contents/{path}?ref=__STORAGE__` (GitHub Contents API; `content` is base64-encoded).

Core artifacts
- `partner-open-issues.json` — open + priced issues (primary list for UI).
- `mirror-state.json` — map keyed by partner `node_id` with directory linkage and assignment.
- `index.json` — `node_id -> { number, url }` for quick directory links.
- `statistics.json` — aggregate counts; includes `lifetime` rollups for completed totals.
- `owners-avatars.json` — `{ owner, type, avatar_url }[]` for owner/org badges.
- `partner-pull-requests.json` — partner PRs for visibility/analytics.
- `twitter-map.json` — `node_id -> tweetId` for lifecycle tweets.
- `issues-map.json` — persistent map of all known issues (state=all) across runs.
- `lifetime-map.json` — `node_id -> amountUSD` for closed (priced) rollups.
- `sync-metadata.json` — per-repo sync metadata for incremental fetches.
- `summary.json` — run summary and the `committedFiles` list.
- `last-run.json` — watermark and run identifiers.

Minimal fetch (browser)
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

let etags: Record<string, string | undefined> = {};
async function refresh(owner: string, repo: string) {
  const sum = await getJson(owner, repo, 'summary.json', etags['summary.json']);
  if (sum.unchanged) return;
  etags['summary.json'] = sum.etag;
  const files = ['partner-open-issues.json','mirror-state.json','index.json','statistics.json','owners-avatars.json','twitter-map.json'];
  const results = await Promise.all(files.map((f) => getJson(owner, repo, f, etags[f])));
  results.forEach((r, i) => { etags[files[i]] = r.etag; /* store r.data */ });
}
```

Minimal fetch (Node/server)
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

Linking & identity
- Primary identity is GraphQL `node_id`.
- Directory links: use `index.json[node_id]` or `mirror-state.json[node_id].directory_issue_url`.
- Assignment: `mirror-state.json[node_id].assigned` and `assignees`.

Price/time labels
- Price labels are raw strings like "Price: $500" or "Pricing: $500".
- Time labels are raw strings like "Time: 1 week".
- Simple parser:
```ts
function parsePriceUSD(labels: string[]): number | null {
  const m = (labels || []).find((l) => /^(Price:|Pricing:)\s*/.test(String(l)));
  if (!m) return null;
  const n = parseInt(String(m).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
```

Rendering patterns
- Header stats: `statistics.json` (open+priced) plus `statistics.lifetime` for completed totals.
- Task list: start from `partner-open-issues.json`; enrich each row with `mirror-state`, avatars, and tweets via `twitter-map`.
- Grouping/sorting: by owner/repo, price, updated date, or assignment.

Resilience & cadence
- Poll `summary.json` every 1–5 minutes; if ETag unchanged, skip other fetches.
- Treat unknown fields/files as optional; tolerate partial data.
- Back off on 403/429; extend poll interval.

Notes
- Do not embed PATs in browser apps; prefer unauthenticated reads or a small server proxy with caching.
- New files/fields may be added; use `summary.json.committedFiles` for visibility.

For deeper background and architecture details, see the main branch README and `docs/` directory.

