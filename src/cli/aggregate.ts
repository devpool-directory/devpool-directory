#!/usr/bin/env -S node --enable-source-maps
import fs from "fs";
import path from "path";
import { mergeIssues, mergeMirrorState, mergePRs, computeStatistics } from "../artifacts/merge.js";
import { writeJson } from "../artifacts/write.js";
import { getOctokit } from "../github/client.js";
import { ensureBranch, commitChanges } from "../storage/git.js";

async function main() {
  const shardsDir = path.join(process.cwd(), "shards");
  const shardDirs = fs.existsSync(shardsDir) ? fs.readdirSync(shardsDir) : [];

  const issueChunks: any[] = [];
  const prChunks: any[] = [];
  const mirrorChunks: any[] = [];
  const ownerChunks: any[] = [];
  const syncChunks: any[] = [];
  const twitterDeltas: any[] = [];
  let tweetsCreated = 0;
  let tweetsDeleted = 0;
  const shardIdSet = new Set<number>();

  for (const d of shardDirs) {
    const dir = path.join(shardsDir, d);
    if (!fs.lstatSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith("-issues.json")) issueChunks.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (f.endsWith("-prs.json")) prChunks.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (f.endsWith("-mirror-state.json")) mirrorChunks.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (f.endsWith("-owners.json")) ownerChunks.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (f.endsWith("-sync-meta.json")) syncChunks.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (f.endsWith("-twitter-delta.json")) twitterDeltas.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      const m = f.match(/^shard-(\d+)-/);
      if (m) shardIdSet.add(Number(m[1]));
    }
  }

  const issues = mergeIssues(issueChunks);
  const prs = mergePRs(prChunks);
  const mirror = mergeMirrorState(mirrorChunks);
  // Restrict published issues file to open + priced items only
  const issuesOpenPriced = issues.filter(
    (i) => i.state === "open" && (i.labels || []).some((l: string) => /^Price:\s*/.test(String(l)))
  );
  const stats = computeStatistics(issuesOpenPriced, mirror);
  // Lifetime (completed): compute over closed + priced to expose historical totals
  const issuesClosedPriced = issues.filter(
    (i) => i.state === "closed" && (i.labels || []).some((l: string) => /^Price:\s*/.test(String(l)))
  );
  const life = computeStatistics(issuesClosedPriced, mirror);
  (stats as any).lifetime = {
    rewardsCompletedUSD: life.rewards.completed,
    tasksCompletedPriced: life.tasks.completed
  };
  const ownersMap: Record<string, { owner: string; type: "User" | "Organization"; avatar_url: string }> = {};
  for (const chunk of ownerChunks) {
    for (const o of chunk) ownersMap[o.owner] = o;
  }
  const owners = Object.values(ownersMap).sort((a, b) => a.owner.localeCompare(b.owner));

  const syncMeta = { perRepo: {} as Record<string, any> };
  for (const ch of syncChunks) Object.assign(syncMeta.perRepo, ch?.perRepo ?? ch);

  // Build index from mirror state
  const index: Record<string, { number: number; url: string }> = {};
  for (const [node, e] of Object.entries(mirror)) {
    if (e.directory_issue_number && e.directory_issue_url) index[node] = { number: e.directory_issue_number, url: e.directory_issue_url };
  }

  // Seed twitter map from existing artifact on data branch, then merge deltas
  const octokit = getOctokit();
  const owner = process.env.DIRECTORY_OWNER ?? "";
  const repo = process.env.DIRECTORY_REPO ?? "";
  const branch = process.env.DATA_BRANCH ?? "__STORAGE__";

  let twitterMap: Record<string, string> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "twitter-map.json", ref: branch });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    twitterMap = JSON.parse(content || "{}");
  } catch {
    twitterMap = {};
  }
  for (const d of twitterDeltas) {
    if (d && typeof d === "object") {
      if (d.creates || d.deletes) {
        const creates = d.creates ?? {};
        const deletes = d.deletes ?? [];
        Object.assign(twitterMap, creates);
        for (const id of deletes) delete twitterMap[id];
        tweetsCreated += Object.keys(creates).length;
        tweetsDeleted += deletes.length;
      } else {
        Object.assign(twitterMap, d);
      }
    }
  }

  // Lifetime completed rollup (closed+priced) via persistent map
  // Load prior lifetime map (node_id -> amountUSD), update only changed issues, then sum
  let lifetimeMap: Record<string, number> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "lifetime-map.json", ref: branch });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    lifetimeMap = JSON.parse(content || "{}");
  } catch {
    lifetimeMap = {};
  }
  const parsePrice = (labels: string[]): number => {
    const raw = (labels || []).find((l: string) => /^Price:\s*/.test(String(l)));
    if (!raw) return 0;
    const n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };
  for (const it of issues) {
    if (it.state === "closed") {
      lifetimeMap[it.node_id] = parsePrice(it.labels);
    } else {
      // If reopened or price removed, clear
      lifetimeMap[it.node_id] = 0;
    }
  }
  const rewardsCompletedUSD = Object.values(lifetimeMap).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const tasksCompletedPriced = Object.values(lifetimeMap).filter((v) => (Number.isFinite(v) ? v : 0) > 0).length;
  (stats as any).lifetime = { rewardsCompletedUSD, tasksCompletedPriced };

  // Write local build outputs for debugging
  const outDir = path.join(process.cwd(), "out-agg");
  writeJson(outDir, "partner-open-issues.json", issuesOpenPriced);
  writeJson(outDir, "partner-pull-requests.json", prs);
  writeJson(outDir, "owners-avatars.json", owners);
  writeJson(outDir, "mirror-state.json", mirror);
  writeJson(outDir, "statistics.json", stats);
  writeJson(outDir, "sync-metadata.json", syncMeta);
  writeJson(outDir, "twitter-map.json", twitterMap);
  writeJson(outDir, "index.json", index);
  writeJson(outDir, "lifetime-map.json", lifetimeMap);

  // Build human-friendly summary
  const reposProcessed = Object.keys(syncMeta.perRepo || {}).length;
  const issuesOpen = issues.filter((i) => i.state === "open").length;
  const issuesClosed = issues.filter((i) => i.state === "closed").length;
  const issuesOpenPricedCount = issuesOpenPriced.length;
  const summary = {
    reposProcessed,
    shards: shardIdSet.size,
    issuesOpen,
    issuesOpenPriced: issuesOpenPricedCount,
    issuesClosed,
    prs: prs.length,
    mirrors: Object.keys(mirror).length,
    owners: owners.length,
    tweetsCreated,
    tweetsDeleted,
    committedFiles: [
      "partner-open-issues.json",
      "partner-pull-requests.json",
      "owners-avatars.json",
      "mirror-state.json",
      "statistics.json",
      "sync-metadata.json",
      "twitter-map.json",
      "index.json",
      "summary.json"
    ]
  };
  writeJson(outDir, "summary.json", summary);

  if (process.env.DRY_RUN === "true") return;

  await ensureBranch(octokit, owner, repo, branch);
  await commitChanges(octokit, owner, repo, branch, "sync: update artifacts", [
    { path: "partner-open-issues.json", content: JSON.stringify(issuesOpenPriced) },
    { path: "partner-pull-requests.json", content: JSON.stringify(prs) },
    { path: "owners-avatars.json", content: JSON.stringify(owners) },
    { path: "mirror-state.json", content: JSON.stringify(mirror) },
    { path: "statistics.json", content: JSON.stringify(stats) },
    { path: "sync-metadata.json", content: JSON.stringify(syncMeta) },
    { path: "twitter-map.json", content: JSON.stringify(twitterMap) },
    { path: "index.json", content: JSON.stringify(index) },
    { path: "summary.json", content: JSON.stringify(summary) },
    { path: "lifetime-map.json", content: JSON.stringify(lifetimeMap) }
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
