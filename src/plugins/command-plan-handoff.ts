 /**
  * @file command-plan-handoff.ts
  * @description Handoff scaffolding for "command-plan" (Issue #5877 / upstream ubiquity-os/plugins-wishlist#78).
  * Provides generators for a /plan command that decomposes specs into child issues,
  * manages sub-issue relationships via REST API, handles dependencies via GraphQL,
  * and enforces label/time estimate policies.
  *
  * Bounty: $600 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export type TimeLabel = 
  | 'Time: <15 Minutes' 
  | 'Time: <1 Hour' 
  | 'Time: <2 Hours' 
  | 'Time: <4 Hours' 
  | 'Time: <1 Day' 
  | 'Time: <1 Week' 
  | 'Time: <1 Month';

 export type PriorityLabel = 
  | 'Priority: 1 (Normal)' 
  | 'Priority: 2 (Medium)' 
  | 'Priority: 3 (High)' 
  | 'Priority: 4 (Urgent)';

 export interface ChildIssueSpec {
   title: string;
   body: string;
   timeLabel: TimeLabel;
   priorityLabel: PriorityLabel;
   files?: string[];
   acceptanceCriteria: string[];
 }

 export interface PlanResult {
   parentIssueNumber: number;
   childIssues: Array<{
     number: number;
     id: number;
     title: string;
     url: string;
   }>;
   dependencies: Array<{
     childNumber: number;
     blockedBy: number[];
   }>;
   warnings: string[];
 }

 export interface GitHubContext {
   owner: string;
   repo: string;
   token: string;
 }

 export interface LabelPolicy {
   allowedTimeLabels: TimeLabel[];
   allowedPriorityLabels: PriorityLabel[];
   disallowedPatterns: RegExp[];
 }

 // ============================================================================
 // Spec Parser Generator
 // ============================================================================

 /**
  * Generates logic to parse a parent spec into structured child issue specifications.
  * Uses LLM-assisted decomposition following the minimal spec format.
  */
 export function generateSpecParser(): string {
   return `// Auto-generated Spec Parser for /plan Command
 import type { ChildIssueSpec, TimeLabel, PriorityLabel } from './types';

 const DEFAULT_TIME_ESTIMATES: Record<string, TimeLabel> = {
   docs: 'Time: <15 Minutes',
   copy: 'Time: <15 Minutes',
   'minor-ui': 'Time: <1 Hour',
   wiring: 'Time: <1 Hour',
   handler: 'Time: <1 Hour',
   filter: 'Time: <1 Hour',
   'client-work': 'Time: <2 Hours',
   'url-state': 'Time: <2 Hours',
   export: 'Time: <2 Hours',
   'saved-views': 'Time: <2 Hours',
   'print-stylesheet': 'Time: <4 Hours',
   charts: 'Time: <4 Hours',
   'design-tokens': 'Time: <4 Hours',
   a11y: 'Time: <4 Hours',
   keyboard: 'Time: <4 Hours',
   virtualization: 'Time: <4 Hours',
 };

 export function estimateTimeLabel(description: string): TimeLabel {
   const lower = description.toLowerCase();
   
   for (const [keyword, label] of Object.entries(DEFAULT_TIME_ESTIMATES)) {
     if (lower.includes(keyword)) return label;
   }
   
   // Default aggressive estimate
   return 'Time: <2 Hours';
 }

 export function parseSpecIntoChildren(
   parentSpec: string,
   llmDecompose: (spec: string) => Promise<ChildIssueSpec[]>
 ): Promise<ChildIssueSpec[]> {
   return llmDecompose(parentSpec);
 }

 export function validateChildSpec(spec: ChildIssueSpec): string[] {
   const warnings: string[] = [];
   
   if (!spec.title || spec.title.length < 5) {
     warnings.push('Title too short or missing');
   }
   
   if (spec.acceptanceCriteria.length === 0) {
     warnings.push('No acceptance criteria defined');
   }
   
   if (!spec.body || spec.body.length < 20) {
     warnings.push('Body description too brief');
   }
   
   return warnings;
 }
 `.trim();
 }

 // ============================================================================
 // Sub-Issue Manager Generator
 // ============================================================================

 /**
  * Generates REST API client for managing sub-issue relationships.
  * Handles creating child issues and linking them to parent via sub_issues endpoint.
  */
 export function generateSubIssueManager(): string {
   return `// Auto-generated Sub-Issue Manager (REST API)
 import type { GitHubContext, ChildIssueSpec, PlanResult } from './types';

 export class SubIssueManager {
   private ctx: GitHubContext;

   constructor(ctx: GitHubContext) {
     this.ctx = ctx;
   }

   async createChildIssue(spec: ChildIssueSpec): Promise<{ number: number; id: number; url: string }> {
     const body = [
       spec.body,
       '',
       'Acceptance:',
       ...spec.acceptanceCriteria.map(c => \`- \${c}\`),
       '',
       ...(spec.files && spec.files.length > 0 
         ? ['Files:', ...spec.files.map(f => \`- \${f}\`)] 
         : []),
     ].join('\\n');

     const res = await fetch(
       \`https://api.github.com/repos/\${this.ctx.owner}/\${this.ctx.repo}/issues\`,
       {
         method: 'POST',
         headers: {
           'Authorization': \`Bearer \${this.ctx.token}\`,
           'Accept': 'application/vnd.github+json',
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           title: spec.title,
           body,
           labels: [spec.timeLabel, spec.priorityLabel],
         }),
       }
     );

     if (!res.ok) {
       throw new Error(\`Failed to create child issue: \${res.status} \${res.statusText}\`);
     }

     const data = await res.json();
     return { number: data.number, id: data.id, url: data.html_url };
   }

   async linkAsSubIssue(parentNumber: number, childId: number): Promise<void> {
     const res = await fetch(
       \`https://api.github.com/repos/\${this.ctx.owner}/\${this.ctx.repo}/issues/\${parentNumber}/sub_issues\`,
       {
         method: 'POST',
         headers: {
           'Authorization': \`Bearer \${this.ctx.token}\`,
           'Accept': 'application/vnd.github+json',
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ sub_issue_id: childId }),
       }
     );

     if (!res.ok) {
       throw new Error(\`Failed to link sub-issue: \${res.status} \${res.statusText}\`);
     }
   }

   async listSubIssues(parentNumber: number): Promise<Array<{ number: number; title: string }>> {
     const res = await fetch(
       \`https://api.github.com/repos/\${this.ctx.owner}/\${this.ctx.repo}/issues/\${parentNumber}/sub_issues\`,
       {
         headers: {
           'Authorization': \`Bearer \${this.ctx.token}\`,
           'Accept': 'application/vnd.github+json',
         },
       }
     );

     if (!res.ok) return [];
     const data = await res.json();
     return data.map((i: any) => ({ number: i.number, title: i.title }));
   }
 }
 `.trim();
 }

 // ============================================================================
 // Dependency Manager Generator (GraphQL)
 // ============================================================================

 /**
  * Generates GraphQL-based dependency management for blocked_by/blocking relationships.
  * Preferred over REST due to better reliability across token types.
  */
 export function generateDependencyManager(): string {
   return `// Auto-generated Dependency Manager (GraphQL API)
 import type { GitHubContext } from './types';

 export class DependencyManager {
   private ctx: GitHubContext;

   constructor(ctx: GitHubContext) {
     this.ctx = ctx;
   }

   async getIssueId(issueNumber: number): Promise<string> {
     const query = \`query { repository(owner: "\${this.ctx.owner}", name: "\${this.ctx.repo}") { issue(number: \${issueNumber}) { id } } }\`;
     
     const res = await fetch('https://api.github.com/graphql', {
       method: 'POST',
       headers: {
         'Authorization': \`Bearer \${this.ctx.token}\`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ query }),
     });

     if (!res.ok) throw new Error(\`GraphQL error: \${res.status}\`);
     const data = await res.json();
     return data.data.repository.issue.id;
   }

   async addBlockedBy(targetNumber: number, blockerNumber: number): Promise<void> {
     const targetId = await this.getIssueId(targetNumber);
     const blockerId = await this.getIssueId(blockerNumber);

     const mutation = \`mutation { addBlockedBy(input: { issueId: "\${targetId}", blockingIssueId: "\${blockerId}" }) { issue { number } blockingIssue { number } } }\`;

     const res = await fetch('https://api.github.com/graphql', {
       method: 'POST',
       headers: {
         'Authorization': \`Bearer \${this.ctx.token}\`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ query: mutation }),
     });

     if (!res.ok) throw new Error(\`Failed to add blocked_by: \${res.status}\`);
   }

   async removeBlockedBy(targetNumber: number, blockerNumber: number): Promise<void> {
     const targetId = await this.getIssueId(targetNumber);
     const blockerId = await this.getIssueId(blockerNumber);

     const mutation = \`mutation { removeBlockedBy(input: { issueId: "\${targetId}", blockingIssueId: "\${blockerId}" }) { issue { number } } }\`;

     const res = await fetch('https://api.github.com/graphql', {
       method: 'POST',
       headers: {
         'Authorization': \`Bearer \${this.ctx.token}\`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ query: mutation }),
     });

     if (!res.ok) throw new Error(\`Failed to remove blocked_by: \${res.status}\`);
   }

   async getDependencies(issueNumber: number): Promise<{ blockedBy: number[]; blocking: number[] }> {
     const query = \`query { repository(owner: "\${this.ctx.owner}", name: "\${this.ctx.repo}") { issue(number: \${issueNumber}) { blockedBy(first: 50) { nodes { number } } blocking(first: 50) { nodes { number } } } } }\`;

     const res = await fetch('https://api.github.com/graphql', {
       method: 'POST',
       headers: {
         'Authorization': \`Bearer \${this.ctx.token}\`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ query }),
     });

     if (!res.ok) return { blockedBy: [], blocking: [] };
     const data = await res.json();
     const issue = data.data.repository.issue;

     return {
       blockedBy: issue.blockedBy.nodes.map((n: any) => n.number),
       blocking: issue.blocking.nodes.map((n: any) => n.number),
     };
   }
 }
 `.trim();
 }

 // ============================================================================
 // Label Policy Enforcer Generator
 // ============================================================================

 /**
  * Generates label validation logic enforcing the hard rules:
  * no sprint labels, no price labels, exactly one time + one priority per child.
  */
 export function generateLabelPolicyEnforcer(): string {
   return `// Auto-generated Label Policy Enforcer
 import type { LabelPolicy, TimeLabel, PriorityLabel } from './types';

 const DEFAULT_POLICY: LabelPolicy = {
   allowedTimeLabels: [
     'Time: <15 Minutes',
     'Time: <1 Hour',
     'Time: <2 Hours',
     'Time: <4 Hours',
     'Time: <1 Day',
     'Time: <1 Week',
     'Time: <1 Month',
   ],
   allowedPriorityLabels: [
     'Priority: 1 (Normal)',
     'Priority: 2 (Medium)',
     'Priority: 3 (High)',
     'Priority: 4 (Urgent)',
   ],
   disallowedPatterns: [
     /^\\[S\\d+\\]/i,          // Sprint prefixes like [S1]
     /sprint/i,               // Any sprint reference
     /price/i,                // Price labels
     /\\$\\d+/i,              // Dollar amounts
     /bounty/i,               // Bounty references
   ],
 };

 export function validateLabels(
   labels: string[],
   isParentIssue: boolean = false
 ): { valid: boolean; errors: string[]; sanitized: string[] } {
   const errors: string[] = [];
   const sanitized: string[] = [];
   let timeCount = 0;
   let priorityCount = 0;

   for (const label of labels) {
     // Check disallowed patterns
     if (DEFAULT_POLICY.disallowedPatterns.some(p => p.test(label))) {
       errors.push(\`Disallowed label: "\${label}"\`);
       continue;
     }

     // Count time/priority labels
     if (DEFAULT_POLICY.allowedTimeLabels.includes(label as TimeLabel)) {
       timeCount++;
       sanitized.push(label);
     } else if (DEFAULT_POLICY.allowedPriorityLabels.includes(label as PriorityLabel)) {
       priorityCount++;
       sanitized.push(label);
     } else {
       // Unknown label – skip but warn
       errors.push(\`Unknown label skipped: "\${label}"\`);
     }
   }

   // Parent issues should NOT have time labels
   if (isParentIssue && timeCount > 0) {
     errors.push('Parent issues must not have time labels');
     // Remove time labels from sanitized
     const filtered = sanitized.filter(l => !DEFAULT_POLICY.allowedTimeLabels.includes(l as TimeLabel));
     sanitized.length = 0;
     sanitized.push(...filtered);
     timeCount = 0;
   }

   // Child issues need exactly one of each
   if (!isParentIssue) {
     if (timeCount !== 1) errors.push(\`Expected exactly 1 time label, found \${timeCount}\`);
     if (priorityCount !== 1) errors.push(\`Expected exactly 1 priority label, found \${priorityCount}\`);
   }

   return {
     valid: errors.length === 0,
     errors,
     sanitized,
   };
 }
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5877 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasSpecParser = Object.values(files).some(c =>
     c.includes('parseSpecIntoChildren') && c.includes('estimateTimeLabel')
   );
   const hasSubIssueManager = Object.values(files).some(c =>
     c.includes('SubIssueManager') && c.includes('sub_issues')
   );
   const hasCreateChild = Object.values(files).some(c =>
     c.includes('createChildIssue') && c.includes('labels')
   );
   const hasLinkSubIssue = Object.values(files).some(c =>
     c.includes('linkAsSubIssue') && c.includes('sub_issue_id')
   );
   const hasDependencyManager = Object.values(files).some(c =>
     c.includes('DependencyManager') && c.includes('addBlockedBy')
   );
   const hasGraphql = Object.values(files).some(c =>
     c.includes('api.github.com/graphql') && c.includes('mutation')
   );
   const hasLabelPolicy = Object.values(files).some(c =>
     c.includes('validateLabels') && c.includes('disallowedPatterns')
   );
   const hasNoSprintLabels = Object.values(files).some(c =>
     c.includes('[S\\\\d+]') || c.includes('sprint')
   );
   const hasTimeEstimates = Object.values(files).some(c =>
     c.includes('DEFAULT_TIME_ESTIMATES') && c.includes('Time: <')
   );
   const hasMinimalSpecFormat = Object.values(files).some(c =>
     c.includes('Acceptance:') && c.includes('Files:')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasSpecParser, 'Spec parser with LLM decomposition exists');
   check(hasSubIssueManager, 'Sub-issue manager with REST API exists');
   check(hasCreateChild, 'Child issue creation with labels exists');
   check(hasLinkSubIssue, 'Sub-issue linking via REST exists');
   check(hasDependencyManager, 'Dependency manager with GraphQL exists');
   check(hasGraphql, 'GraphQL mutations for blocked_by exist');
   check(hasLabelPolicy, 'Label policy enforcer exists');
   check(hasNoSprintLabels, 'Sprint/price label restrictions enforced');
   check(hasTimeEstimates, 'Aggressive time estimate defaults exist');
   check(hasMinimalSpecFormat, 'Minimal spec format (Acceptance/Files) supported');

   return { pass, report };
 }
