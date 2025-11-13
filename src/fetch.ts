import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
import type { PartnerIssue, PartnerPullRequest } from "./artifacts/types";

const limit = pLimit(6);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withBackoff<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    const reset = Number(e?.response?.headers?.["x-ratelimit-reset"]) || 0;
    const retryAfter = Number(e?.response?.headers?.["retry-after"]) || 0;
    if (status === 403 || status === 429) {
      const nowSec = Math.floor(Date.now() / 1000);
      const untilResetMs = reset > nowSec ? (reset - nowSec) * 1000 : 0;
      const base = Math.min(30000, 2000 * Math.pow(2, attempt));
      const wait = Math.max(base, retryAfter * 1000, untilResetMs);
      await sleep(Math.min(wait, 60000));
      return withBackoff(fn, Math.min(attempt + 1, 5));
    }
    throw e;
  }
}

export async function fetchIssuesForRepo(octokit: Octokit, full: string, sinceISO?: string): Promise<PartnerIssue[]> {
  const [owner, repo] = full.split("/");
  const params: any = { owner, repo, state: "all", per_page: 100 };
  if (sinceISO) params.since = sinceISO;
  let raw: any[];
  try {
    raw = await withBackoff(() => octokit.paginate((octokit as any).issues.listForRepo, params));
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    if ((status === 401 || status === 404) && (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)) {
      // Fallback to anonymous for public repos if token is bad/mis-scoped
      const anon = new Octokit();
      raw = await withBackoff(() => anon.paginate((anon as any).issues.listForRepo, params));
    } else {
      throw e;
    }
  }

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
  let raw: any[];
  try {
    raw = await withBackoff(() => octokit.paginate((octokit as any).pulls.list, { owner, repo, state: "all", per_page: 100 }));
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    if ((status === 401 || status === 404) && (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)) {
      const anon = new Octokit();
      raw = await withBackoff(() => anon.paginate((anon as any).pulls.list, { owner, repo, state: "all", per_page: 100 }));
    } else {
      throw e;
    }
  }
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
