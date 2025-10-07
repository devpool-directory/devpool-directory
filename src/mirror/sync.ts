import type { Octokit } from "@octokit/rest";
import type { MirrorState, PartnerIssue } from "../artifacts/types.js";
import { fetchIssuesForRepo, fetchPRsForRepo, fetchOwnersAvatars } from "../fetch.js";
import { computeMirrorStateEntry } from "../artifacts/state.js";
import { reconcileMirror, type IndexMap } from "./reconcile.js";

export type SyncResult = {
  issues: PartnerIssue[];
  mirrorState: MirrorState;
  prs: any[]; // placeholder
  owners: Array<{ owner: string; type: "User" | "Organization"; avatar_url: string }>;
  twitterDelta: Record<string, string>; // node_id -> tweet_id
  syncMeta: any; // per-repo etags/since metadata
};

export async function syncShard(
  octokit: Octokit,
  opts: { repos: string[]; directoryOwner: string; directoryRepo: string }
): Promise<SyncResult> {
  const issues: PartnerIssue[] = [];
  const mirrorState: MirrorState = {};
  const prs: any[] = [];
  const ownersSet = new Set<string>();
  const twitterDelta: Record<string, string> = {};
  const syncMeta: Record<string, any> = {};

  const index: IndexMap = {}; // Optional: could be passed in via artifact; start empty for now
  const dryRun = process.env.DRY_RUN === "true";

  for (const full of opts.repos) {
    const [owner] = full.split("/");
    ownersSet.add(owner);

    const iss = await fetchIssuesForRepo(octokit, full);
    issues.push(...iss);

    for (const it of iss) {
      // Skip potential mirror issues to avoid recursion: body exactly a GitHub issue URL
      if (it.body && /^https?:\/\/(www\.)?github\.com\/[^\s]+\/issues\/\d+$/.test(it.body.trim())) {
        continue;
      }
      // Also skip if partner repo equals directory repo (self-mirroring not desired)
      if (`${it.owner}/${it.repo}` === `${opts.directoryOwner}/${opts.directoryRepo}`) {
        continue;
      }
      // Mirror creation/update (dry-run by default if DRY_RUN)
      let dir: { number?: number; url?: string } | null = null;
      try {
        const res = await reconcileMirror(
          octokit,
          { owner: opts.directoryOwner, repo: opts.directoryRepo },
          { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels },
          index,
          { dryRun }
        );
        dir = res;
        index[it.node_id] = { number: res.number!, url: res.url! };
      } catch {
        // ignore mirror errors in shard to keep processing
      }

      mirrorState[it.node_id] = computeMirrorStateEntry(it, dir, undefined);
    }

    const rawPrs = await fetchPRsForRepo(octokit, full);
    prs.push(...rawPrs);

    syncMeta[full] = { lastSyncISO: new Date().toISOString() };
  }

  const owners = await fetchOwnersAvatars(octokit, ownersSet);

  return { issues, mirrorState, prs, owners, twitterDelta, syncMeta };
}
