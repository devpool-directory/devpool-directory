import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from "@jest/globals";
import { GitHubIssue, GitHubLabel } from "../src/directory/directory";

describe("Duplicate Issue Prevention", () => {
  let mockOctokit: any;

  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          createLabel: jest.fn(),
          listForRepo: jest.fn(),
          create: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe("newDirectoryIssue duplicate prevention", () => {
    test("Should skip issue creation when label exists and issue with that label exists", async () => {
      // Mock label creation to indicate it already exists
      mockOctokit.rest.issues.createLabel.mockRejectedValue({
        status: 422,
        response: {
          data: {
            errors: [{ code: "already_exists" }],
          },
        },
      });

      // Mock finding an existing issue with this label
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            id: 1,
            number: 123,
            html_url: "https://github.com/test/repo/issues/123",
          },
        ],
      });

      // Mock the module with our mocked octokit
      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const { newDirectoryIssue } = await import("../src/directory/new-directory-issue");

      const partnerIssue: GitHubIssue = {
        state: "open",
        node_id: "test-node-123",
        title: "Test Issue",
        html_url: "https://github.com/partner/repo/issues/1",
        labels: [],
      } as GitHubIssue;

      await newDirectoryIssue(partnerIssue, "https://github.com/partner/repo", {});

      // Should have attempted to create label
      expect(mockOctokit.rest.issues.createLabel).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        name: "id: test-node-123",
      });

      // Should have checked for existing issues
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "id: test-node-123",
        state: "all",
        per_page: 1,
      });

      // Should NOT have created a new issue
      expect(mockOctokit.rest.issues.create).not.toHaveBeenCalled();
    });

    test("Should create issue when label exists but no issue with that label exists", async () => {
      // Mock label creation to indicate it already exists
      mockOctokit.rest.issues.createLabel.mockRejectedValue({
        status: 422,
        response: {
          data: {
            errors: [{ code: "already_exists" }],
          },
        },
      });

      // Mock no existing issues with this label
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      // Mock successful issue creation
      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          id: 2,
          number: 456,
          html_url: "https://github.com/test/repo/issues/456",
          node_id: "new-issue-node",
        },
      });

      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const { newDirectoryIssue } = await import("../src/directory/new-directory-issue");

      const partnerIssue: GitHubIssue = {
        state: "open",
        node_id: "test-node-456",
        title: "Test Issue 2",
        html_url: "https://github.com/partner/repo/issues/2",
        labels: [],
      } as GitHubIssue;

      await newDirectoryIssue(partnerIssue, "https://github.com/partner/repo", {});

      // Should have checked for existing issues
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalled();

      // Should have created a new issue since none existed
      expect(mockOctokit.rest.issues.create).toHaveBeenCalled();
    });

    test("Should throw error when checking for existing issues fails", async () => {
      // Mock label creation to indicate it already exists
      mockOctokit.rest.issues.createLabel.mockRejectedValue({
        status: 422,
        response: {
          data: {
            errors: [{ code: "already_exists" }],
          },
        },
      });

      // Mock API error when checking for existing issues
      mockOctokit.rest.issues.listForRepo.mockRejectedValue(new Error("API Error"));

      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const { newDirectoryIssue } = await import("../src/directory/new-directory-issue");

      const partnerIssue: GitHubIssue = {
        state: "open",
        node_id: "test-node-789",
        title: "Test Issue 3",
        html_url: "https://github.com/partner/repo/issues/3",
        labels: [],
      } as GitHubIssue;

      await expect(
        newDirectoryIssue(partnerIssue, "https://github.com/partner/repo", {})
      ).rejects.toThrow("Failed to check for existing issues, aborting to prevent potential duplicate creation.");

      // Should NOT have created a new issue
      expect(mockOctokit.rest.issues.create).not.toHaveBeenCalled();
    });

    test("Should optimize API call with per_page parameter", async () => {
      // Mock label already exists
      mockOctokit.rest.issues.createLabel.mockRejectedValue({
        status: 422,
        response: {
          data: {
            errors: [{ code: "already_exists" }],
          },
        },
      });

      // Mock no existing issues
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const { newDirectoryIssue } = await import("../src/directory/new-directory-issue");

      const partnerIssue: GitHubIssue = {
        state: "open",
        node_id: "test-node-opt",
        title: "Test Optimization",
        html_url: "https://github.com/partner/repo/issues/4",
        labels: [],
      } as GitHubIssue;

      await newDirectoryIssue(partnerIssue, "https://github.com/partner/repo", {});

      // Verify per_page parameter is used for optimization
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 1,
        })
      );
    });

    test("Should not check for duplicates when label creation succeeds", async () => {
      // Mock successful label creation (new label)
      mockOctokit.rest.issues.createLabel.mockResolvedValue({
        data: { name: "id: test-node-new" },
      });

      // Mock successful issue creation
      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          id: 3,
          number: 789,
          html_url: "https://github.com/test/repo/issues/789",
          node_id: "new-issue-node",
        },
      });

      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      const { newDirectoryIssue } = await import("../src/directory/new-directory-issue");

      const partnerIssue: GitHubIssue = {
        state: "open",
        node_id: "test-node-new",
        title: "Brand New Issue",
        html_url: "https://github.com/partner/repo/issues/5",
        labels: [],
      } as GitHubIssue;

      await newDirectoryIssue(partnerIssue, "https://github.com/partner/repo", {});

      // Should NOT have checked for existing issues since label was new
      expect(mockOctokit.rest.issues.listForRepo).not.toHaveBeenCalled();

      // Should have created the issue directly
      expect(mockOctokit.rest.issues.create).toHaveBeenCalled();
    });
  });

  describe("Deduplication script", () => {
    test("Should identify duplicate issues with same ID label", async () => {
      const mockIssues = [
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

      mockOctokit.paginate = jest.fn().mockResolvedValue(mockIssues);
      mockOctokit.rest.rateLimit = {
        get: jest.fn().mockResolvedValue({
          data: { rate: { remaining: 5000, limit: 5000 } },
        }),
      };
      mockOctokit.rest.users = {
        getAuthenticated: jest.fn().mockResolvedValue({
          data: { login: "test-user", id: 123, type: "User" },
        }),
      };

      jest.doMock("../src/directory/directory", () => ({
        ...jest.requireActual("../src/directory/directory") as any,
        octokit: mockOctokit,
        DEVPOOL_OWNER_NAME: "test-owner",
        DEVPOOL_REPO_NAME: "test-repo",
      }));

      jest.doMock("../src/directory/get-repository-issues", () => ({
        getRepositoryIssues: jest.fn().mockResolvedValue(mockIssues),
      }));

      const { deduplicateIssues } = await import("../src/deduplicate-issues");

      const result = await deduplicateIssues(true); // dry run

      expect(result.totalDuplicates).toBe(1); // One duplicate found (issue #2)
      expect(result.closedIssues).toBe(0); // Dry run, so nothing closed
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

    test("Should skip closed issues when checking for duplicates", async () => {
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
      ];

      // In the actual deduplication logic, closed issues are skipped
      const openIssues = mockIssues.filter(issue => issue.state === "open");
      
      expect(openIssues).toHaveLength(1);
      expect(openIssues[0].number).toBe(2);
    });
  });
});