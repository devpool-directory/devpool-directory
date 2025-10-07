# Architecture Overview (v2)

Goals:
- Mirror partner issues exactly into a central directory repo.
- Keep derived state (assignment, categories, price parsing) in artifacts.
- Shard sync via matrix builds; aggregate once; commit artifacts to a data branch.

Modules:
- discovery: partner repo selection and sharding.
- github: HTTP clients, rate limit helpers.
- mirror: create/update mirror issues, identity mapping.
- artifacts: merge, compute statistics, write files.
- storage: commit artifacts via Git to data branch.
- twitter: tweet create/delete lifecycle (optional).
- cli: plan, sync-shard, aggregate, summary, deduplicate.

