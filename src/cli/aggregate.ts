#!/usr/bin/env -S node --enable-source-maps
import fs from "fs";
import path from "path";
import { mergeIssues, mergeMirrorState, mergePRs, computeStatistics } from "../artifacts/merge.js";
import { writeJson } from "../artifacts/write.js";
import { Octokit } from "@octokit/rest";
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
  // Restrict published issues file to open + priced items only (initial set; will recompute from issues-map below)
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
  // Add counts that reflect all closed issues (priced or not) to better match
  // historical totals displayed in the UI.
  // Use the persistent issues map (allIssues) for a comprehensive count across runs.
  // NOTE: This complements tasksCompletedPriced (priced subset) without changing
  // existing fields used by current consumers.
  // Merge owners with prior artifact to retain avatars when a shard sees none
  // Use the GitHub App token for reads/writes to the data branch
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.DIRECTORY_OWNER ?? "";
  const repo = process.env.DIRECTORY_REPO ?? "";
  const branch = process.env.DATA_BRANCH ?? "__STORAGE__";

  const ownersMap: Record<string, { owner: string; type: "User" | "Organization"; avatar_url: string }> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "owners-avatars.json", ref: branch });
    const prev = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf8"));
    for (const o of prev) ownersMap[o.owner] = o;
  } catch {}
  for (const chunk of ownerChunks) for (const o of chunk) ownersMap[o.owner] = o;
  const owners = Object.values(ownersMap).sort((a, b) => a.owner.localeCompare(b.owner));

  const syncMeta = { perRepo: {} as Record<string, any> };
  for (const ch of syncChunks) Object.assign(syncMeta.perRepo, ch?.perRepo ?? ch);

  // Load and update issues map (persistent), then compute open+priced from the full map
  let issuesMap: Record<string, any> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "issues-map.json", ref: branch });
    issuesMap = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf8"));
  } catch { issuesMap = {}; }
  for (const it of issues) issuesMap[it.node_id] = it;
  const allIssues: any[] = Object.values(issuesMap);
  const issuesOpenPricedFromMap = allIssues.filter((i) => i.state === "open" && (i.labels || []).some((l: string) => /^Price:\s*/.test(String(l))));
  // Open issues without an explicit Price label (proposals)
  const issuesOpenUnpricedFromMap = allIssues.filter(
    (i) => i.state === "open" && !((i.labels || []).some((l: string) => /^Price:\s*/.test(String(l))))
  );

  // Compute additional aggregate helpers for UI rendering
  const closedAllCount = allIssues.filter((i) => i.state === "closed").length;
  const projectsOpenPriced = new Set(issuesOpenPricedFromMap.map((i) => `${i.owner}/${i.repo}`)).size;
  const projectsAny = new Set(allIssues.map((i) => `${i.owner}/${i.repo}`)).size;
  const projectsClosedAny = new Set(allIssues.filter((i) => i.state === "closed").map((i) => `${i.owner}/${i.repo}`)).size;
  (stats as any).lifetime.tasksCompletedAll = closedAllCount;
  (stats as any).projects = {
    openPriced: projectsOpenPriced,
    any: projectsAny,
    closedAny: projectsClosedAny
  };
  // Convenience breakdown for open+priced
  (stats as any).breakdown = {
    openPricedUSD: (stats as any).rewards.total,
    openPricedCount: issuesOpenPricedFromMap.length,
    availableUSD: (stats as any).rewards.notAssigned,
    availableCount: (stats as any).tasks.notAssigned,
    ongoingUSD: (stats as any).rewards.assigned,
    ongoingCount: (stats as any).tasks.assigned
  };

  // Merge mirror-state with prior artifact to avoid dropping entries when a shard sees no changes
  let mirrorPrev: Record<string, any> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "mirror-state.json", ref: branch });
    mirrorPrev = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf8"));
  } catch {}
  const mirrorMerged = Object.assign({}, mirrorPrev, mirror);

  // Build index from merged mirror state
  const index: Record<string, { number: number; url: string }> = {};
  for (const [node, e] of Object.entries(mirrorMerged)) {
    if (e.directory_issue_number && e.directory_issue_url) index[node] = { number: e.directory_issue_number, url: e.directory_issue_url };
  }

  // Seed twitter map from existing artifact on data branch, then merge deltas

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
  const prevLifetime = (stats as any).lifetime || {};
  (stats as any).lifetime = { ...prevLifetime, rewardsCompletedUSD, tasksCompletedPriced };

  // Write local build outputs for debugging
  const outDir = path.join(process.cwd(), "out-agg");
  writeJson(outDir, "partner-open-issues.json", issuesOpenPricedFromMap);
  writeJson(outDir, "partner-open-proposals.json", issuesOpenUnpricedFromMap);
  writeJson(outDir, "partner-pull-requests.json", prs);
  writeJson(outDir, "owners-avatars.json", owners);
  writeJson(outDir, "mirror-state.json", mirrorMerged);
  writeJson(outDir, "statistics.json", stats);
  writeJson(outDir, "sync-metadata.json", syncMeta);
  writeJson(outDir, "twitter-map.json", twitterMap);
  writeJson(outDir, "index.json", index);
  writeJson(outDir, "issues-map.json", issuesMap);
  writeJson(outDir, "lifetime-map.json", lifetimeMap);

  // Generate a concise README for the data branch (__STORAGE__) to help integrators
  const storageReadme = `# DevPool Directory — Data Branch (__STORAGE__)

This branch is an artifacts-only branch for UIs and services. Files are updated atomically per run.

How to fetch (Contents API):
- GET /repos/{owner}/{repo}/contents/{path}?ref=__STORAGE__
- Use ETag/If-None-Match to avoid re-downloading unchanged files.
- Poll summary.json first; if unchanged, skip other reads.

Primary artifacts:
- partner-open-issues.json — Open + priced partner issues (Price: label).
- partner-open-proposals.json — Open partner issues without Price: ("proposals").
- mirror-state.json — node_id -> mirror linkage + assignment flags.
- index.json — node_id -> { number, url } for directory issues.
- statistics.json — Aggregate counts + lifetime rollups.
- owners-avatars.json — { owner, type, avatar_url }[] for badges.
- partner-pull-requests.json — Partner PRs (state=all).
- twitter-map.json — node_id -> tweetId.
- issues-map.json — Persistent map of all known issues (state=all). Large.
- lifetime-map.json — node_id -> closed priced amount (for totals).
- sync-metadata.json — Per-repo since/etag hints.
- summary.json — Run summary and list of committed files.

Notes:
- Price label standard is "Price:" only. The legacy "Pricing:" prefix is deprecated and treated as unpriced.
- Array order is not guaranteed; sort client-side as needed.
- Identity key is GitHub GraphQL node_id.
`;
  try { fs.writeFileSync(path.join(outDir, "README.md"), storageReadme); } catch {}

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
    issuesOpenUnpriced: issuesOpenUnpricedFromMap.length,
    issuesClosed,
    prs: prs.length,
    mirrors: Object.keys(mirror).length,
    owners: owners.length,
    tweetsCreated,
    tweetsDeleted,
    committedFiles: [
      "partner-open-issues.json",
      "partner-open-proposals.json",
      "partner-pull-requests.json",
      "owners-avatars.json",
      "mirror-state.json",
      "statistics.json",
      "sync-metadata.json",
      "twitter-map.json",
      "index.json",
      "summary.json",
      "README.md"
    ]
  };
  writeJson(outDir, "summary.json", summary);

  if (process.env.DRY_RUN === "true") return;

  await ensureBranch(octokit, owner, repo, branch);
  await commitChanges(octokit, owner, repo, branch, "sync: update artifacts", [
    { path: "partner-open-issues.json", content: JSON.stringify(issuesOpenPricedFromMap) },
    { path: "partner-open-proposals.json", content: JSON.stringify(issuesOpenUnpricedFromMap) },
    { path: "partner-pull-requests.json", content: JSON.stringify(prs) },
    { path: "owners-avatars.json", content: JSON.stringify(owners) },
    { path: "mirror-state.json", content: JSON.stringify(mirrorMerged) },
    { path: "statistics.json", content: JSON.stringify(stats) },
    { path: "sync-metadata.json", content: JSON.stringify(syncMeta) },
    { path: "twitter-map.json", content: JSON.stringify(twitterMap) },
    { path: "index.json", content: JSON.stringify(index) },
    { path: "summary.json", content: JSON.stringify(summary) },
    { path: "lifetime-map.json", content: JSON.stringify(lifetimeMap) },
    { path: "issues-map.json", content: JSON.stringify(issuesMap) },
    { path: "README.md", content: storageReadme }
  ]);

  // Record last-run watermark for next sync planning
  const lastRun = {
    lastRunISO: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID,
    sha: process.env.GITHUB_SHA
  };
  await commitChanges(octokit, owner, repo, branch, "sync: record last run", [
    { path: "last-run.json", content: JSON.stringify(lastRun) }
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
