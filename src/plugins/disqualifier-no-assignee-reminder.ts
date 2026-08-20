/**
 * @file disqualifier-no-assignee-reminder.ts
 * @description Scaffolding and generator utilities for fixing the issue where
 * deadline reminders are incorrectly posted when a PR is reopened but has no
 * current assignee.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#135
 * Problem: Reminders should not be posted on pull-request reopening if there
 * is currently no assignee on the task.
 * Solution: Add an explicit assignee-presence guard before dispatching any
 * reminder notifications during PR lifecycle events (reopened, synchronize, etc).
 */

import type { PluginContext, PullRequest, TaskAssignee } from "./types";

/**
 * Configuration for the no-assignee reminder guard.
 */
export interface NoAssigneeReminderGuardConfig {
  /** Whether to block reminders entirely when assignee list is empty */
  blockOnEmptyAssignees: boolean;
  /** Events that trigger the guard check */
  guardedEvents: string[];
  /** Log level for skipped reminder decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of evaluating whether a reminder should proceed.
 */
export interface ReminderGuardResult {
  shouldProceed: boolean;
  reason: string;
  event: string;
  prNumber: number;
  assigneeCount: number;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the assignee guard system.
 * @returns String containing interface definitions
 */
export function generateGuardInterfaces(): string {
  return `
/**
 * Interface for checking assignee presence before reminder dispatch.
 */
export interface IAssigneePresenceGuard {
  /**
   * Evaluates whether a reminder should proceed based on assignee state.
   * @param pr - The pull request triggering the event
   * @param assignees - Current list of task assignees
   * @param event - The GitHub event type (e.g., "reopened", "synchronize")
   * @returns Guard result indicating whether to proceed or skip
   */
  evaluate(
    pr: PullRequest,
    assignees: TaskAssignee[],
    event: string
  ): ReminderGuardResult;

  /**
   * Returns the list of events this guard monitors.
   */
  getGuardedEvents(): string[];
}

/**
 * Interface for audit logging of skipped reminders.
 */
export interface IReminderSkipLogger {
  /**
   * Logs a skipped reminder decision for observability.
   * @param result - The guard result explaining why the reminder was skipped
   */
  logSkip(result: ReminderGuardResult): void;

  /**
   * Retrieves recent skip decisions for debugging.
   * @param limit - Maximum number of entries to return
   */
  getRecentSkips(limit: number): ReminderGuardResult[];
}
`;
}

/**
 * Generates the core guard implementation.
 * @param config - Guard configuration
 * @returns String containing the guard class implementation
 */
export function generateGuardImplementation(
  config: NoAssigneeReminderGuardConfig
): string {
  return `
import type { IAssigneePresenceGuard, IReminderSkipLogger, ReminderGuardResult } from "./interfaces";
import type { PullRequest, TaskAssignee } from "../types";

/**
 * Guard that prevents reminder dispatch when no assignee exists on the task.
 * Addresses daemon-disqualifier#135: reminders on PR reopening with no assignee.
 */
export class NoAssigneeReminderGuard implements IAssigneePresenceGuard {
  private readonly config: NoAssigneeReminderGuardConfig;
  private readonly logger: IReminderSkipLogger;

  constructor(config: NoAssigneeReminderGuardConfig, logger: IReminderSkipLogger) {
    this.config = config;
    this.logger = logger;
  }

  evaluate(
    pr: PullRequest,
    assignees: TaskAssignee[],
    event: string
  ): ReminderGuardResult {
    const isGuardedEvent = this.config.guardedEvents.includes(event);
    const assigneeCount = assignees.length;

    // If event is not in guarded list, always allow
    if (!isGuardedEvent) {
      return {
        shouldProceed: true,
        reason: \`Event '\${event}' is not in guarded events list\`,
        event,
        prNumber: pr.number,
        assigneeCount,
        timestamp: new Date().toISOString(),
      };
    }

    // Primary guard: block if no assignees and blocking is enabled
    if (assigneeCount === 0 && this.config.blockOnEmptyAssignees) {
      const result: ReminderGuardResult = {
        shouldProceed: false,
        reason: "No assignees on task - reminder suppressed to avoid noise",
        event,
        prNumber: pr.number,
        assigneeCount,
        timestamp: new Date().toISOString(),
      };

      this.logger.logSkip(result);
      return result;
    }

    return {
      shouldProceed: true,
      reason: \`Assignee check passed (\${assigneeCount} assignee(s) present)\`,
      event,
      prNumber: pr.number,
      assigneeCount,
      timestamp: new Date().toISOString(),
    };
  }

  getGuardedEvents(): string[] {
    return [...this.config.guardedEvents];
  }
}
`;
}

/**
 * Generates test scaffolding for the no-assignee guard.
 * @returns String containing Vitest test suite
 */
export function generateGuardTests(): string {
  return `
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NoAssigneeReminderGuard } from "../disqualifier-no-assignee-reminder";
import type { IReminderSkipLogger } from "../interfaces";
import type { PullRequest, TaskAssignee } from "../../types";

describe("NoAssigneeReminderGuard", () => {
  let guard: NoAssigneeReminderGuard;
  let mockLogger: IReminderSkipLogger;
  let mockPR: PullRequest;

  beforeEach(() => {
    mockLogger = {
      logSkip: vi.fn(),
      getRecentSkips: vi.fn().mockReturnValue([]),
    };

    guard = new NoAssigneeReminderGuard(
      {
        blockOnEmptyAssignees: true,
        guardedEvents: ["reopened", "synchronize"],
        logLevel: "info",
      },
      mockLogger
    );

    mockPR = {
      number: 42,
      author: { id: 1001, login: "userA" },
      issueNumber: 135,
      state: "open",
      merged: false,
    } as PullRequest;
  });

  it("should block reminder on reopened event with no assignees", () => {
    const result = guard.evaluate(mockPR, [], "reopened");
    expect(result.shouldProceed).toBe(false);
    expect(result.reason).toContain("No assignees");
    expect(mockLogger.logSkip).toHaveBeenCalledWith(result);
  });

  it("should allow reminder on reopened event with active assignee", () => {
    const assignees: TaskAssignee[] = [{ id: 1001, login: "userA" }];
    const result = guard.evaluate(mockPR, assignees, "reopened");
    expect(result.shouldProceed).toBe(true);
    expect(result.assigneeCount).toBe(1);
  });

  it("should allow reminder on non-guarded event even without assignees", () => {
    const result = guard.evaluate(mockPR, [], "opened");
    expect(result.shouldProceed).toBe(true);
    expect(result.reason).toContain("not in guarded events");
  });

  it("should report correct guarded events list", () => {
    const events = guard.getGuardedEvents();
    expect(events).toContain("reopened");
    expect(events).toContain("synchronize");
    expect(events).toHaveLength(2);
  });
});
`;
}

/**
 * Main generator function for all no-assignee guard artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<NoAssigneeReminderGuardConfig>
): Record<string, string> {
  const resolvedConfig: NoAssigneeReminderGuardConfig = {
    blockOnEmptyAssignees: true,
    guardedEvents: ["reopened", "synchronize", "ready_for_review"],
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateGuardInterfaces(),
    implementation: generateGuardImplementation(resolvedConfig),
    tests: generateGuardTests(),
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

  if (!artifacts.interfaces.includes("IAssigneePresenceGuard")) {
    errors.push("Missing IAssigneePresenceGuard interface");
  }

  if (!artifacts.implementation.includes("NoAssigneeReminderGuard")) {
    errors.push("Missing NoAssigneeReminderGuard class");
  }

  if (!artifacts.implementation.includes("blockOnEmptyAssignees")) {
    errors.push("Missing empty-assignee blocking logic");
  }

  if (!artifacts.tests.includes("should block reminder on reopened event with no assignees")) {
    errors.push("Missing critical test for no-assignee blocking");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateGuardInterfaces,
  generateGuardImplementation,
  generateGuardTests,
};
