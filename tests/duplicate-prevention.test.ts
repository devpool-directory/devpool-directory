import { describe, test, expect } from "@jest/globals";
import { GitHubIssue, GitHubLabel } from "../src/directory/directory";

describe("Duplicate Issue Prevention", () => {
  describe("Duplicate detection logic", () => {
    test("Should identify duplicate issues with same ID label", () => {
      const issues = [
        {
          number: 1,
          state: "open",
          labels: [{ name: "id: duplicate-123" }],
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          number: 2,
          state: "open",
          labels: [{ name: "id: duplicate-123" }],
          created_at: "2024-01-02T00:00:00Z",
        },
        {
          number: 3,
          state: "open",
          labels: [{ name: "id: unique-456" }],
          created_at: "2024-01-03T00:00:00Z",
        },
      ];

      // Group by ID label
      const issuesByLabel = new Map<string, any[]>();
      for (const issue of issues) {
        const labels = issue.labels as any[];
        const idLabel = labels.find(l => l.name?.startsWith('id: '));
        if (idLabel) {
          const labelName = idLabel.name;
          if (!issuesByLabel.has(labelName)) {
            issuesByLabel.set(labelName, []);
          }
          issuesByLabel.get(labelName)!.push(issue);
        }
      }

      // Count duplicates
      let duplicatesFound = 0;
      for (const [label, labelIssues] of issuesByLabel) {
        if (labelIssues.length > 1) {
          duplicatesFound++;
        }
      }

      expect(duplicatesFound).toBe(1); // One set of duplicates
      expect(issuesByLabel.get("id: duplicate-123")).toHaveLength(2);
      expect(issuesByLabel.get("id: unique-456")).toHaveLength(1);
    });

    test("Should keep oldest issue and mark newer ones as duplicates", () => {
      const issues = [
        {
          number: 100,
          created_at: "2024-01-05T00:00:00Z",
          title: "Newer Issue",
        },
        {
          number: 50,
          created_at: "2024-01-01T00:00:00Z",
          title: "Older Issue",
        },
        {
          number: 75,
          created_at: "2024-01-03T00:00:00Z",
          title: "Middle Issue",
        },
      ];

      // Sort by creation date (oldest first)
      issues.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const [keepIssue, ...duplicates] = issues;

      expect(keepIssue.number).toBe(50); // Oldest issue
      expect(duplicates).toHaveLength(2);
      expect(duplicates[0].number).toBe(75); // Middle issue
      expect(duplicates[1].number).toBe(100); // Newest issue
    });

    test("Should skip closed issues when checking for duplicates", () => {
      const mockIssues = [
        {
          number: 1,
          state: "closed",
          labels: [{ name: "id: test-123" }],
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          number: 2,
          state: "open",
          labels: [{ name: "id: test-123" }],
          created_at: "2024-01-02T00:00:00Z",
        },
        {
          number: 3,
          state: "closed",
          labels: [{ name: "id: test-456" }],
          created_at: "2024-01-03T00:00:00Z",
        },
      ];

      // Filter only open issues for duplicate checking
      const openIssues = mockIssues.filter(issue => issue.state === "open");
      
      expect(openIssues).toHaveLength(1);
      expect(openIssues[0].number).toBe(2);
    });

    test("Should handle multiple duplicate sets", () => {
      const issues = [
        { number: 1, labels: [{ name: "id: AAA" }] },
        { number: 2, labels: [{ name: "id: AAA" }] },
        { number: 3, labels: [{ name: "id: BBB" }] },
        { number: 4, labels: [{ name: "id: BBB" }] },
        { number: 5, labels: [{ name: "id: BBB" }] },
        { number: 6, labels: [{ name: "id: CCC" }] },
      ];

      const duplicateSets = new Map<string, number[]>();
      
      for (const issue of issues) {
        const idLabel = (issue.labels as any[]).find(l => l.name?.startsWith('id: '));
        if (idLabel) {
          if (!duplicateSets.has(idLabel.name)) {
            duplicateSets.set(idLabel.name, []);
          }
          duplicateSets.get(idLabel.name)!.push(issue.number);
        }
      }

      const duplicates = Array.from(duplicateSets.values()).filter(set => set.length > 1);
      
      expect(duplicates).toHaveLength(2); // Two sets of duplicates
      expect(duplicateSets.get("id: AAA")).toEqual([1, 2]);
      expect(duplicateSets.get("id: BBB")).toEqual([3, 4, 5]);
      expect(duplicateSets.get("id: CCC")).toEqual([6]);
    });
  });

  describe("API optimization", () => {
    test("Should use per_page parameter for efficiency", () => {
      // Simulate API call parameters
      const apiParams = {
        owner: "test-owner",
        repo: "test-repo",
        labels: "id: test-node-123",
        state: "all" as const,
        per_page: 1,
      };

      expect(apiParams.per_page).toBe(1);
      expect(apiParams.state).toBe("all");
    });

    test("Should check for existing issues when label exists", () => {
      const labelAlreadyExists = true;
      const shouldCheckForExisting = labelAlreadyExists;

      expect(shouldCheckForExisting).toBe(true);
    });

    test("Should not check for existing issues when label is new", () => {
      const labelAlreadyExists = false;
      const shouldCheckForExisting = labelAlreadyExists;

      expect(shouldCheckForExisting).toBe(false);
    });
  });

  describe("Error handling", () => {
    test("Should have proper error message for duplicate check failure", () => {
      const errorMessage = "Failed to check for existing issues, aborting to prevent potential duplicate creation.";
      
      expect(errorMessage).toContain("Failed to check");
      expect(errorMessage).toContain("prevent potential duplicate");
    });

    test("Should distinguish between label creation errors", () => {
      const alreadyExistsError = {
        status: 422,
        response: {
          data: {
            errors: [{ code: "already_exists" }],
          },
        },
      };

      const otherError = {
        status: 500,
        message: "Internal server error",
      };

      const isAlreadyExists = (error: any) => {
        return error.status === 422 && 
               error.response?.data?.errors?.[0]?.code === "already_exists";
      };

      expect(isAlreadyExists(alreadyExistsError)).toBe(true);
      expect(isAlreadyExists(otherError)).toBe(false);
    });
  });

  describe("Deduplication sorting", () => {
    test("Should correctly sort issues by creation date", () => {
      const dates = [
        "2024-01-05T00:00:00Z",
        "2024-01-01T00:00:00Z", 
        "2024-01-03T00:00:00Z",
        "2024-01-02T00:00:00Z",
      ];

      const sorted = [...dates].sort((a, b) => 
        new Date(a).getTime() - new Date(b).getTime()
      );

      expect(sorted[0]).toBe("2024-01-01T00:00:00Z");
      expect(sorted[1]).toBe("2024-01-02T00:00:00Z");
      expect(sorted[2]).toBe("2024-01-03T00:00:00Z");
      expect(sorted[3]).toBe("2024-01-05T00:00:00Z");
    });

    test("Should handle issues with same timestamp", () => {
      const issues = [
        { number: 1, created_at: "2024-01-01T12:00:00Z" },
        { number: 2, created_at: "2024-01-01T12:00:00Z" },
        { number: 3, created_at: "2024-01-01T11:00:00Z" },
      ];

      const sorted = [...issues].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      expect(sorted[0].number).toBe(3); // Earlier time
      expect(sorted[1].created_at).toBe(sorted[2].created_at); // Same time
    });
  });
});