/**
 * Reopen Reminder Guard (#5957)
 *
 * Prevents automated reminder comments and deadline warnings from being sent
 * when an issue or pull request is reopened without any assigned contributor.
 *
 * References:
 * - Issue #5957: "Reminder is sent on PR reopening even with no assignee"
 * - Upstream: ubiquity-os-marketplace/daemon-disqualifier#135
 */

export interface AssigneeUser {
  login: string;
  id?: number;
}

export interface TaskItem {
  id?: number | string;
  number?: number;
  title?: string;
  state: "open" | "closed" | string;
  locked?: boolean;
  draft?: boolean;
  pull_request?: unknown;
  assignee?: AssigneeUser | null;
  assignees?: AssigneeUser[] | null;
  labels?: Array<{ name?: string } | string> | null;
}

export type ReminderDecisionReason =
  | "reopened_without_assignee"
  | "reopened_with_assignee"
  | "assigned_with_assignee"
  | "task_not_open"
  | "task_locked"
  | "task_draft"
  | "unpriced_task"
  | "event_ignored";

export interface ReminderDecision {
  /** Whether a reminder comment should be dispatched */
  shouldPost: boolean;
  /** Reason code for auditing and telemetry */
  reason: ReminderDecisionReason;
  /** Human-readable rationale */
  message: string;
  /** Number of active assignees */
  assigneeCount: number;
  /** List of assigned contributor logins */
  assignees: string[];
  /** Parsed reward price in USD, or null if unpriced */
  priceUsd: number | null;
}

/**
 * Checks whether an issue or pull request has at least one assigned contributor.
 */
export function hasTaskAssignee(task: TaskItem): boolean {
  if (task.assignees && Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.some((a) => Boolean(a?.login));
  }
  return Boolean(task.assignee?.login);
}

/**
 * Returns a deduplicated array of assignee logins for the task.
 */
export function getTaskAssignees(task: TaskItem): string[] {
  const logins = new Set<string>();
  if (task.assignee?.login) {
    logins.add(task.assignee.login);
  }
  if (task.assignees && Array.isArray(task.assignees)) {
    for (const a of task.assignees) {
      if (a?.login) {
        logins.add(a.login);
      }
    }
  }
  return Array.from(logins);
}

/**
 * Extracts a numeric bounty reward value from labels (e.g. "Price: 75 USD").
 */
export function parsePriceLabel(labels?: Array<{ name?: string } | string> | null): number | null {
  if (!labels || !Array.isArray(labels)) return null;
  for (const label of labels) {
    const raw = typeof label === "string" ? label : label?.name;
    if (!raw) continue;
    const match = raw.match(/^Price:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      const num = parseFloat(match[1]);
      if (Number.isFinite(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

/**
 * Determines whether the event corresponds to reopening an issue or pull request.
 */
export function isReopenEvent(eventName?: string): boolean {
  if (!eventName) return false;
  const normalized = eventName.toLowerCase().trim();
  return (
    normalized === "issues.reopened" ||
    normalized === "pull_request.reopened" ||
    normalized === "reopened"
  );
}

/**
 * Evaluates whether an issue/PR should be ignored for reminder notifications.
 * When event is a reopen event and no assignee is assigned, it MUST be ignored (#5957).
 *
 * @param task The issue or pull request payload
 * @param eventName The GitHub webhook event name (e.g. "issues.reopened", "pull_request.reopened")
 * @returns true if the reminder should be suppressed; false if it should proceed
 */
export function shouldIgnoreIssue(task: TaskItem, eventName?: string): boolean {
  const hasAssignee = hasTaskAssignee(task);
  const isPriced = parsePriceLabel(task.labels) !== null;
  const isReopened = isReopenEvent(eventName);

  return (
    Boolean(task.draft) ||
    Boolean(task.locked) ||
    task.state !== "open" ||
    !isPriced ||
    (isReopened && !hasAssignee)
  );
}

/**
 * Computes a detailed decision struct with telemetry diagnostics.
 */
export function evaluateReminderAction(task: TaskItem, eventName?: string): ReminderDecision {
  const assignees = getTaskAssignees(task);
  const assigneeCount = assignees.length;
  const priceUsd = parsePriceLabel(task.labels);
  const isReopened = isReopenEvent(eventName);

  if (task.draft) {
    return {
      shouldPost: false,
      reason: "task_draft",
      message: "Reminders are suppressed for draft tasks.",
      assigneeCount,
      assignees,
      priceUsd,
    };
  }

  if (task.locked) {
    return {
      shouldPost: false,
      reason: "task_locked",
      message: "Reminders are suppressed for locked tasks.",
      assigneeCount,
      assignees,
      priceUsd,
    };
  }

  if (task.state !== "open") {
    return {
      shouldPost: false,
      reason: "task_not_open",
      message: `Reminders are only sent for open tasks (current state: ${task.state}).`,
      assigneeCount,
      assignees,
      priceUsd,
    };
  }

  if (priceUsd === null) {
    return {
      shouldPost: false,
      reason: "unpriced_task",
      message: "Reminders are suppressed for unpriced tasks.",
      assigneeCount,
      assignees,
      priceUsd: null,
    };
  }

  if (isReopened && assigneeCount === 0) {
    return {
      shouldPost: false,
      reason: "reopened_without_assignee",
      message: "Reminders should not be posted on pull-request/issue reopening when there is no assignee (#5957).",
      assigneeCount: 0,
      assignees: [],
      priceUsd,
    };
  }

  if (isReopened) {
    return {
      shouldPost: true,
      reason: "reopened_with_assignee",
      message: `Reminder authorized for reopened task with assigned contributor(s): ${assignees.join(", ")}.`,
      assigneeCount,
      assignees,
      priceUsd,
    };
  }

  return {
    shouldPost: true,
    reason: "assigned_with_assignee",
    message: `Reminder authorized for active contributor(s): ${assignees.join(", ")}.`,
    assigneeCount,
    assignees,
    priceUsd,
  };
}

/**
 * Dispatches a reminder comment only if permitted by policy.
 * When a task is reopened without an assignee, `postComment` is guaranteed not to be called.
 */
export async function processTaskReminder(
  task: TaskItem,
  eventName: string,
  postComment: (body: string) => Promise<unknown>
): Promise<ReminderDecision> {
  const decision = evaluateReminderAction(task, eventName);
  if (decision.shouldPost) {
    const mentions = decision.assignees.map((login) => `@${login}`).join(" ");
    const body = `> [!IMPORTANT]\n> ${mentions} Reminder: This task has an active bounty ($${decision.priceUsd}). Please ensure timely delivery.`;
    await postComment(body);
  }
  return decision;
}
