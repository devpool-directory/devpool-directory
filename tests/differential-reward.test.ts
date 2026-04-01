import { computeDifferentialReward, buildRewardHistoryEntry, differentialToComment } from "../src/artifacts/differential";

describe("computeDifferentialReward", () => {
  const emptyHistory: import("../src/artifacts/types").RewardHistoryEntry[] = [];

  test("initial distribution: all positive differences", () => {
    const result = computeDifferentialReward(
      "node-1",
      { alice: 100, bob: 50 },
      emptyHistory
    );

    expect(result.is_reopened).toBe(false);
    expect(result.positive_differences).toEqual({ alice: 100, bob: 50 });
    expect(result.negative_differences).toEqual({});
    expect(result.unchanged).toEqual([]);
    expect(result.new_totals).toEqual({ alice: 100, bob: 50 });
    expect(result.previous_totals).toEqual({});
  });

  test("reopened issue: partial increase", () => {
    const history: import("../src/artifacts/types").RewardHistoryEntry[] = [
      {
        timestamp: "2026-01-01T00:00:00Z",
        beneficiaries: { alice: 100, bob: 50 },
        total_distributed: 150,
      },
    ];

    const result = computeDifferentialReward(
      "node-1",
      { alice: 150, bob: 50 },
      history
    );

    expect(result.is_reopened).toBe(true);
    expect(result.positive_differences).toEqual({ alice: 50 });
    expect(result.negative_differences).toEqual({});
    expect(result.unchanged).toEqual(["bob"]);
    expect(result.new_totals).toEqual({ alice: 150, bob: 50 });
    expect(result.previous_totals).toEqual({ alice: 100, bob: 50 });
  });

  test("reopened issue: price reduced", () => {
    const history: import("../src/artifacts/types").RewardHistoryEntry[] = [
      {
        timestamp: "2026-01-01T00:00:00Z",
        beneficiaries: { alice: 100 },
        total_distributed: 100,
      },
    ];

    const result = computeDifferentialReward(
      "node-1",
      { alice: 80 },
      history
    );

    expect(result.is_reopened).toBe(false); // no positive diffs
    expect(result.positive_differences).toEqual({});
    expect(result.negative_differences).toEqual({ alice: 20 });
  });

  test("new beneficiary added on reopen", () => {
    const history: import("../src/artifacts/types").RewardHistoryEntry[] = [
      {
        timestamp: "2026-01-01T00:00:00Z",
        beneficiaries: { alice: 100 },
        total_distributed: 100,
      },
    ];

    const result = computeDifferentialReward(
      "node-1",
      { alice: 100, charlie: 50 },
      history
    );

    expect(result.is_reopened).toBe(true);
    expect(result.positive_differences).toEqual({ charlie: 50 });
    expect(result.unchanged).toEqual(["alice"]);
  });

  test("completely unchanged rewards", () => {
    const history: import("../src/artifacts/types").RewardHistoryEntry[] = [
      {
        timestamp: "2026-01-01T00:00:00Z",
        beneficiaries: { alice: 100 },
        total_distributed: 100,
      },
    ];

    const result = computeDifferentialReward(
      "node-1",
      { alice: 100 },
      history
    );

    expect(result.is_reopened).toBe(false);
    expect(result.unchanged).toEqual(["alice"]);
    expect(Object.keys(result.positive_differences)).toHaveLength(0);
  });
});

describe("buildRewardHistoryEntry", () => {
  test("basic entry", () => {
    const entry = buildRewardHistoryEntry({ alice: 100, bob: 50 }, "https://github.com/comment/1", "permit");
    expect(entry.beneficiaries).toEqual({ alice: 100, bob: 50 });
    expect(entry.total_distributed).toBe(150);
    expect(entry.payment_mode).toBe("permit");
    expect(entry.comment_url).toBe("https://github.com/comment/1");
    expect(entry.timestamp).toBeTruthy();
  });
});

describe("differentialToComment", () => {
  test("initial distribution comment", () => {
    const result = computeDifferentialReward("node-1", { alice: 100 }, []);
    const comment = differentialToComment(result);
    expect(comment).toContain("Initial distribution");
    expect(comment).toContain("alice");
    expect(comment).toContain("$100.00");
  });

  test("reopened issue comment", () => {
    const history: import("../src/artifacts/types").RewardHistoryEntry[] = [
      {
        timestamp: "2026-01-01T00:00:00Z",
        beneficiaries: { alice: 100 },
        total_distributed: 100,
      },
    ];
    const result = computeDifferentialReward("node-1", { alice: 150 }, history);
    const comment = differentialToComment(result);
    expect(comment).toContain("Additional Rewards");
    expect(comment).toContain("+$50.00");
  });
});
