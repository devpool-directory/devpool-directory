/**
 * @file disqualifier-wrong-pr-reminder.ts
 * @description Scaffolding and generator utilities for fixing the issue where
 * deadline reminders are posted on the wrong pull request when multiple PRs
 * are linked to the same issue.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#128
 * Problem: When User A is assigned to an issue, User B's PR (which should have
 * been closed but wasn't) incorrectly receives the reminder notification.
 * Solution: Filter reminder targets by verifying the PR author matches the
 * current task assignee before dispatching notifications.
 */

import type { PluginContext, TaskAssignee, PullRequest } from "./types";

/**
 * Configuration interface for the wrong-pr-reminder fix plugin.
 */
export interface DisqualifierWrongPrReminderConfig {
  /** Whether to strictly enforce assignee matching before sending reminders */
  strictAssigneeMatch: boolean;
  /** Maximum number of linked PRs to check per issue */
  maxLinkedPrsToCheck: number;
  /** Log level for debugging reminder routing decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Represents a candidate PR that might receive a reminder.
 */
export interface ReminderCandidate {
  prNumber: number;
  prAuthor: string;
  issueNumber: number;
  isAssignedToIssue: boolean;
  shouldBeReminded: boolean;
  reason: string;
}

/**
 * Generates the TypeScript interface definitions for the reminder filtering logic.
 * @returns String containing TypeScript interface code
 */
export function generateReminderFilterInterfaces(): string {
  return `
/**
 * Validates whether a PR should receive a deadline reminder based on
 * assignment status and linkage to the target issue.
 */
export interface IReminderFilter {
  /**
   * Determines if a given PR is eligible to receive a reminder.
   * @param pr - The pull request to evaluate
   * @param assignees - List of current task assignees
   * @returns True if the PR should receive the reminder
   */
  shouldReceiveReminder(pr: PullRequest, assignees: TaskAssignee[]): boolean;

  /**
   * Filters a list of candidate PRs to only those eligible for reminders.
   * @param candidates - Array of PRs linked to the issue
   * @param assignees - Current task assignees
   * @returns Filtered array of eligible PRs
   */
  filterEligibleReminders(
    candidates: PullRequest[],
    assignees: TaskAssignee[]
  ): PullRequest[];
}

/**
 * Metadata attached to reminder decisions for auditability.
 */
export interface IReminderDecisionMetadata {
  prNumber: number;
  issueNumber: number;
  decision: "send" | "skip";
  reason: string;
  timestamp: string;
  assigneeMatched: boolean;
}
`;
}

/**
 * Generates the core filtering implementation that prevents wrong-PR reminders.
 * @param config - Plugin configuration
 * @returns String containing the filter class implementation
 */
export function generateReminderFilterImplementation(
  config: DisqualifierWrongPrReminderConfig
): string {
  const strictCheck = config.strictAssigneeMatch
    ? `if (!assigneeIds.has(pr.author.id)) {
      this.log("debug", \`Skipping PR #\${pr.number}: author \${pr.author.login} not in assignee list\`);
      return false;
    }`
    : `// Non-strict mode: warn but don't block
    if (!assigneeIds.has(pr.author.id)) {
      this.log("warn", \`PR #\${pr.number} author \${pr.author.login} not assigned, but strict mode is off\`);
    }`;

  return `
import type { IReminderFilter, IReminderDecisionMetadata } from "./interfaces";

export class WrongPrReminderFilter implements IReminderFilter {
  private readonly config: DisqualifierWrongPrReminderConfig;
  private readonly decisionLog: IReminderDecisionMetadata[] = [];

  constructor(config: DisqualifierWrongPrReminderConfig) {
    this.config = config;
  }

  shouldReceiveReminder(pr: PullRequest, assignees: TaskAssignee[]): boolean {
    const assigneeIds = new Set(assignees.map(a => a.id));
    
    // Primary check: PR author must be among current assignees
    ${strictCheck}

    // Secondary check: PR must not be in a closed/merged state
    if (pr.state === "closed" || pr.merged === true) {
      this.logDecision({
        prNumber: pr.number,
        issueNumber: pr.issueNumber,
        decision: "skip",
        reason: "PR is closed or merged",
        timestamp: new Date().toISOString(),
        assigneeMatched: assigneeIds.has(pr.author.id),
      });
      return false;
    }

    this.logDecision({
      prNumber: pr.number,
      issueNumber: pr.issueNumber,
      decision: "send",
      reason: "Author is assigned and PR is open",
      timestamp: new Date().toISOString(),
      assigneeMatched: true,
    });

    return true;
  }

  filterEligibleReminders(
    candidates: PullRequest[],
    assignees: TaskAssignee[]
  ): PullRequest[] {
    const limited = candidates.slice(0, this.config.maxLinkedPrsToCheck);
    return limited.filter(pr => this.shouldReceiveReminder(pr, assignees));
  }

  getDecisionLog(): IReminderDecisionMetadata[] {
    return [...this.decisionLog];
  }

  private logDecision(metadata: IReminderDecisionMetadata): void {
    this.decisionLog.push(metadata);
    this.log(this.config.logLevel, \`[\${metadata.decision.toUpperCase()}] PR #\${metadata.prNumber}: \${metadata.reason}\`);
  }

  private log(level: string, message: string): void {
    // Delegate to plugin context logger
    console[level]?.(message) ?? console.log(message);
  }
}
`;
}

/**
 * Generates test scaffolding for validating the wrong-PR reminder fix.
 * @returns String containing Jest/Vitest test suite code
 */
export function generateReminderFilterTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { WrongPrReminderFilter } from "../disqualifier-wrong-pr-reminder";
import type { PullRequest, TaskAssignee } from "../../types";

describe("WrongPrReminderFilter", () => {
  let filter: WrongPrReminderFilter;
  let mockAssignees: TaskAssignee[];
  let mockPRs: PullRequest[];

  beforeEach(() => {
    filter = new WrongPrReminderFilter({
      strictAssigneeMatch: true,
      maxLinkedPrsToCheck: 10,
      logLevel: "debug",
    });

    mockAssignees = [
      { id: 1001, login: "userA" },
      { id: 1002, login: "userB" },
    ];

    mockPRs = [
      {
        number: 42,
        author: { id: 1001, login: "userA" },
        issueNumber: 128,
        state: "open",
        merged: false,
      },
      {
        number: 43,
        author: { id: 9999, login: "userC" },
        issueNumber: 128,
        state: "open",
        merged: false,
      },
      {
        number: 44,
        author: { id: 1002, login: "userB" },
        issueNumber: 128,
        state: "closed",
        merged: false,
      },
    ] as PullRequest[];
  });

  it("should allow reminder for assigned user with open PR", () => {
    expect(filter.shouldReceiveReminder(mockPRs[0], mockAssignees)).toBe(true);
  });

  it("should block reminder for unassigned user even with open PR", () => {
    expect(filter.shouldReceiveReminder(mockPRs[1], mockAssignees)).toBe(false);
  });

  it("should block reminder for assigned user with closed PR", () => {
    expect(filter.shouldReceiveReminder(mockPRs[2], mockAssignees)).toBe(false);
  });

  it("should filter eligible reminders correctly", () => {
    const eligible = filter.filterEligibleReminders(mockPRs, mockAssignees);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].number).toBe(42);
  });

  it("should maintain decision log for auditability", () => {
    filter.filterEligibleReminders(mockPRs, mockAssignees);
    const log = filter.getDecisionLog();
    expect(log).toHaveLength(3);
    expect(log.filter(d => d.decision === "send")).toHaveLength(1);
    expect(log.filter(d => d.decision === "skip")).toHaveLength(2);
  });
});
`;
}

/**
 * Generates the GitHub Actions workflow patch for integrating the filter.
 * @returns String containing YAML workflow snippet
 */
export function generateWorkflowIntegrationPatch(): string {
  return `
# Add this step to the daemon-disqualifier reminder workflow
# after fetching linked PRs and before sending notifications

- name: Filter PRs by assignee match
  uses: ./actions/filter-wrong-pr-reminders
  with:
    strict-mode: true
    max-prs-to-check: 10
    log-level: info

- name: Send filtered reminders
  if: steps.filter.outputs.eligible_count > 0
  uses: ./actions/send-deadline-reminder
  with:
    pr-numbers: \${{ steps.filter.outputs.eligible_pr_numbers }}
    issue-number: \${{ github.event.issue.number }}
`;
}

/**
 * Main generator function that produces all scaffolding artifacts.
 * @param config - Optional plugin configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<DisqualifierWrongPrReminderConfig>
): Record<string, string> {
  const resolvedConfig: DisqualifierWrongPrReminderConfig = {
    strictAssigneeMatch: true,
    maxLinkedPrsToCheck: 10,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateReminderFilterInterfaces(),
    implementation: generateReminderFilterImplementation(resolvedConfig),
    tests: generateReminderFilterTests(),
    workflowPatch: generateWorkflowIntegrationPatch(),
  };
}

/**
 * Validates that generated artifacts contain required sections.
 * @param artifacts - Generated code artifacts to validate
 * @returns Validation result with pass/fail status and messages
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IReminderFilter")) {
    errors.push("Missing IReminderFilter interface definition");
  }

  if (!artifacts.implementation.includes("WrongPrReminderFilter")) {
    errors.push("Missing WrongPrReminderFilter class implementation");
  }

  if (!artifacts.implementation.includes("shouldReceiveReminder")) {
    errors.push("Missing shouldReceiveReminder method in implementation");
  }

  if (!artifacts.tests.includes("should block reminder for unassigned user")) {
    errors.push("Missing critical test case for unassigned user blocking");
  }

  if (!artifacts.workflowPatch.includes("filter-wrong-pr-reminders")) {
    errors.push("Missing workflow integration step");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateReminderFilterInterfaces,
  generateReminderFilterImplementation,
  generateReminderFilterTests,
  generateWorkflowIntegrationPatch,
};
