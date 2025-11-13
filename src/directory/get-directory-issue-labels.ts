import { GitHubIssue } from "./directory";
import { getRepoCredentials } from "./get-repo-credentials";

export async function getDirectoryIssueLabelsFromPartnerIssue(partnerIssue: GitHubIssue): Promise<string[]> {
  const labels: string[] = [];

  // Derive id label
  labels.push(`id: ${partnerIssue.node_id}`);

  // Derive pricing label
  const priceLabel = partnerIssue.labels.find(label =>
    typeof label === 'object' && 'name' in label && typeof label.name === 'string' && label.name.startsWith("Price:")
  );
  if (priceLabel && typeof priceLabel === 'object' && 'name' in priceLabel && typeof priceLabel.name === 'string') {
    const priceValue = priceLabel.name.replace(/^Price:\s*/, "");
    labels.push(`Pricing: ${priceValue}`);
  } else {
    labels.push("Pricing: not set");
  }

  // Derive time label
  const timeLabel = partnerIssue.labels.find(label =>
    typeof label === 'object' && 'name' in label && typeof label.name === 'string' && label.name.startsWith("Time:")
  );
  if (timeLabel && typeof timeLabel === 'object' && 'name' in timeLabel && typeof timeLabel.name === 'string') {
    labels.push(timeLabel.name);
  }

  // Derive partner label
  const [owner, repo] = getRepoCredentials(partnerIssue.html_url);
  labels.push(`Partner: ${owner}/${repo}`);

  return labels;
}
