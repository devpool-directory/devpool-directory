import { describe, test, expect } from "@jest/globals";
import { GitHubIssueWithStateReason } from "../src/directory/directory";

describe("Unplanned Issues Filtering", () => {
  describe("Issue Filtering Logic", () => {
    test("Should filter out issues closed as not_planned", () => {
      const issues: GitHubIssueWithStateReason[] = [
        {
          state: "open",
          state_reason: null,
          title: "Open issue",
        } as GitHubIssueWithStateReason,
        {
          state: "closed",
          state_reason: "completed",
          title: "Closed completed",
        } as GitHubIssueWithStateReason,
        {
          state: "closed",
          state_reason: "not_planned",
          title: "Closed unplanned",
        } as GitHubIssueWithStateReason,
      ];

      const filtered = issues.filter((issue) => {
        if (issue.state === "closed" && issue.state_reason === "not_planned") {
          return false;
        }
        return true;
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.find((i) => i.title === "Closed unplanned")).toBeUndefined();
      expect(filtered.find((i) => i.title === "Open issue")).toBeDefined();
      expect(filtered.find((i) => i.title === "Closed completed")).toBeDefined();
    });

    test("Should keep open issues regardless of state_reason", () => {
      const issues: GitHubIssueWithStateReason[] = [
        {
          state: "open",
          state_reason: null,
          title: "Open with null",
        } as GitHubIssueWithStateReason,
        {
          state: "open",
          state_reason: "reopened",
          title: "Open reopened",
        } as GitHubIssueWithStateReason,
      ];

      const filtered = issues.filter((issue) => {
        if (issue.state === "closed" && issue.state_reason === "not_planned") {
          return false;
        }
        return true;
      });

      expect(filtered).toHaveLength(2);
    });

    test("Should keep closed issues with other state_reasons", () => {
      const issues: GitHubIssueWithStateReason[] = [
        {
          state: "closed",
          state_reason: "completed",
          title: "Closed completed",
        } as GitHubIssueWithStateReason,
        {
          state: "closed",
          state_reason: null,
          title: "Closed with null",
        } as GitHubIssueWithStateReason,
        {
          state: "closed",
          state_reason: "reopened",
          title: "Closed reopened",
        } as GitHubIssueWithStateReason,
      ];

      const filtered = issues.filter((issue) => {
        if (issue.state === "closed" && issue.state_reason === "not_planned") {
          return false;
        }
        return true;
      });

      expect(filtered).toHaveLength(3);
    });
  });

  describe("GitHubIssueWithStateReason interface", () => {
    test("Should accept valid state_reason values", () => {
      const validIssues: GitHubIssueWithStateReason[] = [
        { state_reason: "completed" } as GitHubIssueWithStateReason,
        { state_reason: "not_planned" } as GitHubIssueWithStateReason,
        { state_reason: "reopened" } as GitHubIssueWithStateReason,
        { state_reason: null } as GitHubIssueWithStateReason,
        { state_reason: undefined } as GitHubIssueWithStateReason,
      ];

      expect(validIssues).toHaveLength(5);
    });

    test("Should properly extend GitHubIssue", () => {
      const issue: GitHubIssueWithStateReason = {
        id: 1,
        number: 123,
        state: "closed",
        state_reason: "not_planned",
        title: "Test issue",
      } as GitHubIssueWithStateReason;

      expect(issue.state_reason).toBe("not_planned");
      expect(issue.state).toBe("closed");
      expect(issue.number).toBe(123);
    });
  });

  describe("Filtering logic validation", () => {
    test("Should correctly identify unplanned issues", () => {
      const isUnplanned = (issue: GitHubIssueWithStateReason) => {
        return issue.state === "closed" && issue.state_reason === "not_planned";
      };

      const unplannedIssue: GitHubIssueWithStateReason = {
        state: "closed",
        state_reason: "not_planned",
      } as GitHubIssueWithStateReason;

      const completedIssue: GitHubIssueWithStateReason = {
        state: "closed",
        state_reason: "completed",
      } as GitHubIssueWithStateReason;

      const openIssue: GitHubIssueWithStateReason = {
        state: "open",
        state_reason: null,
      } as GitHubIssueWithStateReason;

      expect(isUnplanned(unplannedIssue)).toBe(true);
      expect(isUnplanned(completedIssue)).toBe(false);
      expect(isUnplanned(openIssue)).toBe(false);
    });

    test("Should handle mixed issue states correctly", () => {
      const issues: GitHubIssueWithStateReason[] = [
        { state: "open", state_reason: null, number: 1 } as GitHubIssueWithStateReason,
        { state: "closed", state_reason: "not_planned", number: 2 } as GitHubIssueWithStateReason,
        { state: "closed", state_reason: "completed", number: 3 } as GitHubIssueWithStateReason,
        { state: "closed", state_reason: "not_planned", number: 4 } as GitHubIssueWithStateReason,
        { state: "open", state_reason: "reopened", number: 5 } as GitHubIssueWithStateReason,
      ];

      const filtered = issues.filter((issue) => {
        const issueWithReason = issue as GitHubIssueWithStateReason;
        if (issueWithReason.state === "closed" && issueWithReason.state_reason === "not_planned") {
          return false;
        }
        return true;
      });

      expect(filtered).toHaveLength(3);
      expect(filtered.map(i => i.number)).toEqual([1, 3, 5]);
    });
  });
});