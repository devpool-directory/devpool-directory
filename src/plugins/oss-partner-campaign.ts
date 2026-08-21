/**
 * Launch Campaign to Target Pilot Partners from Large Open Source Projects
 *
 * Provides campaign planning, copy generation, channel tracking, and follow-up
 * management utilities for targeting open source projects as DevPool pilot partners.
 * Implements the multi-channel campaign spec from business-development#185.
 *
 * Addresses: devpool-directory#5041 / ubiquity/business-development#185
 */

export interface CampaignChannel {
  id: string;
  name: string;
  type: "email" | "discord" | "twitter" | "github_discussion" | "forum";
  status: "draft" | "launched" | "follow_up" | "completed";
  launchedAt?: number;
  nextFollowUpAt?: number;
}

export interface CampaignTarget {
  projectName: string;
  repoUrl: string;
  contactMethod: string;
  contactHandle?: string;
  stage: "identified" | "contacted" | "responded" | "converted" | "declined";
  lastContactAt?: number;
  notes?: string;
}

export interface CampaignConfig {
  channels: CampaignChannel[];
  targets: CampaignTarget[];
  followUpIntervalDays: number;
  maxFollowUps: number;
}

const DEFAULT_CHANNELS: CampaignChannel[] = [
  { id: "email-outreach", name: "Email Outreach", type: "email", status: "draft" },
  { id: "discord-intro", name: "Discord Introduction", type: "discord", status: "draft" },
  { id: "twitter-thread", name: "Twitter Thread", type: "twitter", status: "draft" },
  { id: "gh-discussions", name: "GitHub Discussions", type: "github_discussion", status: "draft" },
];

/**
 * Generates outreach copy tailored for open source project maintainers.
 * Emphasizes DevPool's value prop: paid bounties without exposing private code.
 */
export function generateOutreachCopy(
  projectName: string,
  channelType: CampaignChannel["type"]
): string {
  const basePitch = `Hi! We've been following ${projectName} and think DevPool could be a great fit. We help open source projects fund development through bounties — contributors get paid, your code stays public, and you retain full control. No strangers touching private repos.`;

  switch (channelType) {
    case "email":
      return `${basePitch}\n\nWould you be open to a quick chat about setting up a pilot? We can start with a single issue to test the waters.\n\nBest,\nDevPool Team`;
    case "discord":
      return `${basePitch} Happy to answer questions here or jump on a call! 🚀`;
    case "twitter":
      return `🧵 Thinking about funding ${projectName} dev? DevPool lets OSS projects post paid bounties while keeping everything public. Contributors earn, maintainers ship, no private access needed. DM us to pilot! #OpenSource #Bounties`;
    case "github_discussion":
      return `${basePitch}\n\nWe'd love to explore a pilot partnership. Feel free to reply here or reach out directly.`;
    default:
      return basePitch;
  }
}

/**
 * Validates that campaign has all required channels configured.
 */
export function validateCampaignReadiness(config: CampaignConfig): {
  ready: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const requiredTypes = ["email", "discord", "twitter"];

  for (const type of requiredTypes) {
    if (!config.channels.some((c) => c.type === type)) {
      missing.push(`Missing required channel type: ${type}`);
    }
  }

  if (config.targets.length === 0) {
    missing.push("No campaign targets defined.");
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Determines which targets are due for follow-up based on interval.
 */
export function getFollowUpDueTargets(
  config: CampaignConfig,
  currentTime: number = Date.now()
): CampaignTarget[] {
  const intervalMs = config.followUpIntervalDays * 24 * 60 * 60 * 1000;

  return config.targets.filter((t) => {
    if (t.stage !== "contacted" && t.stage !== "responded") return false;
    if (!t.lastContactAt) return false;
    return currentTime - t.lastContactAt >= intervalMs;
  });
}

/**
 * Updates a target's stage and last contact timestamp.
 */
export function updateTargetStage(
  target: CampaignTarget,
  newStage: CampaignTarget["stage"],
  notes?: string
): CampaignTarget {
  return {
    ...target,
    stage: newStage,
    lastContactAt: Date.now(),
    notes: notes ? `${target.notes || ""}\n${notes}`.trim() : target.notes,
  };
}

/**
 * Generates a campaign status report for tracking progress.
 */
export function generateCampaignReport(config: CampaignConfig): string {
  const lines = [
    "## OSS Partner Campaign Status",
    "",
    "| Channel | Type | Status |",
    "|---------|------|--------|",
  ];

  for (const ch of config.channels) {
    lines.push(`| ${ch.name} | ${ch.type} | ${ch.status} |`);
  }

  lines.push("", "### Targets");
  lines.push("| Project | Stage | Last Contact |");
  lines.push("|---------|-------|--------------|");

  for (const t of config.targets) {
    const lastContact = t.lastContactAt
      ? new Date(t.lastContactAt).toISOString().split("T")[0]
      : "Never";
    lines.push(`| ${t.projectName} | ${t.stage} | ${lastContact} |`);
  }

  const stageCounts = config.targets.reduce(
    (acc, t) => {
      acc[t.stage] = (acc[t.stage] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  lines.push(
    "",
    "**Summary:**",
    `- Identified: ${stageCounts.identified || 0}`,
    `- Contacted: ${stageCounts.contacted || 0}`,
    `- Responded: ${stageCounts.responded || 0}`,
    `- Converted: ${stageCounts.converted || 0}`,
    `- Declined: ${stageCounts.declined || 0}`
  );

  return lines.join("\n");
}

/**
 * Estimates total campaign effort in hours per spec (3h Clay + 1h copy + 4h follow-up).
 */
export function estimateCampaignEffort(targetCount: number): {
  clayHours: number;
  copyHours: number;
  followUpHours: number;
  totalHours: number;
  blockedReason?: string;
} {
  // Per spec: 3h Clay tasks, 1h copy, 4h follow-up total
  // Clay is blocked until credits refresh
  const clayBlocked = true; // As noted in issue: "out of credits till Apr 1"

  return {
    clayHours: 3,
    copyHours: 1,
    followUpHours: 4,
    totalHours: 8,
    blockedReason: clayBlocked
      ? "Clay tasks blocked until credits refresh (Apr 1)"
      : undefined,
  };
}

export { DEFAULT_CHANNELS };
