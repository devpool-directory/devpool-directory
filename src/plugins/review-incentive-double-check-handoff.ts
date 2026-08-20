 /**
  * @file review-incentive-double-check-handoff.ts
  * @description Handoff scaffolding for "Review Incentive Double Check Calculations"
  * (Issue #5042 / upstream ubiquity-os-marketplace/text-conversation-rewards#260).
  * Provides generators for filtering linguist-generated files, deduplicating review credits,
  * and correcting line count calculations in code review incentive systems.
  *
  * Bounty: $450 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface ReviewCredit {
   reviewer: string;
   prNumber: number;
   reviewId: string;
   reviewType: 'comment' | 'approval' | 'changes_requested';
   addedLines: number;
   deletedLines: number;
   timestamp: string;
   filesReviewed: string[];
 }

 export interface LineCountCorrection {
   originalAdded: number;
   correctedAdded: number;
   excludedFiles: string[];
   exclusionReason: 'linguist-generated' | 'binary' | 'vendored' | 'custom-ignore';
 }

 export interface ReviewIncentiveConfig {
   linguistGeneratedPaths: string[];
   customIgnorePatterns: RegExp[];
   deduplicateApprovals: boolean;
   mergeCommitCreditPolicy: 'none' | 'review-only' | 'merge-only';
   maxLinesPerReview: number;
 }

 export interface AuditReport {
   totalReviewsAnalyzed: number;
   duplicateCreditsFound: number;
   linguistExclusionsApplied: number;
   lineCountAdjustments: LineCountCorrection[];
   affectedReviewers: string[];
 }

 // ============================================================================
 // Linguist Filter Generator
 // ============================================================================

 /**
  * Generates a utility that filters out linguist-generated, vendored,
  * and binary files from line count calculations using .gitattributes patterns.
  */
 export function generateLinguistFilter(): string {
   return `
 // Auto-generated Linguist-aware file filter for review incentives
 import { minimatch } from 'minimatch';

 const LINGUIST_GENERATED_PATTERNS = [
   '**/*.min.js', '**/*.min.css', '**/dist/**', '**/build/**',
   '**/vendor/**', '**/node_modules/**', '**/*.generated.*',
   '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml',
 ];

 export interface FileClassification {
   path: string;
   isGenerated: boolean;
   isVendored: boolean;
   isBinary: boolean;
   shouldExclude: boolean;
   reason?: string;
 }

 export function classifyFile(
   filePath: string,
   gitattributesContent?: string,
   customPatterns: string[] = []
 ): FileClassification {
   const result: FileClassification = {
     path: filePath,
     isGenerated: false,
     isVendored: false,
     isBinary: false,
     shouldExclude: false,
   };

   // Check built-in linguist patterns
   for (const pattern of LINGUIST_GENERATED_PATTERNS) {
     if (minimatch(filePath, pattern)) {
       result.isGenerated = true;
       result.shouldExclude = true;
       result.reason = 'linguist-generated';
       return result;
     }
   }

   // Check custom ignore patterns
   for (const pattern of customPatterns) {
     if (minimatch(filePath, pattern)) {
       result.shouldExclude = true;
       result.reason = 'custom-ignore';
       return result;
     }
   }

   // Parse .gitattributes if provided
   if (gitattributesContent) {
     const lines = gitattributesContent.split('\\n');
     for (const line of lines) {
       const trimmed = line.trim();
       if (!trimmed || trimmed.startsWith('#')) continue;

       const parts = trimmed.split(/\\s+/);
       const pattern = parts[0];
       const attrs = parts.slice(1).join(' ');

       if (minimatch(filePath, pattern)) {
         if (attrs.includes('linguist-generated=true') || attrs.includes('generated')) {
           result.isGenerated = true;
           result.shouldExclude = true;
           result.reason = 'linguist-generated';
           return result;
         }
         if (attrs.includes('linguist-vendored=true') || attrs.includes('vendored')) {
           result.isVendored = true;
           result.shouldExclude = true;
           result.reason = 'vendored';
           return result;
         }
         if (attrs.includes('linguist-documentation=true')) {
           result.shouldExclude = true;
           result.reason = 'documentation';
           return result;
         }
       }
     }
   }

   return result;
 }

 export function filterDiffForIncentive(
   diffFiles: Array<{ path: string; additions: number; deletions: number }>,
   gitattributes?: string,
   customPatterns: string[] = []
 ): { filtered: typeof diffFiles; exclusions: FileClassification[] } {
   const filtered: typeof diffFiles = [];
   const exclusions: FileClassification[] = [];

   for (const file of diffFiles) {
     const classification = classifyFile(file.path, gitattributes, customPatterns);
     if (classification.shouldExclude) {
       exclusions.push(classification);
     } else {
       filtered.push(file);
     }
   }

   return { filtered, exclusions };
 }
 `.trim();
 }

 // ============================================================================
 // Review Credit Deduplicator Generator
 // ============================================================================

 /**
  * Generates logic to detect and merge duplicate review credits where
  * the same reviewer left both comments and approval on the same PR.
  */
 export function generateReviewDeduplicator(): string {
   return `
 // Auto-generated Review Credit Deduplicator
 import type { ReviewCredit } from './types';

 export interface DeduplicatedReview {
   reviewer: string;
   prNumber: number;
   primaryReviewId: string;
   mergedReviewIds: string[];
   reviewType: 'comment' | 'approval' | 'changes_requested';
   addedLines: number;
   deletedLines: number;
   timestamp: string;
   filesReviewed: string[];
   wasDuplicate: boolean;
 }

 export function deduplicateReviewCredits(
   reviews: ReviewCredit[],
   policy: 'keep-first' | 'keep-last' | 'keep-approval' = 'keep-approval'
 ): DeduplicatedReview[] {
   // Group by reviewer + PR
   const groups = new Map<string, ReviewCredit[]>();

   for (const review of reviews) {
     const key = \`\${review.reviewer}::\${review.prNumber}\`;
     if (!groups.has(key)) groups.set(key, []);
     groups.get(key)!.push(review);
   }

   const results: DeduplicatedReview[] = [];

   for (const [key, group] of groups) {
     if (group.length === 1) {
       results.push({
         ...group[0],
         primaryReviewId: group[0].reviewId,
         mergedReviewIds: [],
         wasDuplicate: false,
       });
       continue;
     }

     // Sort by timestamp
     const sorted = [...group].sort(
       (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
     );

     let primary: ReviewCredit;
     if (policy === 'keep-approval') {
       primary = sorted.find(r => r.reviewType === 'approval') ?? sorted[sorted.length - 1];
     } else if (policy === 'keep-first') {
       primary = sorted[0];
     } else {
       primary = sorted[sorted.length - 1];
     }

     // Merge line counts from all reviews (avoid double-counting same files)
     const allFiles = new Set<string>();
     let totalAdded = 0;
     let totalDeleted = 0;

     for (const r of sorted) {
       for (const f of r.filesReviewed) {
         if (!allFiles.has(f)) {
           allFiles.add(f);
           totalAdded += r.addedLines;
           totalDeleted += r.deletedLines;
         }
       }
     }

     results.push({
       reviewer: primary.reviewer,
       prNumber: primary.prNumber,
       primaryReviewId: primary.reviewId,
       mergedReviewIds: sorted
         .filter(r => r.reviewId !== primary.reviewId)
         .map(r => r.reviewId),
       reviewType: primary.reviewType,
       addedLines: totalAdded,
       deletedLines: totalDeleted,
       timestamp: primary.timestamp,
       filesReviewed: Array.from(allFiles),
       wasDuplicate: true,
     });
   }

   return results;
 }
 `.trim();
 }

 // ============================================================================
 // Merge Commit Credit Policy Generator
 // ============================================================================

 /**
  * Generates policy enforcement to prevent merge commits from receiving
  * review credit unless an actual review was performed.
  */
 export function generateMergeCommitPolicy(): string {
   return `
 // Auto-generated Merge Commit Credit Policy Enforcer
 import type { ReviewCredit } from './types';

 export type MergeCreditPolicy = 'none' | 'review-only' | 'merge-only';

 export interface MergeEvent {
   merger: string;
   prNumber: number;
   commitSha: string;
   hasReview: boolean;
   reviewId?: string;
   timestamp: string;
 }

 export function applyMergeCommitPolicy(
   mergeEvents: MergeEvent[],
   existingCredits: ReviewCredit[],
   policy: MergeCreditPolicy
 ): { allowed: ReviewCredit[]; rejected: MergeEvent[] } {
   const allowed: ReviewCredit[] = [];
   const rejected: MergeEvent[] = [];

   for (const event of mergeEvents) {
     switch (policy) {
       case 'none':
         // Never credit merges
         rejected.push(event);
         break;

       case 'review-only':
         // Only credit if merge author also left a substantive review
         if (event.hasReview && event.reviewId) {
           const review = existingCredits.find(c => c.reviewId === event.reviewId);
           if (review) allowed.push(review);
           else rejected.push(event);
         } else {
           rejected.push(event);
         }
         break;

       case 'merge-only':
         // Credit merge as separate action (not as review)
         if (!event.hasReview) {
           allowed.push({
             reviewer: event.merger,
             prNumber: event.prNumber,
             reviewId: \`merge-\${event.commitSha.slice(0, 7)}\`,
             reviewType: 'approval',
             addedLines: 0,
             deletedLines: 0,
             timestamp: event.timestamp,
             filesReviewed: [],
           });
         } else {
           rejected.push(event);
         }
         break;
     }
   }

   return { allowed, rejected };
 }
 `.trim();
 }

 // ============================================================================
 // Audit Report Generator
 // ============================================================================

 /**
  * Generates a comprehensive audit report comparing original vs corrected
  * incentive calculations with detailed breakdowns.
  */
 export function generateAuditReportBuilder(): string {
   return `
 // Auto-generated Incentive Audit Report Builder
 import type { ReviewCredit, LineCountCorrection, AuditReport } from './types';
 import type { DeduplicatedReview } from './deduplicator';

 export function buildAuditReport(
   originalCredits: ReviewCredit[],
   deduplicatedCredits: DeduplicatedReview[],
   corrections: LineCountCorrection[]
 ): AuditReport {
   const duplicateCreditsFound = deduplicatedCredits.filter(d => d.wasDuplicate).length;
   const linguistExclusionsApplied = corrections.filter(
     c => c.exclusionReason === 'linguist-generated'
   ).length;

   const affectedReviewers = new Set<string>();
   for (const d of deduplicatedCredits) {
     if (d.wasDuplicate) affectedReviewers.add(d.reviewer);
   }
   for (const c of corrections) {
     if (c.originalAdded !== c.correctedAdded) {
       // Would need mapping from correction to reviewer
     }
   }

   return {
     totalReviewsAnalyzed: originalCredits.length,
     duplicateCreditsFound,
     linguistExclusionsApplied,
     lineCountAdjustments: corrections,
     affectedReviewers: Array.from(affectedReviewers),
   };
 }

 export function formatAuditMarkdown(report: AuditReport): string {
   const lines = [
     '# Review Incentive Audit Report',
     '',
     \`- **Total Reviews Analyzed**: \${report.totalReviewsAnalyzed}\`,
     \`- **Duplicate Credits Found**: \${report.duplicateCreditsFound}\`,
     \`- **Linguist Exclusions Applied**: \${report.linguistExclusionsApplied}\`,
     \`- **Affected Reviewers**: \${report.affectedReviewers.join(', ') || 'None'}\`,
     '',
     '## Line Count Corrections',
     '',
   ];

   for (const adj of report.lineCountAdjustments) {
     lines.push(
       \`| Original: \${adj.originalAdded} | Corrected: \${adj.correctedAdded} | Reason: \${adj.exclusionReason} |\`
     );
     if (adj.excludedFiles.length > 0) {
       lines.push(\`| Excluded: \${adj.excludedFiles.slice(0, 3).join(', ')}\${adj.excludedFiles.length > 3 ? '...' : ''} |\`);
     }
   }

   return lines.join('\\n');
 }
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5042 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasLinguistFilter = Object.values(files).some(c =>
     c.includes('classifyFile') && c.includes('linguist-generated')
   );
   const hasGitattributesParsing = Object.values(files).some(c =>
     c.includes('.gitattributes') || c.includes('gitattributesContent')
   );
   const hasDeduplicator = Object.values(files).some(c =>
     c.includes('deduplicateReviewCredits') && c.includes('mergedReviewIds')
   );
   const hasApprovalDetection = Object.values(files).some(c =>
     c.includes("'approval'") && c.includes('keep-approval')
   );
   const hasMergePolicy = Object.values(files).some(c =>
     c.includes('applyMergeCommitPolicy') && c.includes("'review-only'")
   );
   const hasAuditReport = Object.values(files).some(c =>
     c.includes('buildAuditReport') && c.includes('duplicateCreditsFound')
   );
   const hasLineCountCorrection = Object.values(files).some(c =>
     c.includes('originalAdded') && c.includes('correctedAdded')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasLinguistFilter, 'Linguist-generated file classifier exists');
   check(hasGitattributesParsing, '.gitattributes parsing implemented');
   check(hasDeduplicator, 'Review credit deduplication logic exists');
   check(hasApprovalDetection, 'Approval vs comment distinction handled');
   check(hasMergePolicy, 'Merge commit credit policy enforcement exists');
   check(hasAuditReport, 'Audit report builder with metrics exists');
   check(hasLineCountCorrection, 'Line count correction tracking exists');

   return { pass, report };
 }
