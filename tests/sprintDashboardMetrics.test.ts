import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateSprintMetrics,
  calculateCycleTimeStats,
  calculateManagerRoi,
  classifyTaskCategory,
  classifyTaskPriority,
  estimateTaskHours,
  formatSprintReportMarkdown,
  parsePriceFromLabels,
  planSprintAssignments,
  SprintIssueRecord,
  TeamMember,
} from "../src/utils/sprintDashboardMetrics";

describe("UbiquityOS Sprint Management Dashboard (#5916)", () => {
  const sampleRecords: SprintIssueRecord[] = [
    {
      id: 5916,
      state: "open",
      priceUsd: 1800,
      title: "UbiquityOS Sprint Management Dashboard",
      labels: ["Time: <1 Week", "Priority: 3 (High)", "Price: 1800 USD"],
      createdAtIso: "2026-11-01T00:00:00Z",
    },
    {
      id: 5886,
      state: "closed",
      priceUsd: 450,
      title: "Plugin health monitor",
      labels: ["Time: <4 Hours", "Priority: 3 (High)", "Price: 450 USD"],
      createdAtIso: "2026-11-01T00:00:00Z",
      closedAtIso: "2026-11-02T12:00:00Z",
      assignee: "alice",
    },
    {
      id: 5034,
      state: "closed",
      priceUsd: 75,
      title: "Config Protection",
      labels: ["Time: <2 Hours", "Priority: 1 (Normal)", "Price: 75 USD"],
      createdAtIso: "2026-11-01T00:00:00Z",
      closedAtIso: "2026-11-01T06:00:00Z",
      assignee: "bob",
    },
    {
      id: 6140,
      state: "closed",
      priceUsd: 75,
      title: "Apply health-check deadline to response decoding",
      labels: ["Time: <1 Hour", "Priority: 1 (Normal)", "Price: 75 USD"],
      createdAtIso: "2026-11-01T00:00:00Z",
      closedAtIso: "2026-11-01T18:00:00Z",
      assignee: "alice",
    },
  ];

  describe("Competitor PR #6260 API Compatibility", () => {
    it("returns expected fields with exact calculation for empty list", () => {
      const res = aggregateSprintMetrics([]);
      assert.equal(res.totalIssues, 0);
      assert.equal(res.completedIssues, 0);
      assert.equal(res.completionRatePct, 0);
      assert.equal(res.totalBudgetUsd, 0);
      assert.equal(res.earnedBudgetUsd, 0);
      assert.equal(res.averageCycleTimeHours, 0);
      assert.equal(res.medianCycleTimeHours, 0);
    });

    it("returns expected metrics matching PR #6260 baseline", () => {
      const res = aggregateSprintMetrics(sampleRecords);
      assert.equal(res.totalIssues, 4);
      assert.equal(res.completedIssues, 3);
      assert.equal(res.completionRatePct, 75.0);
      assert.equal(res.totalBudgetUsd, 2400);
      assert.equal(res.earnedBudgetUsd, 600);
      assert.equal(res.averageCycleTimeHours, 20.0);
      assert.equal(res.medianCycleTimeHours, 18.0);
    });
  });

  describe("parsePriceFromLabels", () => {
    it("extracts USD numeric amounts from string and object labels", () => {
      assert.equal(parsePriceFromLabels(["Price: 1800 USD"]), 1800);
      assert.equal(parsePriceFromLabels([{ name: "Price: 450 USD" }]), 450);
      assert.equal(parsePriceFromLabels(["Price: 75.5 USD"]), 75.5);
    });

    it("returns 0 when no price label is present or invalid", () => {
      assert.equal(parsePriceFromLabels(["bug", "help wanted"]), 0);
      assert.equal(parsePriceFromLabels([]), 0);
      assert.equal(parsePriceFromLabels(null), 0);
    });
  });

  describe("estimateTaskHours", () => {
    it("parses UbiquityOS standard time labels accurately", () => {
      assert.equal(estimateTaskHours({ labels: ["Time: <1 Hour"] }), 1);
      assert.equal(estimateTaskHours({ labels: ["Time: <2 Hours"] }), 2);
      assert.equal(estimateTaskHours({ labels: ["Time: <4 Hours"] }), 4);
      assert.equal(estimateTaskHours({ labels: ["Time: <1 Day"] }), 8);
      assert.equal(estimateTaskHours({ labels: ["Time: <2 Days"] }), 16);
      assert.equal(estimateTaskHours({ labels: ["Time: <1 Week"] }), 40);
      assert.equal(estimateTaskHours({ labels: ["Time: <2 Weeks"] }), 80);
    });

    it("prioritizes explicit estimatedHours when provided", () => {
      assert.equal(
        estimateTaskHours({ estimatedHours: 12, labels: ["Time: <1 Hour"] }),
        12
      );
    });

    it("falls back to 4 hours default for missing or unrecognized labels", () => {
      assert.equal(estimateTaskHours({ labels: [] }), 4);
      assert.equal(estimateTaskHours({ labels: ["enhancement"] }), 4);
    });
  });

  describe("classifyTaskPriority & classifyTaskCategory", () => {
    it("identifies priority from labels correctly", () => {
      assert.equal(classifyTaskPriority("test", ["Priority: 4 (Urgent)"]), "urgent");
      assert.equal(classifyTaskPriority("test", ["Priority: 3 (High)"]), "high");
      assert.equal(classifyTaskPriority("test", ["Priority: 1 (Normal)"]), "normal");
      assert.equal(classifyTaskPriority("test", ["Priority: 0 (Low)"]), "low");
    });

    it("falls back to semantic triage from title keywords", () => {
      assert.equal(classifyTaskPriority("Critical exploit vulnerability"), "urgent");
      assert.equal(classifyTaskPriority("Payment gateway timeout fix"), "high");
      assert.equal(classifyTaskPriority("Update internal developer tooling docs"), "low");
    });

    it("categorizes tasks into functional categories", () => {
      assert.equal(classifyTaskCategory("Implement CowSwap payout settlement"), "revenue");
      assert.equal(classifyTaskCategory("Fix memory leak crash"), "bug");
      assert.equal(classifyTaskCategory("Add security token rotation"), "security");
      assert.equal(classifyTaskCategory("Improve CI workflow build caching"), "tooling");
      assert.equal(classifyTaskCategory("Update API documentation"), "docs");
      assert.equal(classifyTaskCategory("Create new user onboarding wizard"), "feature");
    });
  });

  describe("calculateManagerRoi", () => {
    it("computes default savings based on standard 5-minute task triage benchmark", () => {
      const roi = calculateManagerRoi(120);
      assert.equal(roi.backlogTaskCount, 120);
      assert.equal(roi.timeSavedMinutes, 600);
      assert.equal(roi.timeSavedHours, 10);
      assert.equal(roi.estimatedSavingsUsd, 900);
    });

    it("supports custom hourly rates and assignment durations", () => {
      const roi = calculateManagerRoi(60, {
        minutesSavedPerTask: 10,
        managerHourlyRateUsd: 120,
      });
      assert.equal(roi.timeSavedHours, 10);
      assert.equal(roi.estimatedSavingsUsd, 1200);
    });
  });

  describe("calculateCycleTimeStats", () => {
    it("calculates distribution metrics including median and p90", () => {
      const stats = calculateCycleTimeStats(sampleRecords);
      assert.equal(stats.sampleCount, 3);
      assert.equal(stats.minHours, 6);
      assert.equal(stats.maxHours, 36);
      assert.equal(stats.averageHours, 20);
      assert.equal(stats.medianHours, 18);
    });

    it("gracefully discards invalid and negative dates", () => {
      const corruptRecords: SprintIssueRecord[] = [
        {
          id: 1,
          state: "closed",
          priceUsd: 100,
          createdAtIso: "invalid-date",
          closedAtIso: "2026-11-01T00:00:00Z",
        },
        {
          id: 2,
          state: "closed",
          priceUsd: 100,
          createdAtIso: "2026-11-02T00:00:00Z",
          closedAtIso: "2026-11-01T00:00:00Z",
        },
      ];
      const stats = calculateCycleTimeStats(corruptRecords);
      assert.equal(stats.sampleCount, 0);
      assert.equal(stats.averageHours, 0);
    });
  });

  describe("planSprintAssignments", () => {
    const team: TeamMember[] = [
      { login: "alice", name: "Alice", capacityHours: 40 },
      { login: "bob", name: "Bob", capacityHours: 20 },
    ];

    const backlog: SprintIssueRecord[] = [
      {
        id: 1,
        state: "open",
        priceUsd: 1800,
        title: "Urgent Payout Service",
        priority: "urgent",
        estimatedHours: 24,
      },
      {
        id: 2,
        state: "open",
        priceUsd: 450,
        title: "High Priority Plugin Monitor",
        priority: "high",
        estimatedHours: 16,
      },
      {
        id: 3,
        state: "open",
        priceUsd: 75,
        title: "Normal Bug Fix",
        priority: "normal",
        estimatedHours: 12,
      },
    ];

    it("optimally schedules tasks respecting member capacities", () => {
      const plan = planSprintAssignments(backlog, team);

      assert.equal(plan.assignments.length, 3);
      assert.equal(plan.unassignedTasks.length, 0);
      assert.equal(plan.totalAllocatedHours, 52);
      assert.equal(plan.totalCapacityHours, 60);
      assert.equal(plan.overallUtilizationPct, 86.7);

      assert.ok(plan.memberUtilization.alice.allocatedHours <= 40);
      assert.ok(plan.memberUtilization.bob.allocatedHours <= 20);
    });

    it("leaves tasks unassigned when team capacity is exceeded", () => {
      const smallTeam: TeamMember[] = [
        { login: "charlie", capacityHours: 10 },
      ];
      const plan = planSprintAssignments(backlog, smallTeam);

      assert.equal(plan.assignments.length, 0);
      assert.equal(plan.unassignedTasks.length, 3);
    });
  });

  describe("formatSprintReportMarkdown", () => {
    it("generates markdown dashboard report with tables and ROI numbers", () => {
      const metrics = aggregateSprintMetrics(sampleRecords);
      const team: TeamMember[] = [{ login: "alice", capacityHours: 40 }];
      const plan = planSprintAssignments(sampleRecords, team);
      const md = formatSprintReportMarkdown(metrics, plan);

      assert.match(md, /## 🚀 UbiquityOS Sprint Management Dashboard/);
      assert.match(md, /\$2,400/);
      assert.match(md, /\$600/);
      assert.match(md, /Engineering Manager ROI/);
      assert.match(md, /@alice/);
    });
  });
});
