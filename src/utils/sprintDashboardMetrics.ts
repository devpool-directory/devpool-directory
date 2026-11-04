export interface SprintIssueRecord {
  id: number;
  state: "open" | "closed";
  priceUsd: number;
  assignee?: string | null;
  createdAtIso: string;
  closedAtIso?: string | null;
}

export interface SprintSummaryMetrics {
  totalIssues: number;
  completedIssues: number;
  completionRatePct: number;
  totalBudgetUsd: number;
  earnedBudgetUsd: number;
  averageCycleTimeHours: number;
}

export function aggregateSprintMetrics(issues: SprintIssueRecord[]): SprintSummaryMetrics {
  const totalIssues = issues.length;
  if (totalIssues === 0) {
    return {
      totalIssues: 0,
      completedIssues: 0,
      completionRatePct: 0,
      totalBudgetUsd: 0,
      earnedBudgetUsd: 0,
      averageCycleTimeHours: 0,
    };
  }

  let completedIssues = 0;
  let totalBudgetUsd = 0;
  let earnedBudgetUsd = 0;
  const cycleHours: number[] = [];

  for (const iss of issues) {
    totalBudgetUsd += iss.priceUsd || 0;
    if (iss.state === "closed") {
      completedIssues += 1;
      earnedBudgetUsd += iss.priceUsd || 0;
      if (iss.closedAtIso) {
        const dt =
          (new Date(iss.closedAtIso).getTime() - new Date(iss.createdAtIso).getTime()) /
          3_600_000;
        if (dt >= 0) cycleHours.push(dt);
      }
    }
  }

  const avgCycle =
    cycleHours.length > 0
      ? cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length
      : 0;

  return {
    totalIssues,
    completedIssues,
    completionRatePct: Number(((completedIssues / totalIssues) * 100).toFixed(2)),
    totalBudgetUsd,
    earnedBudgetUsd,
    averageCycleTimeHours: Number(avgCycle.toFixed(2)),
  };
}
