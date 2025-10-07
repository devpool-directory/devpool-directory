# Matrix Sharding Workflow (Spec)

Jobs:
- plan: discover repos, compute shards, output `{ matrix, maxParallel }`, upload plan + cached inputs.
- sync-shard (matrix): for shard repos, fetch partner issues/PRs, reconcile mirrors, produce shard artifacts.
- aggregate: download shards, merge, recompute statistics, write artifacts to data branch in a single commit.
- summary: print run metrics.

Rate limit-aware:
- Compute `max-parallel` dynamically based on remaining rate + estimated calls per shard.
- Use ETags / `since` from `sync-metadata.json` to skip unchanged repos.

Idempotency:
- Only aggregator writes to the data branch.
- Each shard operates exclusively on its assigned repos.

