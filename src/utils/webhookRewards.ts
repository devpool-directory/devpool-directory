/**
 * Generalized GitHub Webhook + Contributor Role -> Rewards (No Config v1) (#5039)
 *
 * Dynamically maps GitHub webhook and timeline events that occur in an issue
 * and its linked pull requests to calculate reward credits per contributor.
 *
 * Core Specification (v1 No-Config):
 * 1. Collect timeline events from the issue and linked pull requests.
 * 2. Assign a default credit value of 1 point to every qualifying event counted per contributor.
 * 3. Return aggregated sum totals and breakdown per event type.
 * 4. Categorize contributors by GitHub Author Association / Class (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, etc.).
 * 5. Allow optional role-based scaling multipliers while maintaining zero-config by default.
 * 6. Generate formatted Markdown summaries for audit trails and GitHub issue comments.
 *
 * References:
 * - Issue #5039: "Generalized 'GitHub Webhook + Contributor Role -> Rewards' No Config v1"
 * - Upstream Wishlist: ubiquity-os/plugins-wishlist#46
 * - Webhook Definitions: https://github.com/octokit/webhooks.js
 */

export type GitHubAuthorAssociation =
  | "OWNER"
  | "MEMBER"
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "FIRST_TIME_CONTRIBUTOR"
  | "FIRST_TIMER"
  | "NONE";

export type ContributorClass =
  | "owner"
  | "member"
  | "collaborator"
  | "contributor"
  | "first_time_contributor"
  | "external";

export const STANDARD_WEBHOOK_EVENTS = Object.freeze([
  "issues.opened",
  "issues.closed",
  "issues.reopened",
  "issues.labeled",
  "issues.unlabeled",
  "issues.assigned",
  "issues.unassigned",
  "issues.edited",
  "issue_comment.created",
  "issue_comment.edited",
  "issue_comment.deleted",
  "pull_request.opened",
  "pull_request.closed",
  "pull_request.reopened",
  "pull_request.synchronize",
  "pull_request.ready_for_review",
  "pull_request.review_requested",
  "pull_request_review.submitted",
  "pull_request_review.edited",
  "pull_request_review.dismissed",
  "pull_request_review_comment.created",
  "pull_request_review_comment.edited",
  "push",
  "commit",
] as const);

export type StandardWebhookEvent = (typeof STANDARD_WEBHOOK_EVENTS)[number];

export interface WebhookTimelineEvent {
  id?: string | number;
  event: string;
  actor: {
    login: string;
    id?: number;
    type?: "User" | "Bot" | "Organization" | string;
    author_association?: GitHubAuthorAssociation | string;
  };
  created_at?: string;
  source?: "issue" | "pull_request" | "webhook" | "timeline";
  sourceNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface RoleMultiplierConfig {
  owner?: number;
  member?: number;
  collaborator?: number;
  contributor?: number;
  first_time_contributor?: number;
  external?: number;
}

export interface WebhookRewardsOptions {
  defaultEventCredit?: number;
  eventCreditOverrides?: Record<string, number>;
  excludeBots?: boolean;
  botBlacklist?: readonly string[];
  roleMultipliers?: RoleMultiplierConfig;
  normalizeEventNames?: boolean;
  deduplicateEvents?: boolean;
}

export interface ContributorRewardSummary {
  login: string;
  actorType: string;
  authorAssociation: GitHubAuthorAssociation;
  contributorClass: ContributorClass;
  totalEvents: number;
  eventBreakdown: Record<string, number>;
  baseCredits: number;
  roleMultiplier: number;
  totalRewardCredits: number;
  eventsParticipated: WebhookTimelineEvent[];
}

export interface WebhookRewardsSummary {
  issueNumber?: number;
  totalEventsProcessed: number;
  qualifyingEventsCount: number;
  totalRewardsAllocated: number;
  uniqueContributorsCount: number;
  contributors: ContributorRewardSummary[];
  eventDistribution: Record<string, number>;
  generatedAt: string;
  isZeroConfig: boolean;
}

export const DEFAULT_BOT_BLACKLIST: readonly string[] = Object.freeze([
  "github-actions[bot]",
  "ubiquity-os[bot]",
  "ubiquity-os-beta[bot]",
  "ubiquibot[bot]",
  "devpool-directory-superintendent[bot]",
  "dependabot[bot]",
  "renovate[bot]",
  "codecov[bot]",
]);

const TIMELINE_TO_WEBHOOK_MAP: Record<string, string> = {
  commented: "issue_comment.created",
  reviewed: "pull_request_review.submitted",
  committed: "commit",
  labeled: "issues.labeled",
  unlabeled: "issues.unlabeled",
  assigned: "issues.assigned",
  unassigned: "issues.unassigned",
  closed: "issues.closed",
  reopened: "issues.reopened",
  opened: "issues.opened",
  review_requested: "pull_request.review_requested",
  line_commented: "pull_request_review_comment.created",
};

export function normalizeWebhookEventName(eventName: string): string {
  const trimmed = eventName.trim().toLowerCase();
  if (TIMELINE_TO_WEBHOOK_MAP[trimmed]) {
    return TIMELINE_TO_WEBHOOK_MAP[trimmed];
  }
  return trimmed;
}

export function resolveContributorClass(association?: string): ContributorClass {
  const norm = (association || "NONE").toUpperCase();
  switch (norm) {
    case "OWNER":
      return "owner";
    case "MEMBER":
      return "member";
    case "COLLABORATOR":
      return "collaborator";
    case "CONTRIBUTOR":
      return "contributor";
    case "FIRST_TIME_CONTRIBUTOR":
    case "FIRST_TIMER":
      return "first_time_contributor";
    case "NONE":
    default:
      return "external";
  }
}

export function isBotActor(
  actor: WebhookTimelineEvent["actor"],
  customBlacklist: readonly string[] = DEFAULT_BOT_BLACKLIST
): boolean {
  if (actor.type?.toLowerCase() === "bot") {
    return true;
  }
  const login = actor.login.toLowerCase();
  if (login.endsWith("[bot]")) {
    return true;
  }
  return customBlacklist.some((b) => b.toLowerCase() === login);
}

export function calculateWebhookRewards(
  events: readonly WebhookTimelineEvent[],
  options: WebhookRewardsOptions = {}
): WebhookRewardsSummary {
  const {
    defaultEventCredit = 1,
    eventCreditOverrides = {},
    excludeBots = true,
    botBlacklist = DEFAULT_BOT_BLACKLIST,
    roleMultipliers,
    normalizeEventNames = true,
    deduplicateEvents = true,
  } = options;

  const isZeroConfig =
    defaultEventCredit === 1 &&
    Object.keys(eventCreditOverrides).length === 0 &&
    !roleMultipliers;

  const contributorMap = new Map<
    string,
    {
      actor: WebhookTimelineEvent["actor"];
      events: WebhookTimelineEvent[];
      breakdown: Map<string, number>;
      baseCredits: number;
    }
  >();

  const seenEventKeys = new Set<string>();
  const eventDistribution: Record<string, number> = {};
  let qualifyingEventsCount = 0;

  for (const rawEvent of events) {
    if (!rawEvent || !rawEvent.actor || !rawEvent.actor.login) {
      continue;
    }

    if (excludeBots && isBotActor(rawEvent.actor, botBlacklist)) {
      continue;
    }

    if (deduplicateEvents && rawEvent.id != null) {
      const dedupeKey = `${rawEvent.actor.login}:${rawEvent.id}`;
      if (seenEventKeys.has(dedupeKey)) {
        continue;
      }
      seenEventKeys.add(dedupeKey);
    }

    const eventName = normalizeEventNames
      ? normalizeWebhookEventName(rawEvent.event)
      : rawEvent.event;

    const creditForEvent =
      eventCreditOverrides[eventName] !== undefined
        ? eventCreditOverrides[eventName]
        : defaultEventCredit;

    qualifyingEventsCount++;
    eventDistribution[eventName] = (eventDistribution[eventName] || 0) + 1;

    const login = rawEvent.actor.login;
    let entry = contributorMap.get(login);
    if (!entry) {
      entry = {
        actor: rawEvent.actor,
        events: [],
        breakdown: new Map<string, number>(),
        baseCredits: 0,
      };
      contributorMap.set(login, entry);
    }

    entry.events.push(rawEvent);
    entry.breakdown.set(eventName, (entry.breakdown.get(eventName) || 0) + 1);
    entry.baseCredits += creditForEvent;
  }

  const contributors: ContributorRewardSummary[] = [];
  let totalRewardsAllocated = 0;

  for (const [login, data] of contributorMap.entries()) {
    const rawAssoc = (data.actor.author_association || "NONE") as GitHubAuthorAssociation;
    const contributorClass = resolveContributorClass(rawAssoc);

    let multiplier = 1.0;
    if (roleMultipliers) {
      multiplier = roleMultipliers[contributorClass] ?? 1.0;
    }

    const totalRewardCredits = Math.round(data.baseCredits * multiplier * 100) / 100;
    totalRewardsAllocated += totalRewardCredits;

    const breakdownObj: Record<string, number> = {};
    for (const [evt, count] of data.breakdown.entries()) {
      breakdownObj[evt] = count;
    }

    contributors.push({
      login,
      actorType: data.actor.type || "User",
      authorAssociation: rawAssoc,
      contributorClass,
      totalEvents: data.events.length,
      eventBreakdown: breakdownObj,
      baseCredits: data.baseCredits,
      roleMultiplier: multiplier,
      totalRewardCredits,
      eventsParticipated: data.events,
    });
  }

  contributors.sort((a, b) => {
    if (b.totalRewardCredits !== a.totalRewardCredits) {
      return b.totalRewardCredits - a.totalRewardCredits;
    }
    return b.totalEvents - a.totalEvents;
  });

  return {
    totalEventsProcessed: events.length,
    qualifyingEventsCount,
    totalRewardsAllocated: Math.round(totalRewardsAllocated * 100) / 100,
    uniqueContributorsCount: contributors.length,
    contributors,
    eventDistribution,
    generatedAt: new Date().toISOString(),
    isZeroConfig,
  };
}

export function generateRewardsMarkdownSummary(
  summary: WebhookRewardsSummary,
  contextTitle?: string
): string {
  const lines: string[] = [];

  const titleHeader = contextTitle
    ? `### 🏆 Contributor Rewards Breakdown — ${contextTitle}`
    : "### 🏆 Contributor Rewards Breakdown (No-Config v1)";

  lines.push(titleHeader);
  lines.push("");
  lines.push(
    `> **Summary**: Calculated **${summary.totalRewardsAllocated}** reward credits across **${summary.uniqueContributorsCount}** contributors from **${summary.qualifyingEventsCount}** qualifying webhook/timeline events.`
  );
  lines.push("");

  if (summary.contributors.length === 0) {
    lines.push("_No eligible contributor activity recorded._");
    return lines.join("\n");
  }

  lines.push("| Contributor | Role / Class | Events | Multiplier | Reward Credits | Top Activity |");
  lines.push("| :--- | :--- | :---: | :---: | :---: | :--- |");

  for (const c of summary.contributors) {
    const topActivities = Object.entries(c.eventBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([evt, count]) => `\`${evt}\` (${count})`)
      .join(", ");

    const roleLabel = `${c.authorAssociation} (${c.contributorClass})`;
    const multLabel = c.roleMultiplier !== 1.0 ? `${c.roleMultiplier}x` : "1.0x";

    lines.push(
      `| @${c.login} | ${roleLabel} | ${c.totalEvents} | ${multLabel} | **${c.totalRewardCredits}** | ${topActivities || "None"} |`
    );
  }

  lines.push("");
  lines.push("#### 📊 Event Distribution");
  lines.push("");
  lines.push("| Event Type | Count | Share |");
  lines.push("| :--- | :---: | :---: |");

  for (const [evt, count] of Object.entries(summary.eventDistribution).sort((a, b) => b[1] - a[1])) {
    const share = summary.qualifyingEventsCount > 0
      ? `${Math.round((count / summary.qualifyingEventsCount) * 1000) / 10}%`
      : "0%";
    lines.push(`| \`${evt}\` | ${count} | ${share} |`);
  }

  lines.push("");
  lines.push(
    `<sub>Generated by UbiquityOS Generalized Webhook Rewards (v1 No-Config) at ${summary.generatedAt}</sub>`
  );

  return lines.join("\n");
}
