import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMatchmakingCandidates } from "../src/matchmaking/rank";
import type { PartnerIssue } from "../src/artifacts/types";

function issue(overrides: Partial<PartnerIssue>): PartnerIssue {
  return {
    owner: "ubiquity-os-marketplace",
    repo: "text-conversation-rewards",
    number: 1,
    node_id: "node-1",
    title: "Fallback issue",
    url: "https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/1",
    body: "",
    labels: ["Price: 300 USD", "Time: <1 Day"],
    assignees: [],
    state: "open",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildMatchmakingCandidates", () => {
  it("sorts open tasks by developer experience relevance before payout", () => {
    const tasks = [
      issue({
        number: 1,
        node_id: "ui",
        title: "Dashboard polish",
        body: "Implement React filters and responsive cards",
        labels: ["Price: 1200 USD", "frontend"],
      }),
      issue({
        number: 2,
        node_id: "contracts",
        title: "Permit nonce import",
        body: "Solidity contract migration with Foundry tests and nonce storage",
        labels: ["Price: 600 USD", "solidity", "foundry"],
      }),
    ];
    const completed = [
      {
        title: "Add Foundry invariant tests",
        body: "Implemented Solidity nonce tracking and contract migration tests",
        labels: ["solidity", "foundry"],
        url: "https://github.com/example/contracts/issues/7",
      },
    ];

    const candidates = buildMatchmakingCandidates(tasks, completed);

    assert.equal(candidates[0].issue.node_id, "contracts");
    assert.equal(candidates[0].priceUsd, 600);
    assert(candidates[0].matchScore > candidates[1].matchScore);
    assert(candidates[0].matchedTerms.includes("solidity"));
    assert(candidates[0].matchedTerms.includes("foundry"));
  });

  it("keeps assigned tasks out of the default candidate list", () => {
    const candidates = buildMatchmakingCandidates([
      issue({ node_id: "available", title: "Available task" }),
      issue({ node_id: "assigned", title: "Assigned task", assignees: ["alice"] }),
    ], []);

    assert.deepEqual(
      candidates.map((candidate) => candidate.issue.node_id),
      ["available"]
    );
  });
});
