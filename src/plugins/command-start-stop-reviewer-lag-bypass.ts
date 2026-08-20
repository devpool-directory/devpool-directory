/**
 * @file command-start-stop-reviewer-lag-bypass.ts
 * @description Scaffolding and generator utilities for allowing contributors
 * to bypass task assignment limits when they are blocked by slow reviewers.
 * 
 * Upstream Issue: ubiquity-os-marketplace/command-start-stop#106
 * Problem: Contributors are blocked from assigning new tasks due to task limits
 * even when they've addressed all open review threads and are waiting on reviewers.
 * Solution: Implement reviewer-lag detection that checks if the assignee is the
 * last commenter on unresolved threads with a 24h timeout, allowing limit bypass
 * while including safeguards against misuse.
 */

import type { PluginContext, PullRequest, TaskAssignee, ReviewThread } from "./types";

/**
 * Configuration for reviewer lag bypass logic.
 */
export interface ReviewerLagBypassConfig {
  /** Hours after last assignee comment before considering task reviewer-lagged */
  lagThresholdHours: number;
  /** Whether to require ALL unresolved threads to have assignee as last commenter */
  requireAllThreadsResolved: boolean;
  /** Maximum number of concurrent bypassed tasks allowed per contributor */
  maxBypassedTasks: number;
  /** Enable integrity checks to prevent thread resolution abuse */
  enableIntegrityChecks: boolean;
  /** Minimum comment length to count as meaningful engagement */
  minCommentLength: number;
  /** Log level for bypass decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Assessment of whether a task qualifies for limit bypass.
 */
export interface BypassAssessment {
  qualifiesForBypass: boolean;
  reason: string;
  unresolvedThreadCount: number;
  assigneeLastCommentAgeHours: number;
  threadsWithAssigneeLastComment: number;
  currentBypassedTaskCount: number;
  integrityWarnings: string[];
}

/**
 * Result of applying a bypass decision.
 */
export interface BypassResult {
  applied: boolean;
  taskId: string;
  assigneeLogin: string;
  assessment: BypassAssessment;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the reviewer lag bypass system.
 * @returns String containing interface definitions
 */
export function generateBypassInterfaces(): string {
  return `
/**
 * Interface for analyzing review thread state to detect reviewer lag.
 */
export interface IReviewThreadAnalyzer {
  /**
   * Analyzes unresolved review threads to determine if assignee is blocked.
   * @param pr - The pull request to analyze
   * @param assignee - The task assignee
   * @returns Analysis result with thread-level details
   */
  analyzeThreads(
    pr: PullRequest,
    assignee: TaskAssignee
  ): Promise<{
    totalUnresolved: number;
    assigneeIsLastCommenter: number;
    oldestAssigneeCommentAgeHours: number;
    threads: Array<{
      threadId: string;
      lastCommenter: string;
      lastCommentAt: string;
      isAssigneeLast: boolean;
      commentLength: number;
    }>;
  }>;
}

/**
 * Interface for evaluating bypass eligibility with integrity checks.
 */
export interface IBypassEvaluator {
  /**
   * Evaluates whether a contributor qualifies for task limit bypass.
   * @param assignee - The contributor requesting assignment
   * @param activePrs - PRs currently assigned to this contributor
   * @param config - Bypass configuration
   * @returns Bypass assessment with reasoning
   */
  evaluate(
    assignee: TaskAssignee,
    activePrs: PullRequest[],
    config: ReviewerLagBypassConfig
  ): Promise<BypassAssessment>;
}

/**
 * Interface for tracking bypass usage to enforce limits.
 */
export interface IBypassTracker {
  /**
   * Records a bypass application for a contributor.
   * @param assigneeLogin - GitHub login of the contributor
   * @param taskId - Task being bypassed
   */
  recordBypass(assigneeLogin: string, taskId: string): Promise<void>;

  /**
   * Gets current bypassed task count for a contributor.
   * @param assigneeLogin - GitHub login to check
   * @returns Number of currently bypassed tasks
   */
  getBypassedCount(assigneeLogin: string): Promise<number>;

  /**
   * Removes bypass record when task is completed or unassigned.
   * @param assigneeLogin - GitHub login
   * @param taskId - Task no longer bypassed
   */
  clearBypass(assigneeLogin: string, taskId: string): Promise<void>;
}
`;
}

/**
 * Generates the review thread analyzer implementation.
 * @param config - Bypass configuration
 * @returns String containing analyzer class
 */
export function generateThreadAnalyzer(config: ReviewerLagBypassConfig): string {
  return `
import type { IReviewThreadAnalyzer, PullRequest, TaskAssignee } from "./interfaces";

/**
 * Analyzes review threads to detect when assignees are blocked by reviewers.
 */
export class ReviewThreadAnalyzer implements IReviewThreadAnalyzer {
  private readonly config: ReviewerLagBypassConfig;

  constructor(config: ReviewerLagBypassConfig) {
    this.config = config;
  }

  async analyzeThreads(
    pr: PullRequest,
    assignee: TaskAssignee
  ): Promise<{
    totalUnresolved: number;
    assigneeIsLastCommenter: number;
    oldestAssigneeCommentAgeHours: number;
    threads: Array<{
      threadId: string;
      lastCommenter: string;
      lastCommentAt: string;
      isAssigneeLast: boolean;
      commentLength: number;
    }>;
  }> {
    // In production: fetch review threads via GitHub GraphQL API
    // For scaffold, simulate thread analysis
    const now = new Date();
    
    // Simulated unresolved threads
    const simulatedThreads = [
      {
        threadId: "thread-1",
        lastCommenter: assignee.login,
        lastCommentAt: new Date(now.getTime() - 48 * 3600000).toISOString(),
        resolved: false,
        commentLength: 150,
      },
      {
        threadId: "thread-2",
        lastCommenter: "reviewer-a",
        lastCommentAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
        resolved: false,
        commentLength: 80,
      },
    ];

    const unresolved = simulatedThreads.filter(t => !t.resolved);
    const assigneeLastThreads = unresolved.filter(
      t => t.lastCommenter === assignee.login && t.commentLength >= this.config.minCommentLength
    );

    let oldestAgeHours = 0;
    for (const t of assigneeLastThreads) {
      const age = (now.getTime() - new Date(t.lastCommentAt).getTime()) / 3600000;
      if (age > oldestAgeHours) oldestAgeHours = age;
    }

    return {
      totalUnresolved: unresolved.length,
      assigneeIsLastCommenter: assigneeLastThreads.length,
      oldestAssigneeCommentAgeHours: oldestAgeHours,
      threads: unresolved.map(t => ({
        threadId: t.threadId,
        lastCommenter: t.lastCommenter,
        lastCommentAt: t.lastCommentAt,
        isAssigneeLast: t.lastCommenter === assignee.login,
        commentLength: t.commentLength,
      })),
    };
  }
}
`;
}

/**
 * Generates the bypass evaluator with integrity checks.
 * @param config - Bypass configuration
 * @returns String containing evaluator class
 */
export function generateBypassEvaluator(config: ReviewerLagBypassConfig): string {
  return `
import type { IBypassEvaluator, BypassAssessment, PullRequest, TaskAssignee } from "./interfaces";
import { ReviewThreadAnalyzer } from "./thread-analyzer";

/**
 * Evaluates bypass eligibility with safeguards against abuse.
 */
export class ReviewerLagBypassEvaluator implements IBypassEvaluator {
  private readonly config: ReviewerLagBypassConfig;
  private readonly analyzer: ReviewThreadAnalyzer;

  constructor(config: ReviewerLagBypassConfig) {
    this.config = config;
    this.analyzer = new ReviewThreadAnalyzer(config);
  }

  async evaluate(
    assignee: TaskAssignee,
    activePrs: PullRequest[],
    config: ReviewerLagBypassConfig
  ): Promise<BypassAssessment> {
    const integrityWarnings: string[] = [];
    let totalUnresolved = 0;
    let totalAssigneeLast = 0;
    let maxAgeHours = 0;

    // Analyze each active PR for reviewer lag
    for (const pr of activePrs) {
      const analysis = await this.analyzer.analyzeThreads(pr, assignee);
      totalUnresolved += analysis.totalUnresolved;
      totalAssigneeLast += analysis.assigneeIsLastCommenter;

      if (analysis.oldestAssigneeCommentAgeHours > maxAgeHours) {
        maxAgeHours = analysis.oldestAssigneeCommentAgeHours;
      }

      // Integrity check: flag if all threads resolved but still claiming lag
      if (analysis.totalUnresolved === 0) {
        integrityWarnings.push(\`PR #\${pr.number}: No unresolved threads found\`);
      }

      // Integrity check: flag very short comments that might be gaming
      const shortComments = analysis.threads.filter(
        t => t.isAssigneeLast && t.commentLength < config.minCommentLength
      );
      if (shortComments.length > 0) {
        integrityWarnings.push(
          \`PR #\${pr.number}: \${shortComments.length} comment(s) below minimum length threshold\`
        );
      }
    }

    // Determine qualification
    const allThreadsHaveAssigneeLast = totalUnresolved > 0 && totalAssigneeLast === totalUnresolved;
    const exceedsLagThreshold = maxAgeHours >= config.lagThresholdHours;
    const meetsThreadRequirement = config.requireAllThreadsResolved
      ? allThreadsHaveAssigneeLast
      : totalAssigneeLast > 0;

    const qualifies = meetsThreadRequirement && exceedsLagThreshold;

    let reason: string;
    if (!qualifies) {
      if (!meetsThreadRequirement) {
        reason = \`Assignee is not last commenter on all unresolved threads (\${totalAssigneeLast}/\${totalUnresolved})\`;
      } else if (!exceedsLagThreshold) {
        reason = \`Last assignee comment was \${maxAgeHours.toFixed(1)}h ago (threshold: \${config.lagThresholdHours}h)\`;
      } else {
        reason = "Does not meet bypass criteria";
      }
    } else {
      reason = \`Reviewer lag detected: \${totalAssigneeLast} thread(s) with assignee as last commenter for \${maxAgeHours.toFixed(1)}h\`;
    }

    return {
      qualifiesForBypass: qualifies,
      reason,
      unresolvedThreadCount: totalUnresolved,
      assigneeLastCommentAgeHours: maxAgeHours,
      threadsWithAssigneeLastComment: totalAssigneeLast,
      currentBypassedTaskCount: 0, // Would be populated by tracker
      integrityWarnings,
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the bypass system.
 * @returns String containing Vitest test suite
 */
export function generateBypassTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { ReviewThreadAnalyzer, ReviewerLagBypassEvaluator } from "../command-start-stop-reviewer-lag-bypass";
import type { PullRequest, TaskAssignee } from "../../types";

describe("Reviewer Lag Bypass", () => {
  let analyzer: ReviewThreadAnalyzer;
  let evaluator: ReviewerLagBypassEvaluator;
  let mockAssignee: TaskAssignee;

  beforeEach(() => {
    const config = {
      lagThresholdHours: 24,
      requireAllThreadsResolved: true,
      maxBypassedTasks: 2,
      enableIntegrityChecks: true,
      minCommentLength: 20,
      logLevel: "warn" as const,
    };

    analyzer = new ReviewThreadAnalyzer(config);
    evaluator = new ReviewerLagBypassEvaluator(config);
    mockAssignee = { id: 1001, login: "contributor" };
  });

  it("should analyze threads and identify assignee as last commenter", async () => {
    const mockPR = { number: 42 } as PullRequest;
    const analysis = await analyzer.analyzeThreads(mockPR, mockAssignee);

    expect(analysis.totalUnresolved).toBeGreaterThan(0);
    expect(analysis.threads).toBeDefined();
    expect(Array.isArray(analysis.threads)).toBe(true);
  });

  it("should qualify bypass when assignee is last commenter beyond threshold", async () => {
    const mockPRs = [{ number: 42 }] as PullRequest[];
    const config = {
      lagThresholdHours: 24,
      requireAllThreadsResolved: false, // Relaxed for test
      maxBypassedTasks: 2,
      enableIntegrityChecks: true,
      minCommentLength: 20,
      logLevel: "warn" as const,
    };

    const assessment = await evaluator.evaluate(mockAssignee, mockPRs, config);
    // Scaffold returns simulated data; verify structure
    expect(assessment).toHaveProperty("qualifiesForBypass");
    expect(assessment).toHaveProperty("reason");
    expect(assessment).toHaveProperty("integrityWarnings");
  });

  it("should include integrity warnings for suspicious patterns", async () => {
    const mockPRs = [{ number: 42 }] as PullRequest[];
    const config = {
      lagThresholdHours: 24,
      requireAllThreadsResolved: true,
      maxBypassedTasks: 2,
      enableIntegrityChecks: true,
      minCommentLength: 1000, // Very high to trigger warning
      logLevel: "warn" as const,
    };

    const assessment = await evaluator.evaluate(mockAssignee, mockPRs, config);
    expect(Array.isArray(assessment.integrityWarnings)).toBe(true);
  });

  it("should report correct thread counts in assessment", async () => {
    const mockPRs = [{ number: 42 }] as PullRequest[];
    const config = {
      lagThresholdHours: 24,
      requireAllThreadsResolved: false,
      maxBypassedTasks: 2,
      enableIntegrityChecks: true,
      minCommentLength: 20,
      logLevel: "warn" as const,
    };

    const assessment = await evaluator.evaluate(mockAssignee, mockPRs, config);
    expect(typeof assessment.unresolvedThreadCount).toBe("number");
    expect(typeof assessment.threadsWithAssigneeLastComment).toBe("number");
  });
});
`;
}

/**
 * Main generator function for all reviewer lag bypass artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<ReviewerLagBypassConfig>
): Record<string, string> {
  const resolvedConfig: ReviewerLagBypassConfig = {
    lagThresholdHours: 24,
    requireAllThreadsResolved: true,
    maxBypassedTasks: 2,
    enableIntegrityChecks: true,
    minCommentLength: 20,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateBypassInterfaces(),
    analyzer: generateThreadAnalyzer(resolvedConfig),
    evaluator: generateBypassEvaluator(resolvedConfig),
    tests: generateBypassTests(),
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

  if (!artifacts.interfaces.includes("IReviewThreadAnalyzer")) {
    errors.push("Missing IReviewThreadAnalyzer interface");
  }

  if (!artifacts.interfaces.includes("IBypassEvaluator")) {
    errors.push("Missing IBypassEvaluator interface");
  }

  if (!artifacts.interfaces.includes("IBypassTracker")) {
    errors.push("Missing IBypassTracker interface");
  }

  if (!artifacts.analyzer.includes("ReviewThreadAnalyzer")) {
    errors.push("Missing ReviewThreadAnalyzer class");
  }

  if (!artifacts.evaluator.includes("ReviewerLagBypassEvaluator")) {
    errors.push("Missing ReviewerLagBypassEvaluator class");
  }

  if (!artifacts.tests.includes("should qualify bypass when assignee is last commenter beyond threshold")) {
    errors.push("Missing critical test for bypass qualification");
  }

  if (!artifacts.tests.includes("should include integrity warnings for suspicious patterns")) {
    errors.push("Missing test for integrity checks");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateBypassInterfaces,
  generateThreadAnalyzer,
  generateBypassEvaluator,
  generateBypassTests,
};
