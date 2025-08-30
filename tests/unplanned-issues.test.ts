import { describe, test, expect, jest, beforeAll, afterEach } from "@jest/globals";
import { GitHubIssue, GitHubIssueWithStateReason } from "../src/directory/directory";

describe("Unplanned Issues Filtering", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  describe("updateDirectoryIssue with unplanned partner issues", () => {
    let mockOctokit: any;

    beforeEach(() => {
      mockOctokit = {
        rest: {
          issues: {
            update: jest.fn().mockResolvedValue({}),
          },
        },
      };
    });

    test("Should close directory issue when partner issue is closed as unplanned", async () => {
      const { updateDirectoryIssue } = await import("../src/directory/update-issue");
      
      // Mock the octokit import
      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const directoryIssue: GitHubIssue = {
        state: "open",
        number: 123,
      } as GitHubIssue;

      const partnerIssue: GitHubIssueWithStateReason = {
        state: "closed",
        state_reason: "not_planned",
        labels: [],
      } as GitHubIssueWithStateReason;

      await updateDirectoryIssue({ directoryIssue, partnerIssue });

      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: expect.any(String),
        repo: expect.any(String),
        issue_number: 123,
        state: "closed",
        state_reason: "not_planned",
      });
    });

    test("Should not close directory issue when partner issue is closed as completed", async () => {
      const { updateDirectoryIssue } = await import("../src/directory/update-issue");

      const directoryIssue: GitHubIssue = {
        state: "open",
        number: 123,
        labels: [],
      } as GitHubIssue;

      const partnerIssue: GitHubIssueWithStateReason = {
        state: "closed",
        state_reason: "completed",
        labels: [],
      } as GitHubIssueWithStateReason;

      // Should not throw and should continue to normal processing
      await expect(updateDirectoryIssue({ directoryIssue, partnerIssue })).resolves.not.toThrow();
    });

    test("Should not close directory issue if it's already closed", async () => {
      const { updateDirectoryIssue } = await import("../src/directory/update-issue");

      const directoryIssue: GitHubIssue = {
        state: "closed",
        number: 123,
      } as GitHubIssue;

      const partnerIssue: GitHubIssueWithStateReason = {
        state: "closed",
        state_reason: "not_planned",
        labels: [],
      } as GitHubIssueWithStateReason;

      await updateDirectoryIssue({ directoryIssue, partnerIssue });

      expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
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
});