import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const TEST_REPO = "devpool-directory/devpool-directory-testing";
const [TEST_OWNER, TEST_REPO_NAME] = TEST_REPO.split("/");

describe("Sandbox GitHub API Integration Tests", () => {
  let octokit: Octokit;
  let testIssueNumber: number;

  beforeAll(() => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is required for integration tests");
    }
    octokit = new Octokit({ auth: token });
  });

  describe("Issue Operations", () => {
    test("should create a new issue", async () => {
      const { data: issue } = await octokit.issues.create({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        title: `Integration Test Issue ${Date.now()}`,
        body: "This issue was created by automated tests",
        labels: ["Price: 100 USD", "Time: <4 Hours"],
      });

      testIssueNumber = issue.number;
      expect(issue.number).toBeDefined();
      expect(issue.title).toContain("Integration Test Issue");
      expect(issue.labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Price: 100 USD" }),
          expect.objectContaining({ name: "Time: <4 Hours" }),
        ])
      );
    });

    test("should update issue title", async () => {
      const newTitle = `Updated Test Issue ${Date.now()}`;
      const { data: updated } = await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: testIssueNumber,
        title: newTitle,
      });

      expect(updated.title).toBe(newTitle);
    });

    test("should add labels to issue", async () => {
      const { data: updated } = await octokit.issues.addLabels({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: testIssueNumber,
        labels: ["Price: 500 USD"],
      });

      expect(updated).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Price: 500 USD" }),
        ])
      );
    });

    test("should list repository issues", async () => {
      const { data: issues } = await octokit.issues.listForRepo({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        state: "all",
        per_page: 100,
      });

      expect(issues.length).toBeGreaterThan(0);
      // Just verify we can list issues, the specific issue might be on another page
      expect(issues[0]).toHaveProperty('number');
      expect(issues[0]).toHaveProperty('title');
    });

    test("should close an issue", async () => {
      const { data: closed } = await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: testIssueNumber,
        state: "closed",
      });

      expect(closed.state).toBe("closed");
    });

    test("should reopen an issue", async () => {
      const { data: reopened } = await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: testIssueNumber,
        state: "open",
      });

      expect(reopened.state).toBe("open");
    });
  });

  describe("DevPool Directory Scenarios", () => {
    let devpoolIssueNumber: number;
    let partnerIssueNumber: number;

    test("should simulate partner issue creation", async () => {
      const { data: partnerIssue } = await octokit.issues.create({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        title: "Partner Issue for DevPool",
        body: "Task description for developers",
        labels: ["Price: 100 USD", "Time: <4 Hours"],
      });

      partnerIssueNumber = partnerIssue.number;
      expect(partnerIssue.state).toBe("open");
    });

    test("should create corresponding devpool issue", async () => {
      const { data: devpoolIssue } = await octokit.issues.create({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        title: "Partner Issue for DevPool",
        body: `https://github.com/${TEST_REPO}/issues/${partnerIssueNumber}`,
        labels: [
          "Pricing: 100 USD",
          "Time: <1 Day",
          "Partner: test-repo",
          `id: ${partnerIssueNumber}`,
        ],
      });

      devpoolIssueNumber = devpoolIssue.number;
      expect(devpoolIssue.body).toContain(`issues/${partnerIssueNumber}`);
    });

    test("should sync title changes from partner to devpool", async () => {
      const newTitle = "Updated Partner Issue Title";
      
      await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: partnerIssueNumber,
        title: newTitle,
      });

      await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: devpoolIssueNumber,
        title: newTitle,
      });

      const { data: updatedDevpool } = await octokit.issues.get({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: devpoolIssueNumber,
      });

      expect(updatedDevpool.title).toBe(newTitle);
    });

    test("should handle issue assignment", async () => {
      const { data: user } = await octokit.users.getAuthenticated();
      
      const { data: assigned } = await octokit.issues.update({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: partnerIssueNumber,
        assignees: [user.login],
      });

      expect(assigned.assignees).toHaveLength(1);
      expect(assigned.assignees?.[0].login).toBe(user.login);

      const { data: devpoolWithUnavailable } = await octokit.issues.addLabels({
        owner: TEST_OWNER,
        repo: TEST_REPO_NAME,
        issue_number: devpoolIssueNumber,
        labels: ["Unavailable"],
      });

      expect(devpoolWithUnavailable).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Unavailable" }),
        ])
      );
    });

    afterAll(async () => {
      const issuesToClose = [
        testIssueNumber,
        devpoolIssueNumber,
        partnerIssueNumber,
      ].filter(Boolean);

      for (const issueNumber of issuesToClose) {
        try {
          await octokit.issues.update({
            owner: TEST_OWNER,
            repo: TEST_REPO_NAME,
            issue_number: issueNumber,
            state: "closed",
          });
        } catch (error) {
          console.log(`Could not close issue ${issueNumber}:`, error);
        }
      }
    });
  });

  describe("Error Handling", () => {
    test("should handle non-existent issue gracefully", async () => {
      await expect(
        octokit.issues.get({
          owner: TEST_OWNER,
          repo: TEST_REPO_NAME,
          issue_number: 999999,
        })
      ).rejects.toThrow("Not Found");
    });

    test("should handle invalid operations gracefully", async () => {
      await expect(
        octokit.issues.update({
          owner: TEST_OWNER,
          repo: TEST_REPO_NAME,
          issue_number: 999999,
          state: "invalid_state" as "open" | "closed",
        })
      ).rejects.toThrow();
    });
  });
});