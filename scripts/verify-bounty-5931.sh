#!/usr/bin/env bash
# Verify NIO-5 / devpool-directory#5931 partner bundle (ubiquity-dollar#997).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="${ROOT}/partner-deliverables/5931-liquity-sp/ubiquity-dollar-997.patch"
UBQ="${UBIQUITY_DOLLAR_ROOT:-$(dirname "${ROOT}")/ubiquity-dollar}"
CONTRACTS="${UBQ}/packages/contracts"

if [[ ! -f "${PATCH}" ]]; then
  echo "ERROR: missing patch ${PATCH}" >&2
  exit 1
fi

if [[ ! -d "${CONTRACTS}" ]]; then
  echo "ERROR: ubiquity-dollar contracts not found at ${CONTRACTS}" >&2
  echo "Set UBIQUITY_DOLLAR_ROOT or clone sibling ../ubiquity-dollar" >&2
  exit 1
fi

export HOME="${HOME:-/root}"
export PATH="${HOME}/.foundry/bin:${PATH}"

if ! command -v forge >/dev/null 2>&1; then
  echo "ERROR: forge not found (install foundry)" >&2
  exit 1
fi

cd "${CONTRACTS}"

echo "==> forge test --match-contract StabilityPool"
forge test --match-contract StabilityPool

if [[ "${VERIFY_FULL:-}" == "1" ]]; then
  FULL_LOG="${ROOT}/partner-deliverables/5931-liquity-sp/full-forge-test.txt"
  SUMMARY="${ROOT}/partner-deliverables/5931-liquity-sp/full-forge-test-summary.txt"
  echo "==> forge test (full suite) -> ${FULL_LOG}"
  forge test 2>&1 | tee "${FULL_LOG}"
  grep -E "Ran [0-9]+ test suites" "${FULL_LOG}" | tail -1 > "${SUMMARY}"
fi

echo "OK: bounty-5931 partner bundle verify passed"
