import { GitHubIssue, GitHubLabel } from "./directory";

export async function calculateStatistics(issues: GitHubIssue[]): Promise<{ rewards: number; tasks: number }> {
  let rewards = 0;
  let tasks = issues.length;
  for (const issue of issues) {
    // Parse price from labels or body if present
    const priceLabel = issue.labels.find((label): label is GitHubLabel => typeof label === 'object' && 'name' in label && (label as GitHubLabel).name?.startsWith('Price: '));
    if (priceLabel && priceLabel.name) {
      const price = parseFloat(priceLabel.name.replace('Price: ', ''));
      if (!isNaN(price)) rewards += price;
    }
  }
  return { rewards, tasks };
}
