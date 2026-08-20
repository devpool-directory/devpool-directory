/**
 * Generalized "GitHub Webhook + Contributor Role -> Rewards" No Config v1
 * 
 * Dynamically maps webhook event names to reward credits per contributor.
 * Counts matching events in issue/PR timeline and returns sum totals.
 * 
 * Addresses: devpool-directory#5039 / ubiquity-os/plugins-wishlist#46
 */

import { Octokit } from "octokit";

export interface TimelineEvent {
  event: string;
  actor?: { login: string };
  created_at?: string;
}

export interface ContributorRewards {
  contributor: string;
  total_events: number;
  breakdown: Record<string, number>;
}

export interface RewardAuditResult {
  issue_number: number;
  repo: string;
  owner: string;
  contributors: ContributorRewards[];
  total_events_counted: number;
  unique_event_types: string[];
}

// All valid GitHub webhook/timeline event types
const VALID_TIMELINE_EVENTS = new Set([
  "assigned", "unassigned", "labeled", "unlabeled",
  "opened", "edited", "closed", "reopened",
  "locked", "unlocked", "pinned", "unpinned",
  "subscribed", "unsubscribed", "referenced",
  "cross-referenced", "commented", "reviewed",
  "review_requested", "review_request_removed",
  "changes_requested", "approved", "dismissed",
  "committed", "head_ref_deleted", "head_ref_restored",
  "merged", "deployed", "deployment_status_changed",
  "connected", "disconnected", "transferred",
  "renamed", "converted_to_draft", "ready_for_review",
  "auto_merge_enabled", "auto_merge_disabled",
  "marked_as_duplicate", "unmarked_as_duplicate",
  "mentioned", "team_mentioned", "milestoned", "demilestoned",
]);

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

export function aggregateContributorRewards(events: TimelineEvent[]): ContributorRewards[] {
  const contributorMap = new Map<string, Record<string, number>>();
  for (const event of events) {
    if (!event.actor || !VALID_TIMELINE_EVENTS.has(event.event)) continue;
    const login = event.actor.login;
    if (!contributorMap.has(login)) contributorMap.set(login, {});
    const breakdown = contributorMap.get(login)!;
    breakdown[event.event] = (breakdown[event.event] || 0) + 1;
  }
  const results: ContributorRewards[] = [];
  for (const [contributor, breakdown] of contributorMap) {
    const totalEvents = Object.values(breakdown).reduce((sum, count) => sum + count, 0);
    results.push({ contributor, total_events: totalEvents, breakdown });
  }
  results.sort((a, b) => b.total_events - a.total_events);
  return results;
}

export async function auditWebhookRewards(
  octokit: Octokit, owner: string, repo: string, issueNumber: number
): Promise<RewardAuditResult> {
  const events = await fetchTimelineEvents(octokit, owner, repo, issueNumber);
  const contributors = aggregateContributorRewards(events);
  const uniqueEventTypes = [...new Set(events.map(e => e.event))].sort();
  const totalEventsCounted = contributors.reduce((sum, c) => sum + c.total_events, 0);
  return { issue_number: issueNumber, repo, owner, contributors, total_events_counted: totalEventsCounted, unique_event_types: uniqueEventTypes };
}

export function formatRewardAudit(result: RewardAuditResult): string {
  const lines: string[] = [];
  lines.push(`\n${"=".repeat(70)}`);
  lines.push(`WEBHOOK REWARDS AUDIT: ${result.owner}/${result.repo}#${result.issue_number}`);
  lines.push(`${"=".repeat(70)}`);
  lines.push(`Total events counted: ${result.total_events_counted}`);
  lines.push(`Unique event types: ${result.unique_event_types.length}`);
  lines.push(`Contributors: ${result.contributors.length}`);
  lines.push("");
  for (const contrib of result.contributors) {
    lines.push(`👤 ${contrib.contributor}: ${contrib.total_events} events`);
    const topEvents = Object.entries(contrib.breakdown).sort(([, a], [, b]) => b - a).slice(0, 5);
    for (const [eventType, count] of topEvents) {
      lines.push(`   └─ ${eventType}: ${count}`);
    }
  }
  lines.push(`${"=".repeat(70)}\n`);
  return lines.join("\n");
}
