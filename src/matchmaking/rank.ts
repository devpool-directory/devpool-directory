import type { PartnerIssue } from "../artifacts/types";

export type DeveloperCompletedIssue = {
  title?: string | null;
  body?: string | null;
  labels?: string[] | null;
  url?: string | null;
};

export type MatchmakingCandidate = {
  issue: PartnerIssue;
  matchScore: number;
  priceUsd: number | null;
  matchedTerms: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "based",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function tokenize(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

function termFrequency(terms: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

function extractIssueTerms(issue: PartnerIssue): string[] {
  return [
    ...tokenize(issue.owner),
    ...tokenize(issue.repo),
    ...tokenize(issue.title),
    ...tokenize(issue.body),
    ...(issue.labels ?? []).flatMap((label) => tokenize(label.replace(/^Price:\s*[^,]+/iu, ""))),
  ];
}

function extractCompletedTerms(completedIssues: DeveloperCompletedIssue[]): string[] {
  return completedIssues.flatMap((issue) => [
    ...tokenize(issue.title),
    ...tokenize(issue.body),
    ...(issue.labels ?? []).flatMap((label) => tokenize(label)),
  ]);
}

export function parsePriceUsd(labels: string[]): number | null {
  const label = labels.find((entry) => /^Price:\s*/iu.test(entry));
  if (!label) {
    return null;
  }
  const amount = Number.parseInt(label.replace(/[^0-9]/gu, ""), 10);
  return Number.isFinite(amount) ? amount : null;
}

export function buildMatchmakingCandidates(
  issues: PartnerIssue[],
  completedIssues: DeveloperCompletedIssue[],
  options: { includeAssigned?: boolean } = {}
): MatchmakingCandidate[] {
  const completedTerms = termFrequency(extractCompletedTerms(completedIssues));
  const includeAssigned = options.includeAssigned ?? false;

  return issues
    .filter((issue) => issue.state === "open")
    .filter((issue) => includeAssigned || issue.assignees.length === 0)
    .map((issue) => {
      const issueTerms = new Set(extractIssueTerms(issue));
      const matchedTerms = Array.from(issueTerms)
        .filter((term) => completedTerms.has(term))
        .sort();
      const matchedWeight = matchedTerms.reduce((sum, term) => sum + (completedTerms.get(term) ?? 0), 0);
      const breadthBonus = matchedTerms.length / Math.max(issueTerms.size, 1);
      const matchScore = Number((matchedWeight + breadthBonus).toFixed(4));
      return {
        issue,
        matchScore,
        priceUsd: parsePriceUsd(issue.labels ?? []),
        matchedTerms,
      };
    })
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }
      return (right.priceUsd ?? 0) - (left.priceUsd ?? 0);
    });
}
