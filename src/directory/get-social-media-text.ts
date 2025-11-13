import { GitHubIssue } from "./directory";

export function getSocialMediaText(issue: GitHubIssue): string {
  const priceLabel = issue.labels.find(label =>
    typeof label === 'object' && 'name' in label && typeof label.name === 'string' && label.name.startsWith("Price:")
  );
  const timeLabel = issue.labels.find(label =>
    typeof label === 'object' && 'name' in label && typeof label.name === 'string' && label.name.startsWith("Time:")
  );

  if (priceLabel && timeLabel && typeof priceLabel === 'object' && 'name' in priceLabel && typeof priceLabel.name === 'string' &&
      typeof timeLabel === 'object' && 'name' in timeLabel && typeof timeLabel.name === 'string') {
    const price = priceLabel.name.replace(/^Price:\s*/, "");
    const time = timeLabel.name.replace(/^Time:\s*/, "");
    return `${price} for ${time}\n\n${issue.html_url}`;
  }

  return `Check out this issue: ${issue.title} - ${issue.html_url}`;
}
