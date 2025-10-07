#!/usr/bin/env -S node --enable-source-maps
import { getOctokit, getRateRemaining } from "../github/client.js";
import { loadConfig } from "../config/load.js";
import { discoverRepos } from "../discovery.js";

function fastHash(str: string): number {
  // djb2 variant
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

// Minimal plan scaffold: evenly distribute repos across shards
async function main() {
  const cfg = loadConfig();
  const octokit = getOctokit();
  const remaining = await getRateRemaining(octokit);

  const repos = await discoverRepos(octokit, cfg);
  const K = Math.max(1, Math.min(cfg.max_shards, repos.length || 1));

  const shards: Array<{ shard_id: number; repos: string[] }> = Array.from({ length: K }, (_, i) => ({ shard_id: i, repos: [] }));
  for (const r of repos) {
    const idx = fastHash(r) % K;
    shards[idx].repos.push(r);
  }

  // Max out to GitHub OSS default concurrency ceiling (256) but never exceed shard count
  const maxParallel = Math.min(256, K);

  const plan = { matrix: { include: shards }, maxParallel };
  process.stdout.write(JSON.stringify(plan, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
