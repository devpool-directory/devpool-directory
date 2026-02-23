import type { MirrorStateEntry, PartnerIssue } from "./types";

export function computeMirrorStateEntry(issue: PartnerIssue, directory: { number?: number; url?: string } | null, category?: string, previouslyCompleted?: boolean): MirrorStateEntry {
  const price = issue.labels.find((l) => /^Price:/.test(l)) ?? null;
  const time = issue.labels.find((l) => l.startsWith("Time:")) ?? null;
  return {
    directory_issue_number: directory?.number,
    directory_issue_url: directory?.url,
    assigned: issue.assignees.length > 0,
    assignees: issue.assignees,
    price_label: price,
    time_label: time,
    category,
    ...(previouslyCompleted ? { previously_completed: true } : {}),
  };
}
