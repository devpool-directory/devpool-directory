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
    }
  }

  const issues = mergeIssues(issueChunks);
  const prs = mergePRs(prChunks);
  const mirror = mergeMirrorState(mirrorChunks);
  const stats = computeStatistics(issues, mirror);
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

  // Merge twitter deltas (support both record form and {creates,deletes})
  const twitterMap: Record<string, string> = {};
  for (const d of twitterDeltas) {
    if (d && typeof d === "object") {
      if (d.creates || d.deletes) {
        Object.assign(twitterMap, d.creates ?? {});
        for (const id of d.deletes ?? []) delete twitterMap[id];
      } else {
        Object.assign(twitterMap, d);
      }
    }
  }

  // Write local build outputs for debugging
  const outDir = path.join(process.cwd(), "out-agg");
  writeJson(outDir, "partner-open-issues.json", issues);
  writeJson(outDir, "partner-pull-requests.json", prs);
  writeJson(outDir, "owners-avatars.json", owners);
  writeJson(outDir, "mirror-state.json", mirror);
  writeJson(outDir, "statistics.json", stats);
  writeJson(outDir, "sync-metadata.json", syncMeta);
  writeJson(outDir, "twitter-map.json", twitterMap);
  writeJson(outDir, "index.json", index);

  if (process.env.DRY_RUN === "true") {
    return;
  }

  // Commit to data branch
  const octokit = getOctokit();
  const owner = process.env.DIRECTORY_OWNER ?? "";
  const repo = process.env.DIRECTORY_REPO ?? "";
  const branch = process.env.DATA_BRANCH ?? "__STORAGE__";

  await ensureBranch(octokit, owner, repo, branch);
  await commitChanges(octokit, owner, repo, branch, "sync: update artifacts", [
    { path: "partner-open-issues.json", content: JSON.stringify(issues) },
    { path: "partner-pull-requests.json", content: JSON.stringify(prs) },
    { path: "owners-avatars.json", content: JSON.stringify(owners) },
    { path: "mirror-state.json", content: JSON.stringify(mirror) },
    { path: "statistics.json", content: JSON.stringify(stats) },
    { path: "sync-metadata.json", content: JSON.stringify(syncMeta) },
    { path: "twitter-map.json", content: JSON.stringify(twitterMap) },
    { path: "index.json", content: JSON.stringify(index) }
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
