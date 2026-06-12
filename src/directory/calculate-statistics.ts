import { GitHubIssue, GitHubLabel } from "./directory";

export async function calculateStatistics(issues: GitHubIssue[]): Promise<{ rewards: number; tasks: number }> {
  let rewards = 0;
  let tasks = issues.length;
  for (const issue of issues) {
    let price = NaN;

    // 1. Check labels
    const priceLabel = issue.labels.find((label): label is GitHubLabel => typeof label === 'object' && 'name' in label && (label as GitHubLabel).name?.startsWith('Price: '));
    if (priceLabel && priceLabel.name) {
      price = parseFloat(priceLabel.name.replace('Price: ', ''));
    }

    // 2. Check body if label price is missing
    if (isNaN(price) && issue.body) {
      const bodyMatch = issue.body.match(/(?:Price:\s*|\$)\s*(\d+(?:\.\d+)?)/i);
      if (bodyMatch) {
        price = parseFloat(bodyMatch[1]);
      }
    }

    if (!isNaN(price)) rewards += price;
  }
  return { rewards, tasks };
}
