# Bounty #5931 — Partner delivery pointer

**Directory:** [devpool-directory#5931](https://github.com/devpool-directory/devpool-directory/issues/5931)  
**Partner:** [ubiquity/ubiquity-dollar#997](https://github.com/ubiquity/ubiquity-dollar/issues/997)  
**Tier:** $1200 (integration + tests + rollback checklist)

## Reviewable bundle (this repo)

[`partner-deliverables/5931-liquity-sp/`](../../partner-deliverables/5931-liquity-sp/)

| Artifact | Path |
|----------|------|
| Full patch (+1797 lines) | `partner-deliverables/5931-liquity-sp/ubiquity-dollar-997.patch` |
| Test proof | `partner-deliverables/5931-liquity-sp/stability-pool-forge-test.txt` |
| PR template | `partner-deliverables/5931-liquity-sp/PR_TEMPLATE.md` |

Apply with `git am` on `ubiquity/ubiquity-dollar` `development` (see bundle README).

## Verify

```bash
cd ubiquity-dollar/packages/contracts
forge test --match-contract StabilityPool   # 15 passed
```

Sibling clone: `../ubiquity-dollar` (6 commits ahead of `origin/development`).

## Payout gate

PR on **ubiquity/ubiquity-dollar** closing #997. This directory repo mirrors partner status.
