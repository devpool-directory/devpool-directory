import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWebhookRewards,
  generateRewardsMarkdownSummary,
  normalizeWebhookEventName,
  resolveContributorClass,
  isBotActor,
  type WebhookTimelineEvent,
  type RoleMultiplierConfig,
} from "../src/utils/webhookRewards";

test("normalizeWebhookEventName correctly maps legacy timeline names to webhook actions", () => {
  assert.equal(normalizeWebhookEventName("commented"), "issue_comment.created");
  assert.equal(normalizeWebhookEventName("reviewed"), "pull_request_review.submitted");
  assert.equal(normalizeWebhookEventName("committed"), "commit");
  assert.equal(normalizeWebhookEventName("labeled"), "issues.labeled");
  assert.equal(normalizeWebhookEventName("unlabeled"), "issues.unlabeled");
  assert.equal(normalizeWebhookEventName("assigned"), "issues.assigned");
  assert.equal(normalizeWebhookEventName("unassigned"), "issues.unassigned");
  assert.equal(normalizeWebhookEventName("closed"), "issues.closed");
  assert.equal(normalizeWebhookEventName("reopened"), "issues.reopened");
  assert.equal(normalizeWebhookEventName("opened"), "issues.opened");
  assert.equal(normalizeWebhookEventName("pull_request.opened"), "pull_request.opened");
});

test("resolveContributorClass maps GitHub author associations accurately", () => {
  assert.equal(resolveContributorClass("OWNER"), "owner");
  assert.equal(resolveContributorClass("MEMBER"), "member");
  assert.equal(resolveContributorClass("COLLABORATOR"), "collaborator");
  assert.equal(resolveContributorClass("CONTRIBUTOR"), "contributor");
  assert.equal(resolveContributorClass("FIRST_TIME_CONTRIBUTOR"), "first_time_contributor");
  assert.equal(resolveContributorClass("FIRST_TIMER"), "first_time_contributor");
  assert.equal(resolveContributorClass("NONE"), "external");
  assert.equal(resolveContributorClass(undefined), "external");
});

test("isBotActor detects bot accounts reliably", () => {
  assert.equal(isBotActor({ login: "ubiquibot[bot]" }), true);
  assert.equal(isBotActor({ login: "github-actions[bot]" }), true);
  assert.equal(isBotActor({ login: "my-automation-app", type: "Bot" }), true);
  assert.equal(isBotActor({ login: "alice", type: "User" }), false);
  assert.equal(isBotActor({ login: "dependabot[bot]" }), true);
});

test("calculateWebhookRewards: strictly follows No-Config v1 baseline (1 credit per event)", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: 1,
      event: "issues.opened",
      actor: { login: "alice", author_association: "CONTRIBUTOR" },
      source: "issue",
    },
    {
      id: 2,
      event: "commented",
      actor: { login: "bob", author_association: "MEMBER" },
      source: "issue",
    },
    {
      id: 3,
      event: "commented",
      actor: { login: "alice", author_association: "CONTRIBUTOR" },
      source: "issue",
    },
    {
      id: 4,
      event: "pull_request.opened",
      actor: { login: "alice", author_association: "CONTRIBUTOR" },
      source: "pull_request",
    },
    {
      id: 5,
      event: "reviewed",
      actor: { login: "bob", author_association: "MEMBER" },
      source: "pull_request",
    },
  ];

  const summary = calculateWebhookRewards(events);

  assert.equal(summary.isZeroConfig, true);
  assert.equal(summary.totalEventsProcessed, 5);
  assert.equal(summary.qualifyingEventsCount, 5);
  assert.equal(summary.uniqueContributorsCount, 2);
  assert.equal(summary.totalRewardsAllocated, 5);

  const alice = summary.contributors.find((c) => c.login === "alice");
  assert.ok(alice);
  assert.equal(alice.totalEvents, 3);
  assert.equal(alice.baseCredits, 3);
  assert.equal(alice.totalRewardCredits, 3);
  assert.equal(alice.contributorClass, "contributor");
  assert.equal(alice.eventBreakdown["issues.opened"], 1);
  assert.equal(alice.eventBreakdown["issue_comment.created"], 1);
  assert.equal(alice.eventBreakdown["pull_request.opened"], 1);

  const bob = summary.contributors.find((c) => c.login === "bob");
  assert.ok(bob);
  assert.equal(bob.totalEvents, 2);
  assert.equal(bob.baseCredits, 2);
  assert.equal(bob.totalRewardCredits, 2);
  assert.equal(bob.contributorClass, "member");
  assert.equal(bob.eventBreakdown["issue_comment.created"], 1);
  assert.equal(bob.eventBreakdown["pull_request_review.submitted"], 1);

  assert.equal(summary.eventDistribution["issues.opened"], 1);
  assert.equal(summary.eventDistribution["issue_comment.created"], 2);
  assert.equal(summary.eventDistribution["pull_request.opened"], 1);
  assert.equal(summary.eventDistribution["pull_request_review.submitted"], 1);
});

test("calculateWebhookRewards: filters out bot events by default", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: 101,
      event: "issues.opened",
      actor: { login: "charlie", author_association: "CONTRIBUTOR" },
    },
    {
      id: 102,
      event: "commented",
      actor: { login: "ubiquibot[bot]", type: "Bot" },
    },
    {
      id: 103,
      event: "commented",
      actor: { login: "github-actions[bot]" },
    },
    {
      id: 104,
      event: "commented",
      actor: { login: "charlie", author_association: "CONTRIBUTOR" },
    },
  ];

  const summary = calculateWebhookRewards(events);

  assert.equal(summary.totalEventsProcessed, 4);
  assert.equal(summary.qualifyingEventsCount, 2);
  assert.equal(summary.uniqueContributorsCount, 1);
  assert.equal(summary.contributors[0].login, "charlie");
  assert.equal(summary.contributors[0].totalRewardCredits, 2);
});

test("calculateWebhookRewards: deduplicates identical event IDs per contributor", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: "evt-999",
      event: "issue_comment.created",
      actor: { login: "dave", author_association: "CONTRIBUTOR" },
    },
    {
      id: "evt-999",
      event: "issue_comment.created",
      actor: { login: "dave", author_association: "CONTRIBUTOR" },
    },
    {
      id: "evt-1000",
      event: "pull_request.opened",
      actor: { login: "dave", author_association: "CONTRIBUTOR" },
    },
  ];

  const summary = calculateWebhookRewards(events, { deduplicateEvents: true });

  assert.equal(summary.totalEventsProcessed, 3);
  assert.equal(summary.qualifyingEventsCount, 2);
  assert.equal(summary.contributors[0].totalRewardCredits, 2);
});

test("calculateWebhookRewards: scales credits with roleMultipliers", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: 1,
      event: "issues.opened",
      actor: { login: "maintainer1", author_association: "MEMBER" },
    },
    {
      id: 2,
      event: "pull_request.opened",
      actor: { login: "contributor1", author_association: "FIRST_TIME_CONTRIBUTOR" },
    },
  ];

  const multipliers: RoleMultiplierConfig = {
    member: 2.0,
    first_time_contributor: 1.5,
  };

  const summary = calculateWebhookRewards(events, { roleMultipliers: multipliers });

  assert.equal(summary.isZeroConfig, false);
  const m1 = summary.contributors.find((c) => c.login === "maintainer1");
  const c1 = summary.contributors.find((c) => c.login === "contributor1");

  assert.equal(m1?.totalRewardCredits, 2.0);
  assert.equal(c1?.totalRewardCredits, 1.5);
  assert.equal(summary.totalRewardsAllocated, 3.5);
});

test("calculateWebhookRewards: supports custom event credit overrides", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: 1,
      event: "pull_request_review.submitted",
      actor: { login: "reviewer", author_association: "COLLABORATOR" },
    },
    {
      id: 2,
      event: "issue_comment.created",
      actor: { login: "reviewer", author_association: "COLLABORATOR" },
    },
  ];

  const summary = calculateWebhookRewards(events, {
    eventCreditOverrides: {
      "pull_request_review.submitted": 5,
    },
  });

  const reviewer = summary.contributors[0];
  assert.equal(reviewer.baseCredits, 6);
  assert.equal(reviewer.totalRewardCredits, 6);
});

test("generateRewardsMarkdownSummary formats audit comment cleanly", () => {
  const events: WebhookTimelineEvent[] = [
    {
      id: 1,
      event: "pull_request.opened",
      actor: { login: "alice", author_association: "CONTRIBUTOR" },
    },
    {
      id: 2,
      event: "commented",
      actor: { login: "alice", author_association: "CONTRIBUTOR" },
    },
  ];

  const summary = calculateWebhookRewards(events);
  const markdown = generateRewardsMarkdownSummary(summary, "Issue #5039");

  assert.ok(markdown.includes("### 🏆 Contributor Rewards Breakdown — Issue #5039"));
  assert.ok(markdown.includes("@alice"));
  assert.ok(markdown.includes("| @alice | CONTRIBUTOR (contributor) | 2 | 1.0x | **2** |"));
  assert.ok(markdown.includes("#### 📊 Event Distribution"));
  assert.ok(markdown.includes("`pull_request.opened`"));
  assert.ok(markdown.includes("`issue_comment.created`"));
});

test("generateRewardsMarkdownSummary handles empty contributors gracefully", () => {
  const summary = calculateWebhookRewards([]);
  const markdown = generateRewardsMarkdownSummary(summary);

  assert.ok(markdown.includes("_No eligible contributor activity recorded._"));
});
