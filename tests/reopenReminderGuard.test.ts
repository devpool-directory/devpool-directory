import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateReminderAction,
  getTaskAssignees,
  hasTaskAssignee,
  isReopenEvent,
  parsePriceLabel,
  processTaskReminder,
  shouldIgnoreIssue,
  TaskItem,
} from "../src/utils/reopenReminderGuard";

describe("reopenReminderGuard (#5957)", () => {
  const basePricedTask: TaskItem = {
    id: 101,
    number: 101,
    title: "Implement feature",
    state: "open",
    locked: false,
    draft: false,
    labels: [{ name: "Price: 75 USD" }, { name: "Priority: 1 (Normal)" }],
    assignee: null,
    assignees: [],
  };

  describe("hasTaskAssignee & getTaskAssignees", () => {
    it("returns false and empty array when no assignee present", () => {
      assert.equal(hasTaskAssignee(basePricedTask), false);
      assert.deepEqual(getTaskAssignees(basePricedTask), []);
    });

    it("detects single assignee from assignee field", () => {
      const task: TaskItem = { ...basePricedTask, assignee: { login: "alice" } };
      assert.equal(hasTaskAssignee(task), true);
      assert.deepEqual(getTaskAssignees(task), ["alice"]);
    });

    it("detects multiple assignees from assignees array and deduplicates", () => {
      const task: TaskItem = {
        ...basePricedTask,
        assignee: { login: "alice" },
        assignees: [{ login: "alice" }, { login: "bob" }],
      };
      assert.equal(hasTaskAssignee(task), true);
      assert.deepEqual(getTaskAssignees(task).sort(), ["alice", "bob"].sort());
    });
  });

  describe("parsePriceLabel", () => {
    it("parses USD price correctly", () => {
      assert.equal(parsePriceLabel([{ name: "Price: 75 USD" }]), 75);
      assert.equal(parsePriceLabel([{ name: "Price: 300 USD" }]), 300);
      assert.equal(parsePriceLabel(["Price: 150 USD"]), 150);
    });

    it("returns null when no price label is found", () => {
      assert.equal(parsePriceLabel([{ name: "bug" }]), null);
      assert.equal(parsePriceLabel([]), null);
      assert.equal(parsePriceLabel(null), null);
    });
  });

  describe("isReopenEvent", () => {
    it("identifies issue and PR reopen events case-insensitively", () => {
      assert.equal(isReopenEvent("issues.reopened"), true);
      assert.equal(isReopenEvent("pull_request.reopened"), true);
      assert.equal(isReopenEvent("reopened"), true);
      assert.equal(isReopenEvent("ISSUES.REOPENED"), true);
    });

    it("returns false for non-reopen events", () => {
      assert.equal(isReopenEvent("issues.assigned"), false);
      assert.equal(isReopenEvent("issues.opened"), false);
      assert.equal(isReopenEvent(undefined), false);
    });
  });

  describe("shouldIgnoreIssue (#5957 core requirement)", () => {
    it("ignores reopened issue when task has no assignee", () => {
      const unassignedTask: TaskItem = {
        ...basePricedTask,
        assignee: null,
        assignees: [],
      };
      const ignored = shouldIgnoreIssue(unassignedTask, "issues.reopened");
      assert.equal(ignored, true, "Reopened issue without assignee must be ignored");
    });

    it("ignores reopened pull request when task has no assignee", () => {
      const unassignedTask: TaskItem = {
        ...basePricedTask,
        assignee: null,
        assignees: [],
      };
      const ignored = shouldIgnoreIssue(unassignedTask, "pull_request.reopened");
      assert.equal(ignored, true, "Reopened PR without assignee must be ignored");
    });

    it("does NOT ignore reopened task when assignee is present", () => {
      const assignedTask: TaskItem = {
        ...basePricedTask,
        assignee: { login: "developer1" },
        assignees: [{ login: "developer1" }],
      };
      const ignored = shouldIgnoreIssue(assignedTask, "issues.reopened");
      assert.equal(ignored, false, "Reopened task WITH assignee should not be ignored");
    });

    it("ignores unpriced task even if assignee is present", () => {
      const unpricedTask: TaskItem = {
        ...basePricedTask,
        labels: [{ name: "enhancement" }],
        assignee: { login: "developer1" },
      };
      assert.equal(shouldIgnoreIssue(unpricedTask, "issues.reopened"), true);
    });

    it("ignores closed or locked or draft tasks", () => {
      const assignedTask: TaskItem = { ...basePricedTask, assignee: { login: "dev" } };
      assert.equal(shouldIgnoreIssue({ ...assignedTask, state: "closed" }, "issues.reopened"), true);
      assert.equal(shouldIgnoreIssue({ ...assignedTask, locked: true }, "issues.reopened"), true);
      assert.equal(shouldIgnoreIssue({ ...assignedTask, draft: true }, "issues.reopened"), true);
    });
  });

  describe("evaluateReminderAction", () => {
    it("returns reopened_without_assignee with shouldPost=false", () => {
      const unassignedTask: TaskItem = {
        ...basePricedTask,
        assignee: null,
        assignees: [],
      };
      const decision = evaluateReminderAction(unassignedTask, "issues.reopened");
      assert.equal(decision.shouldPost, false);
      assert.equal(decision.reason, "reopened_without_assignee");
      assert.equal(decision.assigneeCount, 0);
      assert.equal(decision.priceUsd, 75);
    });

    it("returns reopened_with_assignee with shouldPost=true", () => {
      const assignedTask: TaskItem = {
        ...basePricedTask,
        assignee: { login: "sora" },
      };
      const decision = evaluateReminderAction(assignedTask, "issues.reopened");
      assert.equal(decision.shouldPost, true);
      assert.equal(decision.reason, "reopened_with_assignee");
      assert.deepEqual(decision.assignees, ["sora"]);
      assert.equal(decision.priceUsd, 75);
    });
  });

  describe("processTaskReminder", () => {
    it("never calls postComment when task is reopened without an assignee", async () => {
      let callCount = 0;
      const postComment = async () => {
        callCount++;
      };

      const unassignedTask: TaskItem = {
        ...basePricedTask,
        assignee: null,
        assignees: [],
      };

      const decision = await processTaskReminder(unassignedTask, "issues.reopened", postComment);

      assert.equal(callCount, 0, "postComment must NOT be called for unassigned reopened task");
      assert.equal(decision.shouldPost, false);
      assert.equal(decision.reason, "reopened_without_assignee");
    });

    it("calls postComment when task is reopened with an assignee", async () => {
      let postedBody = "";
      const postComment = async (body: string) => {
        postedBody = body;
      };

      const assignedTask: TaskItem = {
        ...basePricedTask,
        assignees: [{ login: "contributor42" }],
      };

      const decision = await processTaskReminder(assignedTask, "issues.reopened", postComment);

      assert.equal(decision.shouldPost, true);
      assert.match(postedBody, /@contributor42/);
      assert.match(postedBody, /\$75/);
    });
  });
});
