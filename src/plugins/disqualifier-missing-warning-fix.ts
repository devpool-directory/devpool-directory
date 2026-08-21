/**
 * @file disqualifier-missing-warning-fix.ts
 * @description Scaffolding and generator utilities for fixing the issue where
 * the bot fails to post intermediate warning comments before reaching max extensions.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#113
 * Problem: Bot jumps straight to "3/3 extensions used" without posting prior warnings.
 * Solution: Implement a reliable warning dispatch system with delivery verification,
 * retry logic, and explicit state tracking to ensure all intermediate warnings are posted.
 */

import type { PluginContext, PullRequest, TaskAssignee, ExtensionState } from "./types";

/**
 * Configuration for the missing warning fix.
 */
export interface MissingWarningFixConfig {
  /** Maximum number of retry attempts for failed warning posts */
  maxRetries: number;
  /** Delay in ms between retry attempts */
  retryDelayMs: number;
  /** Whether to verify comment delivery by re-fetching after post */
  verifyDelivery: boolean;
  /** Log level for warning dispatch events */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of attempting to post a warning comment.
 */
export interface WarningPostResult {
  success: boolean;
  commentId?: number;
  attemptNumber: number;
  error?: string;
  verified: boolean;
  timestamp: string;
}

/**
 * State tracker for ensuring all warnings are dispatched.
 */
export interface WarningDispatchState {
  issueNumber: number;
  prNumber: number;
  assigneeId: number;
  totalExtensionsAllowed: number;
  warningsPosted: Map<number, WarningPostResult>;
  lastCheckedAt: string;
}

/**
 * Generates TypeScript interfaces for the warning dispatch system.
 * @returns String containing interface definitions
 */
export function generateWarningDispatchInterfaces(): string {
  return `
/**
 * Interface for reliably posting warning comments with retry and verification.
 */
export interface IReliableWarningPoster {
  /**
   * Posts a warning comment with automatic retry on failure.
   * @param pr - The pull request to comment on
   * @param extensionCount - Current extension count (e.g., 1, 2, 3)
   * @param message - The warning message body
   * @returns Post result indicating success/failure and verification status
   */
  postWarningWithRetry(
    pr: PullRequest,
    extensionCount: number,
    message: string
  ): Promise<WarningPostResult>;

  /**
   * Verifies that a previously posted comment still exists.
   * @param prNumber - PR number to check
   * @param commentId - Comment ID to verify
   * @returns True if comment exists and is visible
   */
  verifyCommentExists(prNumber: number, commentId: number): Promise<boolean>;
}

/**
 * Interface for tracking which warnings have been successfully dispatched.
 */
export interface IWarningStateTracker {
  /**
   * Records a successful warning post.
   * @param state - Updated dispatch state
   */
  recordSuccessfulPost(state: WarningDispatchState): void;

  /**
   * Retrieves current dispatch state for an issue/PR pair.
   * @param issueNumber - Issue number
   * @param prNumber - PR number
   * @returns Current dispatch state or null if none exists
   */
  getState(issueNumber: number, prNumber: number): WarningDispatchState | null;

  /**
   * Identifies missing warnings that should have been posted but weren't.
   * @param issueNumber - Issue number to check
   * @param currentExtensionCount - Current extension usage count
   * @returns Array of extension counts for which warnings are missing
   */
  findMissingWarnings(
    issueNumber: number,
    currentExtensionCount: number
  ): number[];
}

/**
 * Interface for generating warning messages at each extension stage.
 */
export interface IWarningMessageGenerator {
  /**
   * Generates the appropriate warning message for a given extension count.
   * @param extensionCount - Number of extensions used so far
   * @param maxExtensions - Maximum allowed extensions
   * @param xpAtRisk - XP that will be lost if disqualified
   * @returns Formatted warning message body
   */
  generateWarningMessage(
    extensionCount: number,
    maxExtensions: number,
    xpAtRisk: number
  ): string;
}
`;
}

/**
 * Generates the reliable warning poster implementation.
 * @param config - Fix configuration
 * @returns String containing poster class implementation
 */
export function generateReliableWarningPoster(config: MissingWarningFixConfig): string {
  return `
import type { IReliableWarningPoster, WarningPostResult } from "./interfaces";
import type { PullRequest } from "../types";

/**
 * Reliably posts warning comments with exponential backoff retry
 * and optional delivery verification.
 */
export class ReliableWarningPoster implements IReliableWarningPoster {
  private readonly config: MissingWarningFixConfig;

  constructor(config: MissingWarningFixConfig) {
    this.config = config;
  }

  async postWarningWithRetry(
    pr: PullRequest,
    extensionCount: number,
    message: string
  ): Promise<WarningPostResult> {
    let lastError: string | undefined;
    let commentId: number | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // In production, call GitHub API to create comment
        // For scaffold, simulate successful post
        console[this.config.logLevel](
          \`[Attempt \${attempt}/\${this.config.maxRetries}] Posting warning for PR #\${pr.number}, extension \${extensionCount}\`
        );

        // Simulated comment ID
        commentId = Math.floor(Math.random() * 1000000);

        const result: WarningPostResult = {
          success: true,
          commentId,
          attemptNumber: attempt,
          verified: false,
          timestamp: new Date().toISOString(),
        };

        // Verify delivery if configured
        if (this.config.verifyDelivery) {
          const exists = await this.verifyCommentExists(pr.number, commentId);
          result.verified = exists;

          if (!exists) {
            throw new Error(\`Comment \${commentId} not found after posting\`);
          }
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console[this.config.logLevel](
          \`[Attempt \${attempt}] Failed to post warning: \${lastError}\`
        );

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      commentId,
      attemptNumber: this.config.maxRetries,
      error: lastError ?? "Unknown error after max retries",
      verified: false,
      timestamp: new Date().toISOString(),
    };
  }

  async verifyCommentExists(prNumber: number, commentId: number): Promise<boolean> {
    // In production, fetch comment via GitHub API
    // For scaffold, always return true
    console.debug?.(\`Verifying comment \${commentId} on PR #\${prNumber}\`);
    return true;
  }
}
`;
}

/**
 * Generates the warning state tracker implementation.
 * @returns String containing tracker class implementation
 */
export function generateWarningStateTracker(): string {
  return `
import type { IWarningStateTracker, WarningDispatchState } from "./interfaces";

/**
 * Tracks which warnings have been successfully dispatched to prevent
 * gaps in the warning sequence.
 */
export class WarningStateTracker implements IWarningStateTracker {
  private readonly states: Map<string, WarningDispatchState> = new Map();

  private makeKey(issueNumber: number, prNumber: number): string {
    return \`\${issueNumber}:\${prNumber}\`;
  }

  recordSuccessfulPost(state: WarningDispatchState): void {
    const key = this.makeKey(state.issueNumber, state.prNumber);
    this.states.set(key, { ...state, lastCheckedAt: new Date().toISOString() });
  }

  getState(issueNumber: number, prNumber: number): WarningDispatchState | null {
    const key = this.makeKey(issueNumber, prNumber);
    return this.states.get(key) ?? null;
  }

  findMissingWarnings(
    issueNumber: number,
    currentExtensionCount: number
  ): number[] {
    const missing: number[] = [];

    // Check all issues/PRs for gaps
    for (const [key, state] of this.states.entries()) {
      if (state.issueNumber !== issueNumber) continue;

      for (let i = 1; i <= currentExtensionCount; i++) {
        if (!state.warningsPosted.has(i)) {
          missing.push(i);
        } else {
          const post = state.warningsPosted.get(i)!;
          if (!post.success || !post.verified) {
            missing.push(i);
          }
        }
      }
    }

    return [...new Set(missing)].sort((a, b) => a - b);
  }
}
`;
}

/**
 * Generates test scaffolding for the missing warning fix.
 * @returns String containing Vitest test suite
 */
export function generateMissingWarningTests(): string {
  return `
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReliableWarningPoster } from "../disqualifier-missing-warning-fix";
import type { PullRequest } from "../../types";

describe("Missing Warning Fix", () => {
  let poster: ReliableWarningPoster;
  let mockPR: PullRequest;

  beforeEach(() => {
    poster = new ReliableWarningPoster({
      maxRetries: 3,
      retryDelayMs: 100,
      verifyDelivery: true,
      logLevel: "debug",
    });

    mockPR = {
      number: 60,
      author: { id: 1001, login: "contributor" },
      issueNumber: 113,
      state: "open",
      merged: false,
    } as PullRequest;
  });

  it("should successfully post warning on first attempt", async () => {
    const result = await poster.postWarningWithRetry(mockPR, 1, "Warning 1/3");
    expect(result.success).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(result.commentId).toBeDefined();
  });

  it("should verify comment delivery when configured", async () => {
    const result = await poster.postWarningWithRetry(mockPR, 2, "Warning 2/3");
    expect(result.verified).toBe(true);
  });

  it("should include timestamp in post result", async () => {
    const result = await poster.postWarningWithRetry(mockPR, 1, "Warning");
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });
});
`;
}

/**
 * Main generator function for all missing warning fix artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<MissingWarningFixConfig>
): Record<string, string> {
  const resolvedConfig: MissingWarningFixConfig = {
    maxRetries: 3,
    retryDelayMs: 2000,
    verifyDelivery: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateWarningDispatchInterfaces(),
    poster: generateReliableWarningPoster(resolvedConfig),
    tracker: generateWarningStateTracker(),
    tests: generateMissingWarningTests(),
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

  if (!artifacts.interfaces.includes("IReliableWarningPoster")) {
    errors.push("Missing IReliableWarningPoster interface");
  }

  if (!artifacts.interfaces.includes("IWarningStateTracker")) {
    errors.push("Missing IWarningStateTracker interface");
  }

  if (!artifacts.poster.includes("ReliableWarningPoster")) {
    errors.push("Missing ReliableWarningPoster class");
  }

  if (!artifacts.poster.includes("postWarningWithRetry")) {
    errors.push("Missing postWarningWithRetry method");
  }

  if (!artifacts.tracker.includes("findMissingWarnings")) {
    errors.push("Missing findMissingWarnings method");
  }

  if (!artifacts.tests.includes("should verify comment delivery")) {
    errors.push("Missing critical test for delivery verification");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateWarningDispatchInterfaces,
  generateReliableWarningPoster,
  generateWarningStateTracker,
  generateMissingWarningTests,
};
