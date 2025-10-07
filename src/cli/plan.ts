#!/usr/bin/env -S node --enable-source-maps
import { getOctokit, getRateRemaining } from "../github/client.js";
import { loadConfig } from "../config/load.js";
import { discoverRepos } from "../discovery.js";
import crypto from "crypto";

// Minimal plan scaffold: evenly distribute repos across shards
async function main() {
  const cfg = loadConfig();
  const octokit = getOctokit();
  const remaining = await getRateRemaining(octokit);

  const repos = await discoverRepos(octokit, cfg);
  const K = Math.max(1, Math.min(cfg.max_shards, repos.length || 1));

  const shards: Array<{ shard_id: number; repos: string[] }> = Array.from({ length: K }, (_, i) => ({ shard_id: i, repos: [] }));
  for (const r of repos) {
    const n = parseInt(crypto.createHash("sha1").update(r).digest("hex").slice(0, 8), 16);
    const idx = n % K;
    shards[idx].repos.push(r);
  }

  const estPerShard = Math.max(10, Math.ceil((repos.length || 1) / K) * 12);
  const maxParallel = Math.max(1, Math.min(K, Math.floor((remaining * 0.6) / estPerShard)));

  const plan = { matrix: { include: shards }, maxParallel };
  process.stdout.write(JSON.stringify(plan, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
