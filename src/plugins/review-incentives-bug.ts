/**
 * @file review-incentives-bug.ts
 * @description Scaffolding and generator utilities for fixing the review incentives
 * bug where incorrect parent commits cause inflated diff statistics. Ensures
 * accurate line change calculation by validating commit ancestry.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#289
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Commit ancestry validator detecting incorrect parent references
 * - Diff statistics recalculation using correct base commits
 * - GitHub API commit graph traversal utilities
 * - Review reward adjustment logic for corrected diffs
 * - Audit logging for diff corrections
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a commit with its parent relationships.
 */
export interface CommitInfo {
  sha: string;
  parents: Array<{ sha: string }>;
  author: { login: string; date: string };
  message: string;
}

/**
 * Diff statistics for a pull request.
 */
export interface DiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
  baseCommit: string;
  headCommit: string;
  isCorrected: boolean;
  originalAdditions?: number;
  originalDeletions?: number;
  correctionReason?: string;
}

/**
 * Result of validating PR diff accuracy.
 */
export interface DiffValidationResult {
  prNumber: number;
  repo: string;
  reportedStats: DiffStats;
  validatedStats: DiffStats;
  requiresCorrection: boolean;
  correctionDetails?: {
    originalBase: string;
    correctedBase: string;
    reason: string;
  };
  affectedReviewers: Array<{
    username: string;
    originalReward: bigint;
    correctedReward: bigint;
    adjustment: bigint;
  }>;
}

/**
 * Configuration for diff validation.
 */
export interface DiffValidationConfig {
  /** Whether to automatically correct rewards when diff errors are found */
  autoCorrectRewards: boolean;
  /** Maximum allowed discrepancy ratio before flagging (e.g., 2.0 = 2x difference) */
  maxDiscrepancyRatio: number;
  /** Whether to log all validations regardless of outcome */
  enableAuditLogging: boolean;
  /** Cache TTL for commit lookups in milliseconds */
  commitCacheTtlMs: number;
}

// ============================================================================
// COMMIT ANCESTRY VALIDATOR
// ============================================================================

/**
 * Validates commit parent relationships to detect API inconsistencies.
 */
export class CommitAncestryValidator {
  private cache: Map<string, CommitInfo> = new Map();
  private config: DiffValidationConfig;

  constructor(config: DiffValidationConfig) {
    this.config = config;
  }

  /**
   * Fetch commit info with caching.
   */
  async getCommit(
    octokit: any,
    owner: string,
    repo: string,
    sha: string
  ): Promise<CommitInfo | null> {
    const cacheKey = `${owner}/${repo}:${sha}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) return cached;

    try {
      const { data } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: sha,
      });

      const info: CommitInfo = {
        sha: data.sha,
        parents: data.parents || [],
        author: {
          login: data.author?.login || "unknown",
          date: data.commit.author.date,
        },
        message: data.commit.message,
      };

      this.cache.set(cacheKey, info);
      return info;
    } catch (error) {
      console.error(`Failed to fetch commit ${sha}:`, error);
      return null;
    }
  }

  /**
   * Validate that a PR's reported base commit is actually an ancestor of the head.
   * Detects cases where GitHub API returns incorrect parent references.
   * 
   * @param octokit - Authenticated Octokit instance
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Validation result with corrected stats if needed
   */
  async validatePrDiff(
    octokit: any,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<DiffValidationResult> {
    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const headSha = pr.head.sha;
    const reportedBaseSha = pr.base.sha;

    // Get reported diff stats
    const reportedStats: DiffStats = {
      additions: pr.additions,
      deletions: pr.deletions,
      filesChanged: pr.changed_files,
      baseCommit: reportedBaseSha,
      headCommit: headSha,
      isCorrected: false,
    };

    // Validate parent chain from head commit
    const headCommit = await this.getCommit(octokit, owner, repo, headSha);
    
    if (!headCommit) {
      return {
        prNumber,
        repo: `${owner}/${repo}`,
        reportedStats,
        validatedStats: reportedStats,
        requiresCorrection: false,
      };
    }

    // Check if reported base is in the parent chain
    const isInParentChain = await this.isAncestor(
      octokit, owner, repo, reportedBaseSha, headSha
    );

    if (isInParentChain) {
      // Reported base is valid
      return {
        prNumber,
        repo: `${owner}/${repo}`,
        reportedStats,
        validatedStats: reportedStats,
        requiresCorrection: false,
      };
    }

    // Find the actual merge base
    const actualBase = await this.findMergeBase(
      octokit, owner, repo, reportedBaseSha, headSha
    );

    if (!actualBase || actualBase === reportedBaseSha) {
      // Could not find better base or it matches reported
      return {
        prNumber,
        repo: `${owner}/${repo}`,
        reportedStats,
        validatedStats: reportedStats,
        requiresCorrection: false,
      };
    }

    // Recalculate diff with correct base
    const correctedStats = await this.calculateDiff(
      octokit, owner, repo, actualBase, headSha
    );

    correctedStats.isCorrected = true;
    correctedStats.originalAdditions = reportedStats.additions;
    correctedStats.originalDeletions = reportedStats.deletions;
    correctedStats.correctionReason = `API returned incorrect parent; using merge-base ${actualBase.slice(0, 7)} instead of ${reportedBaseSha.slice(0, 7)}`;

    // Calculate reward adjustments for reviewers
    const affectedReviewers = await this.calculateReviewerAdjustments(
      octokit, owner, repo, prNumber, reportedStats, correctedStats
    );

    return {
      prNumber,
      repo: `${owner}/${repo}`,
      reportedStats,
      validatedStats: correctedStats,
      requiresCorrection: true,
      correctionDetails: {
        originalBase: reportedBaseSha,
        correctedBase: actualBase,
        reason: correctedStats.correctionReason!,
      },
      affectedReviewers,
    };
  }

  /**
   * Check if ancestorSha is an ancestor of descendantSha.
   */
  private async isAncestor(
    octokit: any,
    owner: string,
    repo: string,
    ancestorSha: string,
    descendantSha: string,
    maxDepth: number = 100
  ): Promise<boolean> {
    let current = descendantSha;
    const visited = new Set<string>();

    for (let i = 0; i < maxDepth; i++) {
      if (current === ancestorSha) return true;
      if (visited.has(current)) break;
      visited.add(current);

      const commit = await this.getCommit(octokit, owner, repo, current);
      if (!commit || commit.parents.length === 0) break;

      // Follow first parent (mainline)
      current = commit.parents[0].sha;
    }

    return false;
  }

  /**
   * Find the merge base between two commits.
   */
  private async findMergeBase(
    octokit: any,
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string
  ): Promise<string | null> {
    try {
      const { data } = await octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: baseSha,
        head: headSha,
      });

      return data.merge_base_commit?.sha || null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate accurate diff statistics between two commits.
   */
  private async calculateDiff(
    octokit: any,
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string
  ): Promise<DiffStats> {
    const { data } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseSha,
      head: headSha,
    });

    let additions = 0;
    let deletions = 0;

    for (const file of data.files || []) {
      additions += file.additions || 0;
      deletions += file.deletions || 0;
    }

    return {
      additions,
      deletions,
      filesChanged: data.files?.length || 0,
      baseCommit: baseSha,
      headCommit: headSha,
      isCorrected: true,
    };
  }

  /**
   * Calculate reward adjustments for reviewers based on corrected diff.
   */
  private async calculateReviewerAdjustments(
    octokit: any,
    owner: string,
    repo: string,
    prNumber: number,
    originalStats: DiffStats,
    correctedStats: DiffStats
  ): Promise<DiffValidationResult["affectedReviewers"]> {
    const adjustments: DiffValidationResult["affectedReviewers"] = [];

    // Get reviews for this PR
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    // Get unique reviewers
    const reviewerSet = new Set(reviews.map(r => r.user?.login).filter(Boolean));

    for (const username of reviewerSet) {
      // Original reward was based on inflated stats
      const originalTotalChanges = originalStats.additions + originalStats.deletions;
      const correctedTotalChanges = correctedStats.additions + correctedStats.deletions;

      // Simple proportional adjustment (actual formula may be more complex)
      const ratio = correctedTotalChanges > 0 
        ? correctedTotalChanges / originalTotalChanges 
        : 0;

      // Placeholder amounts - actual implementation would query reward history
      const originalReward = BigInt(Math.round(originalTotalChanges * 0.04)); // Example rate
      const correctedReward = BigInt(Math.round(correctedTotalChanges * 0.04));

      if (originalReward !== correctedReward) {
        adjustments.push({
          username: username!,
          originalReward,
          correctedReward,
          adjustment: correctedReward - originalReward,
        });
      }
    }

    return adjustments;
  }

  /**
   * Clear the commit cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_DIFF_VALIDATION_CONFIG: DiffValidationConfig = {
  autoCorrectRewards: false, // Require manual approval for corrections
  maxDiscrepancyRatio: 3.0, // Flag if diff is 3x larger than expected
  enableAuditLogging: true,
  commitCacheTtlMs: 300000, // 5 minutes
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for review reward pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Validate PR diffs before calculating review rewards.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#289
 */

import { CommitAncestryValidator, DEFAULT_DIFF_VALIDATION_CONFIG } from "./review-incentives-bug";

const validator = new CommitAncestryValidator(DEFAULT_DIFF_VALIDATION_CONFIG);

/**
 * Validate and potentially correct review rewards before distribution.
 */
export async function validateReviewRewards(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  isValid: boolean;
  correctionApplied: boolean;
  adjustedRewards?: Map<string, bigint>;
  auditLog?: string;
}> {
  const result = await validator.validatePrDiff(octokit, owner, repo, prNumber);

  if (!result.requiresCorrection) {
    return { isValid: true, correctionApplied: false };
  }

  // Log the correction
  const auditLog = [
    \`PR #\${prNumber}: Diff correction required\`,
    \`  Original base: \${result.correctionDetails?.originalBase.slice(0, 7)}\`,
    \`  Corrected base: \${result.correctionDetails?.correctedBase.slice(0, 7)}\`,
    \`  Reason: \${result.correctionDetails?.reason}\`,
    \`  Original: +\${result.reportedStats.additions}/-\${result.reportedStats.deletions}\`,
    \`  Corrected: +\${result.validatedStats.additions}/-\${result.validatedStats.deletions}\`,
  ].join("\\n");

  console.warn(auditLog);

  if (!DEFAULT_DIFF_VALIDATION_CONFIG.autoCorrectRewards) {
    return { 
      isValid: false, 
      correctionApplied: false,
      auditLog,
    };
  }

  // Apply corrections
  const adjustedRewards = new Map<string, bigint>();
  for (const reviewer of result.affectedReviewers) {
    adjustedRewards.set(reviewer.username, reviewer.correctedReward);
  }

  return {
    isValid: true,
    correctionApplied: true,
    adjustedRewards,
    auditLog,
  };
}
`;
}

/**
 * Format diff correction disclosure for GitHub comments.
 */
export function formatCorrectionComment(result: DiffValidationResult): string {
  if (!result.requiresCorrection) return "";

  const lines: string[] = [
    `### ⚠️ Review Reward Adjustment`,
    ``,
    `The diff statistics for this PR were corrected due to an API inconsistency:`,
    ``,
    `| Metric | Original | Corrected |`,
    `|--------|----------|-----------|`,
    `| **Base Commit** | \`${result.correctionDetails?.originalBase.slice(0, 7)}\` | \`${result.correctionDetails?.correctedBase.slice(0, 7)}\` |`,
    `| **Additions** | +${result.reportedStats.additions} | +${result.validatedStats.additions} |`,
    `| **Deletions** | -${result.reportedStats.deletions} | -${result.validatedStats.deletions} |`,
    ``,
  ];

  if (result.affectedReviewers.length > 0) {
    lines.push(`#### Affected Review Rewards`);
    lines.push(`| Reviewer | Original | Adjusted | Change |`);
    lines.push(`|----------|----------|----------|--------|`);
    
    for (const r of result.affectedReviewers) {
      const changeSign = r.adjustment >= 0n ? "+" : "";
      lines.push(`| @${r.username} | ${formatWei(r.originalReward)} | ${formatWei(r.correctedReward)} | ${changeSign}${formatWei(r.adjustment)} |`);
    }
  }

  lines.push(``);
  lines.push(`*This adjustment ensures rewards accurately reflect the actual code changes reviewed.*`);

  return lines.join("\n");
}

function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 4)}\`;
}
