/**
 * Generalized GitHub Webhook + Contributor Role -> Rewards (Config v3)
 * Specification Reference: https://github.com/ubiquity-os/plugins-wishlist/issues/47
 * DevPool Directory Issue: #5927
 */

export type ContributorRole =
  | "ISSUER"
  | "ASSIGNEE"
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "REVIEWERS"
  | "COMMENTERS"
  | "COMMITTERS"
  | "MENTIONED"
  | "AUTHOR";

export const VALID_CONTRIBUTOR_ROLES: readonly ContributorRole[] = [
  "ISSUER",
  "ASSIGNEE",
  "COLLABORATOR",
  "CONTRIBUTOR",
  "REVIEWERS",
  "COMMENTERS",
  "COMMITTERS",
  "MENTIONED",
  "AUTHOR",
] as const;

export type EventContextType = "pull" | "issue";

export interface EventTargetConfig {
  /** Target contributor roles eligible for reward */
  targets: ContributorRole[];
  /** Reward value (can be positive, zero, or negative for cancellations/penalties) */
  value: number;
  /** Optional multiplier applied to the base value */
  multiplier?: number;
}

export interface TwoLevelEventConfig {
  /** Configuration applied when the target entity is a Pull Request */
  pull?: EventTargetConfig;
  /** Configuration applied when the target entity is an Issue */
  issue?: EventTargetConfig;
}

export type ActionConfig = EventTargetConfig | TwoLevelEventConfig;

export interface LabelOverrideConfig {
  /** Flat modifier added to the reward value for tasks with this label */
  value?: number;
  /** Multiplier applied to the calculated reward for tasks with this label */
  multiplier?: number;
}

export interface WebhookRewardsConfigOptions {
  /** Maximum reward that can be credited to any single user per event */
  maxRewardPerUser?: number;
  /** Minimum floor for rewards per user (limits negative penalizations) */
  minRewardPerUser?: number;
  /** Whether negative reward values are permitted (default: true) */
  allowNegativeRewards?: boolean;
  /** If a user has multiple qualifying roles, keep only the highest reward (default: true) */
  deduplicateUsers?: boolean;
  /** Bot accounts or usernames exempt from receiving rewards */
  ignoredUsers?: string[];
  /** Role-specific multipliers (e.g. COLLABORATOR: 1.2) */
  roleMultipliers?: Partial<Record<ContributorRole, number>>;
}

export interface WebhookRewardsConfigV3 {
  version?: "3.0" | "3" | string;
  pull_request?: Record<string, ActionConfig>;
  pull_request_review?: Record<string, ActionConfig>;
  pull_request_review_comment?: Record<string, ActionConfig>;
  pull_request_review_thread?: Record<string, ActionConfig>;
  issues?: Record<string, ActionConfig>;
  issue_comment?: Record<string, ActionConfig>;
  commit_comment?: Record<string, ActionConfig>;
  push?: ActionConfig | Record<string, ActionConfig>;
  workflow_run?: Record<string, ActionConfig>;
  workflow_dispatch?: ActionConfig | Record<string, ActionConfig>;
  check_run?: Record<string, ActionConfig>;
  check_suite?: Record<string, ActionConfig>;
  labelOverrides?: Record<string, LabelOverrideConfig>;
  options?: WebhookRewardsConfigOptions;
  [customEvent: string]: unknown;
}

export interface WebhookEventContext {
  /** Webhook event name (e.g. 'pull_request', 'issues', 'issue_comment', 'push') */
  event: string;
  /** Action subtype (e.g. 'opened', 'closed', 'created', 'assigned', 'submitted') */
  action?: string;
  /** Whether the target context is a pull request (true) or an issue (false) */
  isPullRequest: boolean;
  /** Actor who initiated the webhook action */
  actor?: string;
  /** Role mappings: which contributors hold which roles for this context */
  roles: Partial<Record<ContributorRole, string[]>>;
  /** Labels currently attached to the issue or pull request */
  labels?: string[];
  /** Optional metadata or timestamp */
  timestamp?: string | number;
}

export interface RewardItem {
  username: string;
  role: ContributorRole;
  baseValue: number;
  labelModifier: number;
  roleMultiplier: number;
  finalReward: number;
  reason: string;
}

export interface RewardEvaluationResult {
  event: string;
  action?: string;
  contextType: EventContextType;
  rewards: RewardItem[];
  totalDistributed: number;
  warnings: string[];
}

export interface ContributorRewardSummary {
  username: string;
  totalReward: number;
  eventCount: number;
  roles: ContributorRole[];
  breakdown: Record<string, number>;
}

/**
 * Check whether a configuration node is a TwoLevelEventConfig (has `pull` or `issue` keys)
 */
export function isTwoLevelEventConfig(config: ActionConfig): config is TwoLevelEventConfig {
  if (!config || typeof config !== "object") return false;
  return "pull" in config || "issue" in config;
}

/**
 * Check whether a configuration node is a flat EventTargetConfig (has `targets` and `value`)
 */
export function isEventTargetConfig(config: ActionConfig): config is EventTargetConfig {
  if (!config || typeof config !== "object") return false;
  return "targets" in config && "value" in config;
}

/**
 * Resolves the effective EventTargetConfig for a given event, action, and context type.
 */
export function resolveEventConfig(
  config: WebhookRewardsConfigV3,
  event: string,
  action?: string,
  isPullRequest: boolean = true
): EventTargetConfig | null {
  const eventNode = config[event] as ActionConfig | Record<string, ActionConfig> | undefined;
  if (!eventNode) return null;

  let targetActionNode: ActionConfig | undefined;

  if (action && typeof eventNode === "object" && action in eventNode) {
    targetActionNode = (eventNode as Record<string, ActionConfig>)[action];
  } else if (isEventTargetConfig(eventNode as ActionConfig) || isTwoLevelEventConfig(eventNode as ActionConfig)) {
    targetActionNode = eventNode as ActionConfig;
  }

  if (!targetActionNode) return null;

  const contextType: EventContextType = isPullRequest ? "pull" : "issue";

  if (isTwoLevelEventConfig(targetActionNode)) {
    const contextConfig = targetActionNode[contextType];
    return contextConfig ?? null;
  }

  if (isEventTargetConfig(targetActionNode)) {
    return targetActionNode;
  }

  return null;
}

/**
 * Validates a WebhookRewardsConfigV3 object and returns detailed errors if invalid.
 */
export function validateConfigV3(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Configuration must be a non-null object."] };
  }

  const cfg = config as Record<string, any>;

  const validateTargetConfig = (node: any, path: string) => {
    if (!node || typeof node !== "object") {
      errors.push(`${path}: must be an object.`);
      return;
    }
    if (!Array.isArray(node.targets)) {
      errors.push(`${path}.targets: must be an array of ContributorRole strings.`);
    } else {
      for (const t of node.targets) {
        if (!VALID_CONTRIBUTOR_ROLES.includes(t)) {
          errors.push(`${path}.targets: '${t}' is not a valid ContributorRole.`);
        }
      }
    }
    if (typeof node.value !== "number" || Number.isNaN(node.value)) {
      errors.push(`${path}.value: must be a valid number.`);
    }
    if (node.multiplier !== undefined && (typeof node.multiplier !== "number" || Number.isNaN(node.multiplier))) {
      errors.push(`${path}.multiplier: must be a number if provided.`);
    }
  };

  const validateActionConfig = (actionNode: any, path: string) => {
    if (!actionNode || typeof actionNode !== "object") {
      errors.push(`${path}: must be an object.`);
      return;
    }
    if (isTwoLevelEventConfig(actionNode)) {
      if (actionNode.pull) validateTargetConfig(actionNode.pull, `${path}.pull`);
      if (actionNode.issue) validateTargetConfig(actionNode.issue, `${path}.issue`);
    } else if (isEventTargetConfig(actionNode)) {
      validateTargetConfig(actionNode, path);
    } else {
      errors.push(`${path}: must contain either {pull, issue} contexts or {targets, value}.`);
    }
  };

  const knownEventKeys = [
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "pull_request_review_thread",
    "issues",
    "issue_comment",
    "commit_comment",
    "push",
    "workflow_run",
    "workflow_dispatch",
    "check_run",
    "check_suite",
  ];

  for (const eventKey of knownEventKeys) {
    const val = cfg[eventKey];
    if (!val) continue;
    if (typeof val !== "object") {
      errors.push(`${eventKey}: must be an object.`);
      continue;
    }

    if (isEventTargetConfig(val) || isTwoLevelEventConfig(val)) {
      validateActionConfig(val, eventKey);
    } else {
      for (const [actionName, actionNode] of Object.entries(val)) {
        validateActionConfig(actionNode, `${eventKey}.${actionName}`);
      }
    }
  }

  if (cfg.labelOverrides && typeof cfg.labelOverrides === "object") {
    for (const [label, override] of Object.entries(cfg.labelOverrides as Record<string, any>)) {
      if (!override || typeof override !== "object") {
        errors.push(`labelOverrides.${label}: must be an object.`);
        continue;
      }
      if (override.value !== undefined && (typeof override.value !== "number" || Number.isNaN(override.value))) {
        errors.push(`labelOverrides.${label}.value: must be a valid number.`);
      }
      if (override.multiplier !== undefined && (typeof override.multiplier !== "number" || Number.isNaN(override.multiplier))) {
        errors.push(`labelOverrides.${label}.multiplier: must be a valid number.`);
      }
    }
  }

  if (cfg.options?.roleMultipliers) {
    for (const [role, mult] of Object.entries(cfg.options.roleMultipliers)) {
      if (!VALID_CONTRIBUTOR_ROLES.includes(role as ContributorRole)) {
        errors.push(`options.roleMultipliers: '${role}' is not a valid ContributorRole.`);
      }
      if (typeof mult !== "number" || Number.isNaN(mult)) {
        errors.push(`options.roleMultipliers.${role}: must be a valid number.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculates label-based modifiers (additive delta and cumulative multiplier).
 */
export function calculateLabelModifiers(
  labels: string[] = [],
  labelOverrides: Record<string, LabelOverrideConfig> = {}
): { deltaValue: number; labelMultiplier: number; appliedLabels: string[] } {
  let deltaValue = 0;
  let labelMultiplier = 1;
  const appliedLabels: string[] = [];

  for (const lbl of labels) {
    const override = labelOverrides[lbl];
    if (!override) continue;

    appliedLabels.push(lbl);
    if (typeof override.value === "number") {
      deltaValue += override.value;
    }
    if (typeof override.multiplier === "number" && override.multiplier > 0) {
      labelMultiplier *= override.multiplier;
    }
  }

  return { deltaValue, labelMultiplier, appliedLabels };
}

/**
 * Evaluates rewards for a given webhook event context based on Config v3.
 */
export function evaluateWebhookRewards(
  config: WebhookRewardsConfigV3,
  context: WebhookEventContext
): RewardEvaluationResult {
  const warnings: string[] = [];
  const contextType: EventContextType = context.isPullRequest ? "pull" : "issue";

  const targetConfig = resolveEventConfig(config, context.event, context.action, context.isPullRequest);

  if (!targetConfig) {
    return {
      event: context.event,
      action: context.action,
      contextType,
      rewards: [],
      totalDistributed: 0,
      warnings: [`No reward configuration resolved for ${context.event}${context.action ? `.${context.action}` : ""} [${contextType}].`],
    };
  }

  const options = config.options || {};
  const ignoredUsers = new Set(
    (options.ignoredUsers || []).map((u) => u.toLowerCase())
  );
  ignoredUsers.add("github-actions[bot]");
  ignoredUsers.add("ubiquity-os[bot]");
  ignoredUsers.add("devpool-directory-superintendent[bot]");

  const { deltaValue, labelMultiplier, appliedLabels } = calculateLabelModifiers(
    context.labels,
    config.labelOverrides
  );

  const baseConfigMultiplier = targetConfig.multiplier ?? 1;
  const deduplicate = options.deduplicateUsers !== false;
  const allowNegative = options.allowNegativeRewards !== false;

  const evaluatedUsers = new Map<string, RewardItem>();

  for (const role of targetConfig.targets) {
    let usernames = context.roles[role] || [];
    if (role === "AUTHOR" && !usernames.length && context.roles.ISSUER) {
      usernames = context.roles.ISSUER;
    }

    const roleMultiplier = options.roleMultipliers?.[role] ?? 1;

    for (const rawUser of usernames) {
      const username = rawUser.trim();
      if (!username || ignoredUsers.has(username.toLowerCase())) {
        continue;
      }

      const adjustedBase = targetConfig.value + deltaValue;
      let calculatedReward = adjustedBase * baseConfigMultiplier * labelMultiplier * roleMultiplier;

      if (!allowNegative && calculatedReward < 0) {
        calculatedReward = 0;
      }

      if (options.maxRewardPerUser !== undefined && calculatedReward > options.maxRewardPerUser) {
        calculatedReward = options.maxRewardPerUser;
      }
      if (options.minRewardPerUser !== undefined && calculatedReward < options.minRewardPerUser) {
        calculatedReward = options.minRewardPerUser;
      }

      calculatedReward = Math.round(calculatedReward * 10000) / 10000;

      const reasonParts = [`Role: ${role}`, `Base: ${targetConfig.value}`];
      if (deltaValue !== 0) reasonParts.push(`LabelDelta: ${deltaValue > 0 ? `+${deltaValue}` : deltaValue}`);
      if (labelMultiplier !== 1) reasonParts.push(`LabelMult: x${labelMultiplier}`);
      if (roleMultiplier !== 1) reasonParts.push(`RoleMult: x${roleMultiplier}`);
      if (appliedLabels.length > 0) reasonParts.push(`Labels: [${appliedLabels.join(", ")}]`);

      const rewardItem: RewardItem = {
        username,
        role,
        baseValue: targetConfig.value,
        labelModifier: deltaValue,
        roleMultiplier,
        finalReward: calculatedReward,
        reason: reasonParts.join(" | "),
      };

      if (deduplicate) {
        if (!evaluatedUsers.has(username)) {
          evaluatedUsers.set(username, rewardItem);
        } else {
          const existing = evaluatedUsers.get(username)!;
          if (rewardItem.finalReward > existing.finalReward) {
            evaluatedUsers.set(username, rewardItem);
          }
        }
      } else {
        evaluatedUsers.set(`${username}#${role}`, rewardItem);
      }
    }
  }

  const rewards = Array.from(evaluatedUsers.values()).sort(
    (a, b) => b.finalReward - a.finalReward || a.username.localeCompare(b.username)
  );

  const totalDistributed = Math.round(rewards.reduce((sum, r) => sum + r.finalReward, 0) * 10000) / 10000;

  return {
    event: context.event,
    action: context.action,
    contextType,
    rewards,
    totalDistributed,
    warnings,
  };
}

/**
 * Aggregates multiple RewardEvaluationResults across events into contributor totals.
 */
export function aggregateContributorRewards(
  evaluations: RewardEvaluationResult[]
): Record<string, ContributorRewardSummary> {
  const summary: Record<string, ContributorRewardSummary> = {};

  for (const ev of evaluations) {
    const eventKey = `${ev.event}${ev.action ? `.${ev.action}` : ""} (${ev.contextType})`;

    for (const r of ev.rewards) {
      if (!summary[r.username]) {
        summary[r.username] = {
          username: r.username,
          totalReward: 0,
          eventCount: 0,
          roles: [],
          breakdown: {},
        };
      }

      const userSummary = summary[r.username];
      userSummary.totalReward = Math.round((userSummary.totalReward + r.finalReward) * 10000) / 10000;
      userSummary.eventCount += 1;
      if (!userSummary.roles.includes(r.role)) {
        userSummary.roles.push(r.role);
      }
      userSummary.breakdown[eventKey] = Math.round(((userSummary.breakdown[eventKey] || 0) + r.finalReward) * 10000) / 10000;
    }
  }

  return summary;
}

/**
 * Generates a clean Markdown table summarizing the distributed rewards for comments or audit logs.
 */
export function formatRewardsReport(
  aggregated: Record<string, ContributorRewardSummary>
): string {
  const users = Object.values(aggregated).sort((a, b) => b.totalReward - a.totalReward);
  if (users.length === 0) {
    return "### 🏆 Contributor Rewards Summary\n\n_No rewards distributed._";
  }

  const lines: string[] = [
    "### 🏆 Contributor Rewards Summary (Config v3)",
    "",
    "| Contributor | Total Reward | Events | Roles | Breakdown |",
    "|:---|:---:|:---:|:---|:---|",
  ];

  for (const u of users) {
    const breakdownStr = Object.entries(u.breakdown)
      .map(([k, v]) => `${k}: ${v >= 0 ? `+${v}` : v}`)
      .join(", ");
    lines.push(
      `| @${u.username} | **${u.totalReward >= 0 ? `+${u.totalReward}` : u.totalReward}** | ${u.eventCount} | ${u.roles.join(", ")} | ${breakdownStr} |`
    );
  }

  return lines.join("\n");
}

/**
 * Returns the default Config v3 specification based on ubiquity-os/plugins-wishlist#47 discussion.
 */
export function getDefaultConfigV3(): WebhookRewardsConfigV3 {
  return {
    version: "3.0",
    pull_request: {
      opened: {
        pull: { targets: ["CONTRIBUTOR"], value: 5 },
        issue: { targets: ["CONTRIBUTOR"], value: 2 },
      },
      closed: {
        pull: { targets: ["ISSUER"], value: 10 },
        issue: { targets: ["ISSUER"], value: 1 },
      },
      assigned: {
        pull: { targets: ["ISSUER", "ASSIGNEE", "COLLABORATOR", "CONTRIBUTOR"], value: 0 },
        issue: { targets: ["ISSUER", "ASSIGNEE", "COLLABORATOR", "CONTRIBUTOR"], value: 0 },
      },
      unassigned: {
        pull: { targets: ["ASSIGNEE"], value: 0 },
        issue: { targets: ["ASSIGNEE"], value: 0 },
      },
      synchronize: {
        pull: { targets: ["CONTRIBUTOR"], value: 1 },
      },
      review_requested: {
        pull: { targets: ["REVIEWERS"], value: 1 },
      },
      review_request_removed: {
        pull: { targets: ["REVIEWERS"], value: -1 },
      },
      ready_for_review: {
        pull: { targets: ["CONTRIBUTOR"], value: 2 },
      },
    },
    pull_request_review: {
      submitted: {
        pull: { targets: ["REVIEWERS"], value: 3 },
      },
      dismissed: {
        pull: { targets: ["REVIEWERS"], value: -2 },
      },
    },
    pull_request_review_comment: {
      created: {
        pull: { targets: ["REVIEWERS", "COMMENTERS"], value: 1 },
        issue: { targets: ["COMMENTERS"], value: 0 },
      },
    },
    pull_request_review_thread: {
      resolved: {
        pull: { targets: ["COLLABORATOR", "CONTRIBUTOR"], value: 1 },
      },
      unresolved: {
        pull: { targets: ["COLLABORATOR"], value: 0 },
      },
    },
    issue_comment: {
      created: {
        pull: { targets: ["COMMENTERS"], value: 0 },
        issue: { targets: ["COMMENTERS"], value: 1 },
      },
      deleted: {
        pull: { targets: ["COMMENTERS"], value: 0 },
        issue: { targets: ["COMMENTERS"], value: -1 },
      },
    },
    commit_comment: {
      created: {
        pull: { targets: ["COMMENTERS"], value: 0.5 },
        issue: { targets: ["COMMENTERS"], value: 0.5 },
      },
    },
    push: {
      pull: { targets: ["COMMITTERS"], value: 0.5 },
      issue: { targets: ["COMMITTERS"], value: 0 },
    },
    workflow_run: {
      completed: {
        pull: { targets: ["CONTRIBUTOR"], value: 0.25 },
      },
    },
    labelOverrides: {
      "good-first-issue": { value: 5 },
      bug: { value: -2 },
      enhancement: { value: 3 },
      priority: { multiplier: 1.5 },
    },
    options: {
      maxRewardPerUser: 100,
      minRewardPerUser: -50,
      allowNegativeRewards: true,
      deduplicateUsers: true,
      ignoredUsers: ["ubiquity-os[bot]", "github-actions[bot]"],
      roleMultipliers: {
        COLLABORATOR: 1.2,
        CONTRIBUTOR: 1.0,
      },
    },
  };
}
