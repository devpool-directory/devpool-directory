# Integrate Liquity V1 Stability Pool for LUSD collateral yield

## Summary

- `StabilityPoolFacet` + isolated `LibStabilityPool` (#997)
- Auto-deposit LUSD on mint; withdraw on redeem; optional 50/50 reward routing
- Migrations, integration/rollback docs, 15 Stability Pool tests

## Test plan

- [x] `forge test` — 396 passed
- [x] `forge test --match-contract StabilityPool` — 15 passed
- [x] Mint hook gas overhead < 200K

Closes #997
