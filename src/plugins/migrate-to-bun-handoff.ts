 /**
  * @file migrate-to-bun-handoff.ts
  * @description Handoff scaffolding for "Migrate to Bun: runtime, tests, and CI"
  * (Issue #5885 / upstream ubiquity/notifications.ubq.fi#13).
  * Provides generators for package.json migration, bunfig.toml configuration,
  * test setup with happy-dom, and GitHub Actions workflow updates.
  *
  * Bounty: $150 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface BunMigrationConfig {
   projectName: string;
   nodeVersion?: string;
   bunVersion: string;
   enableCoverage: boolean;
   junitReporterPath: string;
   supabaseEnvKeys: string[];
 }

 export interface MigrationResult {
   filesCreated: string[];
   filesDeleted: string[];
   scriptsUpdated: Record<string, string>;
   warnings: string[];
 }

 // ============================================================================
 // Package.json Generator
 // ============================================================================

 /**
  * Generates a Bun-native package.json replacing Yarn/PnP and Jest scripts.
  */
 export function generatePackageJson(config: BunMigrationConfig): string {
   return `{
   "name": "${config.projectName}",
   "version": "1.0.0",
   "private": true,
   "type": "module",
   "engines": {
     "bun": ">=${config.bunVersion}"
   },
   "scripts": {
     "dev": "bun run --watch src/index.ts",
     "build": "bun build src/index.ts --outdir dist --target browser",
     "test": "bun test",
     "test:coverage": "bun test --coverage",
     "lint": "eslint src/",
     "typecheck": "tsc --noEmit",
     "ci": "bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test"
   },
   "devDependencies": {
     "@types/bun": "^1.1.0",
     "happy-dom": "^15.0.0",
     "typescript": "^5.4.0",
     "eslint": "^9.0.0"
   }
 }`.trim();
 }

 // ============================================================================
 // Bunfig.toml Generator
 // ============================================================================

 /**
  * Generates bunfig.toml with test reporter, coverage, and DOM preload config.
  */
 export function generateBunfigToml(config: BunMigrationConfig): string {
   return `[test]
 coverage = ${config.enableCoverage}
 preload = ["./tests/happydom-setup.ts"]

 [test.junit]
 path = "${config.junitReporterPath}"
 `.trim();
 }

 // ============================================================================
 // Happy-DOM Setup Generator
 // ============================================================================

 /**
  * Generates test setup file that initializes happy-dom for browser-like testing.
  */
 export function generateHappyDomSetup(): string {
   return `// Auto-generated Happy-DOM Test Setup
 // Place in tests/happydom-setup.ts
 import { GlobalRegistrator } from '@happy-dom/global-registrator';

 GlobalRegistrator.register();

 // Cleanup after all tests
 afterAll(() => {
   GlobalRegistrator.unregister();
 });
 `.trim();
 }

 // ============================================================================
 // Environment Setup Generator
 // ============================================================================

 /**
  * Generates test environment setup that loads Supabase keys from env/secrets.
  */
 export function generateTestEnvSetup(keys: string[]): string {
   const lines = [
     '// Auto-generated Test Environment Setup',
     '// Place in tests/setup-env.ts',
     '',
     'const REQUIRED_KEYS = [' + keys.map(k => `"${k}"`).join(', ') + '];',
     '',
     'for (const key of REQUIRED_KEYS) {',
     '  if (!process.env[key]) {',
     '    console.warn(`[TestEnv] Missing required env var: ${key}`);',
     '  }',
     '}',
   ];
   return lines.join('\n');
 }

 // ============================================================================
 // GitHub Actions Workflow Generator
 // ============================================================================

 /**
  * Generates updated CI workflow using oven-sh/setup-bun@v2 with caching.
  */
 export function generateCIWorkflow(config: BunMigrationConfig): string {
   return `name: Build

 on:
   push:
     branches: [main]
   pull_request:
     branches: [main]

 jobs:
   build:
     runs-on: ubuntu-latest
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
           key: bun-cache-\${{ hashFiles('bun.lockb') }}
           restore-keys: bun-cache-

       - name: Install dependencies
         run: bun install --frozen-lockfile

       - name: Lint
         run: bun run lint

       - name: Type Check
         run: bun run typecheck

       - name: Run Tests
         run: bun test
         env:
 ${config.supabaseEnvKeys.map(k => `          ${k}: \${{ secrets.${k} }}`).join('\n')}

       - name: Upload Test Results
         if: always()
         uses: actions/upload-artifact@v4
         with:
           name: test-results
           path: ${config.junitReporterPath}

       - name: Upload Coverage
         if: always()
         uses: actions/upload-artifact@v4
         with:
           name: coverage
           path: coverage/

       - name: Build
         run: bun run build

       - name: Upload Build Artifact
         uses: actions/upload-artifact@v4
         with:
           name: dist
           path: dist/
 `.trim();
 }

 // ============================================================================
 // Cleanup Script Generator
 // ============================================================================

 /**
  * Generates list of files/directories to delete as part of migration.
  */
 export function generateCleanupList(): string[] {
   return [
     'jest.config.json',
     'yarn.lock',
     '.pnp.cjs',
     '.pnp.loader.mjs',
     '.yarn/',
     '.nvmrc',
     'junit.xml',
   ];
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5885 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasBunEngines = Object.values(files).some(c =>
     c.includes('"engines"') && c.includes('"bun"')
   );
   const hasBunScripts = Object.values(files).some(c =>
     c.includes('"test": "bun test"') && c.includes('"dev": "bun run')
   );
   const hasBunfig = Object.values(files).some(c =>
     c.includes('[test]') && c.includes('preload') && c.includes('happy-dom')
   );
   const hasHappyDomSetup = Object.values(files).some(c =>
     c.includes('GlobalRegistrator') && c.includes('happy-dom')
   );
   const hasCIWorkflow = Object.values(files).some(c =>
     c.includes('oven-sh/setup-bun@v2') && c.includes('bun test')
   );
   const hasCacheStep = Object.values(files).some(c =>
     c.includes('actions/cache@v4') && c.includes('bun.lockb')
   );
   const hasSupabaseSecrets = Object.values(files).some(c =>
     c.includes('secrets.') && c.includes('SUPABASE')
   );
   const hasCleanupList = Object.values(files).some(c =>
     c.includes('yarn.lock') && c.includes('.pnp.cjs') && c.includes('jest.config.json')
   );
   const hasJunitUpload = Object.values(files).some(c =>
     c.includes('upload-artifact') && c.includes('test-results')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasBunEngines, 'package.json engines field specifies Bun');
   check(hasBunScripts, 'Bun-based scripts for dev/build/test exist');
   check(hasBunfig, 'bunfig.toml with happy-dom preload exists');
   check(hasHappyDomSetup, 'Happy-DOM global registrator setup exists');
   check(hasCIWorkflow, 'CI workflow uses oven-sh/setup-bun@v2');
   check(hasCacheStep, 'Bun dependency caching configured');
   check(hasSupabaseSecrets, 'Supabase env vars read from GitHub secrets');
   check(hasCleanupList, 'Yarn/Jest cleanup file list provided');
   check(hasJunitUpload, 'JUnit results upload step exists');

   return { pass, report };
 }
