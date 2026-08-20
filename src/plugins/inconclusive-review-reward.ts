/**
 * @file inconclusive-review-reward.ts
 * @description Scaffolding and generator utilities for fixing code review rewards
 * on inconclusive reviews. Ensures rewards are only granted when a review has
 * a definitive state (approved or changes_requested), not merely commented.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#366
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Review state classifier distinguishing conclusive vs inconclusive reviews
 * - Reward eligibility validator for code review contributions
 * - GitHub review event parser with state normalization
 * - Integration patch for reward calculation pipeline
 * - Audit logging for blocked inconclusive review rewards
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Normalized review states from GitHub API.
 */
export enum ReviewState {
  APPROVED = "approved",
  CHANGES_REQUESTED = "changes_requested",
  COMMENTED = "commented",
  DISMISSED = "dismissed",
  PENDING = "pending",
}

/**
 * Classification of review conclusiveness for reward purposes.
 */
export enum ReviewConclusiveness {
  /** Review has definitive approval or rejection - eligible for reward */
  CONCLUSIVE = "conclusive",
  /** Review is only a comment without approval/rejection - NOT eligible */
  INCONCLUSIVE = "inconclusive",
  /** Review was dismissed or superseded - NOT eligible */
  INVALIDATED = "invalidated",
}

/**
 * Represents a parsed GitHub pull request review event.
 */
export interface PullRequestReview {
  /** Review ID from GitHub API */
  id: number;
  /** Reviewer's GitHub username */
  reviewer: string;
  /** Current state of the review */
  state: ReviewState;
  /** Whether this review is conclusive for reward purposes */
  conclusiveness: ReviewConclusiveness;
  /** Timestamp of the review submission */
  submittedAt: Date;
  /** PR number being reviewed */
  prNumber: number;
  /** Repository owner/name */
  repo: string;
  /** Number of inline comments attached to this review */
  commentCount: number;
  /** Whether this review was later dismissed by another review */
  wasSuperseded: boolean;
  /** Body text of the review (if any) */
  body?: string;
}

/**
 * Result of reviewing reward eligibility for a code review.
 */
export interface ReviewRewardEligibility {
  /** Whether the review qualifies for a reward */
  eligible: boolean;
  /** Reviewer username */
  reviewer: string;
  /** Review state that determined eligibility */
  reviewState: ReviewState;
  /** Conclusiveness classification */
  conclusiveness: ReviewConclusiveness;
  /** Reason for eligibility decision */
  reason: string;
  /** Calculated reward amount (0 if not eligible) */
  rewardAmount: bigint;
  /** Original proposed reward before validation */
  proposedAmount: bigint;
}

/**
 * Configuration for review reward validation.
 */
export interface ReviewRewardConfig {
  /** Whether to block rewards for inconclusive reviews */
  blockInconclusiveReviews: boolean;
  /** Whether to block rewards for dismissed reviews */
  blockDismissedReviews: boolean;
  /** Minimum comment count for commented reviews to be considered conclusive (0 = never) */
  minCommentsForConclusive: number;
  /** Whether to log all eligibility decisions */
  enableAuditLogging: boolean;
  /** Base reward amount for valid code reviews in wei */
  baseReviewReward: bigint;
  /** Bonus multiplier for approved reviews vs changes_requested */
  approvalBonusMultiplier: number;
}

/**
 * Audit entry for review reward decisions.
 */
export interface ReviewRewardAuditEntry {
  timestamp: Date;
  reviewer: string;
  prNumber: number;
  repo: string;
  reviewState: ReviewState;
  conclusiveness: ReviewConclusiveness;
  eligible: boolean;
  proposedAmount: bigint;
  finalAmount: bigint;
  reason: string;
}

// ============================================================================
// REVIEW STATE CLASSIFIER
// ============================================================================

/**
 * Classifies GitHub review states into conclusiveness categories.
 * Core logic for determining reward eligibility.
 */
export class ReviewStateClassifier {
  private config: ReviewRewardConfig;

  constructor(config: ReviewRewardConfig) {
    this.config = config;
  }

  /**
   * Classify a review state as conclusive, inconclusive, or invalidated.
   * 
   * @param state - The GitHub review state
   * @param commentCount - Number of inline comments in the review
   * @param wasSuperseded - Whether a later review replaced this one
   * @returns Conclusiveness classification
   */
  classify(
    state: ReviewState,
    commentCount: number = 0,
    wasSuperseded: boolean = false
  ): ReviewConclusiveness {
    // Dismissed or superseded reviews are always invalidated
    if (wasSuperseded || state === ReviewState.DISMISSED) {
      return ReviewConclusiveness.INVALIDATED;
    }

    // Pending reviews are not yet actionable
    if (state === ReviewState.PENDING) {
      return ReviewConclusiveness.INCONCLUSIVE;
    }

    // Approved and changes_requested are always conclusive
    if (state === ReviewState.APPROVED || state === ReviewState.CHANGES_REQUESTED) {
      return ReviewConclusiveness.CONCLUSIVE;
    }

    // Commented reviews depend on configuration
    if (state === ReviewState.COMMENTED) {
      if (this.config.minCommentsForConclusive > 0 && 
          commentCount >= this.config.minCommentsForConclusive) {
        return ReviewConclusiveness.CONCLUSIVE;
      }
      return ReviewConclusiveness.INCONCLUSIVE;
    }

    // Unknown states default to inconclusive for safety
    return ReviewConclusiveness.INCONCLUSIVE;
  }

  /**
   * Parse raw GitHub API review state string to enum.
   * Handles case variations and aliases.
   */
  static parseState(raw: string): ReviewState {
    const normalized = raw.toLowerCase().trim();
    
    switch (normalized) {
      case "approved": return ReviewState.APPROVED;
      case "changes_requested": return ReviewState.CHANGES_REQUESTED;
      case "commented": return ReviewState.COMMENTED;
      case "dismissed": return ReviewState.DISMISSED;
      case "pending": return ReviewState.PENDING;
      default:
        console.warn(`Unknown review state: ${raw}, defaulting to COMMENTED`);
        return ReviewState.COMMENTED;
    }
  }
}

// ============================================================================
// REWARD ELIGIBILITY VALIDATOR
// ============================================================================

/**
 * Validates whether a code review qualifies for a reward.
 * Implements the fix for inconclusive review reward bug.
 */
export class ReviewRewardValidator {
  private config: ReviewRewardConfig;
  private classifier: ReviewStateClassifier;
  private auditLog: ReviewRewardAuditEntry[] = [];

  constructor(config: ReviewRewardConfig) {
    this.config = config;
    this.classifier = new ReviewStateClassifier(config);
  }

  /**
   * Validate reward eligibility for a single review.
   * 
   * @param review - The review to validate
   * @param proposedAmount - Originally calculated reward amount
   * @returns Eligibility result with adjusted reward
   */
  validate(review: PullRequestReview, proposedAmount: bigint): ReviewRewardEligibility {
    const conclusiveness = this.classifier.classify(
      review.state,
      review.commentCount,
      review.wasSuperseded
    );

    let eligible = true;
    let reason = "";
    let rewardAmount = proposedAmount;

    // Check conclusiveness
    if (conclusiveness === ReviewConclusiveness.INCONCLUSIVE && this.config.blockInconclusiveReviews) {
      eligible = false;
      reason = `Review state "${review.state}" is inconclusive. Only approved or changes_requested reviews qualify for rewards.`;
      rewardAmount = 0n;
    } else if (conclusiveness === ReviewConclusiveness.INVALIDATED && this.config.blockDismissedReviews) {
      eligible = false;
      reason = `Review was ${review.wasSuperseded ? "superseded by a later review" : "dismissed"}. Invalidated reviews do not qualify.`;
      rewardAmount = 0n;
    } else if (eligible) {
      // Apply bonus for approved reviews if configured
      if (review.state === ReviewState.APPROVED && this.config.approvalBonusMultiplier > 1) {
        rewardAmount = (proposedAmount * BigInt(Math.round(this.config.approvalBonusMultiplier * 100))) / 100n;
        reason = `Approved review with ${(this.config.approvalBonusMultiplier - 1) * 100}% bonus applied`;
      } else {
        reason = `Valid ${review.state} review qualifies for reward`;
      }
    }

    const result: ReviewRewardEligibility = {
      eligible,
      reviewer: review.reviewer,
      reviewState: review.state,
      conclusiveness,
      reason,
      rewardAmount,
      proposedAmount,
    };

    // Log decision
    if (this.config.enableAuditLogging) {
      this.auditLog.push({
        timestamp: new Date(),
        reviewer: review.reviewer,
        prNumber: review.prNumber,
        repo: review.repo,
        reviewState: review.state,
        conclusiveness,
        eligible,
        proposedAmount,
        finalAmount: rewardAmount,
        reason,
      });
    }

    return result;
  }

  /**
   * Validate multiple reviews and return filtered eligible rewards.
   * 
   * @param reviews - Array of reviews to validate
   * @param proposedRewards - Map of reviewer -> proposed amount
   * @returns Map of eligible reviewers to their validated reward amounts
   */
  validateBatch(
    reviews: PullRequestReview[],
    proposedRewards: Map<string, bigint>
  ): { eligibleRewards: Map<string, bigint>; results: ReviewRewardEligibility[] } {
    const eligibleRewards = new Map<string, bigint>();
    const results: ReviewRewardEligibility[] = [];

    // Index reviews by reviewer (use most recent per reviewer)
    const latestReviewByUser = new Map<string, PullRequestReview>();
    for (const review of reviews) {
      const existing = latestReviewByUser.get(review.reviewer);
      if (!existing || review.submittedAt > existing.submittedAt) {
        latestReviewByUser.set(review.reviewer, review);
      }
    }

    // Validate each reviewer's latest review
    for (const [reviewer, proposedAmount] of proposedRewards) {
      const review = latestReviewByUser.get(reviewer);
      
      if (!review) {
        // No review found for this user - shouldn't happen but handle gracefully
        results.push({
          eligible: false,
          reviewer,
          reviewState: ReviewState.COMMENTED,
          conclusiveness: ReviewConclusiveness.INCONCLUSIVE,
          reason: "No review event found for this contributor",
          rewardAmount: 0n,
          proposedAmount,
        });
        continue;
      }

      const result = this.validate(review, proposedAmount);
      results.push(result);

      if (result.eligible && result.rewardAmount > 0n) {
        eligibleRewards.set(reviewer, result.rewardAmount);
      }
    }

    return { eligibleRewards, results };
  }

  /**
   * Get accumulated audit log.
   */
  getAuditLog(): ReviewRewardAuditEntry[] {
    return [...this.auditLog];
  }
}

// ============================================================================
// GITHUB REVIEW PARSER
// ============================================================================

/**
 * Parses GitHub API review data into normalized PullRequestReview objects.
 * Handles edge cases like superseded reviews and missing fields.
 */
export class GitHubReviewParser {
  /**
   * Parse a list of reviews from GitHub API response.
   * Detects superseded reviews by tracking state transitions per reviewer.
   * 
   * @param rawReviews - Raw review objects from GitHub API
   * @param prNumber - PR number these reviews belong to
   * @param repo - Repository identifier (owner/name)
   * @returns Parsed and normalized reviews
   */
  parseReviews(
    rawReviews: Array<{
      id: number;
      user: { login: string } | null;
      state: string;
      submitted_at: string | null;
      body?: string | null;
      comments_count?: number;
    }>,
    prNumber: number,
    repo: string
  ): PullRequestReview[] {
    // Sort by submission time ascending
    const sorted = [...rawReviews].sort((a, b) => {
      const timeA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const timeB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return timeA - timeB;
    });

    // Track latest review per user to detect superseded ones
    const latestByUser = new Map<string, number>(); // username -> index in sorted array
    
    for (let i = 0; i < sorted.length; i++) {
      const user = sorted[i].user?.login;
      if (user) {
        latestByUser.set(user.toLowerCase(), i);
      }
    }

    const results: PullRequestReview[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const raw = sorted[i];
      const username = raw.user?.login || "unknown";
      const isLatest = latestByUser.get(username.toLowerCase()) === i;

      results.push({
        id: raw.id,
        reviewer: username,
        state: ReviewStateClassifier.parseState(raw.state),
        conclusiveness: ReviewConclusiveness.INCONCLUSIVE, // Will be set by classifier
        submittedAt: raw.submitted_at ? new Date(raw.submitted_at) : new Date(),
        prNumber,
        repo,
        commentCount: raw.comments_count ?? 0,
        wasSuperseded: !isLatest,
        body: raw.body || undefined,
      });
    }

    return results;
  }

  /**
   * Generate integration code for fetching reviews from GitHub API.
   * 
   * @returns TypeScript code for review fetching
   */
  static generateFetchIntegration(): string {
    return `/**
 * Integration: Fetch and parse PR reviews for reward validation.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#366
 */

import { GitHubReviewParser, ReviewRewardValidator, ReviewRewardConfig } from "./inconclusive-review-reward";

/**
 * Fetch reviews for a PR and validate reward eligibility.
 * Returns only eligible rewards after filtering inconclusive reviews.
 */
export async function fetchAndValidateReviewRewards(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  proposedRewards: Map<string, bigint>
): Promise<{ eligibleRewards: Map<string, bigint>; blockedCount: number }> {
  // Fetch all reviews
  const { data: rawReviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  // Parse and normalize
  const parser = new GitHubReviewParser();
  const reviews = parser.parseReviews(rawReviews, prNumber, \`\${owner}/\${repo}\`);

  // Configure validator
  const config: ReviewRewardConfig = {
    blockInconclusiveReviews: process.env.BLOCK_INCONCLUSIVE_REVIEWS !== "false",
    blockDismissedReviews: process.env.BLOCK_DISMISSED_REVIEWS !== "false",
    minCommentsForConclusive: parseInt(process.env.MIN_COMMENTS_FOR_CONCLUSIVE || "0", 10),
    enableAuditLogging: true,
    baseReviewReward: BigInt(process.env.BASE_REVIEW_REWARD || "0"),
    approvalBonusMultiplier: parseFloat(process.env.APPROVAL_BONUS_MULTIPLIER || "1.0"),
  };

  // Validate
  const validator = new ReviewRewardValidator(config);
  const { eligibleRewards, results } = validator.validateBatch(reviews, proposedRewards);

  const blockedCount = results.filter(r => !r.eligible).length;

  // Log summary
  if (blockedCount > 0) {
    console.log(\`Blocked \${blockedCount} inconclusive/invalid review rewards for PR #\${prNumber}\`);
  }

  return { eligibleRewards, blockedCount };
}
`;
  }
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format validation results as a GitHub comment.
 * Provides transparency about why review rewards were blocked.
 */
export function formatReviewValidationComment(
  results: ReviewRewardEligibility[],
  prNumber: number
): string {
  const eligible = results.filter(r => r.eligible);
  const blocked = results.filter(r => !r.eligible);

  if (blocked.length === 0) {
    return ""; // No comment needed if all passed
  }

  const lines: string[] = [
    `### 🔍 Code Review Reward Validation`,
    ``,
    `**PR:** #${prNumber}`,
    `**Total Reviews Evaluated:** ${results.length}`,
    `**✅ Eligible:** ${eligible.length}`,
    `**❌ Blocked:** ${blocked.length}`,
    ``,
  ];

  if (blocked.length > 0) {
    lines.push(`#### ❌ Blocked Review Rewards`);
    lines.push(`| Reviewer | State | Reason |`);
    lines.push(`|----------|-------|--------|`);
    
    for (const r of blocked) {
      lines.push(`| @${r.reviewer} | ${r.reviewState} | ${r.reason} |`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Only reviews with state \`APPROVED\` or \`CHANGES_REQUESTED\` qualify for rewards. Comment-only reviews are considered inconclusive.*`);

  return lines.join("\n");
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Generate test fixtures for review reward validation scenarios.
 */
export function generateTestFixtures(): {
  approvedReview: PullRequestReview;
  changesRequestedReview: PullRequestReview;
  commentOnlyReview: PullRequestReview;
  dismissedReview: PullRequestReview;
  supersededReview: PullRequestReview;
} {
  const baseReview = {
    prNumber: 100,
    repo: "test/repo",
    commentCount: 0,
    wasSuperseded: false,
  };

  return {
    approvedReview: {
      ...baseReview,
      id: 1,
      reviewer: "alice",
      state: ReviewState.APPROVED,
      conclusiveness: ReviewConclusiveness.CONCLUSIVE,
      submittedAt: new Date("2025-01-15T10:00:00Z"),
    },
    changesRequestedReview: {
      ...baseReview,
      id: 2,
      reviewer: "bob",
      state: ReviewState.CHANGES_REQUESTED,
      conclusiveness: ReviewConclusiveness.CONCLUSIVE,
      submittedAt: new Date("2025-01-15T11:00:00Z"),
    },
    commentOnlyReview: {
      ...baseReview,
      id: 3,
      reviewer: "charlie",
      state: ReviewState.COMMENTED,
      conclusiveness: ReviewConclusiveness.INCONCLUSIVE,
      submittedAt: new Date("2025-01-15T12:00:00Z"),
    },
    dismissedReview: {
      ...baseReview,
      id: 4,
      reviewer: "dave",
      state: ReviewState.DISMISSED,
      conclusiveness: ReviewConclusiveness.INVALIDATED,
      submittedAt: new Date("2025-01-15T09:00:00Z"),
    },
    supersededReview: {
      ...baseReview,
      id: 5,
      reviewer: "eve",
      state: ReviewState.APPROVED,
      conclusiveness: ReviewConclusiveness.INVALIDATED,
      submittedAt: new Date("2025-01-15T08:00:00Z"),
      wasSuperseded: true,
    },
  };
}
