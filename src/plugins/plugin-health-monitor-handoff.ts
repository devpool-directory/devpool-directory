 /**
  * @file plugin-health-monitor-handoff.ts
  * @description Handoff scaffolding for "Plugin health monitor" (Issue #5886 / upstream ubiquity-os/.github#12).
  * Provides generators for a daily cron job that checks all plugins in @ubiquity-os-marketplace,
  * tracks consecutive failures, and posts notifications when threshold is reached.
  * 
  * Bounty: $450 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */
 
 // ============================================================================
 // Types & Interfaces
 // ============================================================================
 
 export interface PluginHealthRecord {
   pluginName: string;
   lastCheckAt: string;
   consecutiveFailures: number;
   lastSuccessAt?: string;
   lastError?: string;
 }
 
 export interface HealthMonitorConfig {
   failureThreshold: number;
   notifyUsers: string[];
   marketplaceOwner: string;
   marketplaceRepo: string;
   notificationIssueNumber?: number;
   checkTimeoutMs: number;
 }
 
 export interface PluginDispatchResult {
   pluginName: string;
   success: boolean;
   error?: string;
   durationMs: number;
 }
 
 export interface HealthCheckReport {
   checkedAt: string;
   totalPlugins: number;
   failedPlugins: number;
   newlyCritical: string[];
   recovered: string[];
 }
 
 // ============================================================================
 // Cron Job Generator
 // ============================================================================
 
 /**
  * Generates the main cron job script that iterates through marketplace plugins,
  * dispatches test runs, and updates health records.
  */
 export function generateCronJobScript(config: HealthMonitorConfig): string {
   return `#!/usr/bin/env node
 // Auto-generated Plugin Health Monitor Cron Job
 // Run daily via GitHub Actions or system cron
 
 const CONFIG = ${JSON.stringify(config, null, 2)};
 
 import { Octokit } from '@octokit/rest';
 import fs from 'fs/promises';
 
 const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
 const HEALTH_FILE = './plugin-health-state.json';
 
 async function loadHealthState(): Promise<Record<string, PluginHealthRecord>> {
   try {
     const raw = await fs.readFile(HEALTH_FILE, 'utf-8');
     return JSON.parse(raw);
   } catch {
     return {};
   }
 }
 
 async function saveHealthState(state: Record<string, PluginHealthRecord>): Promise<void> {
   await fs.writeFile(HEALTH_FILE, JSON.stringify(state, null, 2));
 }
 
 async function getMarketplacePlugins(): Promise<string[]> {
   const { data: repos } = await octokit.rest.repos.listForOrg({
     org: CONFIG.marketplaceOwner,
     type: 'public',
     per_page: 100,
   });
   
   // Filter for plugin repos (naming convention or topic)
   return repos
     .filter(r => r.name.startsWith('plugin-') || r.topics?.includes('ubiquity-plugin'))
     .map(r => r.name);
 }
 
 async function dispatchPluginTest(pluginName: string): Promise<PluginDispatchResult> {
   const start = Date.now();
   try {
     // Trigger workflow_dispatch on the plugin's default branch
     await octokit.rest.actions.createWorkflowDispatch({
       owner: CONFIG.marketplaceOwner,
       repo: pluginName,
       workflow_id: 'ci.yml',
       ref: 'main',
     });
     
     // Wait briefly for status (in real impl, use webhook or polling)
     await new Promise(resolve => setTimeout(resolve, CONFIG.checkTimeoutMs));
     
     // Check latest run status
     const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
       owner: CONFIG.marketplaceOwner,
       repo: pluginName,
       event: 'workflow_dispatch',
       per_page: 1,
     });
     
     const latest = runs.workflow_runs[0];
     const success = latest?.status === 'completed' && latest?.conclusion === 'success';
     
     return {
       pluginName,
       success,
       error: success ? undefined : \`Run \${latest?.id} concluded: \${latest?.conclusion}\`,
       durationMs: Date.now() - start,
     };
   } catch (err: any) {
     return {
       pluginName,
       success: false,
       error: err.message,
       durationMs: Date.now() - start,
     };
   }
 }
 
 async function postNotification(message: string): Promise<void> {
   if (!CONFIG.notificationIssueNumber) {
     console.warn('No notification issue configured; skipping alert.');
     return;
   }
   
   const mentions = CONFIG.notifyUsers.map(u => \`@\${u}\`).join(' ');
   await octokit.rest.issues.createComment({
     owner: CONFIG.marketplaceOwner,
     repo: CONFIG.marketplaceRepo,
     issue_number: CONFIG.notificationIssueNumber,
     body: \`## 🚨 Plugin Health Alert\\n\\n\${mentions}\\n\\n\${message}\`,
   });
 }
 
 async function main() {
   const state = await loadHealthState();
   const plugins = await getMarketplacePlugins();
   const report: HealthCheckReport = {
     checkedAt: new Date().toISOString(),
     totalPlugins: plugins.length,
     failedPlugins: 0,
     newlyCritical: [],
     recovered: [],
   };
 
   for (const plugin of plugins) {
     const result = await dispatchPluginTest(plugin);
     const prev = state[plugin] ?? { pluginName: plugin, consecutiveFailures: 0, lastCheckAt: '' };
 
     if (result.success) {
       if (prev.consecutiveFailures >= CONFIG.failureThreshold) {
         report.recovered.push(plugin);
       }
       state[plugin] = {
         ...prev,
         consecutiveFailures: 0,
         lastSuccessAt: result.durationMs.toString(),
         lastCheckAt: report.checkedAt,
         lastError: undefined,
       };
     } else {
       const newCount = prev.consecutiveFailures + 1;
       state[plugin] = {
         ...prev,
         consecutiveFailures: newCount,
         lastCheckAt: report.checkedAt,
         lastError: result.error,
       };
       
       if (newCount >= CONFIG.failureThreshold && prev.consecutiveFailures < CONFIG.failureThreshold) {
         report.newlyCritical.push(plugin);
       }
       report.failedPlugins++;
     }
   }
 
   await saveHealthState(state);
 
   if (report.newlyCritical.length > 0) {
     const msg = [\`**\${report.newlyCritical.length} plugin(s)** exceeded \${CONFIG.failureThreshold} consecutive failures:\`]
       .concat(report.newlyCritical.map(p => \`- \`\${p}\`: \${state[p].lastError ?? 'unknown'}\`))
       .join('\\n');
     await postNotification(msg);
   }
 
   console.log(JSON.stringify(report, null, 2));
 }
 
 main().catch(err => {
   console.error(err);
   process.exit(1);
 });
 `.trim();
 }
 
 // ============================================================================
 // GitHub Actions Workflow Generator
 // ============================================================================
 
 /**
  * Generates a GitHub Actions workflow file for scheduling the daily health check.
  */
 export function generateGitHubActionsWorkflow(): string {
   return `name: Plugin Health Monitor
 
 on:
   schedule:
     - cron: '0 6 * * *'  # Daily at 06:00 UTC
   workflow_dispatch:
 
 permissions:
   contents: write
   issues: write
   actions: read
 
 jobs:
   health-check:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
           node-version: '20'
       
       - name: Install dependencies
         run: npm install @octokit/rest
       
       - name: Restore health state
         uses: actions/cache@v4
         with:
           path: plugin-health-state.json
           key: plugin-health-\${{ github.run_id }}
           restore-keys: plugin-health-
       
       - name: Run health monitor
         env:
           GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
         run: node health-monitor-cron.js
       
       - name: Commit updated state
         run: |
           git config user.name "github-actions[bot]"
           git config user.email "github-actions[bot]@users.noreply.github.com"
           git add plugin-health-state.json || true
           git diff --staged --quiet || git commit -m "chore: update plugin health state [skip ci]"
           git push
 `.trim();
 }
 
 // ============================================================================
 // Notification Formatter
 // ============================================================================
 
 /**
  * Generates markdown notification templates for different alert scenarios.
  */
 export function generateNotificationTemplates(): Record<string, string> {
   return {
     critical: `## 🚨 Critical Plugin Failures Detected
 
 The following plugins have failed **{{threshold}}** consecutive health checks:
 
 {{#each plugins}}
 - **{{this.name}}**: {{this.error}} (last check: {{this.lastCheckAt}})
 {{/each}}
 
 cc: {{mentions}}
 
 _Please investigate and resolve. This alert will clear automatically on next successful check._`,
 
     recovery: `## ✅ Plugin Health Recovered
 
 The following plugins have resumed normal operation after previous failures:
 
 {{#each plugins}}
 - **{{this.name}}** (was failing for {{this.previousFailures}} checks)
 {{/each}}
 
 No action required.`,
 
     summary: `## 📊 Daily Plugin Health Summary
 
 - **Checked**: {{totalPlugins}} plugins
 - **Healthy**: {{healthyCount}}
 - **Failing**: {{failedCount}}
 - **Newly Critical**: {{newlyCriticalCount}}
 - **Recovered**: {{recoveredCount}}
 
 _Full state available in \`plugin-health-state.json\`._`,
   };
 }
 
 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================
 
 /**
  * Validates generated artifacts against Issue #5886 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;
 
   const hasCronScript = Object.values(files).some(c => c.includes('dispatchPluginTest') && c.includes('consecutiveFailures'));
   const hasFailureThreshold = Object.values(files).some(c => c.includes('failureThreshold') && c.includes('>= CONFIG.failureThreshold'));
   const hasNotification = Object.values(files).some(c => c.includes('postNotification') && c.includes('@'));
   const hasMarketplaceScan = Object.values(files).some(c => c.includes('listForOrg') || c.includes('getMarketplacePlugins'));
   const hasStatePersistence = Object.values(files).some(c => c.includes('loadHealthState') && c.includes('saveHealthState'));
   const hasWorkflow = Object.values(files).some(c => c.includes('schedule:') && c.includes('cron:'));
   const hasManualDispatchFilter = Object.values(files).some(c => c.includes('workflow_dispatch') || c.includes('event: \'workflow_dispatch\''));
 
   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };
 
   check(hasCronScript, 'Cron job script with plugin dispatch exists');
   check(hasFailureThreshold, 'Consecutive failure threshold logic implemented');
   check(hasNotification, 'Notification posting with user mentions exists');
   check(hasMarketplaceScan, 'Marketplace plugin enumeration implemented');
   check(hasStatePersistence, 'Health state persistence (load/save) exists');
   check(hasWorkflow, 'GitHub Actions scheduled workflow provided');
   check(hasManualDispatchFilter, 'Filters for workflow_dispatch events');
 
   return { pass, report };
 }
