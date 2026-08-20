/**
 * @module ReusableKnipJestWorkflows
 * @description Handoff plugin for converting Knip and Jest CI workflows into GitHub Actions reusable workflows.
 * Generates centralized workflow definitions with parameterized package manager support (bun/yarn),
 * enabling single-point maintenance across all UbiquityOS repositories inheriting from the template.
 *
 * Upstream Issue: ubiquity-os/plugin-template#13
 * DevPool Issue: #4999
 * Bounty Value: $1200 USD
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface IWorkflowConfig {
  name: string;
  packageManager: "bun" | "yarn" | "npm";
  nodeVersion: string;
  yarnVersion?: string;
  bunVersion?: string;
  enableCaching: boolean;
  failOnUnused: boolean;
}

export interface IReusableWorkflowInput {
  name: string;
  description: string;
  type: "string" | "boolean" | "number";
  required: boolean;
  default?: string | boolean | number;
}

export interface IWorkflowGeneratorOptions {
  includeSecrets: boolean;
  includePermissions: boolean;
  timeoutMinutes: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export function getDefaultConfig(): IWorkflowConfig {
  return {
    name: "Knip & Jest CI",
    packageManager: "bun",
    nodeVersion: "20",
    bunVersion: "1.1.0",
    enableCaching: true,
    failOnUnused: true,
  };
}

// ============================================================================
// REUSABLE WORKFLOW GENERATORS
// ============================================================================

/**
 * Generates the reusable Knip workflow definition.
 * Called by other repos via `uses: ubiquity-os/plugin-template/.github/workflows/knip.yml@main`
 */
export function generateKnipReusableWorkflow(config: IWorkflowConfig = getDefaultConfig()): string {
  return `name: Knip (Reusable)

on:
  workflow_call:
    inputs:
      package-manager:
        description: "Package manager to use (bun, yarn, npm)"
        type: string
        required: false
        default: "${config.packageManager}"
      node-version:
        description: "Node.js version"
        type: string
        required: false
        default: "${config.nodeVersion}"
      bun-version:
        description: "Bun version (only used if package-manager is bun)"
        type: string
        required: false
        default: "${config.bunVersion || 'latest'}"
      yarn-version:
        description: "Yarn version (only used if package-manager is yarn)"
        type: string
        required: false
        default: ""
      fail-on-unused:
        description: "Fail if unused exports/dependencies are found"
        type: boolean
        required: false
        default: ${config.failOnUnused}
      enable-caching:
        description: "Enable dependency caching"
        type: boolean
        required: false
        default: ${config.enableCaching}

permissions:
  contents: read

jobs:
  knip:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ inputs.node-version }}

      - name: Setup Bun
        if: inputs.package-manager == 'bun'
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: \${{ inputs.bun-version }}

      - name: Setup Yarn
        if: inputs.package-manager == 'yarn' && inputs.yarn-version != ''
        run: corepack enable && corepack prepare yarn@\${{ inputs.yarn-version }} --activate

      - name: Cache dependencies (Bun)
        if: inputs.package-manager == 'bun' && inputs.enable-caching
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-\${{ runner.os }}-\${{ hashFiles('**/bun.lockb') }}
          restore-keys: bun-\${{ runner.os }}-

      - name: Cache dependencies (Yarn)
        if: inputs.package-manager == 'yarn' && inputs.enable-caching
        uses: actions/cache@v4
        with:
          path: .yarn/cache
          key: yarn-\${{ runner.os }}-\${{ hashFiles('**/yarn.lock') }}
          restore-keys: yarn-\${{ runner.os }}-

      - name: Install dependencies (Bun)
        if: inputs.package-manager == 'bun'
        run: bun install --frozen-lockfile

      - name: Install dependencies (Yarn)
        if: inputs.package-manager == 'yarn'
        run: yarn install --immutable

      - name: Install dependencies (npm)
        if: inputs.package-manager == 'npm'
        run: npm ci

      - name: Run Knip
        run: |
          PM=\${{ inputs.package-manager }}
          if [ "$PM" = "bun" ]; then
            bun run knip \${{ inputs.fail-on-unused && '--no-exit-code' || '' }}
          elif [ "$PM" = "yarn" ]; then
            yarn knip \${{ inputs.fail-on-unused && '--no-exit-code' || '' }}
          else
            npx knip \${{ inputs.fail-on-unused && '--no-exit-code' || '' }}
          fi
`;
}

/**
 * Generates the reusable Jest/Bun test workflow definition.
 */
export function generateJestReusableWorkflow(config: IWorkflowConfig = getDefaultConfig()): string {
  return `name: Test (Reusable)

on:
  workflow_call:
    inputs:
      package-manager:
        description: "Package manager to use (bun, yarn, npm)"
        type: string
        required: false
        default: "${config.packageManager}"
      node-version:
        description: "Node.js version"
        type: string
        required: false
        default: "${config.nodeVersion}"
      bun-version:
        description: "Bun version (only used if package-manager is bun)"
        type: string
        required: false
        default: "${config.bunVersion || 'latest'}"
      yarn-version:
        description: "Yarn version (only used if package-manager is yarn)"
        type: string
        required: false
        default: ""
      test-command:
        description: "Custom test command override"
        type: string
        required: false
        default: ""
      enable-caching:
        description: "Enable dependency caching"
        type: boolean
        required: false
        default: ${config.enableCaching}
      coverage:
        description: "Generate coverage report"
        type: boolean
        required: false
        default: false

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ inputs.node-version }}

      - name: Setup Bun
        if: inputs.package-manager == 'bun'
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: \${{ inputs.bun-version }}

      - name: Setup Yarn
        if: inputs.package-manager == 'yarn' && inputs.yarn-version != ''
        run: corepack enable && corepack prepare yarn@\${{ inputs.yarn-version }} --activate

      - name: Cache dependencies (Bun)
        if: inputs.package-manager == 'bun' && inputs.enable-caching
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-test-\${{ runner.os }}-\${{ hashFiles('**/bun.lockb') }}
          restore-keys: bun-test-\${{ runner.os }}-

      - name: Cache dependencies (Yarn)
        if: inputs.package-manager == 'yarn' && inputs.enable-caching
        uses: actions/cache@v4
        with:
          path: .yarn/cache
          key: yarn-test-\${{ runner.os }}-\${{ hashFiles('**/yarn.lock') }}
          restore-keys: yarn-test-\${{ runner.os }}-

      - name: Install dependencies (Bun)
        if: inputs.package-manager == 'bun'
        run: bun install --frozen-lockfile

      - name: Install dependencies (Yarn)
        if: inputs.package-manager == 'yarn'
        run: yarn install --immutable

      - name: Install dependencies (npm)
        if: inputs.package-manager == 'npm'
        run: npm ci

      - name: Run tests
        run: |
          PM=\${{ inputs.package-manager }}
          CUSTOM_CMD="\${{ inputs.test-command }}"
          COVERAGE_FLAG=""
          
          if [ "\${{ inputs.coverage }}" = "true" ]; then
            COVERAGE_FLAG="--coverage"
          fi

          if [ -n "$CUSTOM_CMD" ]; then
            eval "$CUSTOM_CMD"
          elif [ "$PM" = "bun" ]; then
            bun test $COVERAGE_FLAG
          elif [ "$PM" = "yarn" ]; then
            yarn test $COVERAGE_FLAG
          else
            npx jest $COVERAGE_FLAG
          fi

      - name: Upload coverage
        if: inputs.coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
`;
}

// ============================================================================
// CALLER WORKFLOW TEMPLATES
// ============================================================================

/**
 * Generates a caller workflow for repositories using Bun.
 */
export function generateBunCallerWorkflow(): string {
  return `name: CI

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main, development]

jobs:
  knip:
    uses: ubiquity-os/plugin-template/.github/workflows/knip-reusable.yml@main
    with:
      package-manager: bun
      node-version: "20"
      bun-version: "1.1.0"
      fail-on-unused: true

  test:
    uses: ubiquity-os/plugin-template/.github/workflows/jest-reusable.yml@main
    with:
      package-manager: bun
      node-version: "20"
      bun-version: "1.1.0"
      coverage: true
`;
}

/**
 * Generates a caller workflow for repositories using Yarn.
 */
export function generateYarnCallerWorkflow(yarnVersion: string = "4.0.0"): string {
  return `name: CI

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main, development]

jobs:
  knip:
    uses: ubiquity-os/plugin-template/.github/workflows/knip-reusable.yml@main
    with:
      package-manager: yarn
      node-version: "20"
      yarn-version: "${yarnVersion}"
      fail-on-unused: true

  test:
    uses: ubiquity-os/plugin-template/.github/workflows/jest-reusable.yml@main
    with:
      package-manager: yarn
      node-version: "20"
      yarn-version: "${yarnVersion}"
      coverage: true
`;
}

// ============================================================================
// MIGRATION SCRIPT GENERATOR
// ============================================================================

/**
 * Generates a migration script to convert existing inline workflows to reusable calls.
 */
export function generateMigrationScript(): string {
  return `#!/usr/bin/env bash
# migrate-to-reusable-workflows.sh
# Converts inline Knip/Jest workflows in UbiquityOS repos to reusable workflow calls.
# Usage: ./migrate-to-reusable-workflows.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "\${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[DRY RUN] No files will be modified."
fi

REPOS=(
  "ubiquity-os/plugin-template"
  "ubiquity-os/ts-template"
  "ubiquibot/permit-generation"
  "ubiquibot/configuration"
  "ubiquity-os-marketplace/text-conversation-rewards"
)

TEMPLATE_REPO="ubiquity-os/plugin-template"
WORKFLOW_REF="$TEMPLATE_REPO/.github/workflows/knip-reusable.yml@main"
TEST_REF="$TEMPLATE_REPO/.github/workflows/jest-reusable.yml@main"

detect_package_manager() {
  local repo_dir="$1"
  if [ -f "$repo_dir/bun.lockb" ]; then
    echo "bun"
  elif [ -f "$repo_dir/yarn.lock" ]; then
    echo "yarn"
  else
    echo "npm"
  fi
}

for repo in "\${REPOS[@]}"; do
  echo "=== Processing $repo ==="
  
  # Clone or update
  REPO_DIR="/tmp/migrate-$(echo $repo | tr '/' '-')"
  if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR" && git fetch origin && git checkout main && git reset --hard origin/main
  else
    git clone "https://github.com/$repo.git" "$REPO_DIR"
  fi
  
  PM=$(detect_package_manager "$REPO_DIR")
  echo "  Detected package manager: $PM"
  
  # Generate new CI workflow
  NEW_CI="$REPO_DIR/.github/workflows/ci.yml"
  
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would create $NEW_CI with pm=$PM"
  else
    mkdir -p "$(dirname "$NEW_CI")"
    cat > "$NEW_CI" << EOF
name: CI

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main, development]

jobs:
  knip:
    uses: $WORKFLOW_REF
    with:
      package-manager: $PM
      node-version: "20"
      fail-on-unused: true

  test:
    uses: $TEST_REF
    with:
      package-manager: $PM
      node-version: "20"
      coverage: true
EOF
    
    # Remove old inline workflows
    rm -f "$REPO_DIR/.github/workflows/knip.yml"
    rm -f "$REPO_DIR/.github/workflows/jest.yml"
    rm -f "$REPO_DIR/.github/workflows/test.yml"
    
    cd "$REPO_DIR"
    git add -A
    git commit -m "ci: migrate to reusable Knip/Jest workflows" || true
    echo "  Committed. Push manually after review."
  fi
done

echo ""
echo "Migration complete. Review changes and push each repo."
`;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateAcceptanceCriteria(files: Record<string, string>): { passed: boolean; checks: Array<{ name: string; status: "pass" | "fail" }> } {
  const checks = [
    { name: "Reusable Knip workflow defined", status: Object.values(files).some(c => c.includes("workflow_call") && c.includes("knip")) ? "pass" : "fail" },
    { name: "Reusable Jest/Test workflow defined", status: Object.values(files).some(c => c.includes("workflow_call") && c.includes("test")) ? "pass" : "fail" },
    { name: "Package manager input parameter", status: Object.values(files).some(c => c.includes("package-manager") && c.includes("type: string")) ? "pass" : "fail" },
    { name: "Bun setup step conditional", status: Object.values(files).some(c => c.includes("oven-sh/setup-bun") && c.includes("if:")) ? "pass" : "fail" },
    { name: "Yarn setup step conditional", status: Object.values(files).some(c => c.includes("corepack") && c.includes("yarn")) ? "pass" : "fail" },
    { name: "Caller workflow template (Bun)", status: Object.values(files).some(c => c.includes("uses:") && c.includes("knip-reusable")) ? "pass" : "fail" },
    { name: "Caller workflow template (Yarn)", status: Object.values(files).some(c => c.includes("yarn-version") && c.includes("uses:")) ? "pass" : "fail" },
    { name: "Migration script generated", status: Object.values(files).some(c => c.includes("migrate") && c.includes("detect_package_manager")) ? "pass" : "fail" },
    { name: "Dependency caching support", status: Object.values(files).some(c => c.includes("actions/cache") && c.includes("enable-caching")) ? "pass" : "fail" },
  ];
  return { passed: checks.every(c => c.status === "pass"), checks };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ReusableKnipJestPlugin = {
  name: "reusable-knip-jest-workflows",
  version: "1.0.0",
  issue: "#4999",
  upstreamIssue: "ubiquity-os/plugin-template#13",
  bountyValue: 1200,
  generators: {
    knipWorkflow: generateKnipReusableWorkflow,
    jestWorkflow: generateJestReusableWorkflow,
    bunCaller: generateBunCallerWorkflow,
    yarnCaller: generateYarnCallerWorkflow,
    migrationScript: generateMigrationScript,
  },
  validators: { acceptanceCriteria: validateAcceptanceCriteria },
  config: { default: getDefaultConfig },
};

export default ReusableKnipJestPlugin;
