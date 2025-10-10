import { describe, test, beforeAll, afterEach, afterAll, expect, jest } from "@jest/globals";
import { setupServer } from "msw/node";
import { handlers } from "../mocks/handlers";
import { drop } from "@mswjs/data";
import { db } from "../mocks/db";

// Use same handlers as other tests
const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  drop(db);
});
afterAll(() => server.close());

describe("Twitter Sync plan/apply", () => {
  test("creates tweet for open+priced+unassigned, then deletes when issue is closed", async () => {
    // Set Twitter env so client initializes
    process.env.TWITTER_API_KEY = "test";
    process.env.TWITTER_API_KEY_SECRET = "test";
    process.env.TWITTER_ACCESS_TOKEN = "test";
    process.env.TWITTER_ACCESS_TOKEN_SECRET = "test";

    jest.resetModules();

    const { buildDesiredSet } = await import("../src/twitter/desired");
    const { plan } = await import("../src/twitter/plan");
    const { applyPlan } = await import("../src/twitter/apply");

    // Step A: Open + priced + unassigned issue present
    const nodeId = "I_test_node";
    const issue = {
      node_id: nodeId,
      title: "Add pagination",
      html_url: "https://github.com/owner/repo/issues/123",
      state: "open",
      labels: ["Price: 200 USD", "Time: 1h"],
      assignees: [],
      updated_at: new Date().toISOString(),
    } as any;

    const desired = buildDesiredSet([issue]);
    expect(desired.size).toBe(1);

    const twitterMap: Record<string, string> = {};
    const currentTweets: Array<{ id: string; text: string; created_at?: string; pinned?: boolean }> = [];

    const pl1 = plan({ desiredMap: desired, currentTweets, twitterMap });
    expect(Object.keys(pl1.creates)).toEqual([nodeId]);
    expect(pl1.deletes).toHaveLength(0);
    expect(pl1.keep).toHaveLength(0);

    const delta1 = await applyPlan({ creates: pl1.creates, deletes: pl1.deletes, budgets: { createBudget: 10, deleteBudget: 10 }, twitterMap });
    // Tweet created and mapped
    expect(Object.keys(delta1.created)).toEqual([nodeId]);
    const tweetId = delta1.created[nodeId];
    expect(typeof tweetId).toBe("string");
    expect(twitterMap[nodeId]).toBe(tweetId);
    // MSW DB has one tweet now
    expect(db.tweet.count()).toBe(1);

    // Step B: Issue closed (no longer desired) -> delete
    const desired2 = new Map();
    const currentTweets2 = [
      {
        id: tweetId,
        text: "200 USD for 1h\n\nAdd pagination\nhttps://github.com/owner/repo/issues/123",
        created_at: new Date("2020-01-01T00:00:00Z").toISOString(),
        pinned: false,
      },
    ];
    const pl2 = plan({ desiredMap: desired2 as any, currentTweets: currentTweets2, twitterMap });
    expect(pl2.deletes).toEqual([tweetId]);

    const delta2 = await applyPlan({ creates: pl2.creates, deletes: pl2.deletes, budgets: { createBudget: 10, deleteBudget: 10 }, twitterMap });
    expect(delta2.deleted).toEqual([tweetId]);
    // Mapping removed after delete
    expect(twitterMap[nodeId]).toBeUndefined();
    // MSW DB has zero tweets after deletion
    expect(db.tweet.count()).toBe(0);
  });
});

