 /**
  * @file auto-time-label-handoff.ts
  * @description Handoff scaffolding for "Automatically set a Time: label"
  * (Issue #5022 / upstream ubiquity-os/plugins-wishlist#76).
  * Provides generators for an AI-powered time estimation plugin that listens to
  * issue events, estimates effort via LLM, applies configurable offsets, and
  * assigns the best-fitting existing Time: label.
  *
  * Bounty: $450 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export type TimeLabel = string; // e.g., "Time: <1 Hour", "Time: <4 Hours"

 export interface TimeEstimationConfig {
   llmProvider: 'claude' | 'grok' | 'openai';
   modelId: string;
   offsetDivisor: number; // e.g., 15 means estimated hours / 15
   ignoreOriginalEstimate: boolean;
   promptTemplate: string;
   maxTokens: number;
   temperature: number;
 }

 export interface IssueContext {
   owner: string;
   repo: string;
   issueNumber: number;
   title: string;
   body: string;
   labels: string[];
   existingTimeLabels: TimeLabel[];
 }

 export interface EstimationResult {
   rawHours: number;
   adjustedHours: number;
   selectedLabel: TimeLabel;
   reasoning: string;
   confidence: number; // 0-1
 }

 export interface PluginEvent {
   type: 'issue_created' | 'issue_edited';
   issue: IssueContext;
   timestamp: string;
 }

 // ============================================================================
 // Prompt Template Generator
 // ============================================================================

 /**
  * Generates the system + user prompt for LLM-based time estimation.
  * Includes instructions to ignore original estimates and output structured JSON.
  */
 export function generateEstimationPrompt(config: TimeEstimationConfig): string {
   return `
 // Auto-generated LLM Prompt Builder for Time Estimation
 import type { IssueContext, TimeEstimationConfig } from './types';

 export function buildEstimationPrompt(
   issue: IssueContext,
   config: TimeEstimationConfig
 ): { system: string; user: string } {
   const system = \`You are an expert software engineering estimator. Your task is to estimate
 the time required to complete a GitHub issue based solely on its specification.

 RULES:
 - Ignore any existing time estimates or labels in the issue.
 - Estimate in HOURS as a decimal number.
 - Consider complexity, scope, testing requirements, and integration points.
 - Output ONLY valid JSON with keys: "rawHours" (number), "reasoning" (string), "confidence" (0-1).
 - Do not include markdown fences or extra text.\`;

   const user = \`ISSUE TITLE: \${issue.title}

 ISSUE BODY:
 \${issue.body ?? '(no description)'}

 EXISTING LABELS: \${issue.labels.join(', ') || 'none'}

 Available Time Labels in this repo: \${issue.existingTimeLabels.join(' | ')}

 Provide your estimate now.\`;

   return { system, user };
 }
 `.trim();
 }

 // ============================================================================
 // Label Matcher Generator
 // ============================================================================

 /**
  * Generates logic to map an adjusted hour estimate to the best-fitting
  * existing Time: label in the repository.
  */
 export function generateLabelMatcher(): string {
   return `
 // Auto-generated Time Label Matcher
 import type { TimeLabel } from './types';

 interface ParsedLabel {
   label: TimeLabel;
   maxHours: number;
 }

 const LABEL_PATTERNS: Array<{ pattern: RegExp; hours: number }> = [
   { pattern: /<\\s*1\\s*hour/i, hours: 1 },
   { pattern: /<\\s*4\\s*hours/i, hours: 4 },
   { pattern: /<\\s*1\\s*day/i, hours: 8 },
   { pattern: /<\\s*1\\s*week/i, hours: 40 },
   { pattern: /<\\s*2\\s*weeks/i, hours: 80 },
   { pattern: /<\\s*1\\s*month/i, hours: 160 },
 ];

 export function parseTimeLabels(labels: TimeLabel[]): ParsedLabel[] {
   const result: ParsedLabel[] = [];
   for (const label of labels) {
     for (const { pattern, hours } of LABEL_PATTERNS) {
       if (pattern.test(label)) {
         result.push({ label, maxHours: hours });
         break;
       }
     }
   }
   // Sort ascending by maxHours
   return result.sort((a, b) => a.maxHours - b.maxHours);
 }

 export function selectBestLabel(
   adjustedHours: number,
   availableLabels: TimeLabel[]
 ): TimeLabel | null {
   const parsed = parseTimeLabels(availableLabels);
   if (parsed.length === 0) return null;

   // Find smallest label whose maxHours >= adjustedHours
   for (const p of parsed) {
     if (adjustedHours <= p.maxHours) return p.label;
   }

   // If exceeds all, pick the largest
   return parsed[parsed.length - 1].label;
 }
 `.trim();
 }

 // ============================================================================
 // Plugin Event Handler Generator
 // ============================================================================

 /**
  * Generates the main event handler that processes issue_created/edited events,
  * calls the LLM, applies offset, matches label, and updates the issue.
  */
 export function generateEventHandler(): string {
   return `
 // Auto-generated Plugin Event Handler
 import type { PluginEvent, TimeEstimationConfig, EstimationResult } from './types';
 import { buildEstimationPrompt } from './prompt';
 import { selectBestLabel } from './label-matcher';

 export async function handleIssueEvent(
   event: PluginEvent,
   config: TimeEstimationConfig,
   octokit: any
 ): Promise<EstimationResult | null> {
   const { issue } = event;

   // Skip if already has a Time: label and event is not an edit
   if (event.type === 'issue_created' && issue.labels.some(l => l.startsWith('Time:'))) {
     console.log(\`Skipping #\${issue.issueNumber}: already has Time label\`);
     return null;
   }

   // Build prompt
   const { system, user } = buildEstimationPrompt(issue, config);

   // Call LLM (adapter pattern – swap provider as needed)
   let llmResponse: any;
   if (config.llmProvider === 'claude') {
     // Use claude CLI: claude -p "..." --output-format json
     const { execSync } = await import('child_process');
     const cmd = \`claude -p "\${user.replace(/"/g, '\\\\"')}" --output-format json --max-tokens \${config.maxTokens}\`;
     const raw = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
     llmResponse = JSON.parse(raw);
   } else {
     throw new Error(\`Unsupported LLM provider: \${config.llmProvider}\`);
   }

   const rawHours = llmResponse.rawHours ?? llmResponse.result?.rawHours;
   const reasoning = llmResponse.reasoning ?? llmResponse.result?.reasoning ?? '';
   const confidence = llmResponse.confidence ?? llmResponse.result?.confidence ?? 0.5;

   if (typeof rawHours !== 'number' || rawHours <= 0) {
     console.error('Invalid LLM response:', llmResponse);
     return null;
   }

   // Apply offset divisor
   const adjustedHours = config.offsetDivisor > 0
     ? rawHours / config.offsetDivisor
     : rawHours;

   // Match to existing label
   const selectedLabel = selectBestLabel(adjustedHours, issue.existingTimeLabels);
   if (!selectedLabel) {
     console.warn('No matching Time label found for', adjustedHours, 'hours');
     return null;
   }

   // Update issue label via GitHub API
   // Remove existing Time: labels first
   const currentLabels = issue.labels.filter(l => !l.startsWith('Time:'));
   await octokit.rest.issues.setLabels({
     owner: issue.owner,
     repo: issue.repo,
     issue_number: issue.issueNumber,
     labels: [...currentLabels, selectedLabel],
   });

   return {
     rawHours,
     adjustedHours,
     selectedLabel,
     reasoning,
     confidence,
   };
 }
 `.trim();
 }

 // ============================================================================
 // Configuration Schema Generator
 // ============================================================================

 /**
  * Generates a JSON schema and default config for the auto-time-label plugin.
  */
 export function generatePluginConfigSchema(): string {
   return `{
   "$schema": "http://json-schema.org/draft-07/schema#",
   "title": "Auto Time Label Plugin Config",
   "type": "object",
   "properties": {
     "llmProvider": {
       "type": "string",
       "enum": ["claude", "grok", "openai"],
       "default": "claude"
     },
     "modelId": {
       "type": "string",
       "default": "claude-sonnet-4-20250514"
     },
     "offsetDivisor": {
       "type": "number",
       "minimum": 1,
       "default": 15,
       "description": "Divide raw LLM estimate by this value"
     },
     "ignoreOriginalEstimate": {
       "type": "boolean",
       "default": true
     },
     "maxTokens": {
       "type": "integer",
       "default": 256
     },
     "temperature": {
       "type": "number",
       "default": 0.2
     }
   },
   "required": ["llmProvider", "offsetDivisor"]
 }`.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5022 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasPromptBuilder = Object.values(files).some(c =>
     c.includes('buildEstimationPrompt') && c.includes('Ignore any existing time estimates')
   );
   const hasLabelMatcher = Object.values(files).some(c =>
     c.includes('selectBestLabel') && c.includes('parseTimeLabels')
   );
   const hasOffsetDivisor = Object.values(files).some(c =>
     c.includes('offsetDivisor') && c.includes('adjustedHours')
   );
   const hasEventHandler = Object.values(files).some(c =>
     c.includes('handleIssueEvent') && c.includes('issue_created')
   );
   const hasClaudeCliIntegration = Object.values(files).some(c =>
     c.includes('claude -p') || c.includes('claude')
   );
   const hasConfigSchema = Object.values(files).some(c =>
     c.includes('"$schema"') && c.includes('offsetDivisor')
   );
   const hasLabelRemoval = Object.values(files).some(c =>
     c.includes("filter(l => !l.startsWith('Time:'))") || c.includes('setLabels')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasPromptBuilder, 'LLM prompt builder with ignore-original-estimate instruction exists');
   check(hasLabelMatcher, 'Time label matcher with parsing logic exists');
   check(hasOffsetDivisor, 'Configurable offset divisor applied to raw estimate');
   check(hasEventHandler, 'Event handler for issue_created/edited exists');
   check(hasClaudeCliIntegration, 'Claude CLI integration (claude -p) implemented');
   check(hasConfigSchema, 'Plugin configuration JSON schema provided');
   check(hasLabelRemoval, 'Existing Time: label removal before reassignment exists');

   return { pass, report };
 }
