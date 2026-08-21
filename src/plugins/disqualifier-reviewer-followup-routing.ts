/**
 * @file disqualifier-reviewer-followup-routing.ts
 * @description Scaffolding and generator utilities for intelligent follow-up
 * routing based on PR readiness state. Addresses the issue where follow-ups
 * incorrectly ping assignees when reviewers are slow, or ping reviewers when
 * the PR is still in draft/changes-requested state.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#49
 * Requirements:
 * - If PR is ready (open, no changes requested): follow up with reviewers
 * - If PR is not ready (draft or changes requested): follow up with assignee
 * - Handle private repos that may not support draft PRs by detecting
 *   "changes requested" review state as proxy for "not ready"
 * - Contributor who stops working should be reminded to unassign, continue,
 *   or finalize their PR
 */

import type { PluginContext, PullRequest, TaskAssignee, ReviewState } from "./types";

/**
 * Configuration for follow-up routing logic.
 */
export interface FollowUpRoutingConfig {
  /** Treat "changes requested" review as equivalent to draft state */
  treatChangesRequestedAsDraft: boolean;
  /** Hours of inactivity before considering contributor stalled */
  stallThresholdHours: number;
  /** Include unassign suggestion in stall reminders */
  suggestUnassignOnStall: boolean;
  /** Maximum follow-ups to send to reviewers before escalating */
  maxReviewerFollowUps: number;
  /** Log level for routing decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Determined readiness state of a pull request.
 */
export type PrReadinessState = "ready" | "draft" | "changes_requested" | "unknown";

/**
 * Result of evaluating PR readiness for follow-up routing.
 */
export interface ReadinessAssessment {
  state: PrReadinessState;
  isReadyForReview: boolean;
  reason: string;
  detectedVia: "draft_flag" | "review_state" | "heuristic" | "api";
  lastActivityAt: string | null;
  hoursSinceLastActivity: number;
}

/**
 * Routing decision for follow-up notifications.
 */
export interface FollowUpRoutingDecision {
  targetType: "assignee" | "reviewers" | "none";
  targetLogins: string[];
  messageTemplate: "stall_reminder" | "review_nudge" | "finalize_reminder";
  readiness: ReadinessAssessment;
  shouldEscalate: boolean;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the follow-up routing system.
 * @returns String containing interface definitions
 */
export function generateRoutingInterfaces(): string {
  return `
/**
 * Interface for assessing PR readiness state.
 */
export interface IPrReadinessAssessor {
  /**
   * Determines whether a PR is ready for review or still in progress.
   * Handles both draft PRs and changes-requested states.
   * @param pr - The pull request to assess
   * @param reviewState - Current review state
   * @returns Readiness assessment with detection method
   */
  assess(pr: PullRequest, reviewState: ReviewState): Promise<ReadinessAssessment>;
}

/**
 * Interface for routing follow-up notifications based on readiness.
 */
export interface IFollowUpRouter {
  /**
   * Determines who should receive a follow-up notification.
   * @param pr - The pull request
   * @param assignees - Current task assignees
   * @param readiness - PR readiness assessment
   * @return Routing decision with target and message template
   */
  route(
    pr: PullRequest,
    assignees: TaskAssignee[],
    readiness: ReadinessAssessment
  ): Promise<FollowUpRoutingDecision>;
}

/**
 * Interface for composing context-appropriate follow-up messages.
 */
export interface IFollowUpMessageComposer {
  /**
   * Composes a stall reminder for assignees who have stopped working.
   */
  composeStallReminder(
    pr: PullRequest,
    assignee: TaskAssignee,
    hoursSinceActivity: number,
    suggestUnassign: boolean
  ): string;

  /**
   * Composes a review nudge for reviewers on ready PRs.
   */
  composeReviewNudge(
    pr: PullRequest,
    reviewerLogins: string[],
    hoursSinceReviewRequested: number
  ): string;

  /**
   * Composes a finalize reminder for assignees with stale drafts.
   */
  composeFinalizeReminder(
    pr: PullRequest,
    assignee: TaskAssignee,
    readiness: ReadinessAssessment
  ): string;
}
`;
}

/**
 * Generates the PR readiness assessor implementation.
 * @param config - Routing configuration
 * @returns String containing assessor class implementation
 */
export function generateReadinessAssessor(config: FollowUpRoutingConfig): string {
  return `
import type { IPrReadinessAssessor, ReadinessAssessment, PrReadinessState } from "./interfaces";
import type { PullRequest, ReviewState } from "../types";

/**
 * Assesses PR readiness using multiple detection strategies.
 * Handles repos without draft PR support via review state proxy.
 */
export class PrReadinessAssessor implements IPrReadinessAssessor {
  private readonly config: FollowUpRoutingConfig;

  constructor(config: FollowUpRoutingConfig) {
    this.config = config;
  }

  async assess(pr: PullRequest, reviewState: ReviewState): Promise<ReadinessAssessment> {
    const now = new Date();
    const lastActivityAt = pr.updatedAt ?? pr.createdAt;
    const hoursSinceLastActivity = lastActivityAt
      ? (now.getTime() - new Date(lastActivityAt).getTime()) / 3600000
      : 0;

    // Strategy 1: Check native draft flag
    if (pr.isDraft === true) {
      return {
        state: "draft",
        isReadyForReview: false,
        reason: "PR is marked as draft",
        detectedVia: "draft_flag",
        lastActivityAt,
        hoursSinceLastActivity,
      };
    }

    // Strategy 2: Check for changes-requested reviews
    if (this.config.treatChangesRequestedAsDraft) {
      const hasChangesRequested = reviewState.reviews?.some(
        r => r.state === "CHANGES_REQUESTED"
      ) ?? false;

      if (hasChangesRequested) {
        return {
          state: "changes_requested",
          isReadyForReview: false,
          reason: "PR has unresolved changes-requested reviews",
          detectedVia: "review_state",
          lastActivityAt,
          hoursSinceLastActivity,
        };
      }
    }

    // Strategy 3: Check if review was explicitly requested (implies ready)
    if (pr.requestedReviewers && pr.requestedReviewers.length > 0) {
      return {
        state: "ready",
        isReadyForReview: true,
        reason: \`PR has \${pr.requestedReviewers.length} reviewer(s) assigned\`,
        detectedVia: "api",
        lastActivityAt,
        hoursSinceLastActivity,
      };
    }

    // Fallback: assume ready if open and not draft
    if (pr.state === "open") {
      return {
        state: "ready",
        isReadyForReview: true,
        reason: "PR is open with no blocking indicators",
        detectedVia: "heuristic",
        lastActivityAt,
        hoursSinceLastActivity,
      };
    }

    return {
      state: "unknown",
      isReadyForReview: false,
      reason: "Unable to determine PR readiness",
      detectedVia: "heuristic",
      lastActivityAt,
      hoursSinceLastActivity,
    };
  }
}
`;
}

/**
 * Generates the follow-up router implementation.
 * @param config - Routing configuration
 * @returns String containing router class implementation
 */
export function generateFollowUpRouter(config: FollowUpRoutingConfig): string {
  return `
import type { IFollowUpRouter, FollowUpRoutingDecision, ReadinessAssessment } from "./interfaces";
import type { PullRequest, TaskAssignee } from "../types";

/**
 * Routes follow-up notifications to the appropriate target based on
 * PR readiness state and activity patterns.
 */
export class FollowUpRouter implements IFollowUpRouter {
  private readonly config: FollowUpRoutingConfig;

  constructor(config: FollowUpRoutingConfig) {
    this.config = config;
  }

  async route(
    pr: PullRequest,
    assignees: TaskAssignee[],
    readiness: ReadinessAssessment
  ): Promise<FollowUpRoutingDecision> {
    const timestamp = new Date().toISOString();

    // Case 1: PR is ready → remind reviewers
    if (readiness.isReadyForReview) {
      const reviewerLogins = pr.requestedReviewers?.map(r => r.login) ?? [];
      
      if (reviewerLogins.length === 0) {
        return {
          targetType: "none",
          targetLogins: [],
          messageTemplate: "review_nudge",
          readiness,
          shouldEscalate: false,
          timestamp,
        };
      }

      return {
        targetType: "reviewers",
        targetLogins: reviewerLogins.slice(0, this.config.maxReviewerFollowUps),
        messageTemplate: "review_nudge",
        readiness,
        shouldEscalate: reviewerLogins.length > this.config.maxReviewerFollowUps,
        timestamp,
      };
    }

    // Case 2: PR is not ready → check if contributor is stalled
    const isStalled = readiness.hoursSinceLastActivity >= this.config.stallThresholdHours;

    if (isStalled && assignees.length > 0) {
      return {
        targetType: "assignee",
        targetLogins: assignees.map(a => a.login),
        messageTemplate: "stall_reminder",
        readiness,
        shouldEscalate: false,
        timestamp,
      };
    }

    // Case 3: PR is not ready but contributor is active → remind to finalize
    if (!isStalled && assignees.length > 0) {
      return {
        targetType: "assignee",
        targetLogins: assignees.map(a => a.login),
        messageTemplate: "finalize_reminder",
        readiness,
        shouldEscalate: false,
        timestamp,
      };
    }

    return {
      targetType: "none",
      targetLogins: [],
      messageTemplate: "finalize_reminder",
      readiness,
      shouldEscalate: false,
      timestamp,
    };
  }
}
`;
}

/**
 * Generates the follow-up message composer.
 * @param config - Routing configuration
 * @returns String containing composer class implementation
 */
export function generateMessageComposer(config: FollowUpRoutingConfig): string {
  return `
import type { IFollowUpMessageComposer, ReadinessAssessment } from "./interfaces";
import type { PullRequest, TaskAssignee } from "../types";

/**
 * Composes context-appropriate follow-up messages based on routing decisions.
 */
export class FollowUpMessageComposer implements IFollowUpMessageComposer {
  private readonly config: FollowUpRoutingConfig;

  constructor(config: FollowUpRoutingConfig) {
    this.config = config;
  }

  composeStallReminder(
    pr: PullRequest,
    assignee: TaskAssignee,
    hoursSinceActivity: number,
    suggestUnassign: boolean
  ): string {
    const hoursRounded = hoursSinceActivity.toFixed(1);
    const lines: string[] = [];

    lines.push(\`## ⚠️ Activity Stall Detected\`);
    lines.push("");
    lines.push(\`@\${assignee.login}, there has been no activity on PR #\${pr.number} for **\${hoursRounded} hours**.\`);
    lines.push("");
    lines.push("Please take one of the following actions:");
    lines.push("- **Continue working** on this task and push updates");
    lines.push("- **Convert to ready** if the PR is complete and awaiting review");
    if (suggestUnassign) {
      lines.push("- **Unassign yourself** if you can no longer work on this task");
    }
    lines.push("");
    lines.push("_Your deadline timer continues running. Inactivity may lead to disqualification._");

    return lines.join("\\n");
  }

  composeReviewNudge(
    pr: PullRequest,
    reviewerLogins: string[],
    hoursSinceReviewRequested: number
  ): string {
    const mentions = reviewerLogins.map(l => \`@\${l}\`).join(", ");
    const hoursRounded = hoursSinceReviewRequested.toFixed(1);
    const lines: string[] = [];

    lines.push("## 🔍 Review Reminder");
    lines.push("");
    lines.push(\`\${mentions} — PR #\${pr.number} by @\${pr.author.login} has been awaiting review for **\${hoursRounded} hours**.\`);
    lines.push("");
    lines.push("This PR is marked as ready for review. Please provide feedback or approve so the contributor can proceed.");
    lines.push("");
    lines.push("_The contributor's deadline is paused while awaiting review._");

    return lines.join("\\n");
  }

  composeFinalizeReminder(
    pr: PullRequest,
    assignee: TaskAssignee,
    readiness: ReadinessAssessment
  ): string {
    const lines: string[] = [];

    lines.push("## 📝 PR Finalization Reminder");
    lines.push("");
    lines.push(\`@\${assignee.login}, your PR #\${pr.number} is currently in **\${readiness.state}** state.\`);
    lines.push("");
    lines.push(\`**Reason**: \${readiness.reason}\`);
    lines.push("");
    lines.push("When your work is complete, please:");
    lines.push("- Mark the PR as **ready for review** (convert from draft if applicable)");
    lines.push("- Ensure all CI checks are passing");
    lines.push("- Request reviewers if not already assigned");
    lines.push("");
    lines.push("_Your deadline timer continues running until the PR is submitted for review._");

    return lines.join("\\n");
  }
}
`;
}

/**
 * Generates test scaffolding for the follow-up routing system.
 * @returns String containing Vitest test suite
 */
export function generateRoutingTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { PrReadinessAssessor, FollowUpRouter } from "../disqualifier-reviewer-followup-routing";
import type { PullRequest, TaskAssignee, ReviewState } from "../../types";

describe("Follow-Up Routing System", () => {
  let assessor: PrReadinessAssessor;
  let router: FollowUpRouter;
  let mockPR: PullRequest;
  let mockAssignees: TaskAssignee[];

  beforeEach(() => {
    const config = {
      treatChangesRequestedAsDraft: true,
      stallThresholdHours: 48,
      suggestUnassignOnStall: true,
      maxReviewerFollowUps: 3,
      logLevel: "info",
    };

    assessor = new PrReadinessAssessor(config);
    router = new FollowUpRouter(config);

    mockPR = {
      number: 49,
      author: { id: 1001, login: "contributor" },
      issueNumber: 49,
      state: "open",
      merged: false,
      isDraft: false,
      updatedAt: new Date().toISOString(),
      requestedReviewers: [{ id: 2001, login: "reviewerA" }],
    } as PullRequest;

    mockAssignees = [{ id: 1001, login: "contributor" }];
  });

  it("should detect draft PRs as not ready", async () => {
    mockPR.isDraft = true;
    const assessment = await assessor.assess(mockPR, {} as ReviewState);
    expect(assessment.state).toBe("draft");
    expect(assessment.isReadyForReview).toBe(false);
    expect(assessment.detectedVia).toBe("draft_flag");
  });

  it("should detect changes-requested as not ready when configured", async () => {
    const reviewState: ReviewState = {
      reviews: [{ state: "CHANGES_REQUESTED", author: { login: "reviewer" } }],
    } as ReviewState;

    const assessment = await assessor.assess(mockPR, reviewState);
    expect(assessment.state).toBe("changes_requested");
    expect(assessment.isReadyForReview).toBe(false);
  });

  it("should route to reviewers when PR is ready", async () => {
    const readiness = await assessor.assess(mockPR, {} as ReviewState);
    const decision = await router.route(mockPR, mockAssignees, readiness);

    expect(decision.targetType).toBe("reviewers");
    expect(decision.targetLogins).toContain("reviewerA");
    expect(decision.messageTemplate).toBe("review_nudge");
  });

  it("should route to assignee when PR is stalled", async () => {
    // Set last activity to 72 hours ago (above 48h threshold)
    mockPR.updatedAt = new Date(Date.now() - 72 * 3600000).toISOString();
    mockPR.isDraft = true; // Not ready

    const readiness = await assessor.assess(mockPR, {} as ReviewState);
    const decision = await router.route(mockPR, mockAssignees, readiness);

    expect(decision.targetType).toBe("assignee");
    expect(decision.targetLogins).toContain("contributor");
    expect(decision.messageTemplate).toBe("stall_reminder");
  });

  it("should route finalize reminder for active but not-ready PRs", async () => {
    mockPR.isDraft = true;
    mockPR.updatedAt = new Date().toISOString(); // Recent activity

    const readiness = await assessor.assess(mockPR, {} as ReviewState);
    const decision = await router.route(mockPR, mockAssignees, readiness);

    expect(decision.targetType).toBe("assignee");
    expect(decision.messageTemplate).toBe("finalize_reminder");
  });
});
`;
}

/**
 * Main generator function for all follow-up routing artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<FollowUpRoutingConfig>
): Record<string, string> {
  const resolvedConfig: FollowUpRoutingConfig = {
    treatChangesRequestedAsDraft: true,
    stallThresholdHours: 48,
    suggestUnassignOnStall: true,
    maxReviewerFollowUps: 3,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateRoutingInterfaces(),
    assessor: generateReadinessAssessor(resolvedConfig),
    router: generateFollowUpRouter(resolvedConfig),
    composer: generateMessageComposer(resolvedConfig),
    tests: generateRoutingTests(),
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

  if (!artifacts.interfaces.includes("IPrReadinessAssessor")) {
    errors.push("Missing IPrReadinessAssessor interface");
  }

  if (!artifacts.interfaces.includes("IFollowUpRouter")) {
    errors.push("Missing IFollowUpRouter interface");
  }

  if (!artifacts.interfaces.includes("IFollowUpMessageComposer")) {
    errors.push("Missing IFollowUpMessageComposer interface");
  }

  if (!artifacts.assessor.includes("PrReadinessAssessor")) {
    errors.push("Missing PrReadinessAssessor class");
  }

  if (!artifacts.router.includes("FollowUpRouter")) {
    errors.push("Missing FollowUpRouter class");
  }

  if (!artifacts.composer.includes("composeStallReminder")) {
    errors.push("Missing composeStallReminder method");
  }

  if (!artifacts.composer.includes("composeReviewNudge")) {
    errors.push("Missing composeReviewNudge method");
  }

  if (!artifacts.tests.includes("should route to reviewers when PR is ready")) {
    errors.push("Missing critical test for reviewer routing");
  }

  if (!artifacts.tests.includes("should detect changes-requested as not ready")) {
    errors.push("Missing test for changes-requested detection");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateRoutingInterfaces,
  generateReadinessAssessor,
  generateFollowUpRouter,
  generateMessageComposer,
  generateRoutingTests,
};
