# Bounty #5931 — Liquity V1 Stability Pool delivery bundle

Partner: [ubiquity/ubiquity-dollar#997](https://github.com/ubiquity/ubiquity-dollar/issues/997)

| File | Purpose |
|------|---------|
| `ubiquity-dollar-997.patch` | 6 commits, 26 files (+1797 lines) for `ubiquity-dollar` `development` |
| `stability-pool-forge-test.txt` | 15 SP tests PASS + coverage |
| `PR_TEMPLATE.md` | PR title/body for ubiquity-dollar |

## Apply

```bash
git clone https://github.com/ubiquity/ubiquity-dollar.git && cd ubiquity-dollar
git checkout development && git pull
git am /path/to/ubiquity-dollar-997.patch
cd packages/contracts && forge test --match-contract StabilityPool
```

## Verify (sibling clone)

```bash
cd ../ubiquity-dollar/packages/contracts
forge test --match-contract StabilityPool   # expect 15 passed
```

Payout requires PR on **ubiquity/ubiquity-dollar** (see `PR_TEMPLATE.md`).
