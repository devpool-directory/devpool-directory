/**
 * PR Reopen Reminder Guard
 *
 * Prevents reminder notifications from being sent when a pull request
 * is reopened but has no current assignee. This avoids noise for tasks
 * that have been unassigned or are awaiting reassignment.
 *
 * Addresses: devpool-directory#5957 / ubiquity-os-marketplace/daemon-disqualifier#135
 */

export interface PullRequestContext {
  number: number;
  title: string;
  state: "open" | "closed";
  action?: string;
  assignees: Array<{ login: string }>;
  merged: boolean;
}

export interface ReminderDecision {
  shouldSendReminder: boolean;
  reason: string;
  prNumber: number;
}

/**
 * Determines whether a reminder should be sent for a given PR event.
 * Returns false if the PR is being reopened and has no assignees.
 */
export function evaluateReminderEligibility(
  pr: PullRequestContext,
  eventType: string
): ReminderDecision {
  // Only guard against reopen events
  if (eventType !== "reopened") {
    return {
      shouldSendReminder: true,
      reason: `Event type '${eventType}' is not a reopen; reminders allowed.`,
      prNumber: pr.number,
    };
  }

  // Check if there are any assignees
  const hasAssignees = pr.assignees && pr.assignees.length > 0;

  if (!hasAssignees) {
    return {
      shouldSendReminder: false,
      reason: `PR #${pr.number} was reopened with no assignees. Suppressing reminder to avoid noise on unassigned tasks.`,
      prNumber: pr.number,
    };
  }

  return {
    shouldSendReminder: true,
    reason: `PR #${pr.number} was reopened with ${pr.assignees.length} assignee(s). Reminder allowed.`,
    prNumber: pr.number,
  };
}

/**
 * Batch filter: returns only the PRs that should receive reminders.
 */
export function filterRemindersForBatch(
  prs: PullRequestContext[],
  eventType: string
): { eligible: PullRequestContext[]; suppressed: ReminderDecision[] } {
  const eligible: PullRequestContext[] = [];
  const suppressed: ReminderDecision[] = [];

  for (const pr of prs) {
    const decision = evaluateReminderEligibility(pr, eventType);
    if (decision.shouldSendReminder) {
      eligible.push(pr);
    } else {
      suppressed.push(decision);
    }
  }

  return { eligible, suppressed };
}

/**
 * Middleware-style guard that can wrap an existing reminder sender.
 * Returns null if the reminder should be suppressed, otherwise passes through.
 */
export function createReopenGuard() {
  return function guard(
    pr: PullRequestContext,
    eventType: string
  ): ReminderDecision {
    return evaluateReminderEligibility(pr, eventType);
  };
}
