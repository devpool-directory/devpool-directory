#!/usr/bin/env -S node --enable-source-maps
import { getOctokitRead, getRateRemaining } from "../github/client.js";
import { loadConfig } from "../config/load.js";
import { discoverRepos } from "../discovery.js";
import fs from "fs";
import path from "path";

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
  const octokit = getOctokitRead();
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

  // Build auditable summary and write alongside plan; log a concise line to stderr
  const shardSums = shards.map((s) => ({
    shard_id: s.shard_id,
    repoCount: s.repos.length,
    weightSum: s.repos.reduce((acc, r) => acc + (weights.get(r) ?? 1), 0)
  }));
  const totalWeight = shardSums.reduce((a, b) => a + b.weightSum, 0);
  const minSum = shardSums.length ? Math.min(...shardSums.map((x) => x.weightSum)) : 0;
  const maxSum = shardSums.length ? Math.max(...shardSums.map((x) => x.weightSum)) : 0;
  const avgSum = shardSums.length ? totalWeight / shardSums.length : 0;
  const summary = {
    repos: repos.length,
    shards: K,
    maxParallel,
    totalWeight,
    minShardWeight: minSum,
    maxShardWeight: maxSum,
    avgShardWeight: Number(avgSum.toFixed(2)),
    perShard: shardSums
  };
  try {
    fs.writeFileSync(path.join(process.cwd(), "plan-summary.json"), JSON.stringify(summary, null, 2));
  } catch {}
  console.error(
    `Plan: repos=${summary.repos} shards=${summary.shards} maxParallel=${summary.maxParallel} ` +
      `weight[min=${summary.minShardWeight}, max=${summary.maxShardWeight}, avg=${summary.avgShardWeight}]`
  );

  process.stdout.write(JSON.stringify(plan, null, 2));

  // Also fetch last-run.json from data branch for shards to use as a global watermark
  if (ctx) {
    const branch = cfg.data_branch || "__STORAGE__";
    const lastRun = await tryLoadJsonFromStorage<any>(octokit, ctx.owner, ctx.repo, "last-run.json", branch);
    if (lastRun) {
      try { fs.writeFileSync(path.join(process.cwd(), "last-run.json"), JSON.stringify(lastRun)); } catch {}
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
