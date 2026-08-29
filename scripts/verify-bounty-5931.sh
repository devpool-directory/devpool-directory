#!/usr/bin/env bash
# Verify NIO-5 / devpool-directory#5931 partner bundle (ubiquity-dollar#997).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="${ROOT}/partner-deliverables/5931-liquity-sp/ubiquity-dollar-997.patch"
UBQ="${UBIQUITY_DOLLAR_ROOT:-$(dirname "${ROOT}")/ubiquity-dollar}"
CONTRACTS="${UBQ}/packages/contracts"
WORKTREE_DIR=""
WORKTREE_BRANCH=""

cleanup() {
  if [[ -n "${WORKTREE_DIR}" && -d "${WORKTREE_DIR}" ]]; then
    git -C "${UBQ}" worktree remove -f "${WORKTREE_DIR}" 2>/dev/null || rm -rf "${WORKTREE_DIR}"
    if [[ -n "${WORKTREE_BRANCH}" ]]; then
      git -C "${UBQ}" branch -D "${WORKTREE_BRANCH}" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT

if [[ ! -f "${PATCH}" ]]; then
  echo "ERROR: missing patch ${PATCH}" >&2
  exit 1
fi

export HOME="${HOME:-/root}"
export PATH="${HOME}/.foundry/bin:${PATH}"

if ! command -v forge >/dev/null 2>&1; then
  echo "ERROR: forge not found (install foundry)" >&2
  exit 1
fi

patch_applied() {
  [[ -f "${CONTRACTS}/test/diamond/facets/StabilityPoolFacet.t.sol" ]]
}

ensure_patch_applied() {
  if patch_applied; then
    return 0
  fi

  if [[ ! -d "${UBQ}/.git" ]]; then
    echo "ERROR: ubiquity-dollar not found at ${UBQ} (set UBIQUITY_DOLLAR_ROOT)" >&2
    exit 1
  fi

  echo "==> Stability Pool tests missing; applying patch in ephemeral worktree"
  mkdir -p "${ROOT}/.verify-worktrees"
  WORKTREE_BRANCH="verify-bounty-5931-$$"
  WORKTREE_DIR="${ROOT}/.verify-worktrees/${WORKTREE_BRANCH}"

  export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-eden-ruiz}"
  export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-eden@nio.local}"
  export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-eden-ruiz}"
  export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-eden@nio.local}"

  git -C "${UBQ}" fetch origin development 2>/dev/null || true
  git -C "${UBQ}" worktree add -B "${WORKTREE_BRANCH}" "${WORKTREE_DIR}" origin/development
  git -C "${WORKTREE_DIR}" am "${PATCH}"
  CONTRACTS="${WORKTREE_DIR}/packages/contracts"
}

ensure_patch_applied

if [[ ! -d "${CONTRACTS}" ]]; then
  echo "ERROR: contracts dir not found at ${CONTRACTS}" >&2
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
  if ! grep -qE "[0-9]+ tests passed, 0 failed" "${SUMMARY}"; then
    echo "ERROR: full suite summary missing from ${FULL_LOG}" >&2
    exit 1
  fi
fi

echo "OK: bounty-5931 partner bundle verify passed"
