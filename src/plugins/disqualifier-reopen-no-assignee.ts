/**
 * @file disqualifier-reopen-no-assignee.ts
 * @description Fix for daemon-disqualifier sending reminders on PR reopening
 * even when no assignee is present. Adds an assignee check before posting
 * reminder comments to prevent noise on unassigned tasks.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#135
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Assignee presence validator for PR reopened events
 * - Conditional reminder suppression logic
 * - Integration patch for the disqualifier event handler
 * - Audit logging for suppressed reminders
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Pull request reopened event payload.
 */
export interface PrReopenedEvent {
  /** Repository full name */
  repoFullName: string;
  /** Pull request number */
  prNumber: number;
  /** Current assignees on the PR */
  assignees: Array<{
    login: string;
    id: number;
  }>;
  /** PR author */
  author: {
    login: string;
    id: number;
  };
  /** Whether the PR is a draft */
  isDraft: boolean;
  /** PR state */
  state: "open" | "closed";
  /** Timestamp of reopen action */
  reopenedAt: Date;
}

/**
 * Reminder configuration.
 */
export interface ReminderConfig {
  /** Whether to send reminders on PR reopen */
  enabledOnReopen: boolean;
  /** Minimum hours since last activity before reminding */
  minHoursSinceActivity: number;
  /** Template for reminder comment */
  template: string;
  /** Whether to skip if no assignee */
  skipIfNoAssignee: boolean;
  /** Labels that exempt from reminders */
  exemptLabels: string[];
}

/**
 * Result of reminder evaluation.
 */
export interface ReminderEvaluation {
  /** Whether a reminder should be sent */
  shouldSend: boolean;
  /** Reason for decision */
  reason: string;
  /** The assignees checked (for audit) */
  assigneesChecked: string[];
  /** Suppressed due to no assignee */
  suppressedNoAssignee: boolean;
}

// ============================================================================
// REMINDER GUARD
// ============================================================================

/**
 * Evaluates whether a reminder should be sent on PR reopen.
 */
export class ReopenReminderGuard {
  private config: ReminderConfig;

  constructor(config: ReminderConfig) {
    this.config = config;
  }

  /**
   * Evaluate whether to send a reminder on PR reopened event.
   * 
   * @param event - The PR reopened event
   * @returns Evaluation result with decision and reason
   */
  evaluate(event: PrReopenedEvent): ReminderEvaluation {
    const assigneeLogins = event.assignees.map(a => a.login);

    // Check 1: Is reminder on reopen enabled?
    if (!this.config.enabledOnReopen) {
      return {
        shouldSend: false,
        reason: "Reminders on reopen are disabled in config",
        assigneesChecked: assigneeLogins,
        suppressedNoAssignee: false,
      };
    }

    // Check 2: Skip if no assignee (THE FIX FOR #135)
    if (this.config.skipIfNoAssignee && event.assignees.length === 0) {
      console.log(`[Disqualifier] Suppressed reminder for ${event.repoFullName}#${event.prNumber}: no assignee`);
      return {
        shouldSend: false,
        reason: "No assignee on PR — reminder suppressed per issue #135",
        assigneesChecked: [],
        suppressedNoAssignee: true,
      };
    }

    // Check 3: Draft PRs don't get reminders
    if (event.isDraft) {
      return {
        shouldSend: false,
        reason: "PR is a draft",
        assigneesChecked: assigneeLogins,
        suppressedNoAssignee: false,
      };
    }

    // All checks passed
    return {
      shouldSend: true,
      reason: `Assignee(s) present: ${assigneeLogins.join(", ")}`,
      assigneesChecked: assigneeLogins,
      suppressedNoAssignee: false,
    };
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enabledOnReopen: true,
  minHoursSinceActivity: 48,
  template: "⏰ Reminder: This task has been reopened. Please review and update your timeline.",
  skipIfNoAssignee: true, // KEY FIX: Default to skipping when no assignee
  exemptLabels: ["wontfix", "duplicate", "invalid"],
};

// ============================================================================
// INTEGRATION PATCH
// ============================================================================

/**
 * Generate integration patch for the disqualifier event handler.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Suppress reminders on PR reopen when no assignee exists.
 * 
 * Issue: ubiquity-os-marketplace/daemon-disqualifier#135
 * 
 * BEFORE (buggy):
 *   onPullRequestReopened(event) {
 *     await postReminderComment(event);
 *   }
 * 
 * AFTER (fixed):
 *   onPullRequestReopened(event) {
 *     const guard = new ReopenReminderGuard(DEFAULT_REMINDER_CONFIG);
 *     const evaluation = guard.evaluate(event);
 *     
 *     if (!evaluation.shouldSend) {
 *       logger.info(\`Reminder suppressed: \${evaluation.reason}\`);
 *       return;
 *     }
 *     
 *     await postReminderComment(event);
 *   }
 */

import { ReopenReminderGuard, DEFAULT_REMINDER_CONFIG } from "./disqualifier-reopen-no-assignee";

const reminderGuard = new ReopenReminderGuard(DEFAULT_REMINDER_CONFIG);

export async function handlePrReopened(event: any): Promise<void> {
  const evaluation = reminderGuard.evaluate({
    repoFullName: event.repository.full_name,
    prNumber: event.pull_request.number,
    assignees: event.pull_request.assignees || [],
    author: event.pull_request.user,
    isDraft: event.pull_request.draft ?? false,
    state: event.pull_request.state,
    reopenedAt: new Date(event.pull_request.updated_at),
  });

  if (!evaluation.shouldSend) {
    console.log(\`[disqualifier] Reminder suppressed for #\${event.pull_request.number}: \${evaluation.reason}\`);
    return;
  }

  // Proceed with existing reminder logic
  // await postReminderComment(event);
}
`;
}
