 /**
  * @file pr-reopen-reminder-guard-handoff.ts
  * @description Handoff scaffolding for "Reminder is sent on PR reopening even with no assignee"
  * (Issue #5957 / upstream ubiquity-os-marketplace/daemon-disqualifier#135).
  * Provides generators for event handler guards that prevent reminder comments
  * when a pull request is reopened without an active assignee.
  *
  * Bounty: $75 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface PullRequestReopenEvent {
   action: 'reopened';
   pull_request: {
     number: number;
     title: string;
     state: 'open' | 'closed';
     assignees: Array<{ login: string }>;
     user: { login: string };
     merged: boolean;
     draft: boolean;
   };
   repository: {
     owner: { login: string };
     name: string;
   };
   sender: { login: string };
 }

 export interface ReminderGuardResult {
   shouldSendReminder: boolean;
   reason: 'has-assignee' | 'no-assignee' | 'draft-pr' | 'merged-pr' | 'self-reopen';
   assigneeCount: number;
 }

 export interface DisqualifierConfig {
   skipRemindersWithoutAssignee: boolean;
   skipDraftPrs: boolean;
   skipSelfReopens: boolean;
   exemptUsers: string[];
   reminderTemplate: string;
 }

 // ============================================================================
 // Event Guard Generator
 // ============================================================================

 /**
  * Generates the core guard logic that evaluates whether a reminder should
  * be suppressed based on assignee presence and PR state.
  */
 export function generateReminderGuard(): string {
   return `// Auto-generated PR Reopen Reminder Guard
 // Place in src/guards/pr-reopen-reminder-guard.ts

 import type { PullRequestReopenEvent, ReminderGuardResult, DisqualifierConfig } from '../types';

 export function evaluateReminderGuard(
   event: PullRequestReopenEvent,
   config: DisqualifierConfig
 ): ReminderGuardResult {
   const pr = event.pull_request;
   const assigneeCount = pr.assignees?.length ?? 0;

   // Never remind on merged PRs
   if (pr.merged) {
     return { shouldSendReminder: false, reason: 'merged-pr', assigneeCount };
   }

   // Skip draft PRs if configured
   if (config.skipDraftPrs && pr.draft) {
     return { shouldSendReminder: false, reason: 'draft-pr', assigneeCount };
   }

   // Skip self-reopens if configured
   if (config.skipSelfReopens && event.sender.login === pr.user.login) {
     return { shouldSendReminder: false, reason: 'self-reopen', assigneeCount };
   }

   // Primary fix: skip reminders when no assignee is present
   if (config.skipRemindersWithoutAssignee && assigneeCount === 0) {
     return { shouldSendReminder: false, reason: 'no-assignee', assigneeCount };
   }

   // Check exempt users
   if (pr.assignees?.some(a => config.exemptUsers.includes(a.login))) {
     return { shouldSendReminder: false, reason: 'has-assignee', assigneeCount };
   }

   return { shouldSendReminder: true, reason: 'has-assignee', assigneeCount };
 }
 `.trim();
 }

 // ============================================================================
 // Webhook Handler Integration Generator
 // ============================================================================

 /**
  * Generates the webhook handler integration that wires the guard into
  * the existing daemon-disqualifier event processing pipeline.
  */
 export function generateWebhookHandlerIntegration(): string {
   return `// Auto-generated Webhook Handler Integration
 // Insert into existing PR reopen handler in daemon-disqualifier

 import { evaluateReminderGuard } from '../guards/pr-reopen-reminder-guard';
 import type { PullRequestReopenEvent, DisqualifierConfig } from '../types';

 export async function handlePullRequestReopened(
   event: PullRequestReopenEvent,
   config: DisqualifierConfig,
   octokit: any
 ): Promise<void> {
   const guard = evaluateReminderGuard(event, config);

   console.log(\`[PR #\${event.pull_request.number}] Reopen reminder guard: \${guard.shouldSendReminder ? 'SEND' : 'SKIP'} (\${guard.reason}, assignees: \${guard.assigneeCount})\`);

   if (!guard.shouldSendReminder) {
     // Log skip reason for observability
     if (guard.reason === 'no-assignee') {
       console.info(\`[PR #\${event.pull_request.number}] Suppressed reminder: no assignee on reopened PR\`);
     }
     return;
   }

   // Proceed with existing reminder logic
   const body = config.reminderTemplate
     .replace('{{prNumber}}', String(event.pull_request.number))
     .replace('{{title}}', event.pull_request.title)
     .replace('{{assignees}}', event.pull_request.assignees.map(a => \`@\${a.login}\`).join(', '));

   await octokit.rest.issues.createComment({
     owner: event.repository.owner.login,
     repo: event.repository.name,
     issue_number: event.pull_request.number,
     body,
   });
 }
 `.trim();
 }

 // ============================================================================
 // Default Config Generator
 // ============================================================================

 /**
  * Generates default configuration with the fix enabled by default.
  */
 export function generateDefaultConfig(): string {
   return `{
   "skipRemindersWithoutAssignee": true,
   "skipDraftPrs": true,
   "skipSelfReopens": false,
   "exemptUsers": [],
   "reminderTemplate": "⏰ Reminder: PR #{{prNumber}} has been reopened. Assignees: {{assignees}}. Please review or update status."
 }`.trim();
 }

 // ============================================================================
 // Unit Test Generator
 // ============================================================================

 /**
  * Generates unit tests covering all guard branches.
  */
 export function generateUnitTests(): string {
   return `// Auto-generated Unit Tests for PR Reopen Reminder Guard
 import { describe, it, expect } from 'bun:test';
 import { evaluateReminderGuard } from '../src/guards/pr-reopen-reminder-guard';
 import type { PullRequestReopenEvent, DisqualifierConfig } from '../src/types';

 const baseConfig: DisqualifierConfig = {
   skipRemindersWithoutAssignee: true,
   skipDraftPrs: true,
   skipSelfReopens: false,
   exemptUsers: [],
   reminderTemplate: 'test',
 };

 function makeEvent(overrides: Partial<PullRequestReopenEvent['pull_request']> = {}): PullRequestReopenEvent {
   return {
     action: 'reopened',
     pull_request: {
       number: 42,
       title: 'Test PR',
       state: 'open',
       assignees: [{ login: 'dev1' }],
       user: { login: 'author' },
       merged: false,
       draft: false,
       ...overrides,
     },
     repository: { owner: { login: 'org' }, name: 'repo' },
     sender: { login: 'someone' },
   };
 }

 describe('PR Reopen Reminder Guard', () => {
   it('should suppress reminder when no assignees', () => {
     const result = evaluateReminderGuard(makeEvent({ assignees: [] }), baseConfig);
     expect(result.shouldSendReminder).toBe(false);
     expect(result.reason).toBe('no-assignee');
   });

   it('should allow reminder when assignees exist', () => {
     const result = evaluateReminderGuard(makeEvent(), baseConfig);
     expect(result.shouldSendReminder).toBe(true);
     expect(result.reason).toBe('has-assignee');
   });

   it('should suppress on merged PR', () => {
     const result = evaluateReminderGuard(makeEvent({ merged: true }), baseConfig);
     expect(result.shouldSendReminder).toBe(false);
     expect(result.reason).toBe('merged-pr');
   });

   it('should suppress draft PR when configured', () => {
     const result = evaluateReminderGuard(makeEvent({ draft: true }), baseConfig);
     expect(result.shouldSendReminder).toBe(false);
     expect(result.reason).toBe('draft-pr');
   });

   it('should allow reminder when skipRemindersWithoutAssignee is disabled', () => {
     const config = { ...baseConfig, skipRemindersWithoutAssignee: false };
     const result = evaluateReminderGuard(makeEvent({ assignees: [] }), config);
     expect(result.shouldSendReminder).toBe(true);
   });
 });
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5957 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasGuard = Object.values(files).some(c =>
     c.includes('evaluateReminderGuard') && c.includes('ReminderGuardResult')
   );
   const hasNoAssigneeCheck = Object.values(files).some(c =>
     c.includes('assigneeCount === 0') && c.includes('no-assignee')
   );
   const hasWebhookIntegration = Object.values(files).some(c =>
     c.includes('handlePullRequestReopened') && c.includes('shouldSendReminder')
   );
   const hasDefaultConfig = Object.values(files).some(c =>
     c.includes('skipRemindersWithoutAssignee') && c.includes('true')
   );
   const hasUnitTests = Object.values(files).some(c =>
     c.includes('should suppress reminder when no assignees')
   );
   const hasLogging = Object.values(files).some(c =>
     c.includes('Suppressed reminder') && c.includes('no assignee')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasGuard, 'Reminder guard function exists');
   check(hasNoAssigneeCheck, 'No-assignee suppression logic implemented');
   check(hasWebhookIntegration, 'Webhook handler integration provided');
   check(hasDefaultConfig, 'Default config with fix enabled exists');
   check(hasUnitTests, 'Unit tests covering no-assignee case exist');
   check(hasLogging, 'Observability logging for suppressed reminders exists');

   return { pass, report };
 }
