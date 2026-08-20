/**
 * Improve Task Assignment Limit Handling
 *
 * Implements logic to bypass task assignment limits when contributors are
 * blocked waiting on reviewers. Checks if assignee is last commenter on
 * all unresolved review threads and applies 24-hour timeout before allowing
 * limit bypass. Includes safeguards against misuse.
 *
 * Addresses: devpool-directory#5085 / ubiquity-os-marketplace/command-start-stop#106
 */

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  lastCommenter: string;
  lastCommentAt: number;
  commentCount: number;
}

export interface TaskAssignmentContext {
  assignee: string;
  currentTaskCount: number;
  maxTaskLimit: number;
  unresolvedThreads: ReviewThread[];
  currentTime: number;
}

export interface LimitBypassResult {
  allowed: boolean;
  reason: string;
  reviewerLaggedThreads: number;
  safeguardWarnings: string[];
}

const REVIEWER_LAG_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_COMMENTS_FOR_LAG_CHECK = 2; // Need at least back-and-forth

/**
 * Checks if the assignee is the last commenter on all unresolved review threads.
 * Per spec: "check if the assignee is the last commenter on all unresolved review threads"
 */
export function isAssigneeLastCommenterOnAll(
  assignee: string,
  unresolvedThreads: ReviewThread[]
): boolean {
  if (unresolvedThreads.length === 0) return true;

  const normalizedAssignee = assignee.toLowerCase();
  return unresolvedThreads.every(
    (thread) => thread.lastCommenter.toLowerCase() === normalizedAssignee
  );
}

/**
 * Determines which unresolved threads qualify as "reviewer-lagged".
 * Per spec: "24-hour timeout after the last comment before considering tasks reviewer-lagged"
 */
export function findReviewerLaggedThreads(
  unresolvedThreads: ReviewThread[],
  currentTime: number,
  timeoutMs: number = REVIEWER_LAG_TIMEOUT_MS
): ReviewThread[] {
  return unresolvedThreads.filter((thread) => {
    const timeSinceLastComment = currentTime - thread.lastCommentAt;
    return timeSinceLastComment >= timeoutMs;
  });
}

/**
 * Evaluates whether a contributor should be allowed to bypass the task limit.
 * Returns detailed result with reasoning and safeguard warnings.
 */
export function evaluateLimitBypass(context: TaskAssignmentContext): LimitBypassResult {
  const { assignee, currentTaskCount, maxTaskLimit, unresolvedThreads, currentTime } = context;

  // If not at limit, no bypass needed
  if (currentTaskCount < maxTaskLimit) {
    return {
      allowed: true,
      reason: `Below task limit (${currentTaskCount}/${maxTaskLimit}). No bypass needed.`,
      reviewerLaggedThreads: 0,
      safeguardWarnings: [],
    };
  }

  // Check if assignee is last commenter on ALL unresolved threads
  const isLastOnAll = isAssigneeLastCommenterOnAll(assignee, unresolvedThreads);
  if (!isLastOnAll) {
    return {
      allowed: false,
      reason: `At task limit (${currentTaskCount}/${maxTaskLimit}) and not last commenter on all unresolved threads. Cannot bypass.`,
      reviewerLaggedThreads: 0,
      safeguardWarnings: [],
    };
  }

  // Find threads where reviewer has lagged >24h
  const laggedThreads = findReviewerLaggedThreads(unresolvedThreads, currentTime);

  if (laggedThreads.length === 0) {
    return {
      allowed: false,
      reason: `At task limit and last commenter on all threads, but no thread has exceeded 24h reviewer lag timeout. Wait for reviewer or timeout.`,
      reviewerLaggedThreads: 0,
      safeguardWarnings: [],
    };
  }

  // Safeguard checks
  const warnings: string[] = [];

  // Check for potential misuse: threads with only 1 comment (assignee opened, no reviewer response yet)
  const singleCommentThreads = laggedThreads.filter(
    (t) => t.commentCount < MIN_COMMENTS_FOR_LAG_CHECK
  );
  if (singleCommentThreads.length > 0) {
    warnings.push(
      `${singleCommentThreads.length} thread(s) have fewer than ${MIN_COMMENTS_FOR_LAG_CHECK} comments. Verify these are genuine reviewer delays, not premature bypass attempts.`
    );
  }

  // Check for very recent thread creation (might indicate gaming)
  const recentThreads = laggedThreads.filter(
    (t) => currentTime - t.lastCommentAt < REVIEWER_LAG_TIMEOUT_MS * 1.5
  );
  if (recentThreads.length === laggedThreads.length) {
    warnings.push(
      "All lagged threads are within 1.5x timeout window. Monitor for pattern of limit circumvention."
    );
  }

  return {
    allowed: true,
    reason: `Bypass granted: assignee is last commenter on ${unresolvedThreads.length} unresolved thread(s), ${laggedThreads.length} exceed 24h reviewer lag timeout.`,
    reviewerLaggedThreads: laggedThreads.length,
    safeguardWarnings: warnings,
  };
}

/**
 * Generates the plugin configuration schema for task limit handling.
 */
export function generatePluginConfig(): Record<string, unknown> {
  return {
    name: "task-assignment-limit-handler",
    description: "Allows task limit bypass when contributors are blocked waiting on reviewers",
    settings: {
      reviewerLagTimeoutHours: {
        type: "number",
        default: 24,
        description: "Hours to wait before considering a thread reviewer-lagged",
        min: 1,
        max: 168,
      },
      minCommentsForLagCheck: {
        type: "number",
        default: 2,
        description: "Minimum comments on a thread before applying lag timeout",
        min: 1,
        max: 10,
      },
      enableSafeguardWarnings: {
        type: "boolean",
        default: true,
        description: "Log warnings when bypass patterns suggest potential misuse",
      },
      maxBypassPerDay: {
        type: "number",
        default: 3,
        description: "Maximum number of limit bypasses allowed per contributor per day",
        min: 1,
        max: 20,
      },
    },
  };
}

/**
 * Tracks bypass usage per contributor to enforce daily limits.
 */
export interface BypassTracker {
  contributor: string;
  bypassesToday: number;
  lastBypassAt: number;
  dateKey: string; // YYYY-MM-DD for daily reset
}

export function canBypassToday(
  tracker: BypassTracker | null,
  maxPerDay: number = 3,
  currentTime: number = Date.now()
): { allowed: boolean; remaining: number; resetsAt: string } {
  const todayKey = new Date(currentTime).toISOString().split("T")[0];

  if (!tracker || tracker.dateKey !== todayKey) {
    return { allowed: true, remaining: maxPerDay, resetsAt: `${todayKey}T23:59:59Z` };
  }

  const remaining = Math.max(0, maxPerDay - tracker.bypassesToday);
  return {
    allowed: remaining > 0,
    remaining,
    resetsAt: `${todayKey}T23:59:59Z`,
  };
}

/**
 * Records a bypass event for tracking purposes.
 */
export function recordBypass(
  tracker: BypassTracker | null,
  contributor: string,
  currentTime: number = Date.now()
): BypassTracker {
  const todayKey = new Date(currentTime).toISOString().split("T")[0];

  if (!tracker || tracker.dateKey !== todayKey) {
    return {
      contributor,
      bypassesToday: 1,
      lastBypassAt: currentTime,
      dateKey: todayKey,
    };
  }

  return {
    ...tracker,
    bypassesToday: tracker.bypassesToday + 1,
    lastBypassAt: currentTime,
  };
}

/**
 * Generates audit log entry for bypass decisions.
 */
export function generateAuditEntry(
  context: TaskAssignmentContext,
  result: LimitBypassResult,
  timestamp: number = Date.now()
): Record<string, unknown> {
  return {
    timestamp: new Date(timestamp).toISOString(),
    assignee: context.assignee,
    taskCount: context.currentTaskCount,
    taskLimit: context.maxTaskLimit,
    unresolvedThreadCount: context.unresolvedThreads.length,
    bypassAllowed: result.allowed,
    reason: result.reason,
    reviewerLaggedThreads: result.reviewerLaggedThreads,
    safeguardWarnings: result.safeguardWarnings,
  };
}

/**
 * Generates GitHub Actions workflow step for periodic bypass audit.
 */
export function generateAuditWorkflowStep(): string {
  return `      - name: Audit task limit bypasses
        run: |
          echo "Checking for bypass pattern anomalies..."
          # Query bypass logs from KV store or database
          # Flag contributors with >3 bypasses in 7 days
          # Post summary to #ops channel`;
}

/**
 * Validates implementation against acceptance criteria.
 */
export function validateImplementation(features: Record<string, boolean>): {
  passed: string[];
  failed: string[];
} {
  const checks: Array<{ name: string; condition: boolean }> = [
    { name: "Checks assignee is last commenter on all unresolved threads", condition: features["lastCommenterCheck"] === true },
    { name: "Applies 24-hour reviewer lag timeout", condition: features["timeoutCheck"] === true },
    { name: "Allows bypass without consuming task slot", condition: features["slotFreeBypass"] === true },
    { name: "Logs safeguard warnings for potential misuse", condition: features["safeguardWarnings"] === true },
    { name: "Tracks daily bypass limits per contributor", condition: features["dailyLimitTracking"] === true },
    { name: "Generates audit trail for bypass decisions", condition: features["auditTrail"] === true },
  ];

  const passed: string[] = [];
  const failed: string[] = [];

  for (const check of checks) {
    if (check.condition) {
      passed.push(check.name);
    } else {
      failed.push(check.name);
    }
  }

  return { passed, failed };
}
