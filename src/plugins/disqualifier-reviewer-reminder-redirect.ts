/**
 * @file disqualifier-reviewer-reminder-redirect.ts
 * @description Scaffolding and generator utilities for redirecting deadline
 * reminders from PR authors to reviewers when review duration exceeds thresholds.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#70
 * Problem: Users are blamed with deadline reminders when reviewers are slow,
 * leading to unfair disqualification risk and manual reviewer nagging.
 * Solution: Implement review-duration detection that redirects reminders to
 * assigned reviewers instead of the PR author when review time exceeds threshold.
 */

import type { PluginContext, PullRequest, TaskAssignee, ReviewState } from "./types";

/**
 * Configuration for reviewer reminder redirection.
 */
export interface ReviewerReminderRedirectConfig {
  /** Hours after which review is considered "taking too long" */
  reviewThresholdHours: number;
  /** Whether to completely suppress author reminders during slow reviews */
  suppressAuthorReminders: boolean;
  /** Include review duration metrics in reviewer reminder */
  includeReviewMetrics: boolean;
  /** Maximum number of reviewers to notify per reminder cycle */
  maxReviewersToNotify: number;
  /** Log level for redirect decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of evaluating who should receive a reminder.
 */
export interface ReminderTargetDecision {
  targetType: "author" | "reviewers" | "none";
  targetIds: number[];
  targetLogins: string[];
  reason: string;
  reviewDurationHours: number;
  isReviewBlocking: boolean;
  timestamp: string;
}

/**
 * Metrics about the current review state.
 */
export interface ReviewMetrics {
  prNumber: number;
  reviewStartedAt: string | null;
  hoursSinceReviewRequested: number;
  assignedReviewerCount: number;
  completedReviewCount: number;
  pendingReviewerLogins: string[];
  lastReviewActivityAt: string | null;
}

/**
 * Generates TypeScript interfaces for the reviewer redirect system.
 * @returns String containing interface definitions
 */
export function generateRedirectInterfaces(): string {
  return `
/**
 * Interface for determining reminder targets based on review state.
 */
export interface IReminderTargetResolver {
  /**
   * Determines who should receive a deadline reminder based on review duration.
   * @param pr - The pull request being evaluated
   * @param assignees - Current task assignees
   * @param reviewState - Current review state for the PR
   * @returns Decision indicating whether to remind author, reviewers, or nobody
   */
  resolveTarget(
    pr: PullRequest,
    assignees: TaskAssignee[],
    reviewState: ReviewState
  ): Promise<ReminderTargetDecision>;

  /**
   * Calculates review duration metrics for a PR.
   * @param pr - The pull request to analyze
   * @return Review metrics including duration and pending reviewers
   */
  getReviewMetrics(pr: PullRequest): Promise<ReviewMetrics>;
}

/**
 * Interface for composing reviewer-specific reminder messages.
 */
export interface IReviewerReminderComposer {
  /**
   * Composes a reminder message directed at reviewers instead of the author.
   * @param pr - The pull request awaiting review
   * @param metrics - Current review duration metrics
   * @param reviewerLogins - GitHub logins of reviewers to remind
   * @returns Formatted Markdown reminder body
   */
  composeReviewerReminder(
    pr: PullRequest,
    metrics: ReviewMetrics,
    reviewerLogins: string[]
  ): string;

  /**
   * Composes an informational message for the author explaining the redirect.
   * @param pr - The pull request
   * @param metrics - Current review metrics
   * @returns Formatted Markdown body informing author that reviewers were reminded
   */
  composeAuthorNotification(
    pr: PullRequest,
    metrics: ReviewMetrics
  ): string;
}

/**
 * Interface for tracking reminder redirect history.
 */
export interface IRedirectAuditLog {
  /**
   * Records a reminder redirect decision for accountability.
   * @param decision - The redirect decision that was made
   */
  recordDecision(decision: ReminderTargetDecision): void;

  /**
   * Retrieves recent redirect decisions for a PR.
   * @param prNumber - PR number to query
   * @param limit - Maximum entries to return
   */
  getRecentDecisions(prNumber: number, limit: number): ReminderTargetDecision[];
}
`;
}

/**
 * Generates the reminder target resolver implementation.
 * @param config - Redirect configuration
 * @returns String containing resolver class implementation
 */
export function generateTargetResolver(config: ReviewerReminderRedirectConfig): string {
  return `
import type { IReminderTargetResolver, ReminderTargetDecision, ReviewMetrics } from "./interfaces";
import type { PullRequest, TaskAssignee, ReviewState } from "../types";

/**
 * Resolves reminder targets by detecting slow reviews and redirecting
 * notifications from authors to reviewers.
 */
export class ReviewerReminderTargetResolver implements IReminderTargetResolver {
  private readonly config: ReviewerReminderRedirectConfig;

  constructor(config: ReviewerReminderRedirectConfig) {
    this.config = config;
  }

  async resolveTarget(
    pr: PullRequest,
    assignees: TaskAssignee[],
    reviewState: ReviewState
  ): Promise<ReminderTargetDecision> {
    const metrics = await this.getReviewMetrics(pr);
    const isReviewBlocking = metrics.hoursSinceReviewRequested >= this.config.reviewThresholdHours;

    // If review is not blocking, normal author reminder applies
    if (!isReviewBlocking) {
      return {
        targetType: "author",
        targetIds: assignees.map(a => a.id),
        targetLogins: assignees.map(a => a.login),
        reason: \`Review duration (\${metrics.hoursSinceReviewRequested.toFixed(1)}h) below threshold (\${this.config.reviewThresholdHours}h)\`,
        reviewDurationHours: metrics.hoursSinceReviewRequested,
        isReviewBlocking: false,
        timestamp: new Date().toISOString(),
      };
    }

    // Review is taking too long - redirect to reviewers
    const pendingReviewers = metrics.pendingReviewerLogins.slice(
      0,
      this.config.maxReviewersToNotify
    );

    if (pendingReviewers.length === 0) {
      return {
        targetType: "none",
        targetIds: [],
        targetLogins: [],
        reason: "Review is slow but no pending reviewers found to notify",
        reviewDurationHours: metrics.hoursSinceReviewRequested,
        isReviewBlocking: true,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      targetType: "reviewers",
      targetIds: [], // Reviewer IDs would be resolved from logins in production
      targetLogins: pendingReviewers,
      reason: \`Review has been pending for \${metrics.hoursSinceReviewRequested.toFixed(1)}h (threshold: \${this.config.reviewThresholdHours}h). Redirecting reminder to \${pendingReviewers.length} reviewer(s).\`,
      reviewDurationHours: metrics.hoursSinceReviewRequested,
      isReviewBlocking: true,
      timestamp: new Date().toISOString(),
    };
  }

  async getReviewMetrics(pr: PullRequest): Promise<ReviewMetrics> {
    // In production, fetch review requests and timestamps from GitHub API
    // For scaffold, simulate metrics calculation
    const now = new Date();
    const reviewRequestedAt = pr.reviewRequestedAt 
      ? new Date(pr.reviewRequestedAt) 
      : null;

    const hoursSinceReviewRequested = reviewRequestedAt
      ? (now.getTime() - reviewRequestedAt.getTime()) / 3600000
      : 0;

    return {
      prNumber: pr.number,
      reviewStartedAt: reviewRequestedAt?.toISOString() ?? null,
      hoursSinceReviewRequested,
      assignedReviewerCount: pr.requestedReviewers?.length ?? 0,
      completedReviewCount: pr.completedReviews?.length ?? 0,
      pendingReviewerLogins: pr.requestedReviewers?.map(r => r.login) ?? [],
      lastReviewActivityAt: pr.lastReviewActivityAt ?? null,
    };
  }
}
`;
}

/**
 * Generates the reviewer reminder composer.
 * @returns String containing composer class implementation
 */
export function generateReminderComposer(): string {
  return `
import type { IReviewerReminderComposer, ReviewMetrics } from "./interfaces";
import type { PullRequest } from "../types";

/**
 * Composes reviewer-directed reminder messages that replace author blame
 * with constructive review nudges.
 */
export class ReviewerReminderComposer implements IReviewerReminderComposer {
  composeReviewerReminder(
    pr: PullRequest,
    metrics: ReviewMetrics,
    reviewerLogins: string[]
  ): string {
    const mentions = reviewerLogins.map(l => \`@\${l}\`).join(", ");
    const hoursRounded = metrics.hoursSinceReviewRequested.toFixed(1);

    const lines: string[] = [];
    lines.push("## ⏰ Review Needed");
    lines.push("");
    lines.push(\`\${mentions} — this PR has been awaiting review for **\${hoursRounded} hours**.\`);
    lines.push("");
    lines.push(\`**PR**: #\${pr.number} by @\${pr.author.login}\`);
    lines.push(\`**Review requested**: \${metrics.reviewStartedAt ?? "unknown"}\`);
    lines.push(\`**Pending reviewers**: \${metrics.assignedReviewerCount - metrics.completedReviewCount} of \${metrics.assignedReviewerCount}\`);
    lines.push("");
    lines.push("The contributor's deadline timer is paused while awaiting review. Please provide feedback or approve so they can continue.");
    lines.push("");
    lines.push("---");
    lines.push("_This reminder was redirected from the contributor because the review duration exceeded the configured threshold._");

    return lines.join("\\n");
  }

  composeAuthorNotification(
    pr: PullRequest,
    metrics: ReviewMetrics
  ): string {
    const hoursRounded = metrics.hoursSinceReviewRequested.toFixed(1);

    const lines: string[] = [];
    lines.push("ℹ️ **Deadline Reminder Paused**");
    lines.push("");
    lines.push(\`Your deadline timer has been paused because your PR has been awaiting review for \${hoursRounded} hours. The reviewers have been notified.\`);
    lines.push("");
    lines.push("You will not be penalized for time spent waiting for review. Your deadline will resume once review activity occurs.");

    return lines.join("\\n");
  }
}
`;
}

/**
 * Generates test scaffolding for the reviewer redirect system.
 * @returns String containing Vitest test suite
 */
export function generateRedirectTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { ReviewerReminderTargetResolver } from "../disqualifier-reviewer-reminder-redirect";
import type { PullRequest, TaskAssignee, ReviewState } from "../../types";

describe("ReviewerReminderTargetResolver", () => {
  let resolver: ReviewerReminderTargetResolver;
  let mockPR: PullRequest;
  let mockAssignees: TaskAssignee[];
  let mockReviewState: ReviewState;

  beforeEach(() => {
    resolver = new ReviewerReminderTargetResolver({
      reviewThresholdHours: 48,
      suppressAuthorReminders: true,
      includeReviewMetrics: true,
      maxReviewersToNotify: 3,
      logLevel: "info",
    });

    mockPR = {
      number: 70,
      author: { id: 1001, login: "contributor" },
      issueNumber: 70,
      state: "open",
      merged: false,
      reviewRequestedAt: new Date(Date.now() - 72 * 3600000).toISOString(),
      requestedReviewers: [
        { id: 2001, login: "reviewerA" },
        { id: 2002, login: "reviewerB" },
      ],
      completedReviews: [],
      lastReviewActivityAt: null,
    } as PullRequest;

    mockAssignees = [{ id: 1001, login: "contributor" }];
    mockReviewState = {} as ReviewState;
  });

  it("should redirect to reviewers when review exceeds threshold", async () => {
    const decision = await resolver.resolveTarget(mockPR, mockAssignees, mockReviewState);
    expect(decision.targetType).toBe("reviewers");
    expect(decision.targetLogins).toContain("reviewerA");
    expect(decision.targetLogins).toContain("reviewerB");
    expect(decision.isReviewBlocking).toBe(true);
    expect(decision.reviewDurationHours).toBeGreaterThanOrEqual(48);
  });

  it("should target author when review is within threshold", async () => {
    // Set review request to 24 hours ago (below 48h threshold)
    mockPR.reviewRequestedAt = new Date(Date.now() - 24 * 3600000).toISOString();

    const decision = await resolver.resolveTarget(mockPR, mockAssignees, mockReviewState);
    expect(decision.targetType).toBe("author");
    expect(decision.targetLogins).toContain("contributor");
    expect(decision.isReviewBlocking).toBe(false);
  });

  it("should calculate review metrics correctly", async () => {
    const metrics = await resolver.getReviewMetrics(mockPR);
    expect(metrics.prNumber).toBe(70);
    expect(metrics.hoursSinceReviewRequested).toBeGreaterThanOrEqual(71);
    expect(metrics.assignedReviewerCount).toBe(2);
    expect(metrics.completedReviewCount).toBe(0);
    expect(metrics.pendingReviewerLogins).toHaveLength(2);
  });

  it("should respect maxReviewersToNotify limit", async () => {
    // Add more reviewers than the limit
    mockPR.requestedReviewers = [
      { id: 2001, login: "r1" },
      { id: 2002, login: "r2" },
      { id: 2003, login: "r3" },
      { id: 2004, login: "r4" },
    ] as any[];

    const decision = await resolver.resolveTarget(mockPR, mockAssignees, mockReviewState);
    expect(decision.targetLogins.length).toBeLessThanOrEqual(3);
  });
});
`;
}

/**
 * Main generator function for all reviewer redirect artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<ReviewerReminderRedirectConfig>
): Record<string, string> {
  const resolvedConfig: ReviewerReminderRedirectConfig = {
    reviewThresholdHours: 48,
    suppressAuthorReminders: true,
    includeReviewMetrics: true,
    maxReviewersToNotify: 3,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateRedirectInterfaces(),
    resolver: generateTargetResolver(resolvedConfig),
    composer: generateReminderComposer(),
    tests: generateRedirectTests(),
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

  if (!artifacts.interfaces.includes("IReminderTargetResolver")) {
    errors.push("Missing IReminderTargetResolver interface");
  }

  if (!artifacts.interfaces.includes("IReviewerReminderComposer")) {
    errors.push("Missing IReviewerReminderComposer interface");
  }

  if (!artifacts.resolver.includes("ReviewerReminderTargetResolver")) {
    errors.push("Missing ReviewerReminderTargetResolver class");
  }

  if (!artifacts.resolver.includes("resolveTarget")) {
    errors.push("Missing resolveTarget method");
  }

  if (!artifacts.composer.includes("composeReviewerReminder")) {
    errors.push("Missing composeReviewerReminder method");
  }

  if (!artifacts.composer.includes("composeAuthorNotification")) {
    errors.push("Missing composeAuthorNotification method");
  }

  if (!artifacts.tests.includes("should redirect to reviewers when review exceeds threshold")) {
    errors.push("Missing critical test for reviewer redirect");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateRedirectInterfaces,
  generateTargetResolver,
  generateReminderComposer,
  generateRedirectTests,
};
