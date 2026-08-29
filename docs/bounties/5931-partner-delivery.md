# Bounty #5931 — Partner delivery pointer

**Directory issue:** [devpool-directory#5931](https://github.com/devpool-directory/devpool-directory/issues/5931)  
**Partner issue:** [ubiquity/ubiquity-dollar#997](https://github.com/ubiquity/ubiquity-dollar/issues/997)  
**Reward tier:** $1200 (full integration + tests + rollback checklist)

## Implementation repository

Solidity work is **not** in `devpool-directory`. It lives in **`ubiquity/ubiquity-dollar`**:

| Artifact | Path (in ubiquity-dollar clone) |
|----------|----------------------------------|
| Integration flow | `packages/contracts/migrations/STABILITY_POOL_INTEGRATION.md` |
| Rollback checklist | `packages/contracts/migrations/STABILITY_POOL_ROLLBACK.md` |
| Config example | `packages/contracts/.env.example` |
| Test proof | `packages/contracts/test-proof/stability-pool-forge-test.txt` |
| Mainnet migration | `packages/contracts/migrations/mainnet/Deploy003_StabilityPool.s.sol` |

Local clone for this session: sibling `../ubiquity-dollar` on branch `development` (5+ commits ahead of `origin/development`).

## Verify (implementation repo)

```bash
cd packages/contracts
forge test
forge test --match-contract StabilityPool
```

## Payout gate

Acceptance requires an **open/merged PR on `ubiquity/ubiquity-dollar`** closing #997, not changes to this directory repo.
