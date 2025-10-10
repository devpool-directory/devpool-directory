import { GitHubIssue, GitHubLabel } from "../directory/directory";

export type DesiredItem = {
  node_id: string;
  text: string;
  issue_url: string;
  title: string;
  updated_at?: string;
};

export function buildDesiredSet(
  issues: GitHubIssue[],
  opts?: { includeAssigned?: boolean }
): Map<string, DesiredItem> {
  const includeAssigned = Boolean(opts?.includeAssigned);
  const map = new Map<string, DesiredItem>();
  for (const issue of issues) {
    try {
      // open only
      if ((issue as any).state && (issue as any).state !== "open") continue;
      const rawLabels = ((issue as any).labels || []) as Array<string | GitHubLabel>;
      const labelNames = rawLabels.map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean) as string[];
      const priceName = labelNames.find((name) => /^(Price:|Pricing:)\s*/.test(name));
      const priceLabel = priceName ? ({ name: priceName } as GitHubLabel) : undefined;
      if (!priceLabel) continue;
      const assigned = Array.isArray((issue as any).assignees) && (issue as any).assignees.length > 0;
      if (!includeAssigned && assigned) continue;
      const amount = extractAmount(priceLabel.name as unknown as string);
      if (!amount) continue;
      const timeName = labelNames.find((name) => name.startsWith("Time:"));
      const timeText = timeName ? timeName.replace(/^Time:\s*/, "").trim() : "this task";
      const issueUrl = (issue as any).html_url || (issue as any).url || "";
      const text = `${amount} for ${timeText}\n\n${(issue as any).title}\n${issueUrl}`;
      const nodeId = (issue as any).node_id as string;
      if (!nodeId) continue;
      map.set(nodeId, {
        node_id: nodeId,
        text,
        issue_url: issueUrl,
        title: (issue as any).title as string,
        updated_at: (issue as any).updated_at,
      });
    } catch {
      continue;
    }
  }
  return map;
}

export function extractAmount(label: string): string | null {
  // Accept things like: "Price: $1,200 USD" or "Pricing: 500 USD"; we extract first integer amount.
  const m = label.match(/([0-9][0-9,]*)/);
  if (!m) return null;
  const raw = m[1].replace(/,/g, "");
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n}`;
}
