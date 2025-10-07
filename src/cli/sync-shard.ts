#!/usr/bin/env -S node --enable-source-maps
import { getOctokit } from "../github/client.js";
import { syncShard } from "../mirror/sync.js";
import { writeJson } from "../artifacts/write.js";
import fs from "fs";

async function main() {
  const shardArg = process.argv.find((a) => a === "--shard");
  const shardId = shardArg ? Number(process.argv[process.argv.indexOf(shardArg) + 1]) : 0;
  const outDir = `out`;

  const directoryOwner = process.env.DIRECTORY_OWNER ?? "";
  const directoryRepo = process.env.DIRECTORY_REPO ?? "";

  // Load plan.json (downloaded from artifacts in workflow)
  let repos: string[] = [];
  try {
    const plan = JSON.parse(fs.readFileSync("plan.json", "utf8"));
    const entry = (plan?.matrix?.include ?? []).find((e: any) => e.shard_id === shardId);
    if (entry?.repos) repos = entry.repos as string[];
  } catch {}

  const octokit = getOctokit();
  const res = await syncShard(octokit, { repos, directoryOwner, directoryRepo });

  writeJson(outDir, `shard-${shardId}-issues.json`, res.issues);
  writeJson(outDir, `shard-${shardId}-prs.json`, res.prs);
  writeJson(outDir, `shard-${shardId}-mirror-state.json`, res.mirrorState);
  writeJson(outDir, `shard-${shardId}-owners.json`, res.owners);
  writeJson(outDir, `shard-${shardId}-twitter-delta.json`, res.twitterDelta);
  writeJson(outDir, `shard-${shardId}-sync-meta.json`, res.syncMeta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
