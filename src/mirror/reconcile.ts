import type { Octokit } from "@octokit/rest";

export type IndexMap = Record<string, { number: number; url: string }>; // node_id -> directory issue

export async function reconcileMirror(
  octokit: Octokit,
  directory: { owner: string; repo: string },
  partnerIssue: { node_id: string; title: string; html_url: string; state: "open" | "closed"; labels: string[] },
  index: IndexMap,
  opts?: { dryRun?: boolean }
): Promise<{ number: number; url: string }> {
  const dry = Boolean(opts?.dryRun);
  const enforced = process.env.WRITE_TARGET_REPO;
  const target = `${directory.owner}/${directory.repo}`;
  if (enforced && enforced !== target) {
    throw new Error(`write-blocked: target ${target} != enforced ${enforced}`);
  }
  const existing = index[partnerIssue.node_id];
  const common = {
    owner: directory.owner,
    repo: directory.repo,
    title: partnerIssue.title,
    body: partnerIssue.html_url,
    labels: partnerIssue.labels
  } as const;

  if (!existing) {
    if (dry) return { number: -1, url: "" };
    const { data } = await (octokit as any).rest.issues.create({ ...common });
    return { number: data.number, url: data.html_url ?? "" };
  }

  if (!dry) {
    await (octokit as any).rest.issues.update({ ...common, issue_number: existing.number, state: partnerIssue.state });
  }
  return existing;
}
