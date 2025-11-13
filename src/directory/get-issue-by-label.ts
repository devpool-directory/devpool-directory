import { GitHubIssue, GitHubLabel } from "./directory";

export function getIssueByLabel(issues: GitHubIssue[], label: string): GitHubIssue | null {
  return issues.find(issue => issue.labels.some(l => typeof l === 'object' && l.name === label)) || null;
}
