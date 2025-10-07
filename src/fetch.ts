import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
import type { PartnerIssue, PartnerPullRequest } from "./artifacts/types.js";

const limit = pLimit(6);

export async function fetchIssuesForRepo(octokit: Octokit, full: string): Promise<PartnerIssue[]> {
  const [owner, repo] = full.split("/");
  const raw = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100
  });

  const issues: PartnerIssue[] = [];
  for (const i of raw as any[]) {
    // Skip PRs
    if (i.pull_request) continue;
    // Skip not planned closures
    if (i.state === "closed" && i.state_reason === "not_planned") continue;

    issues.push({
      owner,
      repo,
      number: i.number,
      node_id: i.node_id,
      title: i.title ?? "",
      url: i.html_url ?? "",
      body: i.body ?? "",
      labels: (i.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name)).filter(Boolean),
      assignees: (i.assignees ?? []).map((a: any) => a.login).filter(Boolean),
      state: i.state === "open" ? "open" : "closed",
      created_at: i.created_at ?? new Date().toISOString(),
      updated_at: i.updated_at ?? new Date().toISOString()
    });
  }

  return issues;
}

export async function fetchPRsForRepo(octokit: Octokit, full: string): Promise<PartnerPullRequest[]> {
  const [owner, repo] = full.split("/");
  const raw = await octokit.paginate(octokit.pulls.list, { owner, repo, state: "all", per_page: 100 });
  return raw.map((pr) => ({
    owner,
    repo,
    number: pr.number,
    state: pr.state === "open" ? "open" : "closed",
    url: pr.html_url ?? "",
    title: pr.title ?? "",
    created_at: pr.created_at ?? new Date().toISOString(),
    updated_at: pr.updated_at ?? new Date().toISOString()
  }));
}

export async function fetchOwnersAvatars(octokit: Octokit, owners: Set<string>): Promise<Array<{ owner: string; type: "User" | "Organization"; avatar_url: string }>> {
  const out: Array<{ owner: string; type: "User" | "Organization"; avatar_url: string }> = [];
  const tasks = Array.from(owners).map((o) =>
    limit(async () => {
      try {
        const { data } = await octokit.users.getByUsername({ username: o });
        out.push({ owner: o, type: "User", avatar_url: data.avatar_url ?? "" });
      } catch {
        try {
          const { data } = await octokit.orgs.get({ org: o });
          out.push({ owner: o, type: "Organization", avatar_url: data.avatar_url ?? "" });
        } catch {
          // ignore
        }
      }
    })
  );
  await Promise.all(tasks);
  return out;
}
