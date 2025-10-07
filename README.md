# DevPool Directory v2 (Scaffold)

This worktree contains a clean scaffold to rebuild the DevPool Directory mirror service from scratch. It focuses on:
- Exact label mirroring (no renames)
- Derived state in sidecar JSON artifacts
- Matrix-enabled sharded sync for speed
- Git-based storage (no external DB)

See `docs/` for specs and the matrix workflow skeleton in `.github/workflows/`.

## Scripts
- `yarn plan` — compute shards and write plan.json
- `yarn sync:shard` — run a shard against its repo list
- `yarn aggregate` — merge shard outputs and write artifacts to the data branch
- `yarn summary` — print a run summary
- `yarn deduplicate` — find/remove duplicate mirrors (stub)

Configure environment via `.env` (see `.env.example`).

