import { GitHubIssue, GitHubLabel } from "./directory";

const REOPENED_MULTIPLIER = 0.5; // Example multiplier for reopened issues

export async function calculateStatistics(issues: GitHubIssue[]): Promise<{ rewards: number; tasks: number }> {
  let rewards = 0;
  let tasks = issues.length;
  for (const issue of issues) {
    const priceLabel = issue.labels.find((label): label is GitHubLabel => typeof label === 'object' && 'name' in label && (label as GitHubLabel).name?.startsWith('Price: '));
    if (priceLabel && priceLabel.name) {
      let price = parseFloat(priceLabel.name.replace('Price: ', ''));
      if (!isNaN(price)) {
        const isReopened = issue.labels.some((label): label is GitHubLabel => typeof label === 'object' && 'name' in label && (label as GitHubLabel).name?.toLowerCase() === 'reopened');
        if (isReopened) {
          price *= REOPENED_MULTIPLIER;
        }
        rewards += price;
      }
    }
  }
  return { rewards, tasks };
}
