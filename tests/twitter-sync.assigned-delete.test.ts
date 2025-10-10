import { describe, test, beforeAll, afterEach, afterAll, expect, jest } from "@jest/globals";
import { setupServer } from "msw/node";
import { handlers } from "../mocks/handlers";
import { drop } from "@mswjs/data";
import { db } from "../mocks/db";

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  drop(db);
});
afterAll(() => server.close());

describe("Twitter Sync assigned -> delete", () => {
  test("assigned issues are excluded and mapped tweets are deleted", async () => {
    process.env.TWITTER_API_KEY = "test";
    process.env.TWITTER_API_KEY_SECRET = "test";
    process.env.TWITTER_ACCESS_TOKEN = "test";
    process.env.TWITTER_ACCESS_TOKEN_SECRET = "test";

    jest.resetModules();

    const { buildDesiredSet } = await import("../src/twitter/desired");
    const { plan } = await import("../src/twitter/plan");
    const { applyPlan } = await import("../src/twitter/apply");

    const nodeId = "I_test_node_2";
    const baseIssue = {
      node_id: nodeId,
      title: "Implement search",
      html_url: "https://github.com/owner/repo/issues/456",
      state: "open",
      labels: ["Price: 300 USD", "Time: 1d"],
      updated_at: new Date().toISOString(),
    } as any;

    // Step A: unassigned desired -> create
    const issueUnassigned = { ...baseIssue, assignees: [] };
    const desiredA = buildDesiredSet([issueUnassigned]);
    expect(desiredA.size).toBe(1);

    const twitterMap: Record<string, string> = {};
    const plA = plan({ desiredMap: desiredA, currentTweets: [], twitterMap });
    const deltaA = await applyPlan({ creates: plA.creates, deletes: plA.deletes, budgets: { createBudget: 5, deleteBudget: 5 }, twitterMap });
    const tweetId = deltaA.created[nodeId];
    expect(tweetId).toBeDefined();
    expect(db.tweet.count()).toBe(1);

    // Step B: assigned (still open) -> not desired -> delete
    const issueAssigned = { ...baseIssue, assignees: [{ login: "user1" }] };
    const desiredB = buildDesiredSet([issueAssigned]);
    expect(desiredB.size).toBe(0);

    const currentTweets = [
      {
        id: tweetId,
        text: "$300 for 1d\n\nImplement search\nhttps://github.com/owner/repo/issues/456",
        created_at: new Date("2020-01-01T00:00:00Z").toISOString(),
        pinned: false,
      },
    ];

    const plB = plan({ desiredMap: desiredB as any, currentTweets, twitterMap });
    expect(plB.deletes).toEqual([tweetId]);

    const deltaB = await applyPlan({ creates: plB.creates, deletes: plB.deletes, budgets: { createBudget: 5, deleteBudget: 5 }, twitterMap });
    expect(deltaB.deleted).toEqual([tweetId]);
    expect(twitterMap[nodeId]).toBeUndefined();
    expect(db.tweet.count()).toBe(0);
  });
});

