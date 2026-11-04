import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  aggregateContributorRewards,
  calculateLabelModifiers,
  evaluateWebhookRewards,
  formatRewardsReport,
  getDefaultConfigV3,
  isEventTargetConfig,
  isTwoLevelEventConfig,
  resolveEventConfig,
  validateConfigV3,
  type ContributorRole,
  type WebhookEventContext,
  type WebhookRewardsConfigV3,
} from "../src/utils/webhookRewardsConfigV3";

describe("Generalized GitHub Webhook + Contributor Role -> Rewards (Config v3)", () => {
  describe("validateConfigV3", () => {
    test("validates the default Config v3 without errors", () => {
      const config = getDefaultConfigV3();
      const result = validateConfigV3(config);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    test("catches invalid contributor roles in targets", () => {
      const invalidConfig = {
        pull_request: {
          opened: {
            pull: { targets: ["INVALID_ROLE" as ContributorRole], value: 5 },
          },
        },
      };
      const result = validateConfigV3(invalidConfig);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("INVALID_ROLE")));
    });

    test("rejects invalid value types (e.g. non-number or NaN)", () => {
      const invalidConfig = {
        pull_request: {
          opened: {
            pull: { targets: ["CONTRIBUTOR" as ContributorRole], value: "ten" as any },
          },
        },
      };
      const result = validateConfigV3(invalidConfig);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("must be a valid number")));
    });

    test("validates labelOverrides schema", () => {
      const invalidConfig = {
        labelOverrides: {
          bug: { value: "invalid" as any },
        },
      };
      const result = validateConfigV3(invalidConfig);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("labelOverrides.bug.value")));
    });

    test("validates options.roleMultipliers", () => {
      const invalidConfig = {
        options: {
          roleMultipliers: {
            SUPERUSER: 2.0 as any,
          },
        },
      };
      const result = validateConfigV3(invalidConfig);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("SUPERUSER")));
    });
  });

  describe("resolveEventConfig & Context Separation", () => {
    const config = getDefaultConfigV3();

    test("resolves pull context for pull_request.opened", () => {
      const targetConfig = resolveEventConfig(config, "pull_request", "opened", true);
      assert.ok(targetConfig);
      assert.equal(targetConfig.value, 5);
      assert.deepEqual(targetConfig.targets, ["CONTRIBUTOR"]);
    });

    test("resolves issue context for pull_request.opened", () => {
      const targetConfig = resolveEventConfig(config, "pull_request", "opened", false);
      assert.ok(targetConfig);
      assert.equal(targetConfig.value, 2);
      assert.deepEqual(targetConfig.targets, ["CONTRIBUTOR"]);
    });

    test("resolves differential rewards for closed event between pull and issue", () => {
      const pullTarget = resolveEventConfig(config, "pull_request", "closed", true);
      const issueTarget = resolveEventConfig(config, "pull_request", "closed", false);
      assert.ok(pullTarget && issueTarget);
      assert.equal(pullTarget.value, 10);
      assert.equal(issueTarget.value, 1);
    });

    test("returns null for unregistered events or actions", () => {
      const targetConfig = resolveEventConfig(config, "non_existent_event", "action", true);
      assert.equal(targetConfig, null);
    });

    test("supports flat (single-level) event target configs", () => {
      const flatConfig: WebhookRewardsConfigV3 = {
        push: {
          targets: ["COMMITTERS"],
          value: 1.5,
        },
      };
      const resolved = resolveEventConfig(flatConfig, "push", undefined, true);
      assert.ok(resolved);
      assert.equal(resolved.value, 1.5);
      assert.deepEqual(resolved.targets, ["COMMITTERS"]);
    });

    test("type guards isTwoLevelEventConfig and isEventTargetConfig work as expected", () => {
      assert.ok(isTwoLevelEventConfig({ pull: { targets: ["CONTRIBUTOR"], value: 1 } }));
      assert.ok(!isTwoLevelEventConfig({ targets: ["CONTRIBUTOR"], value: 1 }));
      assert.ok(isEventTargetConfig({ targets: ["CONTRIBUTOR"], value: 1 }));
      assert.ok(!isEventTargetConfig({ pull: { targets: ["CONTRIBUTOR"], value: 1 } }));
    });
  });

  describe("calculateLabelModifiers", () => {
    const labelOverrides = {
      "good-first-issue": { value: 5 },
      bug: { value: -2 },
      priority: { multiplier: 1.5 },
      bounty: { value: 10, multiplier: 2.0 },
    };

    test("applies additive delta from single label", () => {
      const res = calculateLabelModifiers(["good-first-issue"], labelOverrides);
      assert.equal(res.deltaValue, 5);
      assert.equal(res.labelMultiplier, 1);
      assert.deepEqual(res.appliedLabels, ["good-first-issue"]);
    });

    test("applies multiple additive and multiplicative modifiers", () => {
      const res = calculateLabelModifiers(["good-first-issue", "priority"], labelOverrides);
      assert.equal(res.deltaValue, 5);
      assert.equal(res.labelMultiplier, 1.5);
      assert.deepEqual(res.appliedLabels, ["good-first-issue", "priority"]);
    });

    test("ignores unconfigured labels", () => {
      const res = calculateLabelModifiers(["documentation", "wontfix"], labelOverrides);
      assert.equal(res.deltaValue, 0);
      assert.equal(res.labelMultiplier, 1);
      assert.deepEqual(res.appliedLabels, []);
    });
  });

  describe("evaluateWebhookRewards", () => {
    const config = getDefaultConfigV3();

    test("rewards contributor on pull_request.opened", () => {
      const context: WebhookEventContext = {
        event: "pull_request",
        action: "opened",
        isPullRequest: true,
        roles: {
          CONTRIBUTOR: ["alice"],
          ISSUER: ["alice"],
        },
      };

      const result = evaluateWebhookRewards(config, context);
      assert.equal(result.rewards.length, 1);
      assert.equal(result.rewards[0].username, "alice");
      assert.equal(result.rewards[0].finalReward, 5);
      assert.equal(result.totalDistributed, 5);
    });

    test("handles negative reward events (e.g. review dismissed or review_request_removed)", () => {
      const context: WebhookEventContext = {
        event: "pull_request_review",
        action: "dismissed",
        isPullRequest: true,
        roles: {
          REVIEWERS: ["bob"],
        },
      };

      const result = evaluateWebhookRewards(config, context);
      assert.equal(result.rewards.length, 1);
      assert.equal(result.rewards[0].username, "bob");
      assert.equal(result.rewards[0].finalReward, -2);
      assert.equal(result.totalDistributed, -2);
    });

    test("clamps negative rewards to 0 when allowNegativeRewards is false", () => {
      const customConfig: WebhookRewardsConfigV3 = {
        ...getDefaultConfigV3(),
        options: {
          ...getDefaultConfigV3().options,
          allowNegativeRewards: false,
        },
      };

      const context: WebhookEventContext = {
        event: "pull_request_review",
        action: "dismissed",
        isPullRequest: true,
        roles: {
          REVIEWERS: ["bob"],
        },
      };

      const result = evaluateWebhookRewards(customConfig, context);
      assert.equal(result.rewards[0].finalReward, 0);
      assert.equal(result.totalDistributed, 0);
    });

    test("applies label overrides (additive + multiplicative) and roleMultipliers", () => {
      const context: WebhookEventContext = {
        event: "pull_request",
        action: "opened",
        isPullRequest: true,
        labels: ["good-first-issue", "priority"], // +5, x1.5
        roles: {
          COLLABORATOR: ["charlie"], // roleMultiplier: 1.2
          CONTRIBUTOR: ["charlie"],
        },
      };

      const result = evaluateWebhookRewards(config, context);
      assert.equal(result.rewards.length, 1);
      assert.equal(result.rewards[0].username, "charlie");
      assert.equal(result.rewards[0].finalReward, 15);
    });

    test("automatically skips bots from ignoredUsers", () => {
      const context: WebhookEventContext = {
        event: "pull_request",
        action: "opened",
        isPullRequest: true,
        roles: {
          CONTRIBUTOR: ["ubiquity-os[bot]", "github-actions[bot]", "real_dev"],
        },
      };

      const result = evaluateWebhookRewards(config, context);
      assert.equal(result.rewards.length, 1);
      assert.equal(result.rewards[0].username, "real_dev");
    });

    test("enforces maxRewardPerUser ceiling", () => {
      const customConfig: WebhookRewardsConfigV3 = {
        ...getDefaultConfigV3(),
        options: {
          ...getDefaultConfigV3().options,
          maxRewardPerUser: 8,
        },
      };

      const context: WebhookEventContext = {
        event: "pull_request",
        action: "closed",
        isPullRequest: true, // Base 10
        roles: {
          ISSUER: ["alice"],
        },
      };

      const result = evaluateWebhookRewards(customConfig, context);
      assert.equal(result.rewards[0].finalReward, 8);
    });

    test("enforces minRewardPerUser floor", () => {
      const customConfig: WebhookRewardsConfigV3 = {
        ...getDefaultConfigV3(),
        options: {
          ...getDefaultConfigV3().options,
          minRewardPerUser: -1,
        },
      };

      const context: WebhookEventContext = {
        event: "pull_request_review",
        action: "dismissed", // -2
        isPullRequest: true,
        roles: {
          REVIEWERS: ["bob"],
        },
      };

      const result = evaluateWebhookRewards(customConfig, context);
      assert.equal(result.rewards[0].finalReward, -1);
    });
  });

  describe("aggregateContributorRewards & formatRewardsReport", () => {
    const config = getDefaultConfigV3();

    test("aggregates multiple event evaluations and formats markdown report", () => {
      const ev1 = evaluateWebhookRewards(config, {
        event: "pull_request",
        action: "opened",
        isPullRequest: true,
        roles: { CONTRIBUTOR: ["alice", "bob"] },
      });

      const ev2 = evaluateWebhookRewards(config, {
        event: "pull_request_review",
        action: "submitted",
        isPullRequest: true,
        roles: { REVIEWERS: ["bob"] },
      });

      const ev3 = evaluateWebhookRewards(config, {
        event: "pull_request",
        action: "closed",
        isPullRequest: true,
        roles: { ISSUER: ["alice"] },
      });

      const aggregated = aggregateContributorRewards([ev1, ev2, ev3]);

      assert.equal(aggregated.alice.totalReward, 15);
      assert.equal(aggregated.alice.eventCount, 2);
      assert.ok(aggregated.alice.roles.includes("CONTRIBUTOR"));
      assert.ok(aggregated.alice.roles.includes("ISSUER"));

      assert.equal(aggregated.bob.totalReward, 8);
      assert.equal(aggregated.bob.eventCount, 2);

      const report = formatRewardsReport(aggregated);
      assert.ok(report.includes("@alice"));
      assert.ok(report.includes("@bob"));
      assert.ok(report.includes("**+15**"));
      assert.ok(report.includes("**+8**"));
      assert.ok(report.includes("pull_request.opened (pull)"));
    });

    test("formats empty report when no rewards distributed", () => {
      const emptyReport = formatRewardsReport({});
      assert.ok(emptyReport.includes("No rewards distributed"));
    });
  });
});
