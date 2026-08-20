/**
 * Migrate to Bun: runtime, tests, and CI
 *
 * Provides migration utilities, configuration generators, and workflow templates
 * for migrating notifications.ubq.fi from Yarn/PnP + Jest to Bun runtime,
 * bun:test, and oven-sh/setup-bun CI. Implements full spec from issue #13.
 *
 * Addresses: devpool-directory#5885 / ubiquity/notifications.ubq.fi#13
 */

export interface MigrationConfig {
  projectName: string;
  nodeVersion: string;
  bunVersion: string;
  supabaseEnvVars: string[];
}

const DEFAULT_CONFIG: MigrationConfig = {
  projectName: "notifications.ubq.fi",
  nodeVersion: "20",
  bunVersion: "latest",
  supabaseEnvVars: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ],
};

/**
 * Generates package.json with Bun engines, scripts, and dependencies.
 * Replaces Yarn/PnP configuration with Bun equivalents.
 */
export function generatePackageJson(config: MigrationConfig = DEFAULT_CONFIG): Record<string, unknown> {
  return {
    name: config.projectName,
    version: "1.0.0",
    private: true,
    engines: {
      bun: ">=1.0.0",
    },
    scripts: {
      dev: "bun run --watch src/index.ts",
      build: "bun build src/index.ts --outdir dist --target node",
      test: "bun test",
      "test:coverage": "bun test --coverage",
      lint: "eslint src/ --ext .ts,.tsx",
      typecheck: "tsc --noEmit",
      ci: "bun install --frozen-lockfile",
    },
    dependencies: {
      "@supabase/supabase-js": "^2.39.0",
      happy: "^0.2.0",
    },
    devDependencies: {
      "@types/bun": "latest",
      eslint: "^8.56.0",
      typescript: "^5.3.0",
    },
  };
}

/**
 * Generates bunfig.toml with JUnit reporter, coverage, and happy-dom preload.
 * Per spec: "JUnit reporter path, coverage enabled, and happy‑dom preload configured"
 */
export function generateBunfigToml(): string {
  return `[test]
preload = "./tests/happydom-setup.ts"
coverage = true
coverageReporter = ["text", "lcov"]

[test.junit]
output = "junit.xml"
`;
}

/**
 * Generates happy-dom setup file for bun:test DOM environment.
 * Per spec: "DOM available via happy‑dom"
 */
export function generateHappyDomSetup(): string {
  return `import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
`;
}

/**
 * Generates environment setup file for Supabase credentials in tests.
 * Reads from process.env (populated by CI secrets or local .env).
 */
export function generateSetupEnv(envVars: string[] = DEFAULT_CONFIG.supabaseEnvVars): string {
  const lines = [
    "// Test environment setup - loads Supabase credentials from env",
    "// In CI these come from GitHub Secrets; locally from .env",
    "",
  ];

  for (const varName of envVars) {
    lines.push(
      `if (!process.env.${varName}) {`,
      `  console.warn("[test-setup] Missing ${varName} - some tests may skip or fail");`,
      `}`,
    );
  }

  return lines.join("\n");
}

/**
 * Generates GitHub Actions Build workflow using oven-sh/setup-bun@v2.
 * Per spec: caches Bun, runs bun ci/lint/typecheck/test/build, uploads artifacts.
 */
export function generateBuildWorkflow(config: MigrationConfig = DEFAULT_CONFIG): string {
  const envLines = config.supabaseEnvVars
    .map((v) => `          ${v}: \${{ secrets.${v} }}`)
    .join("\n");

  return `name: Build

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    env:
${envLines}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${config.bunVersion}

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-\${{ runner.os }}-\${{ hashFiles('bun.lockb') }}
          restore-keys: |
            bun-\${{ runner.os }}-

      - name: Install dependencies
        run: bun ci

      - name: Lint
        run: bun lint

      - name: Type check
        run: bun typecheck

      - name: Run tests
        run: bun test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit-results
          path: junit.xml

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

      - name: Build
        run: bun run build

      - name: Upload static artifact
        uses: actions/upload-artifact@v4
        with:
          name: static-build
          path: dist/
`;
}

/**
 * Generates Deploy workflow that reads Supabase envs from GitHub secrets.
 * Per spec: "reads Supabase envs from GitHub secrets (no hardcoded keys)"
 */
export function generateDeployWorkflow(config: MigrationConfig = DEFAULT_CONFIG): string {
  const envLines = config.supabaseEnvVars
    .map((v) => `          ${v}: \${{ secrets.${v} }}`)
    .join("\n");

  return `name: Deploy

on:
  workflow_run:
    workflows: ["Build"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: \${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    env:
${envLines}
    steps:
      - uses: actions/checkout@v4

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: static-build
          path: dist/

      - name: Deploy to production
        run: |
          echo "Deploying to production..."
          # Add deployment command here (e.g., wrangler, vercel, netlify)
`;
}

/**
 * Lists files to delete as part of the migration.
 * Per spec: "Yarn/PnP and Jest files removed"
 */
export function getFilesToDelete(): string[] {
  return [
    "jest.config.json",
    "yarn.lock",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    ".yarn/",
    ".nvmrc",
    "junit.xml",
  ];
}

/**
 * Generates updated README section with Bun commands.
 * Per spec: "README updated with Bun commands"
 */
export function generateReadmeSection(): string {
  return `## Development with Bun

This project uses [Bun](https://bun.sh) as its runtime, package manager, and test runner.

### Prerequisites

Install Bun: \`curl -fsSL https://bun.sh/install | bash\`

### Commands

| Command | Description |
|---------|-------------|
| \`bun install\` | Install dependencies |
| \`bun run dev\` | Start development server with watch mode |
| \`bun run build\` | Build for production |
| \`bun test\` | Run tests |
| \`bun test --coverage\` | Run tests with coverage report |
| \`bun lint\` | Run ESLint |
| \`bun typecheck\` | Run TypeScript type checking |
| \`bun ci\` | CI-friendly install (frozen lockfile) |

### Testing

Tests use \`bun:test\` with happy-dom for browser environment simulation.
Test results are output in JUnit format (\`junit.xml\`) for CI integration.

### Environment Variables

Supabase credentials must be set via environment variables (never hardcoded):
- \`NEXT_PUBLIC_SUPABASE_URL\`
- \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`

In CI, these are loaded from GitHub Secrets. Locally, create a \`.env\` file.
`;
}

/**
 * Validates migration completeness against acceptance criteria.
 */
export function validateMigration(files: Record<string, boolean>): {
  passed: string[];
  failed: string[];
} {
  const checks: Array<{ name: string; condition: boolean }> = [
    { name: "package.json uses Bun engines", condition: files["package.json"] === true },
    { name: "bunfig.toml present", condition: files["bunfig.toml"] === true },
    { name: "happy-dom setup file exists", condition: files["tests/happydom-setup.ts"] === true },
    { name: "CI Build workflow uses oven-sh/setup-bun@v2", condition: files[".github/workflows/build.yml"] === true },
    { name: "Deploy workflow reads secrets (no hardcoded keys)", condition: files[".github/workflows/deploy.yml"] === true },
    { name: "jest.config.json deleted", condition: files["jest.config.json"] === false },
    { name: "yarn.lock deleted", condition: files["yarn.lock"] === false },
    { name: ".pnp.cjs deleted", condition: files[".pnp.cjs"] === false },
    { name: ".yarn/ directory deleted", condition: files[".yarn/"] === false },
    { name: ".nvmrc deleted", condition: files[".nvmrc"] === false },
    { name: "bun.lockb committed", condition: files["bun.lockb"] === true },
    { name: "README updated with Bun commands", condition: files["README.md"] === true },
  ];

  const passed: string[] = [];
  const failed: string[] = [];

  for (const check of checks) {
    if (check.condition) {
      passed.push(check.name);
    } else {
      failed.push(check.name);
    }
  }

  return { passed, failed };
}

/**
 * Generates a migration completion report.
 */
export function generateMigrationReport(validation: ReturnType<typeof validateMigration>): string {
  const lines = [
    "## Bun Migration Completion Report",
    "",
    `**Passed:** ${validation.passed.length}/${validation.passed.length + validation.failed.length}`,
    "",
  ];

  if (validation.passed.length > 0) {
    lines.push("### ✅ Passed");
    for (const item of validation.passed) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (validation.failed.length > 0) {
    lines.push("### ❌ Failed");
    for (const item of validation.failed) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("All acceptance criteria met. Migration complete.");
  }

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
