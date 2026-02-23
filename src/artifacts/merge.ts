import type { MirrorState, PartnerIssue, PartnerPullRequest, Statistics } from "./types";

export function mergeIssues(chunks: PartnerIssue[][]): PartnerIssue[] {
  const map = new Map<string, PartnerIssue>();
  for (const arr of chunks) {
    for (const i of arr) map.set(i.node_id, i);
  }
  return Array.from(map.values());
}

export function mergePRs(chunks: PartnerPullRequest[][]): PartnerPullRequest[] {
  const map = new Map<string, PartnerPullRequest>();
  for (const arr of chunks) {
    for (const pr of arr) map.set(`${pr.owner}/${pr.repo}#${pr.number}`, pr);
  }
  return Array.from(map.values());
}

export function mergeMirrorState(chunks: MirrorState[]): MirrorState {
  return Object.assign({}, ...chunks);
}

export function computeStatistics(issues: PartnerIssue[], mirror: MirrorState): Statistics {
  const rewards = { notAssigned: 0, assigned: 0, completed: 0, reopened: 0, total: 0 };
  const tasks = { notAssigned: 0, assigned: 0, completed: 0, reopened: 0, total: 0 };

  for (const issue of issues) {
    const m = mirror[issue.node_id];
    const priceLabel = m?.price_label ?? null;
    const price = priceLabel ? parseInt(priceLabel.replace(/[^0-9]/g, ""), 10) : NaN;
    const amount = Number.isFinite(price) ? price : 0;

    if (issue.state === "open") {
      if (m?.previously_completed) {
        const reopenedAmount = Math.floor(amount / 2);
        rewards.reopened += reopenedAmount;
        tasks.reopened++;
        rewards.total += reopenedAmount;
      } else if (m?.assigned) {
        rewards.assigned += amount;
        tasks.assigned++;
        rewards.total += amount;
      } else {
        rewards.notAssigned += amount;
        tasks.notAssigned++;
        rewards.total += amount;
      }
      tasks.total++;
    } else {
      rewards.completed += amount;
      tasks.completed++;
      tasks.total++;
      rewards.total += amount;
    }
  }

  return { rewards, tasks };
}
