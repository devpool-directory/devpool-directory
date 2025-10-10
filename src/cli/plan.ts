#!/usr/bin/env -S node --enable-source-maps
import { getOctokit, getRateRemaining } from "../github/client.js";
import { loadConfig } from "../config/load.js";
import { discoverRepos } from "../discovery.js";

type Repo = string; // "owner/repo"

function fastHash(str: string): number {
  // djb2 variant
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

async function tryLoadJsonFromStorage<T = any>(octokit: any, owner: string, repo: string, path: string, ref: string): Promise<T | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    return JSON.parse(content || "null");
  } catch {
    return null;
  }
}

function getRepoContext(): { owner: string; repo: string } | null {
  const ctx = process.env.GITHUB_REPOSITORY;
  if (!ctx) return null;
  const [owner, repo] = ctx.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function greedyBalanceShards(repos: Repo[], weights: Map<Repo, number>, K: number) {
  const items = repos.map((r) => ({ repo: r, w: weights.get(r) ?? 1 })).sort((a, b) => b.w - a.w);
  const shards: Array<{ shard_id: number; repos: string[]; sum: number }> = Array.from({ length: K }, (_, i) => ({ shard_id: i, repos: [], sum: 0 }));
  for (const it of items) {
    let best = 0;
    for (let i = 1; i < shards.length; i++) if (shards[i].sum < shards[best].sum) best = i;
    shards[best].repos.push(it.repo);
    shards[best].sum += it.w;
  }
  return shards.map(({ shard_id, repos }) => ({ shard_id, repos }));
}

// Plan: discover repos, compute simple weights from prior artifacts, balance shards greedily
async function main() {
  const cfg = loadConfig();
  const octokit = getOctokit();
  const remaining = await getRateRemaining(octokit);
  const repos = await discoverRepos(octokit, cfg);
  const K = Math.max(1, Math.min(cfg.max_shards, repos.length || 1));

  // Build simple weights from prior artifacts to spread heavy repos across shards
  const ctx = getRepoContext();
  const weights = new Map<Repo, number>();
  for (const r of repos) weights.set(r, 1); // base weight
  if (ctx) {
    const branch = cfg.data_branch || "__STORAGE__";
    const openPriced = await tryLoadJsonFromStorage<any[]>(octokit, ctx.owner, ctx.repo, "partner-open-issues.json", branch);
    if (Array.isArray(openPriced)) {
      // Count open+priced per repo
      for (const it of openPriced) {
        const key = `${it.owner}/${it.repo}`;
        if (!weights.has(key)) continue;
        weights.set(key, (weights.get(key) ?? 1) + 1);
      }
    }
  }

  const shards = greedyBalanceShards(repos, weights, K);

  // Conservative cap. For now, keep simple and reliable: cap by shards and 256
  const maxParallel = Math.min(256, K);

  const plan = { matrix: { include: shards }, maxParallel };
  process.stdout.write(JSON.stringify(plan, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
