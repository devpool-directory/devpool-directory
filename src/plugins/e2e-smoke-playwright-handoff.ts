/**
 * E2E Smoke (Playwright) – Handoff
 *
 * Provides Playwright configuration, test fixtures, and smoke test templates
 * for validating stake.ubq.fi loads correctly and shows WalletConnect/Reown
 * connect entry point in both dev and preview modes.
 *
 * Addresses: devpool-directory#5081 / ubiquity/stake.ubq.fi#4
 */

export interface E2EConfig {
  devBaseUrl: string;
  previewBaseUrl: string;
  startupTimeoutMs: number;
  chromiumOnly: boolean;
}

const DEFAULT_CONFIG: E2EConfig = {
  devBaseUrl: "http://localhost:5173",
  previewBaseUrl: "http://localhost:4173",
  startupTimeoutMs: 30000,
  chromiumOnly: true,
};

/**
 * Generates playwright.config.ts with environment-based baseURL switching.
 * Per spec: "baseURL switching via env (E2E_MODE=dev|preview)"
 */
export function generatePlaywrightConfig(config: E2EConfig = DEFAULT_CONFIG): string {
  return `import { defineConfig, devices } from "@playwright/test";

const mode = process.env.E2E_MODE || "preview";
const baseURL = mode === "dev" ? "${config.devBaseUrl}" : "${config.previewBaseUrl}";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: ${config.startupTimeoutMs},
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Auto-start server based on mode
  webServer: mode === "dev"
    ? {
        command: "bun run dev",
        url: baseURL,
        timeout: ${config.startupTimeoutMs},
        reuseExistingServer: !process.env.CI,
      }
    : {
        command: "bun run build && bunx vite preview --port 4173",
        url: baseURL,
        timeout: ${config.startupTimeoutMs},
        reuseExistingServer: !process.env.CI,
      },
});
`;
}

/**
 * Generates the server fixture helper for auto-starting dev/preview servers.
 * Per spec: "Implement lightweight server launcher in tests/e2e/fixtures/server.ts"
 */
export function generateServerFixture(): string {
  return `import { test as base } from "@playwright/test";

// Server is managed by Playwright's webServer config in playwright.config.ts
// This fixture provides typed access to the current mode for conditional logic

export type TestFixtures = {
  e2eMode: "dev" | "preview";
};

export const test = base.extend<TestFixtures>({
  e2eMode: async ({}, use) => {
    const mode = (process.env.E2E_MODE || "preview") as "dev" | "preview";
    await use(mode);
  },
});

export { expect } from "@playwright/test";
`;
}

/**
 * Generates the loads-homepage smoke test.
 * Per spec: "Page title contains 'Stake' or app brand and root content renders"
 */
export function generateLoadsHomepageTest(): string {
  return `import { test, expect } from "../fixtures/server";

test.describe("Homepage Smoke", () => {
  test("loads-homepage: page title contains Stake and root content renders", async ({ page }) => {
    await page.goto("/");

    // Wait for root content to be visible
    await expect(page.locator("#root")).toBeVisible({ timeout: 15000 });

    // Check title contains expected brand text
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/stake|ubiquity|uusd/);

    // Verify main content area rendered (not blank/error page)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });
});
`;
}

/**
 * Generates the connect-wallet-visible smoke test.
 * Per spec: "A visible WalletConnect/Reown connect trigger is present; do not require actual wallet connection"
 */
export function generateConnectWalletVisibleTest(): string {
  return `import { test, expect } from "../fixtures/server";

test.describe("Wallet Connect Entry Point", () => {
  test("connect-wallet-visible: connect button is present without requiring wallet interaction", async ({ page }) => {
    await page.goto("/");

    // Wait for app to hydrate
    await expect(page.locator("#root")).toBeVisible({ timeout: 15000 });

    // Look for connect wallet button using role/name matching (not brittle selectors)
    // WalletConnect/Reown UI typically renders a button with "Connect" text
    const connectButton = page.getByRole("button", { name: /connect/i });

    // Button should be visible and enabled
    await expect(connectButton).toBeVisible({ timeout: 10000 });
    await expect(connectButton).toBeEnabled();

    // Do NOT click or interact — just verify presence per spec
  });
});
`;
}

/**
 * Generates package.json scripts section for E2E testing.
 * Per spec: Scripts e2e, e2e:ui, preview
 */
export function generatePackageScripts(): Record<string, string> {
  return {
    e2e: "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:dev": "E2E_MODE=dev playwright test",
    "e2e:preview": "E2E_MODE=preview playwright test",
    preview: "vite preview --port 4173",
  };
}

/**
 * Lists required devDependencies for Playwright setup.
 */
export function getRequiredDevDeps(): Record<string, string> {
  return {
    "@playwright/test": "^1.50.0",
  };
}

/**
 * Generates the test directory structure recommendation.
 */
export function getTestFileStructure(): Array<{
  path: string;
  description: string;
}> {
  return [
    { path: "playwright.config.ts", description: "Playwright config with dev/preview baseURL switching" },
    { path: "tests/e2e/fixtures/server.ts", description: "Test fixture with e2eMode typing" },
    { path: "tests/e2e/homepage.spec.ts", description: "loads-homepage smoke test" },
    { path: "tests/e2e/connect-wallet.spec.ts", description: "connect-wallet-visible smoke test" },
  ];
}

/**
 * Generates validation commands for both dev and preview modes.
 */
export function getValidationCommands(): string[] {
  return [
    "bun install",
    "E2E_MODE=dev bunx playwright test",
    "E2E_MODE=preview bunx playwright test",
    "bunx playwright test --ui",
  ];
}

/**
 * Generates CI workflow snippet for headless E2E execution.
 * Per spec: "Tests run headless in CI and skip if port unavailable"
 */
export function generateCiWorkflowStep(): string {
  return `      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Run E2E smoke tests (preview mode)
        run: E2E_MODE=preview bunx playwright test
        env:
          CI: true

      - name: Upload test artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            test-results/
            playwright-report/`;
}

/**
 * Validates implementation against acceptance criteria.
 */
export function validateImplementation(features: Record<string, boolean>): {
  passed: string[];
  failed: string[];
} {
  const checks: Array<{ name: string; condition: boolean }> = [
    { name: "Playwright configured for Chromium only", condition: features["chromiumOnly"] === true },
    { name: "loads-homepage test validates title and root content", condition: features["homepageTest"] === true },
    { name: "connect-wallet-visible test checks button presence without interaction", condition: features["walletTest"] === true },
    { name: "BaseURL switches via E2E_MODE env var", condition: features["envSwitching"] === true },
    { name: "Auto-starts server via webServer config", condition: features["autoStartServer"] === true },
    { name: "No wallet/RPC/network dependencies", condition: features["noExternalDeps"] === true },
    { name: "Uses role/name selectors (not brittle CSS)", condition: features["robustSelectors"] === true },
    { name: "Generous startup timeout configured", condition: features["startupTimeout"] === true },
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
 * Generates README documentation snippet for E2E testing.
 */
export function generateReadmeSnippet(): string {
  return `## E2E Testing

This project uses Playwright for end-to-end smoke testing.

### Prerequisites

\`\`\`bash
bun install
bunx playwright install chromium
\`\`\`

### Running Tests

**Preview mode (recommended for CI):**
\`\`\`bash
E2E_MODE=preview bunx playwright test
\`\`\`

**Dev mode (hot reload during development):**
\`\`\`bash
E2E_MODE=dev bunx playwright test
\`\`\`

**Interactive UI mode:**
\`\`\`bash
bunx playwright test --ui
\`\`\`

### Test Coverage

- \`loads-homepage\`: Validates page loads, title contains brand, root content renders
- \`connect-wallet-visible\`: Verifies WalletConnect/Reown connect button is present

### Notes

- Tests run headless in CI
- No wallet connections, RPC keys, or network calls required
- Server auto-starts via Playwright's webServer config
`;
}

export { DEFAULT_CONFIG };
