#!/usr/bin/env -S node --enable-source-maps
import { getOctokitRead, getOctokitWrite } from "../github/client";
import { syncShard } from "../mirror/sync";
import { writeJson } from "../artifacts/write";
import fs from "node:fs";
import { getTwitterClient } from "../twitter/client";
import { postTweet, deleteTweet } from "../twitter/lifecycle";
import process from "node:process";

async function main() {
  const shardArgIndex = process.argv.indexOf("--shard");
  let shardId = 0;
  if (shardArgIndex !== -1) {
    const shardValue = process.argv[shardArgIndex + 1];
    if (shardValue === undefined || shardValue.startsWith("--") || isNaN(Number(shardValue))) {
      console.error("Error: --shard must be followed by a valid number.");
      process.exit(1);
    }
    shardId = Number(shardValue);
  }
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

  const octokitWrite = getOctokitWrite();
  const octokitRead = getOctokitRead();
  // Optional inputs provided by plan job
  const indexPath = "index.json";
  const twitterMapPath = "twitter-map.json";
  const lastRunPath = "last-run.json";
  const syncMetaInPath = "sync-metadata.json";

  function safeReadJson<T>(p: string, fallback: T): T {
    try {
      if (!fs.existsSync(p)) return fallback;
      const txt = fs.readFileSync(p, "utf8");
      if (!txt || !txt.trim()) return fallback;
      return JSON.parse(txt) as T;
    } catch {
      return fallback;
    }
  }

  const index = safeReadJson<Record<string, { number: number; url: string }>>(indexPath, {});
  const syncMetaIn = safeReadJson<{ perRepo: Record<string, { lastSyncISO?: string }> }>(syncMetaInPath, { perRepo: {} });
  const twitterMap = safeReadJson<Record<string, string>>(twitterMapPath, {});
  const lastRun = safeReadJson<{ lastRunISO?: string }>(lastRunPath, {});

  // Cold-start guard: if the persistent issues map is absent in the workspace,
  // force a full resync to bootstrap the dataset instead of doing incremental
  // "since" queries that can return nothing and keep artifacts empty.
  // Also allow manual override via FORCE_FULL_RESYNC=true.
  const issuesMapPath = "issues-map.json";
  const shouldForceFullResync = process.env.FORCE_FULL_RESYNC === "true" || !fs.existsSync(issuesMapPath);
  if (shouldForceFullResync) {
    process.env.FULL_RESYNC = "true";
    console.error("[sync-shard] Forcing FULL_RESYNC (missing issues-map.json or override enabled)");
  }

  const res = await syncShard(
    octokitWrite,
    { repos, directoryOwner, directoryRepo, index, prevSyncMeta: syncMetaIn.perRepo, octokitRead, ...(lastRun?.lastRunISO ? { globalSinceISO: lastRun.lastRunISO } : {}) }
  );

  // Twitter lifecycle: compute deltas using current state vs twitterMap
  const tweetOnCreate = process.env.TWEET_ON_CREATE !== "false";
  const deleteOnComplete = process.env.DELETE_TWEET_ON_COMPLETE !== "false";
  const dryRun = process.env.DRY_RUN === "true";
  const client = getTwitterClient();
  const creates: Record<string, string> = {};
  const deletes: string[] = [];

  for (const issue of res.issues) {
    const nodeId = issue.node_id;
    const priceLabel = issue.labels.find((l) => /^Price:/.test(l));
    const timeLabel = issue.labels.find((l) => l.startsWith("Time:"));
    const text = priceLabel ? `${priceLabel.replace(/^Price:\s*/, "")} for ${timeLabel?.replace(/^Time:\s*/, "") ?? "this task"}\n\n${issue.url}` : null;

    if (issue.state === "open" && tweetOnCreate && text && !twitterMap[nodeId]) {
      if (!dryRun) {
        const id = await postTweet(client, text);
        if (id) creates[nodeId] = id;
      }
    }
    if (issue.state === "closed" && deleteOnComplete && twitterMap[nodeId]) {
      if (!dryRun) {
        const ok = await deleteTweet(client, twitterMap[nodeId]);
        if (ok) deletes.push(nodeId);
      }
    }
  }

  writeJson(outDir, `shard-${shardId}-issues.json`, res.issues);
  writeJson(outDir, `shard-${shardId}-prs.json`, res.prs);
  writeJson(outDir, `shard-${shardId}-mirror-state.json`, res.mirrorState);
  writeJson(outDir, `shard-${shardId}-owners.json`, res.owners);
  // Prefer structured delta with creates/deletes
  const twitterDelta = Object.keys(creates).length || deletes.length ? { creates, deletes } : {};
  writeJson(outDir, `shard-${shardId}-twitter-delta.json`, twitterDelta);
  writeJson(outDir, `shard-${shardId}-sync-meta.json`, res.syncMeta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
