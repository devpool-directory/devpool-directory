import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WorkflowRun,
  filterManualWorkflowRuns,
  computeFailureStreak,
  buildFailureStreakAlertComment,
  isDuplicateAlertComment,
  probePluginHealth,
  evaluatePluginHealth,
  DEFAULT_FAILURE_THRESHOLD,
} from "../src/utils/pluginHealthMonitor.js";

describe("Plugin Health Monitor", () => {
  describe("filterManualWorkflowRuns", () => {
    const sampleRuns: WorkflowRun[] = [
      { id: 1, repository: "ubiquity-os/plugin-reward", conclusion: "failure", event: "workflow_dispatch", actorLogin: "ubiquity-os[bot]" },
      { id: 2, repository: "ubiquity-os/plugin-reward", conclusion: "success", event: "push", actorLogin: "contributor" },
      { id: 3, repository: "ubiquity-os/plugin-reward", conclusion: "failure", event: "workflow_dispatch", actorLogin: "other-user" },
    ];

    it("filters only workflow_dispatch runs", () => {
      const filtered = filterManualWorkflowRuns(sampleRuns);
      assert.equal(filtered.length, 2);
      assert.equal(filtered[0].id, 1);
      assert.equal(filtered[1].id, 3);
    });

    it("filters by allowed actor logins", () => {
      const filtered = filterManualWorkflowRuns(sampleRuns, ["ubiquity-os[bot]"]);
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, 1);
    });
  });

  describe("computeFailureStreak", () => {
    it("identifies streaks exceeding threshold", () => {
      const runs: WorkflowRun[] = [];
      for (let i = 1; i <= 12; i++) {
        runs.push({
          id: i,
          repository: "ubiquity-os-marketplace/plugin-access",
          conclusion: "failure",
          htmlUrl: `https://github.com/ubiquity-os-marketplace/plugin-access/actions/runs/${i}`,
        });
      }
      runs.push({
        id: 13,
        repository: "ubiquity-os-marketplace/plugin-access",
        conclusion: "success",
      });

      const streak = computeFailureStreak(runs, 10);
      assert.equal(streak.repository, "ubiquity-os-marketplace/plugin-access");
      assert.equal(streak.consecutiveFailures, 12);
      assert.equal(streak.threshold, 10);
      assert.equal(streak.exceedsThreshold, true);
      assert.equal(streak.failureRunUrls.length, 12);
      assert.equal(streak.lastSuccessfulRunId, 13);
    });

    it("stops counting consecutive failures when a success is encountered", () => {
      const runs: WorkflowRun[] = [
        { id: 101, repository: "ubiquity-os/plugin-x", conclusion: "failure", htmlUrl: "https://example.com/run/101" },
        { id: 102, repository: "ubiquity-os/plugin-x", conclusion: "failure", htmlUrl: "https://example.com/run/102" },
        { id: 103, repository: "ubiquity-os/plugin-x", conclusion: "success" },
        { id: 104, repository: "ubiquity-os/plugin-x", conclusion: "failure" },
      ];

      const streak = computeFailureStreak(runs, DEFAULT_FAILURE_THRESHOLD);
      assert.equal(streak.consecutiveFailures, 2);
      assert.equal(streak.exceedsThreshold, false);
      assert.equal(streak.lastSuccessfulRunId, 103);
    });

    it("handles zero failures gracefully", () => {
      const runs: WorkflowRun[] = [
        { id: 201, repository: "ubiquity-os/plugin-y", conclusion: "success" },
      ];

      const streak = computeFailureStreak(runs);
      assert.equal(streak.consecutiveFailures, 0);
      assert.equal(streak.exceedsThreshold, false);
      assert.equal(streak.lastSuccessfulRunId, 201);
    });
  });

  describe("buildFailureStreakAlertComment & isDuplicateAlertComment", () => {
    const analysis = {
      repository: "ubiquity-os-marketplace/plugin-daemon",
      totalRuns: 15,
      consecutiveFailures: 11,
      threshold: 10,
      exceedsThreshold: true,
      failureRunUrls: [
        "https://github.com/ubiquity-os-marketplace/plugin-daemon/actions/runs/1",
        "https://github.com/ubiquity-os-marketplace/plugin-daemon/actions/runs/2",
      ],
      lastSuccessfulRunId: 100,
    };

    it("generates markdown alert comment with tags and diagnostics", () => {
      const comment = buildFailureStreakAlertComment(analysis);
      assert.ok(comment.includes("@0x4007"));
      assert.ok(comment.includes("@gentlementlegen"));
      assert.ok(comment.includes("ubiquity-os-marketplace/plugin-daemon"));
      assert.ok(comment.includes("**11** consecutive workflow failures"));
      assert.ok(comment.includes("actions/runs/1"));
    });

    it("detects existing duplicate alerts to avoid comment spam", () => {
      const comment = buildFailureStreakAlertComment(analysis);
      const existing = [
        "Some unrelated comment",
        comment,
      ];
      assert.equal(isDuplicateAlertComment(comment, existing), true);
      assert.equal(isDuplicateAlertComment("Different content", existing), false);
    });
  });

  describe("probePluginHealth", () => {
    it("reports healthy when manifest.json is found and ok", async () => {
      const mockFetch: typeof fetch = async (url) => {
        assert.equal(String(url), "https://plugin.example.com/manifest.json");
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: "test-plugin", description: "testing" }),
        } as unknown as Response;
      };

      const report = await probePluginHealth("https://plugin.example.com/", 5000, mockFetch);
      assert.equal(report.healthy, true);
      assert.equal(report.statusCode, 200);
      assert.equal(report.manifestName, "test-plugin");
      assert.ok(report.latencyMs >= 0);
    });

    it("reports unhealthy when endpoint returns HTTP error", async () => {
      const mockFetch: typeof fetch = async () => {
        return {
          ok: false,
          status: 502,
        } as unknown as Response;
      };

      const report = await probePluginHealth("https://broken.example.com", 5000, mockFetch);
      assert.equal(report.healthy, false);
      assert.equal(report.statusCode, 502);
      assert.equal(report.error, "HTTP 502");
    });

    it("handles fetch rejection or timeout", async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error("Connection timeout");
      };

      const report = await probePluginHealth("https://timeout.example.com", 5000, mockFetch);
      assert.equal(report.healthy, false);
      assert.equal(report.statusCode, null);
      assert.equal(report.error, "Connection timeout");
    });
  });

  describe("evaluatePluginHealth", () => {
    it("combines streak and endpoint checks", async () => {
      const mockFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: "health-test" }),
        } as unknown as Response;
      };

      const runs: WorkflowRun[] = [
        { id: 1, repository: "ubiquity-os/plugin-ok", conclusion: "success" },
      ];

      const res = await evaluatePluginHealth({
        pluginUrl: "https://plugin-ok.example.com",
        runs,
        threshold: 10,
        fetchFn: mockFetch,
      });

      assert.equal(res.healthy, true);
      assert.equal(res.streak?.consecutiveFailures, 0);
      assert.equal(res.endpoint?.healthy, true);
    });
  });
});
