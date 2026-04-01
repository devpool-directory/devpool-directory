import type { RewardHistoryEntry, DifferentialResult } from "./types";

/**
 * Compute the differential reward distribution for an issue.
 *
 * When an issue is reopened and its price label changes (or assignees change),
 * we compare the new proposed reward amounts against what was previously paid,
 * and only trigger payments for the positive differences.
 *
 * @param nodeId        - The GitHub GraphQL node_id of the issue.
 * @param newRewards    - The newly calculated rewards (user login -> USD amount).
 * @param rewardHistory - Prior distribution history for this issue (from MirrorStateEntry.reward_history).
 * @returns DifferentialResult describing who should receive additional payment.
 */
export function computeDifferentialReward(
  nodeId: string,
  newRewards: Record<string, number>,
  rewardHistory: RewardHistoryEntry[] = []
): DifferentialResult {
  // Derive the previous totals from the most recent distribution event
  const previousTotals: Record<string, number> = {};
  if (rewardHistory.length > 0) {
    const last = rewardHistory[rewardHistory.length - 1];
    for (const [user, amount] of Object.entries(last.beneficiaries)) {
      previousTotals[user] = amount;
    }
  }

  const allUsers = new Set([...Object.keys(newRewards), ...Object.keys(previousTotals)]);
  const positiveDifferences: Record<string, number> = {};
  const negativeDifferences: Record<string, number> = {};
  const unchanged: string[] = [];
  const newTotals: Record<string, number> = {};

  for (const user of allUsers) {
    const prev = previousTotals[user] ?? 0;
    const next = newRewards[user] ?? 0;
    newTotals[user] = next;

    if (next > prev) {
      positiveDifferences[user] = Math.round((next - prev) * 100) / 100;
    } else if (next < prev) {
      // Price reduced or beneficiary removed — log for audit; no reversal payments made.
      negativeDifferences[user] = Math.round((prev - next) * 100) / 100;
    } else {
      unchanged.push(user);
    }
  }

  // An issue is considered "reopened" when there is at least one prior distribution
  // and at least one positive difference (i.e., additional rewards are due).
  const isReopened = rewardHistory.length > 0 && Object.keys(positiveDifferences).length > 0;

  return {
    node_id: nodeId,
    positive_differences: positiveDifferences,
    negative_differences: negativeDifferences,
    unchanged,
    new_totals: newTotals,
    previous_totals: previousTotals,
    is_reopened: isReopened,
  };
}

/**
 * Build the next RewardHistoryEntry to append after a distribution.
 *
 * @param newRewards   - The new reward amounts per beneficiary (should match new_totals from computeDifferentialReward).
 * @param commentUrl   - GitHub comment URL summarising the distribution.
 * @param paymentMode  - 'direct' | 'permit'.
 * @returns A RewardHistoryEntry ready to be appended to MirrorStateEntry.reward_history.
 */
export function buildRewardHistoryEntry(
  newRewards: Record<string, number>,
  commentUrl?: string,
  paymentMode?: "direct" | "permit"
): RewardHistoryEntry {
  const total = Object.values(newRewards).reduce((sum, v) => sum + v, 0);
  return {
    timestamp: new Date().toISOString(),
    beneficiaries: { ...newRewards },
    comment_url: commentUrl,
    payment_mode: paymentMode,
    total_distributed: Math.round(total * 100) / 100,
  };
}

/**
 * Summarise a DifferentialResult as a human-readable string for GitHub comments.
 */
export function differentialToComment(result: DifferentialResult): string {
  const lines: string[] = [];
  lines.push("## 💰 Differential Reward Distribution\n");

  if (!result.is_reopened) {
    lines.push("_(Initial distribution — full amounts listed below.)_\n");
  } else {
    lines.push("_(Issue was previously distributed; only **additional** amounts are being paid out.)_\n");
  }

  if (Object.keys(result.positive_differences).length > 0) {
    lines.push("### ➕ Additional Rewards (Positive Differences)\n");
    for (const [user, amount] of Object.entries(result.positive_differences)) {
      lines.push(`- @${user}: +$${amount.toFixed(2)}`);
    }
    lines.push("");
  }

  if (Object.keys(result.negative_differences).length > 0) {
    lines.push("### ➖ Reward Reductions (Informational)\n");
    for (const [user, amount] of Object.entries(result.negative_differences)) {
      lines.push(`- @${user}: -$${amount.toFixed(2)}`);
    }
    lines.push("");
  }

  if (result.unchanged.length > 0) {
    lines.push("### ➖ Unchanged\n");
    for (const user of result.unchanged) {
      const amt = result.new_totals[user];
      lines.push(`- @${user}: $${amt.toFixed(2)} (no change)`);
    }
    lines.push("");
  }

  lines.push("### 📊 Totals\n");
  for (const [user, total] of Object.entries(result.new_totals)) {
    const prev = result.previous_totals[user];
    const diff = (result.positive_differences[user] ?? 0) - (result.negative_differences[user] ?? 0);
    if (prev !== undefined && prev !== total) {
      lines.push(`- @${user}: $${total.toFixed(2)} (was $${prev.toFixed(2)}, Δ${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`);
    } else {
      lines.push(`- @${user}: $${total.toFixed(2)}`);
    }
  }

  return lines.join("\n");
}
