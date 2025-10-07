# Configuration

Env vars:
- `GITHUB_TOKEN` (required for API)
- `GH_TOKEN` (optional for GH CLI deletions)
- `DIRECTORY_OWNER`, `DIRECTORY_REPO` (central repo)
- Twitter optional keys
- Flags: `FORK_SAFE_URLS`, `WRITE_UNAVAILABLE_LABEL`, `TWEET_ON_CREATE`, `DELETE_TWEET_ON_COMPLETE`, `DRY_RUN`

Config file (example `config/devpool.config.json`):
```
{
  "include": ["owner1", "org2", "owner3/repoA"],
  "exclude": ["orgToSkip", "ownerX/repoY"],
  "explicit_urls": ["https://github.com/ownerZ/repoQ"],
  "categories": {"https://github.com/owner3/repoA/issues/123": "Category: Payments"},
  "official_owners": ["exampleOrg", "exampleTeam"],
  "data_branch": "__STORAGE__",
  "max_shards": 12
}
```

