import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_OLD_PROPOSAL_CONFIG,
  UPDATE_REQUEST_MARKER,
  handleOldProposals,
  type OldProposalConfig,
} from "../src/proposals/old-proposals";

const now = new Date("2026-05-25T00:00:00.000Z");

function issue(overrides: Record<string, unknown> = {}) {
  return {
    owner: "ubiquity-os",
    repo: "plugins-wishlist",
    number: 70,
    node_id: "node-70",
    title: "Handling old proposals",
    url: "https://github.com/ubiquity-os/plugins-wishlist/issues/70",
    labels: [],
    assignees: [],
    state: "open" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    body: "",
    created_at: "2026-05-01T00:00:00.000Z",
    user: { login: "devpool-directory-superintendent", type: "Bot" },
    reactions: { total_count: 0 },
    ...overrides,
  };
}

function makeOctokit(comments: unknown[] = []) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const octokit = {
    rest: {
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async (params: Record<string, unknown>) => {
          calls.push({ method: "createComment", params });
          return { data: { id: calls.length } };
        },
        update: async (params: Record<string, unknown>) => {
          calls.push({ method: "update", params });
          return { data: { number: params.issue_number } };
        },
      },
    },
    paginate: async (fn: () => Promise<{ data: unknown[] }>) => (await fn()).data,
  };

  return { octokit, calls };
}

const config: OldProposalConfig = {
  ...DEFAULT_OLD_PROPOSAL_CONFIG,
  staleAfterDays: 30,
  responseWindowDays: 7,
  dryRun: false,
};

describe("handleOldProposals", () => {
  test("asks for an update when an unpriced proposal is stale and has not been reminded", async () => {
    const { octokit, calls } = makeOctokit();

    const actions = await handleOldProposals({
      octokit,
      proposals: [issue()],
      config,
      now,
    });

    assert.equal(actions[0].type, "request-update");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "createComment");
    assert.match(String(calls[0].params.body), new RegExp(UPDATE_REQUEST_MARKER));
  });

  test("closes an old proposal when the update request expired without a response", async () => {
    const { octokit, calls } = makeOctokit([
      comment({
        body: `${UPDATE_REQUEST_MARKER}\nPlease share an update.`,
        created_at: "2026-05-01T00:00:00.000Z",
      }),
    ]);

    const actions = await handleOldProposals({
      octokit,
      proposals: [issue()],
      config,
      now,
    });

    assert.equal(actions[0].type, "close");
    assert.deepEqual(
      calls.map((call) => call.method),
      ["createComment", "update"]
    );
    assert.equal(calls[1].params.state, "closed");
    assert.equal(calls[1].params.state_reason, "not_planned");
  });

  test("does not close when a human responded after the update request", async () => {
    const { octokit, calls } = makeOctokit([
      comment({
        body: `${UPDATE_REQUEST_MARKER}\nPlease share an update.`,
        created_at: "2026-05-01T00:00:00.000Z",
      }),
      comment({
        id: 2,
        body: "Still relevant.",
        created_at: "2026-05-10T00:00:00.000Z",
        user: { login: "0x4007", type: "User" },
      }),
    ]);

    const actions = await handleOldProposals({
      octokit,
      proposals: [issue()],
      config,
      now,
    });

    assert.equal(actions[0].type, "skip");
    assert.equal(actions[0].reason, "responded");
    assert.equal(calls.length, 0);
  });

  test("dry run reports the update request without writing to GitHub", async () => {
    const { octokit, calls } = makeOctokit();

    const actions = await handleOldProposals({
      octokit,
      proposals: [issue()],
      config: { ...config, dryRun: true },
      now,
    });

    assert.equal(actions[0].type, "request-update");
    assert.equal(actions[0].dryRun, true);
    assert.equal(calls.length, 0);
  });
});
