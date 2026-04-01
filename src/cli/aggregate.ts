#!/usr/bin/env -S node --enable-source-maps
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { mergeIssues, mergePRs, computeStatistics } from "../artifacts/merge";
import { writeJson } from "../artifacts/write";
import { computeDifferentialReward, buildRewardHistoryEntry, differentialToComment } from "../artifacts/differential";
import { Octokit } from "@octokit/rest";
import { ensureBranch, commitChanges } from "../storage/git";
import { computeMirrorStateEntry } from "../artifacts/state";
import { reconcileMirror } from "../mirror/reconcile";
import { getOctokitDelete } from "../github/client";

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
  // Derive a mirror-like state for statistics directly from issues to decouple from shard writes
  const mirrorForStats: Record<string, any> = {};
  for (const it of issues) mirrorForStats[it.node_id] = computeMirrorStateEntry(it, null, undefined);
  // Restrict published issues file to open + priced items only (initial set; will recompute from issues-map below)
  const issuesOpenPriced = issues.filter(
    (i) => i.state === "open" && (i.labels || []).some((l: string) => /^Price:\s*/.test(String(l)))
  );
  const stats = computeStatistics(issuesOpenPriced, mirrorForStats);
  // Lifetime (completed): compute over closed + priced to expose historical totals
  const issuesClosedPriced = issues.filter(
    (i) => i.state === "closed" && (i.labels || []).some((l: string) => /^Price:\s*/.test(String(l)))
  );
  const life = computeStatistics(issuesClosedPriced, mirrorForStats);
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
  const enforced = process.env.WRITE_TARGET_REPO;
  const target = `${owner}/${repo}`;
  if (enforced && enforced !== target) {
    throw new Error(`write-blocked: target ${target} != enforced ${enforced}`);
  }

  const ownersMap: Record<string, { owner: string; type: "User" | "Organization"; avatar_url: string }> = {};
  let duplicatesDeleted = 0;
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "owners-avatars.json", ref: branch });
    const prev = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf8"));
    for (const o of prev) ownersMap[o.owner] = o;
  } catch {
    // noop
  }
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

  // Single-writer reconciliation in aggregate: rebuild mirror-state and index deterministically
  let mirrorPrev: Record<string, any> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "mirror-state.json", ref: branch });
    mirrorPrev = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf8"));
  } catch {}
  const indexExisting: Record<string, { number: number; url: string }> = {};
  for (const [node, e] of Object.entries(mirrorPrev)) {
    if ((e as any).directory_issue_number && (e as any).directory_issue_url) indexExisting[node] = { number: (e as any).directory_issue_number, url: (e as any).directory_issue_url };
  }
  const indexBuilt: Record<string, { number: number; url: string }> = { ...indexExisting };
  const mirrorStateNew: Record<string, any> = {};
  const directory = { owner, repo } as const;
  const dry = process.env.DRY_RUN === "true";
  const okDelete = getOctokitDelete();
  for (const it of allIssues) {
    const isOpen = it.state === "open";
    const hasPrice = (it.labels || []).some((l: string) => /^Price:\s*/.test(String(l)));
    let dirRef: { number?: number; url?: string } | null = null;
    try {
      if (isOpen && hasPrice) {
        const res = await reconcileMirror((octokit as any), directory as any, { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels }, indexBuilt, { dryRun: dry });
        dirRef = res;
        indexBuilt[it.node_id] = { number: (res as any).number, url: (res as any).url } as any;
      } else if (!isOpen && indexBuilt[it.node_id]) {
        const res = await reconcileMirror((octokit as any), directory as any, { node_id: it.node_id, title: it.title, html_url: it.url, state: "closed", labels: it.labels }, indexBuilt, { dryRun: dry });
        dirRef = res;
      } else if (!hasPrice && indexBuilt[it.node_id]) {
        // Unpriced (open or closed): remove any existing mirror to preserve the
        // invariant that the directory mirrors only open + priced partner issues.
        try {
          // Fetch the directory issue to obtain its node_id for hard delete
          const dirIssueNum = indexBuilt[it.node_id].number;
          if (!dry && Number.isFinite(dirIssueNum)) {
            const { data: dirIssue } = await (octokit as any).issues.get({ owner, repo, issue_number: dirIssueNum });
            const nodeId = (dirIssue as any).node_id as string | undefined;
            if (nodeId) {
              try {
                await (okDelete as any).request("POST /graphql", {
                  query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }",
                  variables: { id: nodeId },
                });
                // Remove from in-memory index so later iterations do not reference it
                delete indexBuilt[it.node_id];
              } catch {
                // best-effort; do not fallback to close to avoid violating invariants
              }
            }
          } else {
            // Dry run: pretend it's removed from the index
            delete indexBuilt[it.node_id];
          }
        } catch {
          // ignore and continue
        }
      }
    } catch {
      // best-effort
    }
    mirrorStateNew[it.node_id] = computeMirrorStateEntry(it, dirRef, undefined);
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

  // Final safety: hard-delete duplicate mirrors by partner URL (keep the oldest issue number per URL).
  // Targeted search per URL, opt-in via FINAL_DEDUP=true to avoid rate-limit issues by default.
  if (process.env.FINAL_DEDUP === "true") {
    try {
      const candidateUrls = Array.from(new Set(issuesOpenPricedFromMap.map((i) => String(i.url))));
      for (const url of candidateUrls) {
        try {
          const urlWww = url.replace("https://github.com/", "https://www.github.com/");
          const q = `repo:${owner}/${repo} in:body is:issue ${JSON.stringify(url)}`;
          const res = await (octokit as any).search.issuesAndPullRequests({ q, per_page: 50 });
          const items = (res.data.items || []).filter((it: any) => {
            const b = String((it as any).body || "").trim();
            return b === url || b === urlWww;
          });
          if (items.length > 1) {
            const sorted = items.map((it: any) => ({ number: it.number, node_id: it.node_id })).sort((a: any, b: any) => a.number - b.number);
            for (const dup of sorted.slice(1)) {
              try {
                if (dup.node_id) {
                  await (okDelete as any).request("POST /graphql", {
                    query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }",
                    variables: { id: dup.node_id },
                  });
                } else {
                  await (octokit as any).issues.update({ owner, repo, issue_number: dup.number, state: "closed" });
                }
                duplicatesDeleted++;
              } catch {}
            }
          }
        } catch {}
      }
    } catch {}
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

  // ── Differential Reward Distribution ────────────────────────────────────────
  // Load prior reward history (node_id -> RewardHistoryEntry[]) for differential calc
  let rewardHistoryMap: Record<string, import("../artifacts/types").RewardHistoryEntry[]> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "reward-history-map.json", ref: branch });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    rewardHistoryMap = JSON.parse(content || "{}");
  } catch {
    rewardHistoryMap = {};
  }

  // Load prior differential map (node_id -> DifferentialResult) for audit
  let differentialMap: Record<string, import("../artifacts/types").DifferentialResult> = {};
  try {
    const { data } = await (octokit as any).repos.getContent({ owner, repo, path: "differential-map.json", ref: branch });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    differentialMap = JSON.parse(content || "{}");
  } catch {
    differentialMap = {};
  }

  // Per-issue new reward map derived from price label + assignees
  const getNewRewards = (it: any): Record<string, number> => {
    const price = parsePrice(it.labels);
    if (!price || !it.assignees || it.assignees.length === 0) return {};
    const share = Math.round((price / it.assignees.length) * 100) / 100;
    const rewards: Record<string, number> = {};
    for (const assignee of it.assignees) rewards[assignee] = share;
    return rewards;
  };

  const reopenEvents: string[] = [];
  for (const it of allIssues) {
    const history = rewardHistoryMap[it.node_id] ?? [];
    const newRewards = getNewRewards(it);

    if (it.state === "open" && history.length > 0) {
      // Potentially reopened: compute differential
      const result = computeDifferentialReward(it.node_id, newRewards, history);
      if (result.is_reopened) {
        differentialMap[it.node_id] = result;
        reopenEvents.push(it.node_id);
      }
    } else if (it.state === "closed" && Object.keys(newRewards).length > 0) {
      // Closed for the first time or again: append history entry (no differential needed)
      const entry = buildRewardHistoryEntry(newRewards);
      if (!rewardHistoryMap[it.node_id]) rewardHistoryMap[it.node_id] = [];
      rewardHistoryMap[it.node_id].push(entry);
      // Clear any stale differential for this issue
      delete differentialMap[it.node_id];
    }
  }

  // Log differential reopen events for observability
  if (reopenEvents.length > 0) {
    console.log(`[aggregate] Differential reward events detected for ${reopenEvents.length} reopened issues:`,
      reopenEvents.map((nid) => {
        const r = differentialMap[nid];
        return r ? `${nid} → ${JSON.stringify(r.positive_differences)}` : nid;
      })
    );
  }

  // Write local build outputs for debugging
  const outDir = path.join(process.cwd(), "out-agg");
  writeJson(outDir, "partner-open-issues.json", issuesOpenPricedFromMap);
  writeJson(outDir, "partner-open-proposals.json", issuesOpenUnpricedFromMap);
  writeJson(outDir, "partner-pull-requests.json", prs);
  writeJson(outDir, "owners-avatars.json", owners);
  writeJson(outDir, "mirror-state.json", mirrorStateNew);
  writeJson(outDir, "statistics.json", stats);
  writeJson(outDir, "sync-metadata.json", syncMeta);
  writeJson(outDir, "twitter-map.json", twitterMap);
  writeJson(outDir, "index.json", indexBuilt);
  writeJson(outDir, "issues-map.json", issuesMap);
  writeJson(outDir, "lifetime-map.json", lifetimeMap);
  writeJson(outDir, "differential-map.json", differentialMap);
  writeJson(outDir, "reward-history-map.json", rewardHistoryMap);

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
- differential-map.json — node_id -> DifferentialResult for reopened issues (positive differences only).
- reward-history-map.json — node_id -> RewardHistoryEntry[] chronologies for audit.
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
    mirrors: Object.keys(mirrorStateNew).length,
    owners: owners.length,
    tweetsCreated,
    tweetsDeleted,
    duplicatesDeleted,
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
      "README.md",
      "differential-map.json",
      "reward-history-map.json"
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
    { path: "mirror-state.json", content: JSON.stringify(mirrorStateNew) },
    { path: "statistics.json", content: JSON.stringify(stats) },
    { path: "sync-metadata.json", content: JSON.stringify(syncMeta) },
    { path: "twitter-map.json", content: JSON.stringify(twitterMap) },
    { path: "index.json", content: JSON.stringify(indexBuilt) },
    { path: "summary.json", content: JSON.stringify(summary) },
    { path: "lifetime-map.json", content: JSON.stringify(lifetimeMap) },
    { path: "issues-map.json", content: JSON.stringify(issuesMap) },
    { path: "differential-map.json", content: JSON.stringify(differentialMap) },
    { path: "reward-history-map.json", content: JSON.stringify(rewardHistoryMap) },
    { path: "README.md", content: storageReadme }
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
