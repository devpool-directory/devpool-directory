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
    // Pre-create de-duplication: search for an existing mirror whose body exactly matches the partner URL
    try {
      const url = partnerIssue.html_url;
      const urlWww = url.replace("https://github.com/", "https://www.github.com/");
      const q = `repo:${directory.owner}/${directory.repo} in:body is:issue ${JSON.stringify(url)}`;
      const res = await (octokit as any).rest.search.issuesAndPullRequests({ q, per_page: 20 });
      const candidates = (res.data.items || []).filter((it: any) =>
        typeof it.body === "string" && (it.body.trim() === url || it.body.trim() === urlWww)
      );
      if (candidates.length) {
        // Pick the oldest (smallest number)
        candidates.sort((a: any, b: any) => a.number - b.number);
        const pick = candidates[0];
        return { number: pick.number, url: pick.html_url };
      }
    } catch {
      // best-effort; proceed to create
    }
    if (dry) return { number: -1, url: "" };
    const { data } = await (octokit as any).rest.issues.create({ ...common });
    return { number: data.number, url: data.html_url ?? "" };
  }

  if (!dry) {
    await (octokit as any).rest.issues.update({ ...common, issue_number: existing.number, state: partnerIssue.state });
  }
  return existing;
}
