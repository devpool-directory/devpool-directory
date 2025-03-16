/* eslint-disable @typescript-eslint/no-explicit-any */
import { drop } from "@mswjs/data";
import { setupServer } from "msw/node";
import { db } from "../mocks/db";
import { handlers } from "../mocks/handlers";
import issueDevpoolTemplate from "../mocks/issue-devpool-template.json";
import issueTemplate from "../mocks/issue-template.json";
import { calculateStatistics } from "../src/directory/calculate-statistics";
import { checkIfForked } from "../src/directory/check-if-forked";
import { GitHubIssue } from "../src/directory/directory";
import { getPartnerUrls } from "../src/directory/get-partner-urls";
import { getRepoUrls } from "../src/directory/get-repo-urls";
import { newDirectoryIssue } from "../src/directory/new-directory-issue";
import { updateDirectoryIssue } from "../src/directory/update-issue";

const DEVPOOL_OWNER_NAME = "ubiquity";
const DEVPOOL_REPO_NAME = "devpool-directory";

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  drop(db);
});
afterAll(() => server.close());

function createIssues(devpoolIssue: GitHubIssue, projectIssue: GitHubIssue) {
  db.issue.create(devpoolIssue);
  db.issue.create(projectIssue);

  return db.issue.findFirst({
    where: {
      id: {
        equals: devpoolIssue.id,
      },
    },
  }) as GitHubIssue;
}

describe("handleDevPoolIssue", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation();

  beforeEach(() => {
    logSpy.mockClear();
  });

  describe("Devpool Directory", () => {
    beforeEach(() => {
      db.repo.create({
        id: 1,
        html_url: "https://github.com/ubiquity/devpool-directory",
        name: DEVPOOL_REPO_NAME,
        owner: DEVPOOL_OWNER_NAME,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
    });

    test("updates issue title in devpool when project issue title changes", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        title: "Original Title",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        title: "Updated Title",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.title).toEqual("Updated Title");
      expect(logSpy).toHaveBeenCalledWith(`Updated metadata for issue:`, {
        directoryIssueUrl: updatedIssue.html_url,
        partnerIssueUrl: partnerIssue.html_url,
        changes: {
          title: true,
          body: false,
          labels: true,
        },
      });
    });

    test("updates issue labels in devpool when project issue labels change", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        labels: issueTemplate.labels?.concat({ name: "enhancement" }),
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "enhancement",
          }),
        ])
      );
      expect(logSpy).toHaveBeenCalledWith(`Updated metadata for issue:`, {
        directoryIssueUrl: updatedIssue.html_url,
        partnerIssueUrl: partnerIssue.html_url,
        changes: {
          title: false,
          body: false,
          labels: true,
        },
      });
    });

    test("does not update issue when no metadata changes are detected", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "id: 1" }, { name: "Time: 1h" }],
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const beforeUpdate = getDb();
      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue).toEqual(beforeUpdate);
    });

    test("keeps devpool issue state unchanged when project issue state matches devpool issue state", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed, assigned and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed, merged, unassigned and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool state unchanged when project issue state is open, assigned, merged and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated"));
    });

    test("keeps devpool state unchanged when project issue state is open, unassigned and devpool issue state is open", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool state unchanged when project issue state is open, unassigned, merged and devpool issue state is open", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: partnerIssue,
      });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    // cause: projectIssue.state == "closed" && devpoolIssue.state == "open"
    // comment: "Closed (not merged):"
    test("closes devpool issue when project issue is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "open",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");
    });

    // cause: projectIssue.state == "open" && devpoolIssue.state == "closed" && !projectIssue.assignee?.login
    // comment: "Reopened (unassigned):",
    test("reopens devpool issue when project issue is reopened", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("open");
    });

    test("reopens devpool issue when project issue is unassigned, reopened, and merged", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: issueInDb,
        partnerIssue: partnerIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("open");
    });

    test("adds Unavailable label to devpool issue when project issue is assigned, open and devpool is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
      } as GitHubIssue;

      const projectIssue = {
        ...issueTemplate,
        state: "open",
        assignees: [
          {
            login: "hunter",
          },
        ] as GitHubIssue["assignees"],
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: projectIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.state).toEqual("open");
      expect(updatedIssue.labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });

    test("removes Unavailable label from devpool issue when project issue is assigned and closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
        labels: issueDevpoolTemplate.labels.concat({ name: "Unavailable" }),
      } as GitHubIssue;

      const projectIssue = {
        ...issueTemplate,
        state: "closed",
        assignees: [
          {
            login: "hunter",
          },
        ] as GitHubIssue["assignees"],
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: projectIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.state).toEqual("closed");
      expect(updatedIssue.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });

    test("removes Unavailable label from devpool issue when project issue is unassigned, closed and merged", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
        labels: issueDevpoolTemplate.labels.concat({ name: "Unavailable" }),
        pull_request: {
          diff_url: "...",
          html_url: "...",
          patch_url: "...",
          url: "...",
          merged_at: new Date().toISOString(),
        },
      } as GitHubIssue;

      const projectIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: projectIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.state).toEqual("closed");
      expect(updatedIssue.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });

    test("removes Unavailable label from devpool issue when project issue is unassigned and reopened", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
        labels: issueDevpoolTemplate.labels.concat({ name: "Unavailable" }),
      } as GitHubIssue;

      const projectIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: projectIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.state).toEqual("open");
      expect(updatedIssue.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });

    test("removes Unavailable label from devpool issue when project issue is unassigned, merged and reopened", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
        labels: issueDevpoolTemplate.labels.concat({ name: "Unavailable" }),
      } as GitHubIssue;

      const projectIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          diff_url: "...",
          html_url: "...",
          patch_url: "...",
          url: "...",
          merged_at: new Date().toISOString(),
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
        partnerIssue: projectIssue,
      });

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue.state).toEqual("open");
      expect(updatedIssue.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });

    test("does not add the Unavailable to an open devpool issue, _ever_", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "open",
        id: 1,
        number: 1,
        node_id: "1",
        repository_url: "https://github.com/ubiquity/devpool-directory",
        html_url: "https://github.com/ubiquity/devpool-directory/issues/1",
      } as GitHubIssue;

      // project issue is open and unassigned
      let projectIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await validateOpen(projectIssue, devpoolIssue);

      // project issue is open, unassigned and merged
      projectIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      await validateOpen(projectIssue, devpoolIssue);
    });

    test("does not remove the Unavailable label from an assigned devpool issue that's open, _ever_", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
        id: 1,
        number: 1,
        node_id: "1",
        repository_url: "https://github.com/ubiquity/devpool-directory",
        html_url: "https://github.com/ubiquity/devpool-directory/issues/1",
      } as GitHubIssue;

      // project issue is open, assigned and unmerged
      let projectIssue = {
        ...issueTemplate,
        state: "open",
        assignees: [
          {
            login: "hunter",
          },
        ] as GitHubIssue["assignees"],
      } as GitHubIssue;

      createIssues(devpoolIssue, projectIssue);

      await validateClosed(projectIssue, devpoolIssue);

      // project issue is open, assigned and merged
      projectIssue = {
        ...issueTemplate,
        state: "open",
        assignees: [
          {
            login: "hunter",
          },
        ] as GitHubIssue["assignees"],
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      await validateClosed(projectIssue, devpoolIssue);
    });

    test("checkIfForkedRepo", async () => {
      expect(await checkIfForked()).toBe(false);
    });

    test("getRepoUrls", async () => {
      let orgOrRepo = "test/org/bad-repo/still/bad";
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      await getRepoUrls(orgOrRepo);

      expect(warnSpy).toHaveBeenCalledWith(`Neither org or nor repo GitHub provided: test/org/bad-repo/still/bad.`);

      orgOrRepo = "/test";

      await getRepoUrls(orgOrRepo);

      expect(warnSpy).toHaveBeenCalledWith(`Invalid org or repo provided: `, orgOrRepo);

      (orgOrRepo as any) = undefined;

      await getRepoUrls(orgOrRepo);

      expect(warnSpy).toHaveBeenCalledWith(`No org or repo provided: `, orgOrRepo);

      warnSpy.mockClear();

      jest.resetModules();

      (orgOrRepo as any) = ".";

      await getRepoUrls(orgOrRepo);

      const localErr = `Getting ${orgOrRepo} org repositories failed: HttpError: Bad credentials`;
      const githubErr = `Getting ${orgOrRepo} org repositories failed: HttpError: Not Found`;

      if (warnSpy.mock.calls.length > 0) {
        const errThrown: string = warnSpy.mock.calls.flatMap((call) => call).includes(localErr) ? localErr : githubErr;
        if (errThrown.includes("Bad credentials")) {
          expect(errThrown).toEqual(localErr);
        } else {
          expect(errThrown).toEqual(githubErr);
        }
      }

      (orgOrRepo as any) = "-/test";

      await getRepoUrls(orgOrRepo);
      expect(warnSpy).toHaveBeenCalledWith(`Getting repo ${orgOrRepo} failed: HttpError`);
    });
  });

  function getDb() {
    return db.issue.findFirst({
      where: {
        id: {
          equals: 1,
        },
      },
    }) as GitHubIssue;
  }

  async function validateClosed(projectIssue: GitHubIssue, devpoolIssue: GitHubIssue) {
    await updateDirectoryIssue({
      directoryIssue: devpoolIssue,
      partnerIssue: projectIssue,
    });

    const updatedIssue = getDb();
    if (updatedIssue === null) {
      throw new Error("Updated issue is null");
    }
    expect(updatedIssue).not.toBeNull();
    expect(updatedIssue.state).toEqual("open");
    expect(updatedIssue.labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Unavailable",
        }),
      ])
    );
  }

  async function validateOpen(projectIssue: GitHubIssue, devpoolIssue: GitHubIssue) {
    await updateDirectoryIssue({
      directoryIssue: projectIssue,
      partnerIssue: devpoolIssue,
    });

    const updatedIssue = getDb();
    if (updatedIssue === null) {
      throw new Error("Updated issue is null");
    }
    expect(updatedIssue).not.toBeNull();
    expect(updatedIssue.state).toEqual("open");
    expect(updatedIssue.labels).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Unavailable",
        }),
      ])
    );
  }
});

describe("createDevPoolIssue", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation();
  const twitterMap: { [key: string]: string } = {
    "ubiquity/test-repo": "ubiquity",
  };

  beforeEach(() => {
    logSpy.mockClear();
  });

  describe("Devpool Directory", () => {
    beforeEach(() => {
      db.repo.create({
        id: 1,
        html_url: "https://github.com/ubiquity/devpool-directory",
        name: DEVPOOL_REPO_NAME,
        owner: DEVPOOL_OWNER_NAME,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
    });

    afterEach(() => {
      drop(db);
    });

    test("only creates a new devpool issue if it's unassigned, opened and not already a devpool issue", async () => {
      const partnerIssue = {
        ...issueTemplate,
        assignee: null,
      } as GitHubIssue;

      logSpy.mockClear();
      await newDirectoryIssue(partnerIssue, partnerIssue.html_url, twitterMap);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Created"));
    });

    test("does not create a new devpool issue if it's already a devpool issue", async () => {
      const partnerIssue = {
        ...issueTemplate,
      } as GitHubIssue;

      db.issue.create({
        ...issueDevpoolTemplate,
        id: partnerIssue.id,
      });
      logSpy.mockClear();

      await newDirectoryIssue(partnerIssue, partnerIssue.html_url, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          id: {
            equals: partnerIssue.id,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).not.toBeNull();
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Created"));
    });

    test("does not create a new devpool issue if it's closed", async () => {
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      await newDirectoryIssue(partnerIssue, partnerIssue.html_url, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          title: {
            equals: partnerIssue.title,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).toBeNull();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Created"));
    });
  });
});

describe("getProjectUrls", () => {
  const responseMap = {
    ubiquity: {
      "series-a": "https://github.com/ubiquity/series-a",
      hackbar: "https://github.com/ubiquity/hackbar",
      "devpool-directory": "https://github.com/ubiquity/devpool-directory",
      "card-issuance": "https://github.com/ubiquity/card-issuance",
      research: "https://github.com/ubiquity/research",
      recruiting: "https://github.com/ubiquity/recruiting",
      "business-development": "https://github.com/ubiquity/business-development",
      ubiquibot: "https://github.com/ubiquity/ubiquibot",
      ubiquibar: "https://github.com/ubiquity/ubiquibar",
      "ubiquibot-telegram": "https://github.com/ubiquity/ubiquibot-telegram",
      // ^ out

      "work.fi": "https://github.com/ubiquity/work.fi",
      "pay.fi": "https://github.com/ubiquity/pay.fi",
      "gas-faucet": "https://github.com/ubiquity/gas-faucet",
      "keygen.fi": "https://github.com/ubiquity/keygen.fi",
      "onboarding.fi": "https://github.com/ubiquity/onboarding.fi",
    },
    ubiquibot: {
      configuration: "https://github.com/ubiquibot/configuration",
      production: "https://github.com/ubiquibot/production",
      sandbox: "https://github.com/ubiquibot/sandbox",
      "e2e-tests": "https://github.com/ubiquibot/e2e-tests",
      staging: "https://github.com/ubiquibot/staging",
      // ^ out

      "test-repo": "https://github.com/ubiquibot/test-repo",
    },
    "pavlovcik/uad.ubq.fi": {
      "uad.ubq.fi": "https://github.com/pavlovcik/uad.ubq.fi",
      // ^ in
    },
    "private-test-org": {
      "secret-repo": "https://github.com/private-test-org/secret-repo",
      "secret-repo-2": "https://github.com/private-test-org/secret-repo-2",
      // ^ out

      "public-repo": "https://github.com/private-test-org/public-repo",
      // ^ in
    },
    "test-org": {
      "secret-repo": "https://github.com/test-org/secret-repo",
      "secret-repo-2": "https://github.com/test-org/secret-repo-2",
      // ^ out
    },
  };

  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation();
  });

  const opt = {
    in: ["ubiquity", "ubiquibot", "private-test-org", "private-test-org/public-repo", "pavlovcik/uad.ubq.fi"],
    out: [
      "private-test-org",
      "ubiquity/series-a",
      "ubiquity/hackbar",
      "ubiquity/devpool-directory",
      "ubiquity/card-issuance",
      "ubiquity/research",
      "ubiquity/recruiting",
      "ubiquity/business-development",
      "ubiquity/ubiquibar",
      "ubiquity/ubiquibot",
      "ubiquity/ubiquibot-telegram",
      "ubiquity/test-repo",
      "ubiquibot/configuration",
      "ubiquibot/production",
      "ubiquibot/sandbox",
      "ubiquibot/e2e-tests",
      "ubiquibot/staging",
    ],
  };

  beforeEach(() => {
    drop(db);

    let index = 1;
    Object.entries(responseMap).forEach(([owner, repos]) => {
      for (const [name, url] of Object.entries(repos)) {
        db.repo.create({
          id: index++,
          owner: owner.split("/")[0],
          name,
          html_url: url,
        });
      }
    });
  });

  test("returns projects not included in Opt.out", async () => {
    const urls = Array.from(await getPartnerUrls(opt));

    opt.out.forEach((url) => {
      expect(urls).not.toContain("https://github.com/" + url);
    });

    expect(urls).not.toEqual("https://github.com/" + opt.out.join(","));

    expect(urls).toEqual(
      expect.arrayContaining([
        "https://github.com/ubiquity/work.fi",
        "https://github.com/ubiquity/pay.fi",
        "https://github.com/ubiquity/gas-faucet",
        "https://github.com/ubiquity/keygen.fi",
        "https://github.com/ubiquity/onboarding.fi",
        "https://github.com/pavlovcik/uad.ubq.fi",
        "https://github.com/private-test-org/public-repo",
      ])
    );
  });
});

describe("calculateStatistics", () => {
  test("calculates statistics correctly for empty issues array", async () => {
    const issues = [] as GitHubIssue[];

    const result = await calculateStatistics(issues);

    expect(result.rewards).toEqual({
      notAssigned: 0,
      assigned: 0,
      completed: 0,
      total: 0,
    });

    expect(result.tasks).toEqual({
      notAssigned: 0,
      assigned: 0,
      completed: 0,
      total: 0,
    });
  });

  test("calculates statistics correctly for issues with different labels and states", async () => {
    const devpoolIssue = {
      ...issueDevpoolTemplate,
      state: "closed",
      labels: [
        {
          name: "Pricing: 200 USD",
        },
        {
          name: "Time: 1h",
        },
        {
          name: "id: 2",
        },
      ],
    } as GitHubIssue;

    const devpoolIssue2 = {
      ...issueDevpoolTemplate,
      id: 4,
      node_id: "4",
      number: 4,
      html_url: "https://github.com/ubiquity/devpool-directory/issues/4",
      repository_url: "https://github.com/ubiquity/devpool-directory",
      labels: [
        {
          name: "Pricing: 1000 USD",
        },
        {
          name: "Time: 1h",
        },
        {
          name: "id: 3",
        },
      ],
    } as GitHubIssue;

    const devpoolIssue3 = {
      ...issueDevpoolTemplate,
      id: 5,
      node_id: "5",
      number: 5,
      state: "closed",
      html_url: "https:/github.com/ubiquity/devpool-directory/issues/5",
      repository_url: "https://github.com/ubiquity/devpool-directory",
      labels: [
        {
          name: "Pricing: 500 USD",
        },
        {
          name: "Time: 1h",
        },
        {
          name: "id: 6",
        },
        {
          name: "Unavailable",
        },
      ],
    } as GitHubIssue;

    const projectIssue1 = {
      ...issueTemplate,
      state: "closed",
      pull_request: {
        merged_at: new Date().toISOString(),
      } as GitHubIssue["pull_request"],
      assignee: {
        login: "hunter",
      } as GitHubIssue["assignee"],
      closed_at: new Date().toISOString(),
    } as GitHubIssue;

    const projectIssue2 = {
      ...issueTemplate,
      state: "open",
      id: 3,
      node_id: "3",
      number: 3,
      html_url: "https://github.com/ubiquity/test-repo/issues/3",
      repository_url: "https://github.com/ubiquity/test-repo",
      labels: [
        {
          name: "Price: 1000 USD",
        },
        {
          name: "Time: 1h",
        },
      ],
    } as GitHubIssue;

    const projectIssue3 = {
      ...issueTemplate,
      state: "open",
      id: 6,
      node_id: "6",
      number: 6,
      html_url: "https://github.com/ubiquity/test-repo/issues/6",
      repository_url: "https://github.com/ubiquity/test-repo",
      labels: [
        {
          name: "Price: 500 USD",
        },
        {
          name: "Time: 1h",
        },
      ],
      assignee: {
        login: "hunter",
      } as GitHubIssue["assignee"],
    } as GitHubIssue;

    createIssues(devpoolIssue, projectIssue1);
    await updateDirectoryIssue({
      directoryIssue: projectIssue1,
      partnerIssue: devpoolIssue,
    });
    createIssues(devpoolIssue2, projectIssue2);
    await updateDirectoryIssue({
      directoryIssue: projectIssue2,
      partnerIssue: devpoolIssue2,
    });
    createIssues(devpoolIssue3, projectIssue3);
    await updateDirectoryIssue({
      directoryIssue: projectIssue3,
      partnerIssue: devpoolIssue3,
    });

    const issues = [devpoolIssue, devpoolIssue2, projectIssue1, projectIssue2, devpoolIssue3, projectIssue3];

    const result = await calculateStatistics(issues as GitHubIssue[]);

    expect(result.rewards).toEqual({
      notAssigned: 1000, // issue 2
      completed: 200, // issue 1
      assigned: 500, // issue 3
      total: 1700, // 1000 + 500 + 200
    });

    expect(result.tasks).toEqual({
      notAssigned: 1,
      assigned: 1,
      completed: 1,
      total: 3,
    });
  });

  test("ignores invalid pricing labels and logs an error", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const devpoolIssue = {
      ...issueDevpoolTemplate,
      state: "closed",
      labels: [
        {
          name: "Pricing: NaN",
        },
        {
          name: "Time: 1h",
        },
        {
          name: "id: 2",
        },
      ],
    } as GitHubIssue;

    const projectIssue1 = {
      ...issueTemplate,
      state: "open",
      labels: [
        {
          name: "Price: NaN",
        },
        {
          name: "Time: 1h",
        },
      ],
      pull_request: {
        merged_at: new Date().toISOString(),
      } as GitHubIssue["pull_request"],
      assignee: {
        login: "hunter",
      } as GitHubIssue["assignee"],
      closed_at: new Date().toISOString(),
    } as GitHubIssue;

    createIssues(devpoolIssue, projectIssue1);
    await updateDirectoryIssue({
      directoryIssue: projectIssue1,
      partnerIssue: devpoolIssue,
    });

    const issues = [devpoolIssue, projectIssue1];

    const result = await calculateStatistics(issues as GitHubIssue[]);

    expect(result.rewards).toEqual({
      notAssigned: 0,
      assigned: 0,
      completed: 0,
      total: 0,
    });

    expect(result.tasks).toEqual({
      notAssigned: 0,
      assigned: 0,
      completed: 1,
      total: 1,
    });

    consoleErrorSpy.mockRestore();
  });
});
