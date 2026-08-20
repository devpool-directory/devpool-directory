/**
 * @file review-incentive-double-check.ts
 * @description Scaffolding and generator utilities for fixing review incentive
 * calculation bugs including linguist-generated file exclusion, merge credit
 * prevention, and accurate line count validation.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#260
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Linguist-generated file detector and filter for diff calculations
 * - Merge commit vs review commit distinction to prevent double-credit
 * - Line count validator comparing reported vs actual net changes
 * - Review deduplication logic for back-to-back reviews
 * - Integration patch for review reward pipeline
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a file in a pull request diff.
 */
export interface DiffFile {
  filename: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "removed" | "renamed";
  /** Whether this file is generated (should be excluded from incentives) */
  isGenerated: boolean;
  /** Language detected by linguist or extension */
  language?: string;
}

/**
 * Represents a single review event on a PR.
 */
export interface ReviewEvent {
  id: number;
  reviewer: string;
  state: "approved" | "changes_requested" | "commented" | "dismissed";
  submittedAt: Date;
  body: string;
  commentCount: number;
  /** Whether this review was immediately followed by another from same user */
  hasSubsequentReview: boolean;
  /** Whether this review is the final approval before merge */
  isPreMergeApproval: boolean;
}

/**
 * Validated line count statistics for a PR.
 */
export interface ValidatedLineStats {
  /** Raw additions from GitHub API */
  rawAdditions: number;
  /** Raw deletions from GitHub API */
  rawDeletions: number;
  /** Additions after excluding generated files */
  filteredAdditions: number;
  /** Deletions after excluding generated files */
  filteredDeletions: number;
  /** Net lines changed (additions + deletions) after filtering */
  netLinesChanged: number;
  /** Number of generated files excluded */
  generatedFilesExcluded: number;
  /** List of excluded filenames */
  excludedFiles: string[];
  /** Discrepancy ratio between raw and filtered (1.0 = no change) */
  discrepancyRatio: number;
}

/**
 * Result of review incentive validation for a single reviewer.
 */
export interface ReviewerIncentiveResult {
  username: string;
  /** Original calculated reward based on raw stats */
  originalReward: bigint;
  /** Corrected reward after all validations */
  correctedReward: bigint;
  /** Adjustment amount (positive = increase, negative = decrease) */
  adjustment: bigint;
  /** Reasons for adjustment */
  adjustmentReasons: string[];
  /** Number of valid reviews counted */
  validReviewCount: number;
  /** Reviews that were deduplicated */
  deduplicatedReviews: number;
  /** Whether merge credit was removed */
  mergeCreditRemoved: boolean;
}

/**
 * Configuration for review incentive validation.
 */
export interface ReviewIncentiveConfig {
  /** Patterns matching linguist-generated files */
  generatedFilePatterns: RegExp[];
  /** File extensions always considered generated */
  generatedExtensions: string[];
  /** Whether to exclude merge commits from review credit */
  excludeMergeCommits: boolean;
  /** Minimum time between reviews to count as separate (ms) */
  reviewDeduplicationWindowMs: number;
  /** Maximum allowed discrepancy ratio before flagging */
  maxDiscrepancyRatio: number;
  /** Whether approval-only reviews (no comments) get full credit */
  approvalOnlyGetsFullCredit: boolean;
  /** Credit multiplier for approval vs comment-only reviews */
  approvalCreditMultiplier: number;
}

// ============================================================================
// GENERATED FILE DETECTOR
// ============================================================================

/**
 * Detects and filters linguist-generated files from diff calculations.
 */
export class GeneratedFileDetector {
  private config: ReviewIncentiveConfig;

  constructor(config: ReviewIncentiveConfig) {
    this.config = config;
  }

  /**
   * Check if a file should be excluded as generated.
   * Uses multiple heuristics: patterns, extensions, and path conventions.
   * 
   * @param filename - File path relative to repo root
   * @returns True if file should be excluded from incentive calculations
   */
  isGenerated(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();

    // Check explicit patterns
    for (const pattern of this.config.generatedFilePatterns) {
      if (pattern.test(filename)) return true;
    }

    // Check extensions
    const ext = lowerFilename.split(".").pop() || "";
    if (this.config.generatedExtensions.includes(ext)) return true;

    // Common generated file conventions
    const generatedIndicators = [
      /\.min\.(js|css|map)$/i,
      /\.bundle\.(js|css)$/i,
      /\.generated\./i,
      /\.g\.ts$/i,           // protobuf generated
      /\.pb\.go$/i,          // protobuf go
      /package-lock\.json$/i,
      /yarn\.lock$/i,
      /pnpm-lock\.yaml$/i,
      /\.snap$/i,            // jest snapshots
      /dist\//i,
      /build\//i,
      /\.next\//i,
      /coverage\//i,
      /\.nyc_output\//i,
      /vendor\//i,
      /node_modules\//i,
      /\.svg$/i,             // often auto-generated icons
      /\.woff2?$/i,          // font files
      /\.eot$/i,
      /\.ttf$/i,
      /\.png$/i,             // binary assets
      /\.jpg$/i,
      /\.jpeg$/i,
      /\.gif$/i,
      /\.ico$/i,
      /openapi\.json$/i,     // generated API specs
      /swagger\.json$/i,
    ];

    for (const indicator of generatedIndicators) {
      if (indicator.test(filename)) return true;
    }

    return false;
  }

  /**
   * Filter diff files to exclude generated ones.
   * 
   * @param files - All files in the PR diff
   * @returns Filtered files and exclusion metadata
   */
  filterDiffFiles(files: DiffFile[]): {
    filtered: DiffFile[];
    excluded: DiffFile[];
    stats: ValidatedLineStats;
  } {
    const filtered: DiffFile[] = [];
    const excluded: DiffFile[] = [];
    let rawAdditions = 0;
    let rawDeletions = 0;
    let filteredAdditions = 0;
    let filteredDeletions = 0;

    for (const file of files) {
      rawAdditions += file.additions;
      rawDeletions += file.deletions;

      if (this.isGenerated(file.filename)) {
        excluded.push({ ...file, isGenerated: true });
      } else {
        filtered.push({ ...file, isGenerated: false });
        filteredAdditions += file.additions;
        filteredDeletions += file.deletions;
      }
    }

    const netLinesChanged = filteredAdditions + filteredDeletions;
    const rawTotal = rawAdditions + rawDeletions;
    const discrepancyRatio = rawTotal > 0 ? rawTotal / Math.max(netLinesChanged, 1) : 1;

    return {
      filtered,
      excluded,
      stats: {
        rawAdditions,
        rawDeletions,
        filteredAdditions,
        filteredDeletions,
        netLinesChanged,
        generatedFilesExcluded: excluded.length,
        excludedFiles: excluded.map(f => f.filename),
        discrepancyRatio,
      },
    };
  }
}

// ============================================================================
// REVIEW DEDUPLICATOR
// ============================================================================

/**
 * Handles deduplication of back-to-back reviews and merge credit prevention.
 */
export class ReviewDeduplicator {
  private config: ReviewIncentiveConfig;

  constructor(config: ReviewIncentiveConfig) {
    this.config = config;
  }

  /**
   * Process review events to identify valid, non-duplicate reviews.
   * 
   * @param reviews - All review events for a PR sorted chronologically
   * @param mergeCommitAuthor - Username who merged the PR (if applicable)
   * @returns Deduplicated review set with metadata
   */
  deduplicateReviews(
    reviews: ReviewEvent[],
    mergeCommitAuthor?: string
  ): {
    validReviews: ReviewEvent[];
    deduplicatedCount: number;
    mergeCreditsRemoved: number;
    perReviewer: Map<string, { valid: number; deduplicated: number; mergeRemoved: boolean }>;
  } {
    const validReviews: ReviewEvent[] = [];
    let deduplicatedCount = 0;
    let mergeCreditsRemoved = 0;
    const perReviewer = new Map<string, { valid: number; deduplicated: number; mergeRemoved: boolean }>();

    // Sort by submission time
    const sorted = [...reviews].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    // Track last review per user for deduplication
    const lastReviewByUser = new Map<string, ReviewEvent>();

    for (let i = 0; i < sorted.length; i++) {
      const review = sorted[i];
      const key = review.reviewer.toLowerCase();
      const lastReview = lastReviewByUser.get(key);

      // Initialize per-reviewer tracking
      if (!perReviewer.has(key)) {
        perReviewer.set(key, { valid: 0, deduplicated: 0, mergeRemoved: false });
      }
      const tracker = perReviewer.get(key)!;

      // Check 1: Is this a merge commit credit that should be excluded?
      if (this.config.excludeMergeCommits && 
          mergeCommitAuthor && 
          review.reviewer.toLowerCase() === mergeCommitAuthor.toLowerCase() &&
          review.isPreMergeApproval) {
        mergeCreditsRemoved++;
        tracker.mergeRemoved = true;
        continue;
      }

      // Check 2: Is this a duplicate within the deduplication window?
      if (lastReview) {
        const timeDiff = review.submittedAt.getTime() - lastReview.submittedAt.getTime();
        
        if (timeDiff < this.config.reviewDeduplicationWindowMs) {
          // Within dedup window - keep the more significant review
          const currentIsApproval = review.state === "approved" || review.state === "changes_requested";
          const lastIsApproval = lastReview.state === "approved" || lastReview.state === "changes_requested";

          if (currentIsApproval && !lastIsApproval) {
            // Replace comment-only with approval
            const idx = validReviews.indexOf(lastReview);
            if (idx >= 0) {
              validReviews[idx] = review;
              tracker.deduplicated++;
              deduplicatedCount++;
            }
          } else if (!currentIsApproval && lastIsApproval) {
            // Keep the approval, skip this comment
            tracker.deduplicated++;
            deduplicatedCount++;
            continue;
          } else {
            // Same type - keep the later one
            const idx = validReviews.indexOf(lastReview);
            if (idx >= 0) {
              validReviews[idx] = review;
            }
            tracker.deduplicated++;
            deduplicatedCount++;
          }
        } else {
          // Outside dedup window - both count
          validReviews.push(review);
          tracker.valid++;
        }
      } else {
        // First review from this user
        validReviews.push(review);
        tracker.valid++;
      }

      lastReviewByUser.set(key, review);
    }

    return {
      validReviews,
      deduplicatedCount,
      mergeCreditsRemoved,
      perReviewer,
    };
  }
}

// ============================================================================
// INCENTIVE CALCULATOR
// ============================================================================

/**
 * Calculates corrected review incentives with all validations applied.
 */
export class ReviewIncentiveCalculator {
  private config: ReviewIncentiveConfig;
  private fileDetector: GeneratedFileDetector;
  private deduplicator: ReviewDeduplicator;

  constructor(config: ReviewIncentiveConfig) {
    this.config = config;
    this.fileDetector = new GeneratedFileDetector(config);
    this.deduplicator = new ReviewDeduplicator(config);
  }

  /**
   * Calculate corrected incentives for all reviewers on a PR.
   * 
   * @param params - Calculation parameters
   * @returns Per-reviewer results with adjustments
   */
  calculate(params: {
    prNumber: number;
    repo: string;
    diffFiles: DiffFile[];
    reviews: ReviewEvent[];
    mergeCommitAuthor?: string;
    baseRewardPerLine: bigint; // Reward rate per line reviewed
  }): {
    validatedStats: ValidatedLineStats;
    reviewerResults: ReviewerIncentiveResult[];
    totalOriginalReward: bigint;
    totalCorrectedReward: bigint;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Step 1: Filter generated files
    const { filtered, excluded, stats } = this.fileDetector.filterDiffFiles(params.diffFiles);

    if (stats.discrepancyRatio > this.config.maxDiscrepancyRatio) {
      warnings.push(
        `High discrepancy detected: raw ${stats.rawAdditions + stats.rawDeletions} lines vs ` +
        `filtered ${stats.netLinesChanged} lines (${stats.discrepancyRatio.toFixed(1)}x difference). ` +
        `${stats.generatedFilesExcluded} generated files excluded.`
      );
    }

    // Step 2: Deduplicate reviews
    const { validReviews, deduplicatedCount, mergeCreditsRemoved, perReviewer } = 
      this.deduplicator.deduplicateReviews(params.reviews, params.mergeCommitAuthor);

    if (deduplicatedCount > 0) {
      warnings.push(`${deduplicatedCount} duplicate reviews removed from incentive calculation.`);
    }
    if (mergeCreditsRemoved > 0) {
      warnings.push(`${mergeCreditsRemoved} merge commit credits removed (merging ≠ reviewing).`);
    }

    // Step 3: Calculate per-reviewer rewards
    const reviewerResults: ReviewerIncentiveResult[] = [];
    let totalOriginalReward = 0n;
    let totalCorrectedReward = 0n;

    // Group valid reviews by reviewer
    const reviewsByUser = new Map<string, ReviewEvent[]>();
    for (const review of validReviews) {
      const key = review.reviewer.toLowerCase();
      if (!reviewsByUser.has(key)) reviewsByUser.set(key, []);
      reviewsByUser.get(key)!.push(review);
    }

    for (const [username, userReviews] of reviewsByUser) {
      const tracker = perReviewer.get(username)!;
      const adjustmentReasons: string[] = [];

      // Original reward was based on raw stats and all reviews
      const originalLineBase = BigInt(stats.rawAdditions + stats.rawDeletions);
      const originalReward = originalLineBase * params.baseRewardPerLine;

      // Corrected reward uses filtered stats and valid review count
      const correctedLineBase = BigInt(stats.netLinesChanged);
      
      // Apply approval multiplier if configured
      let effectiveMultiplier = 100; // percentage
      if (!this.config.approvalOnlyGetsFullCredit) {
        const hasApproval = userReviews.some(r => r.state === "approved");
        const hasComments = userReviews.some(r => r.commentCount > 0 || r.body.length > 0);
        
        if (hasApproval && !hasComments) {
          // Approval-only gets reduced credit
          effectiveMultiplier = Math.round(this.config.approvalCreditMultiplier * 100);
          adjustmentReasons.push(`Approval-only review: ${effectiveMultiplier}% credit`);
        }
      }

      const correctedReward = (correctedLineBase * params.baseRewardPerLine * BigInt(effectiveMultiplier)) / 100n;
      const adjustment = correctedReward - originalReward;

      if (stats.generatedFilesExcluded > 0) {
        adjustmentReasons.push(`${stats.generatedFilesExcluded} generated files excluded from line count`);
      }
      if (tracker.deduplicated > 0) {
        adjustmentReasons.push(`${tracker.deduplicated} duplicate reviews removed`);
      }
      if (tracker.mergeRemoved) {
        adjustmentReasons.push("Merge commit credit removed");
      }

      reviewerResults.push({
        username,
        originalReward,
        correctedReward,
        adjustment,
        adjustmentReasons,
        validReviewCount: tracker.valid,
        deduplicatedReviews: tracker.deduplicated,
        mergeCreditRemoved: tracker.mergeRemoved,
      });

      totalOriginalReward += originalReward;
      totalCorrectedReward += correctedReward;
    }

    return {
      validatedStats: stats,
      reviewerResults,
      totalOriginalReward,
      totalCorrectedReward,
      warnings,
    };
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_REVIEW_INCENTIVE_CONFIG: ReviewIncentiveConfig = {
  generatedFilePatterns: [
    /\.min\.(js|css|map)$/i,
    /\.bundle\.(js|css)$/i,
    /\.generated\./i,
    /dist\//i,
    /build\//i,
    /\.next\//i,
    /coverage\//i,
    /vendor\//i,
    /node_modules\//i,
  ],
  generatedExtensions: ["lock", "snap", "woff", "woff2", "eot", "ttf", "png", "jpg", "jpeg", "gif", "ico"],
  excludeMergeCommits: true,
  reviewDeduplicationWindowMs: 60000, // 1 minute
  maxDiscrepancyRatio: 2.0,
  approvalOnlyGetsFullCredit: false,
  approvalCreditMultiplier: 0.5, // Approval-only gets 50% credit
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for review reward pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Fix review incentive calculations.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#260
 */

import { 
  ReviewIncentiveCalculator, 
  DEFAULT_REVIEW_INCENTIVE_CONFIG,
  DiffFile,
  ReviewEvent
} from "./review-incentive-double-check";

const calculator = new ReviewIncentiveCalculator(DEFAULT_REVIEW_INCENTIVE_CONFIG);

/**
 * FIXED: Calculate review rewards with proper filtering and deduplication.
 * Replaces naive line-count-based calculation.
 */
export async function calculateReviewRewardsFixed(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  baseRewardPerLine: bigint
): Promise<{
  rewards: Map<string, bigint>;
  auditLog: string;
}> {
  // Fetch PR files
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 100,
  });

  const diffFiles: DiffFile[] = files.map(f => ({
    filename: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    status: f.status as any,
    isGenerated: false,
  }));

  // Fetch reviews
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner, repo, pull_number: prNumber, per_page: 100,
  });

  const reviewEvents: ReviewEvent[] = reviews.map(r => ({
    id: r.id,
    reviewer: r.user?.login || "unknown",
    state: r.state.toLowerCase() as any,
    submittedAt: new Date(r.submitted_at || ""),
    body: r.body || "",
    commentCount: 0, // Would need separate API call for inline comments
    hasSubsequentReview: false,
    isPreMergeApproval: false,
  }));

  // Get merge commit author if PR is merged
  let mergeCommitAuthor: string | undefined;
  const { data: pr } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
  });
  if (pr.merged && pr.merged_by) {
    mergeCommitAuthor = pr.merged_by.login;
  }

  // Calculate corrected rewards
  const result = calculator.calculate({
    prNumber,
    repo: \`\${owner}/\${repo}\`,
    diffFiles,
    reviews: reviewEvents,
    mergeCommitAuthor,
    baseRewardPerLine,
  });

  // Build rewards map
  const rewards = new Map<string, bigint>();
  for (const r of result.reviewerResults) {
    if (r.correctedReward > 0n) {
      rewards.set(r.username, r.correctedReward);
    }
  }

  // Build audit log
  const auditLines = [
    \`PR #\${prNumber} Review Incentive Audit\`,
    \`Raw lines: +\${result.validatedStats.rawAdditions}/-\${result.validatedStats.rawDeletions}\`,
    \`Filtered lines: +\${result.validatedStats.filteredAdditions}/-\${result.validatedStats.filteredDeletions}\`,
    \`Generated files excluded: \${result.validatedStats.generatedFilesExcluded}\`,
    \`Total original reward: \${result.totalOriginalReward}\`,
    \`Total corrected reward: \${result.totalCorrectedReward}\`,
    \`Warnings: \${result.warnings.length}\`,
    ...result.warnings.map(w => \`  - \${w}\`),
  ];

  return { rewards, auditLog: auditLines.join("\\n") };
}
`;
}

/**
 * Format correction disclosure for GitHub comments.
 */
export function formatCorrectionComment(result: {
  validatedStats: ValidatedLineStats;
  reviewerResults: ReviewerIncentiveResult[];
  warnings: string[];
}): string {
  const lines: string[] = [
    `### 🔍 Review Incentive Correction Applied`,
    ``,
    `| Metric | Original | Corrected |`,
    `|--------|----------|-----------|`,
    `| **Additions** | +${result.validatedStats.rawAdditions} | +${result.validatedStats.filteredAdditions} |`,
    `| **Deletions** | -${result.validatedStats.rawDeletions} | -${result.validatedStats.filteredDeletions} |`,
    `| **Generated Files Excluded** | — | ${result.validatedStats.generatedFilesExcluded} |`,
    ``,
  ];

  if (result.reviewerResults.some(r => r.adjustment !== 0n)) {
    lines.push(`#### Reviewer Adjustments`);
    lines.push(`| Reviewer | Original | Corrected | Change | Reason |`);
    lines.push(`|----------|----------|-----------|--------|--------|`);
    
    for (const r of result.reviewerResults) {
      if (r.adjustment === 0n) continue;
      const sign = r.adjustment >= 0n ? "+" : "";
      lines.push(`| @${r.username} | ${formatWei(r.originalReward)} | ${formatWei(r.correctedReward)} | ${sign}${formatWei(r.adjustment)} | ${r.adjustmentReasons.join("; ")} |`);
    }
    lines.push(``);
  }

  if (result.warnings.length > 0) {
    lines.push(`#### ⚠️ Warnings`);
    for (const w of result.warnings) {
      lines.push(`- ${w}`);
    }
  }

  return lines.join("\n");
}

function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 4)}\`;
}
