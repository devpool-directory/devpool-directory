/**
 * command-plan: Sprint Planning & Issue Decomposition
 *
 * Implements the /plan command for breaking down specifications into
 * child GitHub issues with proper parent/child relationships, labels,
 * and dependency tracking. Enforces hard rules from plugins-wishlist#78:
 * - No sprint/price labels on children
 * - No title prefixes
 * - No tasklists (sub-issues are source of truth)
 * - Aggressive time estimates by default
 *
 * Addresses: devpool-directory#5877 / ubiquity-os/plugins-wishlist#78
 */

export interface PlanChildIssue {
  title: string;
  body: string;
  timeLabel: string;
  priorityLabel: string;
  files?: string[];
  blockedBy?: number[];
}

export interface PlanSpec {
  parentTitle: string;
  parentBody: string;
  children: PlanChildIssue[];
}

export interface LabelPolicy {
  allowedTimeLabels: string[];
  allowedPriorityLabels: string[];
  disallowedPatterns: RegExp[];
}

const DEFAULT_LABEL_POLICY: LabelPolicy = {
  allowedTimeLabels: [
    "Time: <15 Minutes",
    "Time: <1 Hour",
    "Time: <2 Hours",
    "Time: <4 Hours",
    "Time: <1 Day",
    "Time: <1 Week",
  ],
  allowedPriorityLabels: [
    "Priority: 0 (Regression)",
    "Priority: 1 (Normal)",
    "Priority: 2 (Medium)",
    "Priority: 3 (High)",
    "Priority: 4 (Urgent)",
  ],
  disallowedPatterns: [
    /\[S\d+\]/i, // Sprint prefixes like [S1]
    /Price:/i, // Price labels
    /Sprint/i, // Sprint labels
  ],
};

/**
 * Validates a child issue title against hard rules.
 * Rejects titles with sprint prefixes or other disallowed patterns.
 */
export function validateIssueTitle(
  title: string,
  policy: LabelPolicy = DEFAULT_LABEL_POLICY
): { valid: boolean; error?: string } {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: "Title cannot be empty." };
  }

  for (const pattern of policy.disallowedPatterns) {
    if (pattern.test(title)) {
      return {
        valid: false,
        error: `Title '${title}' matches disallowed pattern: ${pattern.source}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates that exactly one time and one priority label are applied.
 * Rejects sprint, price, or ad-hoc custom labels.
 */
export function validateLabels(
  labels: string[],
  policy: LabelPolicy = DEFAULT_LABEL_POLICY
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const timeLabels = labels.filter((l) => l.startsWith("Time:"));
  const priorityLabels = labels.filter((l) => l.startsWith("Priority:"));

  if (timeLabels.length !== 1) {
    errors.push(
      `Expected exactly 1 time label, got ${timeLabels.length}: ${timeLabels.join(", ")}`
    );
  } else if (!policy.allowedTimeLabels.includes(timeLabels[0])) {
    errors.push(`Invalid time label: '${timeLabels[0]}'`);
  }

  if (priorityLabels.length !== 1) {
    errors.push(
      `Expected exactly 1 priority label, got ${priorityLabels.length}: ${priorityLabels.join(", ")}`
    );
  } else if (!policy.allowedPriorityLabels.includes(priorityLabels[0])) {
    errors.push(`Invalid priority label: '${priorityLabels[0]}'`);
  }

  // Check for disallowed labels
  for (const label of labels) {
    for (const pattern of policy.disallowedPatterns) {
      if (pattern.test(label)) {
        errors.push(`Disallowed label: '${label}' matches ${pattern.source}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Formats a child issue body per the minimal spec format.
 * Uses real newlines (never literal \n).
 */
export function formatChildIssueBody(issue: PlanChildIssue): string {
  const lines: string[] = [];

  // Extract first paragraph as description
  const bodyParts = issue.body.split("\n\n");
  const description = bodyParts[0] || issue.body;
  lines.push(description);
  lines.push("");

  // Acceptance criteria
  lines.push("Acceptance:");
  const acceptanceMatch = issue.body.match(/Acceptance:[\s\S]*?(?=\n\n|$)/i);
  if (acceptanceMatch) {
    const criteria = acceptanceMatch[0]
      .replace(/Acceptance:/i, "")
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    for (const c of criteria) {
      lines.push(`- ${c.replace(/^[-*•]\s*/, "").trim()}`);
    }
  } else {
    lines.push("- Implementation matches specification");
  }
  lines.push("");

  // Files section
  if (issue.files && issue.files.length > 0) {
    lines.push("Files:");
    for (const f of issue.files) {
      lines.push(`- ${f}`);
    }
  }

  return lines.join("\n");
}

/**
 * Estimates time label based on scope description using aggressive defaults.
 * Per policy: docs/<15min, minor UI/<1hr, moderate/<2hr, heavier/<4hr.
 */
export function estimateTimeLabel(
  scopeDescription: string
): string {
  const lower = scopeDescription.toLowerCase();

  // Docs and small copy
  if (
    lower.includes("doc") ||
    lower.includes("readme") ||
    lower.includes("copy") ||
    lower.includes("typo") ||
    lower.includes("comment")
  ) {
    return "Time: <15 Minutes";
  }

  // Minor UI wiring
  if (
    lower.includes("handler") ||
    lower.includes("header") ||
    lower.includes("filter") ||
    lower.includes("button") ||
    lower.includes("sort") ||
    lower.includes("toggle")
  ) {
    return "Time: <1 Hour";
  }

  // Moderate client work
  if (
    lower.includes("url state") ||
    lower.includes("drill-through") ||
    lower.includes("saved view") ||
    lower.includes("csv export") ||
    lower.includes("search") ||
    lower.includes("pagination")
  ) {
    return "Time: <2 Hours";
  }

  // Heavier but contained
  if (
    lower.includes("print") ||
    lower.includes("chart") ||
    lower.includes("design token") ||
    lower.includes("a11y") ||
    lower.includes("keyboard") ||
    lower.includes("virtuali") ||
    lower.includes("responsive")
  ) {
    return "Time: <4 Hours";
  }

  // Default to moderate for unspecified scope
  return "Time: <2 Hours";
}

/**
 * Generates GraphQL mutation for adding blocked_by dependency.
 * Returns the raw GraphQL query string ready for gh api execution.
 */
export function generateBlockedByMutation(
  issueNodeId: string,
  blockingIssueNodeId: string
): string {
  return `mutation {
  addBlockedBy(input: {
    issueId: "${issueNodeId}"
    blockingIssueId: "${blockingIssueNodeId}"
  }) {
    issue { number title }
    blockingIssue { number title }
  }
}`;
}

/**
 * Generates REST API call for adding a sub-issue to a parent.
 * Returns the curl/gh command components.
 */
export function generateSubIssueAddCommand(
  owner: string,
  repo: string,
  parentNumber: number,
  childRestId: number
): { endpoint: string; method: string; body: Record<string, number> } {
  return {
    endpoint: `/repos/${owner}/${repo}/issues/${parentNumber}/sub_issues`,
    method: "POST",
    body: { sub_issue_id: childRestId },
  };
}

/**
 * Validates a complete plan spec before execution.
 * Checks all children for title, label, and body compliance.
 */
export function validatePlanSpec(
  spec: PlanSpec,
  policy: LabelPolicy = DEFAULT_LABEL_POLICY
): {
  valid: boolean;
  errors: string[];
  childCount: number;
} {
  const errors: string[] = [];

  if (!spec.parentTitle || spec.parentTitle.trim().length === 0) {
    errors.push("Parent issue title is required.");
  }

  if (!spec.children || spec.children.length === 0) {
    errors.push("Plan must have at least one child issue.");
  }

  for (let i = 0; i < spec.children.length; i++) {
    const child = spec.children[i];
    const prefix = `Child #${i + 1}`;

    const titleCheck = validateIssueTitle(child.title, policy);
    if (!titleCheck.valid) {
      errors.push(`${prefix}: ${titleCheck.error}`);
    }

    const labelCheck = validateLabels(
      [child.timeLabel, child.priorityLabel],
      policy
    );
    if (!labelCheck.valid) {
      for (const e of labelCheck.errors) {
        errors.push(`${prefix}: ${e}`);
      }
    }

    if (!child.body || child.body.trim().length === 0) {
      errors.push(`${prefix}: Body cannot be empty.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    childCount: spec.children?.length || 0,
  };
}

export { DEFAULT_LABEL_POLICY };
