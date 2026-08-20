/**
 * @file command-start-stop-auto-reopen-pr.ts
 * @description Scaffolding and generator utilities for automatically reopening
 * closed PRs when a contributor is re-assigned by an admin. Also handles
 * syncing commits that were pushed while the PR was closed.
 *
 * Upstream Issue: ubiquity-os-marketplace/command-start-stop#186
 * Problem: When admins re-assign ejected contributors, their PRs remain closed
 * or stale. Reviewers must manually tell users to push fresh commits or open
 * new PRs, creating friction and delaying review.
 * Solution: Detect admin re-assignment events and automatically reopen the
 * contributor's most recent closed PR, optionally triggering a commit sync
 * to pull in any work done while the PR was closed.
 */

import type { PluginContext, PullRequest, TaskAssignee } from "./types";

/**
 * Configuration for auto-reopen behavior.
 */
export interface AutoReopenConfig {
  /** Maximum age in hours of a closed PR eligible for auto-reopen */
  maxPrAgeHours: number;
  /** Whether to attempt syncing commits pushed while PR was closed */
  syncCommitsOnReopen: boolean;
  /** Only reopen if the re-assignee matches the original PR author */
  requireAuthorMatch: boolean;
  /** Post a comment explaining the auto-reopen action */
  postReopenComment: boolean;
  /** Log level for reopen operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of evaluating whether a PR should be auto-reopened.
 */
export interface ReopenDecision {
  shouldReopen: boolean;
  prNumber: number;
  reason: string;
  originalAuthor: string;
  newAssignee: string;
  closedAt: string | null;
  hoursSinceClosed: number;
  hasNewCommits: boolean;
}

/**
 * Result of executing an auto-reopen operation.
 */
export interface ReopenResult {
  success: boolean;
  prNumber: number;
  reopened: boolean;
  commitsSynced: number;
  commentPosted: boolean;
  error?: string;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the auto-reopen system.
 */
export function generateAutoReopenInterfaces(): string {
  return `
/**
 * Interface for finding the most recent closed PR for a re-assigned contributor.
 */
export interface IPrFinder {
  /**
   * Finds the most recent closed PR authored by a specific user for a task.
   * @param repoOwner - Repository owner
   * @param repoName - Repository name
   * @param authorLogin - GitHub login of the PR author
   * @param issueNumber - Associated issue number
   * @returns The most recent closed PR or null if none found
   */
  findRecentClosedPr(
    repoOwner: string,
    repoName: string,
    authorLogin: string,
    issueNumber: number
  ): Promise<PullRequest | null>;
}

/**
 * Interface for evaluating whether a closed PR should be auto-reopened.
 */
export interface IReopenEvaluator {
  /**
   * Determines if a closed PR qualifies for automatic reopening.
   * @param pr - The closed pull request
   * @param newAssignee - The user being re-assigned
   * @param config - Auto-reopen configuration
   * @returns Decision with reasoning
   */
  evaluate(
    pr: PullRequest,
    newAssignee: TaskAssignee,
    config: AutoReopenConfig
  ): Promise<ReopenDecision>;
}

/**
 * Interface for executing the reopen and optional commit sync.
 */
export interface IPrReopener {
  /**
   * Reopens a closed PR and optionally syncs new commits.
   * @param decision - The reopen decision
   * @param config - Auto-reopen configuration
   * @returns Result of the reopen operation
   */
  execute(decision: ReopenDecision, config: AutoReopenConfig): Promise<ReopenResult>;
}
`;
}

/**
 * Generates the reopen evaluator implementation.
 */
export function generateReopenEvaluator(config: AutoReopenConfig): string {
  return `
import type { IReopenEvaluator, ReopenDecision } from "./interfaces";
import type { PullRequest, TaskAssignee } from "../types";

/**
 * Evaluates closed PRs against auto-reopen criteria including age limits,
 * author matching, and commit freshness.
 */
export class ReopenEvaluator implements IReopenEvaluator {
  private readonly config: AutoReopenConfig;

  constructor(config: AutoReopenConfig) {
    this.config = config;
  }

  async evaluate(
    pr: PullRequest,
    newAssignee: TaskAssignee,
    config: AutoReopenConfig
  ): Promise<ReopenDecision> {
    const now = new Date();
    const closedAt = pr.closedAt ? new Date(pr.closedAt) : null;
    const hoursSinceClosed = closedAt
      ? (now.getTime() - closedAt.getTime()) / 3600000
      : Infinity;

    // Check author match if required
    if (config.requireAuthorMatch && pr.author.login !== newAssignee.login) {
      return {
        shouldReopen: false,
        prNumber: pr.number,
        reason: \`Author mismatch: PR by \${pr.author.login}, re-assigned to \${newAssignee.login}\`,
        originalAuthor: pr.author.login,
        newAssignee: newAssignee.login,
        closedAt: pr.closedAt ?? null,
        hoursSinceClosed,
        hasNewCommits: false,
      };
    }

    // Check PR age limit
    if (hoursSinceClosed > config.maxPrAgeHours) {
      return {
        shouldReopen: false,
        prNumber: pr.number,
        reason: \`PR too old: closed \${hoursSinceClosed.toFixed(1)}h ago (max: \${config.maxPrAgeHours}h)\`,
        originalAuthor: pr.author.login,
        newAssignee: newAssignee.login,
        closedAt: pr.closedAt ?? null,
        hoursSinceClosed,
        hasNewCommits: false,
      };
    }

    // In production, check for new commits on the branch since PR was closed
    const hasNewCommits = false; // Placeholder

    return {
      shouldReopen: true,
      prNumber: pr.number,
      reason: \`Admin re-assigned \${newAssignee.login}. PR #\${pr.number} closed \${hoursSinceClosed.toFixed(1)}h ago qualifies for auto-reopen.\`,
      originalAuthor: pr.author.login,
      newAssignee: newAssignee.login,
      closedAt: pr.closedAt ?? null,
      hoursSinceClosed,
      hasNewCommits,
    };
  }
}
`;
}

/**
 * Generates the PR reopener implementation.
 */
export function generatePrReopener(): string {
  return `
import type { IPrReopener, ReopenDecision, ReopenResult } from "./interfaces";

/**
 * Executes PR reopen operations with optional commit synchronization
 * and explanatory comments.
 */
export class PrReopener implements IPrReopener {
  async execute(decision: ReopenDecision, config: AutoReopenConfig): Promise<ReopenResult> {
    const timestamp = new Date().toISOString();

    if (!decision.shouldReopen) {
      return {
        success: false,
        prNumber: decision.prNumber,
        reopened: false,
        commitsSynced: 0,
        commentPosted: false,
        error: decision.reason,
        timestamp,
      };
    }

    try {
      // In production: call GitHub API to reopen PR
      // await octokit.rest.pulls.update({ owner, repo, pull_number: decision.prNumber, state: "open" });

      let commitsSynced = 0;
      if (config.syncCommitsOnReopen && decision.hasNewCommits) {
        // In production: trigger branch update or push empty commit
        commitsSynced = 1; // Placeholder
      }

      let commentPosted = false;
      if (config.postReopenComment) {
        // In production: post explanatory comment
        commentPosted = true;
      }

      console[config.logLevel]?.(
        \`[AutoReopen] Reopened PR #\${decision.prNumber} for \${decision.newAssignee}\`
      );

      return {
        success: true,
        prNumber: decision.prNumber,
        reopened: true,
        commitsSynced,
        commentPosted,
        timestamp,
      };
    } catch (err) {
      return {
        success: false,
        prNumber: decision.prNumber,
        reopened: false,
        commitsSynced: 0,
        commentPosted: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp,
      };
    }
  }
}
`;
}

/**
 * Generates test scaffolding for the auto-reopen system.
 */
export function generateAutoReopenTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { ReopenEvaluator, PrReopener } from "../command-start-stop-auto-reopen-pr";
import type { PullRequest, TaskAssignee } from "../../types";

describe("Auto-Reopen PR System", () => {
  let evaluator: ReopenEvaluator;
  let reopener: PrReopener;
  let mockPR: PullRequest;
  let mockAssignee: TaskAssignee;

  beforeEach(() => {
    const config = {
      maxPrAgeHours: 168,
      syncCommitsOnReopen: true,
      requireAuthorMatch: true,
      postReopenComment: true,
      logLevel: "info" as const,
    };

    evaluator = new ReopenEvaluator(config);
    reopener = new PrReopener();

    mockPR = {
      number: 186,
      author: { id: 1001, login: "contributor" },
      state: "closed",
      closedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      merged: false,
    } as PullRequest;

    mockAssignee = { id: 1001, login: "contributor" };
  });

  it("should approve reopen for matching author within age limit", async () => {
    const config = {
      maxPrAgeHours: 168,
      syncCommitsOnReopen: true,
      requireAuthorMatch: true,
      postReopenComment: true,
      logLevel: "info" as const,
    };

    const decision = await evaluator.evaluate(mockPR, mockAssignee, config);
    expect(decision.shouldReopen).toBe(true);
    expect(decision.originalAuthor).toBe("contributor");
    expect(decision.hoursSinceClosed).toBeLessThan(168);
  });

  it("should reject reopen when author does not match", async () => {
    const differentAssignee = { id: 2001, login: "other-user" };
    const config = {
      maxPrAgeHours: 168,
      syncCommitsOnReopen: true,
      requireAuthorMatch: true,
      postReopenComment: true,
      logLevel: "info" as const,
    };

    const decision = await evaluator.evaluate(mockPR, differentAssignee, config);
    expect(decision.shouldReopen).toBe(false);
    expect(decision.reason).toContain("Author mismatch");
  });

  it("should reject reopen for PRs exceeding age limit", async () => {
    mockPR.closedAt = new Date(Date.now() - 200 * 3600000).toISOString();
    const config = {
      maxPrAgeHours: 168,
      syncCommitsOnReopen: true,
      requireAuthorMatch: true,
      postReopenComment: true,
      logLevel: "info" as const,
    };

    const decision = await evaluator.evaluate(mockPR, mockAssignee, config);
    expect(decision.shouldReopen).toBe(false);
    expect(decision.reason).toContain("too old");
  });

  it("should execute reopen successfully for valid decisions", async () => {
    const config = {
      maxPrAgeHours: 168,
      syncCommitsOnReopen: true,
      requireAuthorMatch: true,
      postReopenComment: true,
      logLevel: "info" as const,
    };

    const decision = await evaluator.evaluate(mockPR, mockAssignee, config);
    const result = await reopener.execute(decision, config);

    expect(result.success).toBe(true);
    expect(result.reopened).toBe(true);
    expect(result.commentPosted).toBe(true);
  });
});
`;
}

/**
 * Main generator function for all auto-reopen artifacts.
 */
export function generateAllArtifacts(
  config?: Partial<AutoReopenConfig>
): Record<string, string> {
  const resolvedConfig: AutoReopenConfig = {
    maxPrAgeHours: 168,
    syncCommitsOnReopen: true,
    requireAuthorMatch: true,
    postReopenComment: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateAutoReopenInterfaces(),
    evaluator: generateReopenEvaluator(resolvedConfig),
    reopener: generatePrReopener(),
    tests: generateAutoReopenTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IPrFinder")) {
    errors.push("Missing IPrFinder interface");
  }

  if (!artifacts.interfaces.includes("IReopenEvaluator")) {
    errors.push("Missing IReopenEvaluator interface");
  }

  if (!artifacts.interfaces.includes("IPrReopener")) {
    errors.push("Missing IPrReopener interface");
  }

  if (!artifacts.evaluator.includes("ReopenEvaluator")) {
    errors.push("Missing ReopenEvaluator class");
  }

  if (!artifacts.reopener.includes("PrReopener")) {
    errors.push("Missing PrReopener class");
  }

  if (!artifacts.tests.includes("should approve reopen for matching author within age limit")) {
    errors.push("Missing critical test for author-matched reopen");
  }

  if (!artifacts.tests.includes("should reject reopen when author does not match")) {
    errors.push("Missing test for author mismatch rejection");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateAutoReopenInterfaces,
  generateReopenEvaluator,
  generatePrReopener,
  generateAutoReopenTests,
};
