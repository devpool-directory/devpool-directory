/* eslint-disable @typescript-eslint/no-explicit-any */
import { drop } from "@mswjs/data";
import { setupServer } from "msw/node";
import { db } from "../mocks/db";
import { handlers } from "../mocks/handlers";
import issueDevpoolTemplate from "../mocks/issue-devpool-template.json";
import issueTemplate from "../mocks/issue-template.json";
import { GitHubIssue } from "../src/directory/directory";
import { updateDirectoryIssue } from "../src/directory/update-issue";

const DEVPOOL_OWNER_NAME = "ubiquity";
const DEVPOOL_REPO_NAME = "devpool-directory";
const REPO_URL = "https://github.com/not-ubiquity/devpool-directory";

const server = setupServer(...handlers);

jest.mock("../src/directory/directory", () => ({
  ...jest.requireActual("../src/directory/directory"),
  DEVPOOL_OWNER_NAME: "not-ubiquity",
}));

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  drop(db);
});
afterAll(() => {
  server.close();
  jest.unmock("../src/directory/directory");
});

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

describe("handleForkedDevPoolIssue", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation();

  beforeEach(() => {
    logSpy.mockClear();
  });

  describe("Forked Devpool", () => {
    beforeEach(() => {
      db.repo.create({
        id: 1,
        owner: "not-ubiquity",
        name: DEVPOOL_REPO_NAME,
        html_url: REPO_URL,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
      db.repo.create({
        id: 3,
        owner: DEVPOOL_OWNER_NAME,
        name: DEVPOOL_REPO_NAME,
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}`,
      });
    });

    test("updates issue title in devpool when project issue title changes in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        title: "Original Title",
        owner: "not-ubiquity",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        title: "Updated Title",
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
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
      expect(updatedIssue?.title).toEqual("Updated Title");
      expect(logSpy).toHaveBeenCalledWith(`Updated metadata for issue:`, {
        directoryIssueUrl: updatedIssue.html_url,
        partnerIssueUrl: partnerIssue.html_url,
        changes: {
          title: true,
          body: true,
          labels: true,
        },
      });
    });

    test("updates issue labels in devpool when project issue labels change in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        body: "https://www.github.com/ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        labels: issueTemplate.labels?.concat({ name: "enhancement" }),
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
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
      expect(logSpy).toHaveBeenCalledWith(`Updated metadata for issue:`, {
        directoryIssueUrl: updatedIssue.html_url,
        partnerIssueUrl: partnerIssue.html_url,
        changes: {
          title: false,
          body: true,
          labels: true,
        },
      });
      expect(updatedIssue.labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "enhancement",
          }),
        ])
      );
    });

    test("closes devpool issue when project issue is merged in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        body: "https://www.github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
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

    test("closes devpool issue when project issue is closed in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        body: "https://www.github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
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

    test("closes devpool issue when project issue is closed and assigned in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        body: "https://www.github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
        assignees: [
          {
            login: "hunter",
          },
        ] as GitHubIssue["assignees"],
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
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

    test("removes Unavailable label from devpool issue when project issue is unassigned and reopened", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        body: "https://www.github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
        state: "closed",
        labels: issueDevpoolTemplate.labels.concat({ name: "Unavailable" }),
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "open",
        html_url: "https://github.com/not-ubiquity/test-repo/issues/1",
        owner: "not-ubiquity",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await updateDirectoryIssue({
        directoryIssue: devpoolIssue,
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
      expect(updatedIssue.state).toEqual("open");
      expect(updatedIssue.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Unavailable",
          }),
        ])
      );
    });
  });
});
