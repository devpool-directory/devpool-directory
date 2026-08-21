/**
 * @file text-conversation-inconclusive-review-reward.ts
 * @description Scaffolding and generator utilities for fixing the issue where
 * code review rewards are incorrectly granted for inconclusive reviews (comments
 * without explicit approval or changes-requested state).
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#366
 * Problem: Contributors receive code review credit even when their review state
 * is neither "approved" nor "changes_requested", which is a bug. Only conclusive
 * reviews should trigger reward generation.
 * Solution: Implement a review state validator that filters out inconclusive
 * reviews before reward calculation, ensuring only actionable feedback counts.
 */

import type { PluginContext, PullRequest, ReviewState } from "./types";

/**
 * Configuration for inconclusive review filtering.
 */
export interface InconclusiveReviewFilterConfig {
  /** Review states that qualify for reward generation */
  qualifyingStates: Array<"APPROVED" | "CHANGES_REQUESTED">;
  /** Whether to include dismissed reviews as qualifying */
  includeDismissedReviews: boolean;
  /** Minimum comment length for non-state reviews to count */
  minCommentLengthForCredit: number;
  /** Log level for filtering decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Classification of a review's eligibility for rewards.
 */
export interface ReviewEligibility {
  reviewId: number;
  reviewerLogin: string;
  state: string;
  eligible: boolean;
  reason: string;
  hasActionableFeedback: boolean;
}

/**
 * Result of filtering reviews for reward eligibility.
 */
export interface ReviewFilterResult {
  totalReviews: number;
  eligibleCount: number;
  ineligibleCount: number;
  eligibleReviews: ReviewEligibility[];
  filteredOutReasons: Record<string, number>;
}

/**
 * Generates TypeScript interfaces for the review filtering system.
 * @returns String containing interface definitions
 */
export function generateReviewFilterInterfaces(): string {
  return `
/**
 * Interface for evaluating individual review eligibility.
 */
export interface IReviewEligibilityEvaluator {
  /**
   * Determines if a specific review qualifies for reward generation.
   * @param review - The review to evaluate
   * @param config - Filter configuration
   * @returns Eligibility assessment with reasoning
   */
  evaluate(review: ReviewState, config: InconclusiveReviewFilterConfig): ReviewEligibility;
}

/**
 * Interface for filtering a collection of reviews.
 */
export interface IReviewCollectionFilter {
  /**
   * Filters an array of reviews to only those eligible for rewards.
   * @param reviews - All reviews on a PR
   * @param config - Filter configuration
   * @returns Filter result with statistics and eligible reviews
   */
  filter(reviews: ReviewState[], config: InconclusiveReviewFilterConfig): ReviewFilterResult;
}

/**
 * Interface for detecting actionable feedback in review comments.
 */
export interface IFeedbackAnalyzer {
  /**
   * Analyzes whether a review contains actionable feedback beyond just a state.
   * @param review - The review to analyze
   * @returns True if review contains substantive feedback
   */
  hasActionableFeedback(review: ReviewState): boolean;
}
`;
}

/**
 * Generates the review eligibility evaluator implementation.
 * @returns String containing evaluator class implementation
 */
export function generateReviewEligibilityEvaluator(): string {
  return `
import type { IReviewEligibilityEvaluator, ReviewEligibility } from "./interfaces";
import type { ReviewState } from "../types";
import type { InconclusiveReviewFilterConfig } from "../text-conversation-inconclusive-review-reward";

/**
 * Evaluates individual reviews against eligibility criteria.
 * Only APPROVED and CHANGES_REQUESTED states qualify by default.
 */
export class ReviewEligibilityEvaluator implements IReviewEligibilityEvaluator {
  evaluate(review: ReviewState, config: InconclusiveReviewFilterConfig): ReviewEligibility {
    const state = review.state?.toUpperCase() ?? "UNKNOWN";
    let eligible = false;
    let reason = "";
    let hasActionableFeedback = false;

    // Check if state is in qualifying list
    if (config.qualifyingStates.includes(state as "APPROVED" | "CHANGES_REQUESTED")) {
      eligible = true;
      reason = \`Review state '\${state}' is qualifying\`;
    } else if (state === "DISMISSED" && config.includeDismissedReviews) {
      eligible = true;
      reason = "Dismissed review included per configuration";
    } else {
      reason = \`Review state '\${state}' is inconclusive - no explicit approval or changes requested\`;
    }

    // Check for actionable feedback regardless of state
    if (review.body && review.body.length >= config.minCommentLengthForCredit) {
      hasActionableFeedback = true;
    }

    // Even with feedback, inconclusive reviews don't qualify unless configured otherwise
    if (!eligible && hasActionableFeedback) {
      reason += " (has feedback but state is inconclusive)";
    }

    return {
      reviewId: review.id,
      reviewerLogin: review.user?.login ?? "unknown",
      state,
      eligible,
      reason,
      hasActionableFeedback,
    };
  }
}
`;
}

/**
 * Generates the review collection filter implementation.
 * @returns String containing filter class implementation
 */
export function generateReviewCollectionFilter(): string {
  return `
import type { IReviewCollectionFilter, ReviewFilterResult, ReviewEligibility } from "./interfaces";
import type { ReviewState } from "../types";
import type { InconclusiveReviewFilterConfig } from "../text-conversation-inconclusive-review-reward";
import { ReviewEligibilityEvaluator } from "./eligibility-evaluator";

/**
 * Filters collections of reviews to identify those eligible for rewards.
 * Provides aggregate statistics for monitoring and debugging.
 */
export class ReviewCollectionFilter implements IReviewCollectionFilter {
  private readonly evaluator: ReviewEligibilityEvaluator;

  constructor() {
    this.evaluator = new ReviewEligibilityEvaluator();
  }

  filter(reviews: ReviewState[], config: InconclusiveReviewFilterConfig): ReviewFilterResult {
    const eligibleReviews: ReviewEligibility[] = [];
    const filteredOutReasons: Record<string, number> = {};

    for (const review of reviews) {
      const eligibility = this.evaluator.evaluate(review, config);

      if (eligibility.eligible) {
        eligibleReviews.push(eligibility);
      } else {
        // Track why reviews were filtered out
        const key = eligibility.state;
        filteredOutReasons[key] = (filteredOutReasons[key] ?? 0) + 1;
      }
    }

    console[config.logLevel]?.(
      \`[ReviewFilter] \${eligibleReviews.length}/\${reviews.length} reviews eligible for rewards\`
    );

    return {
      totalReviews: reviews.length,
      eligibleCount: eligibleReviews.length,
      ineligibleCount: reviews.length - eligibleReviews.length,
      eligibleReviews,
      filteredOutReasons,
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the inconclusive review filter.
 * @returns String containing Vitest test suite
 */
export function generateInconclusiveReviewTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { ReviewEligibilityEvaluator, ReviewCollectionFilter } from "../text-conversation-inconclusive-review-reward";
import type { ReviewState } from "../../types";
import type { InconclusiveReviewFilterConfig } from "../text-conversation-inconclusive-review-reward";

describe("Inconclusive Review Reward Filter", () => {
  let evaluator: ReviewEligibilityEvaluator;
  let filter: ReviewCollectionFilter;
  let config: InconclusiveReviewFilterConfig;

  beforeEach(() => {
    evaluator = new ReviewEligibilityEvaluator();
    filter = new ReviewCollectionFilter();
    config = {
      qualifyingStates: ["APPROVED", "CHANGES_REQUESTED"],
      includeDismissedReviews: false,
      minCommentLengthForCredit: 20,
      logLevel: "warn" as const,
    };
  });

  it("should mark APPROVED reviews as eligible", () => {
    const review = { id: 1, state: "APPROVED", user: { login: "reviewer" } } as ReviewState;
    const result = evaluator.evaluate(review, config);
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("qualifying");
  });

  it("should mark CHANGES_REQUESTED reviews as eligible", () => {
    const review = { id: 2, state: "CHANGES_REQUESTED", user: { login: "reviewer" } } as ReviewState;
    const result = evaluator.evaluate(review, config);
    expect(result.eligible).toBe(true);
  });

  it("should reject COMMENTED reviews as inconclusive", () => {
    const review = { id: 3, state: "COMMENTED", body: "Looks good", user: { login: "reviewer" } } as ReviewState;
    const result = evaluator.evaluate(review, config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("inconclusive");
  });

  it("should reject PENDING reviews", () => {
    const review = { id: 4, state: "PENDING", user: { login: "reviewer" } } as ReviewState;
    const result = evaluator.evaluate(review, config);
    expect(result.eligible).toBe(false);
  });

  it("should filter collection correctly", () => {
    const reviews: ReviewState[] = [
      { id: 1, state: "APPROVED", user: { login: "a" } } as ReviewState,
      { id: 2, state: "COMMENTED", user: { login: "b" } } as ReviewState,
      { id: 3, state: "CHANGES_REQUESTED", user: { login: "c" } } as ReviewState,
      { id: 4, state: "DISMISSED", user: { login: "d" } } as ReviewState,
    ];

    const result = filter.filter(reviews, config);
    expect(result.totalReviews).toBe(4);
    expect(result.eligibleCount).toBe(2);
    expect(result.ineligibleCount).toBe(2);
    expect(result.filteredOutReasons["COMMENTED"]).toBe(1);
    expect(result.filteredOutReasons["DISMISSED"]).toBe(1);
  });

  it("should include dismissed reviews when configured", () => {
    const configWithDismissed = { ...config, includeDismissedReviews: true };
    const review = { id: 5, state: "DISMISSED", user: { login: "reviewer" } } as ReviewState;
    const result = evaluator.evaluate(review, configWithDismissed);
    expect(result.eligible).toBe(true);
  });
});
`;
}

/**
 * Main generator function for all inconclusive review filter artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<InconclusiveReviewFilterConfig>
): Record<string, string> {
  const resolvedConfig: InconclusiveReviewFilterConfig = {
    qualifyingStates: ["APPROVED", "CHANGES_REQUESTED"],
    includeDismissedReviews: false,
    minCommentLengthForCredit: 20,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateReviewFilterInterfaces(),
    evaluator: generateReviewEligibilityEvaluator(),
    filter: generateReviewCollectionFilter(),
    tests: generateInconclusiveReviewTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 * @param artifacts - Generated code artifacts
 * @returns Validation result
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IReviewEligibilityEvaluator")) {
    errors.push("Missing IReviewEligibilityEvaluator interface");
  }

  if (!artifacts.interfaces.includes("IReviewCollectionFilter")) {
    errors.push("Missing IReviewCollectionFilter interface");
  }

  if (!artifacts.evaluator.includes("ReviewEligibilityEvaluator")) {
    errors.push("Missing ReviewEligibilityEvaluator class");
  }

  if (!artifacts.filter.includes("ReviewCollectionFilter")) {
    errors.push("Missing ReviewCollectionFilter class");
  }

  if (!artifacts.tests.includes("should reject COMMENTED reviews as inconclusive")) {
    errors.push("Missing critical test for inconclusive review rejection");
  }

  if (!artifacts.tests.includes("should mark APPROVED reviews as eligible")) {
    errors.push("Missing test for approved review eligibility");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateReviewFilterInterfaces,
  generateReviewEligibilityEvaluator,
  generateReviewCollectionFilter,
  generateInconclusiveReviewTests,
};
