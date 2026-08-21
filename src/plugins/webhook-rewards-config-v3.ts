/**
 * Generalized "GitHub Webhook + Contributor Role -> Rewards" With Config v3
 *
 * Extends the no-config webhook rewards plugin with a fully configurable
 * schema that maps webhook event types and actions to reward values per
 * contributor role (ISSUER, ASSIGNEE, COLLABORATOR, CONTRIBUTOR).
 *
 * Addresses: devpool-directory#5927 / ubiquity-os/plugins-wishlist#47
 */

import { Octokit } from "octokit";

export type ContributorRole = "ISSUER" | "ASSIGNEE" | "COLLABORATOR" | "CONTRIBUTOR";

export interface RoleRewardConfig {
  targets: ContributorRole[];
  value: number;
}

export interface EventActionConfig {
  pull?: RoleRewardConfig;
  issue?: RoleRewardConfig;
}

export interface WebhookRewardsConfigV3 {
  pull_request?: Record<string, EventActionConfig>;
  pull_request_review?: Record<string, EventActionConfig>;
  pull_request_review_comment?: Record<string, EventActionConfig>;
  pull_request_review_thread?: Record<string, EventActionConfig>;
  push?: EventActionConfig;
  commit_comment?: Record<string, EventActionConfig>;
  issue_comment?: Record<string, EventActionConfig>;
  workflow_run?: Record<string, EventActionConfig>;
  workflow_dispatch?: EventActionConfig;
  check_run?: Record<string, EventActionConfig>;
  check_suite?: Record<string, EventActionConfig>;
}

export interface TimelineEvent {
  event: string;
  actor?: { login: string };
  created_at?: string;
}

export interface ContributorRewardResult {
  contributor: string;
  roles: ContributorRole[];
  total_value: number;
  breakdown: Record<string, number>;
}

export interface ConfiguredRewardAuditResult {
  issue_number: number;
  repo: string;
  owner: string;
  config_version: "v3";
  contributors: ContributorRewardResult[];
  total_value_awarded: number;
  events_processed: number;
}

const DEFAULT_CONFIG: WebhookRewardsConfigV3 = {
  pull_request: {
    opened: { pull: { targets: ["CONTRIBUTOR"], value: 10 }, issue: { targets: ["CONTRIBUTOR"], value: 5 } },
    closed: { pull: { targets: ["ASSIGNEE", "CONTRIBUTOR"], value: 20 }, issue: { targets: ["ASSIGNEE"], value: 10 } },
    merged: { pull: { targets: ["ASSIGNEE", "CONTRIBUTOR"], value: 50 }, issue: { targets: ["ASSIGNEE"], value: 25 } },
    reopened: { pull: { targets: ["CONTRIBUTOR"], value: 5 }, issue: { targets: ["CONTRIBUTOR"], value: 5 } },
    ready_for_review: { pull: { targets: ["CONTRIBUTOR"], value: 10 }, issue: { targets: ["CONTRIBUTOR"], value: 5 } },
    converted_to_draft: { pull: { targets: ["CONTRIBUTOR"], value: 0 }, issue: { targets: ["CONTRIBUTOR"], value: 0 } },
    labeled: { pull: { targets: ["COLLABORATOR"], value: 2 }, issue: { targets: ["COLLABORATOR"], value: 2 } },
    assigned: { pull: { targets: ["ASSIGNEE"], value: 5 }, issue: { targets: ["ASSIGNEE"], value: 5 } },
  },
  issue_comment: {
    created: { pull: { targets: ["CONTRIBUTOR", "COLLABORATOR"], value: 3 }, issue: { targets: ["CONTRIBUTOR", "COLLABORATOR"], value: 3 } },
  },
  pull_request_review: {
    submitted: { pull: { targets: ["COLLABORATOR", "CONTRIBUTOR"], value: 10 }, issue: { targets: ["COLLABORATOR"], value: 5 } },
    dismissed: { pull: { targets: ["COLLABORATOR"], value: 0 }, issue: { targets: ["COLLABORATOR"], value: 0 } },
  },
};

function getEventTypeCategory(eventName: string): keyof WebhookRewardsConfigV3 | null {
  if (eventName.startsWith("pull_request_review_comment")) return "pull_request_review_comment";
  if (eventName.startsWith("pull_request_review_thread")) return "pull_request_review_thread";
  if (eventName.startsWith("pull_request_review")) return "pull_request_review";
  if (eventName.startsWith("pull_request")) return "pull_request";
  if (eventName.startsWith("issue_comment")) return "issue_comment";
  if (eventName.startsWith("commit_comment")) return "commit_comment";
  if (eventName.startsWith("workflow_run")) return "workflow_run";
  if (eventName.startsWith("workflow_dispatch")) return "workflow_dispatch";
  if (eventName.startsWith("check_run")) return "check_run";
  if (eventName.startsWith("check_suite")) return "check_suite";
  if (eventName === "push") return "push";
  return null;
}

function extractAction(eventName: string): string {
  const parts = eventName.split("_");
  // For compound events like "pull_request_review.submitted" or timeline events
  // The timeline API returns simple event names like "reviewed", "commented", etc.
  // We map common timeline events to their webhook equivalents
  const timelineToWebhookAction: Record<string, string> = {
    reviewed: "submitted",
    commented: "created",
    committed: "synchronize",
    merged: "closed",
    closed: "closed",
    opened: "opened",
    reopened: "reopened",
    assigned: "assigned",
    unassigned: "unassigned",
    labeled: "labeled",
    unlabeled: "unlabeled",
    locked: "locked",
    unlocked: "unlocked",
    pinned: "pinned",
    unpinned: "unpinned",
    subscribed: "subscribed",
    unsubscribed: "unsubscribed",
    referenced: "referenced",
    cross_referenced: "cross_referenced",
    milestoned: "milestoned",
    demilestoned: "demilestoned",
    renamed: "renamed",
    transferred: "transferred",
    connected: "connected",
    disconnected: "disconnected",
    head_ref_deleted: "head_ref_deleted",
    head_ref_restored: "head_ref_restored",
    deployed: "deployed",
    deployment_status_changed: "deployment_status_changed",
    marked_as_duplicate: "marked_as_duplicate",
    unmarked_as_duplicate: "unmarked_as_duplicate",
    mentioned: "mentioned",
    team_mentioned: "team_mentioned",
    review_requested: "review_requested",
    review_request_removed: "review_request_removed",
    changes_requested: "changes_requested",
    approved: "approved",
    dismissed: "dismissed",
    auto_merge_enabled: "auto_merge_enabled",
    auto_merge_disabled: "auto_merge_disabled",
    ready_for_review: "ready_for_review",
    converted_to_draft: "converted_to_draft",
  };
  return timelineToWebhookAction[eventName] || eventName;
}

export function resolveRewardValue(
  config: WebhookRewardsConfigV3,
  eventType: string,
  action: string,
  isPullRequest: boolean,
  role: ContributorRole
): number {
  const category = getEventTypeCategory(eventType);
  if (!category) return 0;

  const categoryConfig = config[category];
  if (!categoryConfig) return 0;

  // Handle direct EventActionConfig (e.g., push, workflow_dispatch)
  if ("targets" in (categoryConfig as any) || "pull" in (categoryConfig as any)) {
    const directConfig = categoryConfig as EventActionConfig;
    const roleConfig = isPullRequest ? directConfig.pull : directConfig.issue;
    if (roleConfig && roleConfig.targets.includes(role)) {
      return roleConfig.value;
    }
    return 0;
  }

  // Handle Record<string, EventActionConfig>
  const actionConfigs = categoryConfig as Record<string, EventActionConfig>;
  const actionConfig = actionConfigs[action];
  if (!actionConfig) return 0;

  const roleConfig = isPullRequest ? actionConfig.pull : actionConfig.issue;
  if (roleConfig && roleConfig.targets.includes(role)) {
    return roleConfig.value;
  }
  return 0;
}

export async function fetchTimelineEvents(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  try {
    const iterator = octokit.paginate.iterator(
      octokit.rest.issues.listEventsForTimeline,
      { owner, repo, issue_number: issueNumber, per_page: 100 }
    );
    for await (const response of iterator) {
      for (const event of response.data) {
        if (event.actor?.login) {
          events.push({
            event: event.event,
            actor: { login: event.actor.login },
            created_at: event.created_at,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Failed to fetch timeline for ${owner}/${repo}#${issueNumber}:`, error);
  }
  return events;
}

export async function auditConfiguredRewards(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  config: WebhookRewardsConfigV3 = DEFAULT_CONFIG,
  issueAuthor?: string,
  assignees?: string[],
  collaborators?: string[]
): Promise<ConfiguredRewardAuditResult> {
  const events = await fetchTimelineEvents(octokit, owner, repo, issueNumber);
  const isPR = true; // Assume PR context for now; can be detected via API

  const contributorMap = new Map<string, { roles: Set<ContributorRole>; total: number; breakdown: Record<string, number> }>();

  const collaboratorSet = new Set(collaborators || []);
  const assigneeSet = new Set(assignees || []);

  for (const event of events) {
    if (!event.actor) continue;
    const login = event.actor.login;
    const action = extractAction(event.event);

    // Determine roles for this contributor
    const roles: ContributorRole[] = [];
    if (login === issueAuthor) roles.push("ISSUER");
    if (assigneeSet.has(login)) roles.push("ASSIGNEE");
    if (collaboratorSet.has(login)) roles.push("COLLABORATOR");
    if (!roles.length || (roles.length === 1 && roles[0] !== "ISSUER")) {
      // If not explicitly categorized, treat as CONTRIBUTOR
      if (!roles.includes("CONTRIBUTOR")) roles.push("CONTRIBUTOR");
    }

    let eventValue = 0;
    for (const role of roles) {
      const val = resolveRewardValue(config, event.event, action, isPR, role);
      eventValue += val;
    }

    if (eventValue > 0) {
      if (!contributorMap.has(login)) {
        contributorMap.set(login, { roles: new Set(roles), total: 0, breakdown: {} });
      }
      const entry = contributorMap.get(login)!;
      for (const r of roles) entry.roles.add(r);
      entry.total += eventValue;
      const key = `${event.event}:${action}`;
      entry.breakdown[key] = (entry.breakdown[key] || 0) + eventValue;
    }
  }

  const contributors: ContributorRewardResult[] = [];
  let totalValue = 0;
  for (const [contributor, data] of contributorMap) {
    contributors.push({
      contributor,
      roles: Array.from(data.roles),
      total_value: data.total,
      breakdown: data.breakdown,
    });
    totalValue += data.total;
  }

  contributors.sort((a, b) => b.total_value - a.total_value);

  return {
    issue_number: issueNumber,
    repo,
    owner,
    config_version: "v3",
    contributors,
    total_value_awarded: totalValue,
    events_processed: events.length,
  };
}

export { DEFAULT_CONFIG };
