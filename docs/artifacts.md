# Artifacts Schema (v2)

- `partner-open-issues.json`: Array of open partner issues with key fields (owner, repo, number, node_id, title, url, labels, assignees, created_at, updated_at).
- `partner-pull-requests.json`: Array of PRs across all repos (state=all).
- `owners-avatars.json`: Array `{ owner, type, avatar_url }`.
- `mirror-state.json`: Map `{ [partner_node_id]: { directory_issue_number?, directory_issue_url?, assigned, assignees[], price_label?, time_label?, category? } }`.
- `statistics.json`: `{ rewards: { notAssigned, assigned, completed, total }, tasks: { notAssigned, assigned, completed, total } }`.
- `twitter-map.json`: `{ [partner_node_id]: tweet_id }`.
- `sync-metadata.json`: `{ perRepo: { "owner/repo": { etag?, lastSyncISO? } } }`.
- `index.json`: `{ [partner_node_id]: { directory_issue_number, directory_issue_url } }`.

Target branch: configurable (default `__STORAGE__`).

