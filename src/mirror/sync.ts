import type { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
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
  octokitWrite: Octokit,
  opts: { repos: string[]; directoryOwner: string; directoryRepo: string; index?: IndexMap; prevSyncMeta?: Record<string, { lastSyncISO?: string }>; octokitRead?: Octokit }
): Promise<SyncResult> {
  const issues: PartnerIssue[] = [];
  const mirrorState: MirrorState = {};
  const prs: any[] = [];
  const ownersSet = new Set<string>();
  const twitterDelta: Record<string, string> = {};
  const syncMeta: Record<string, any> = {};

  const index: IndexMap = opts.index ?? {};
  const dryRun = process.env.DRY_RUN === "true";

  const poolSize = Math.max(1, Number(process.env.SHARD_CONCURRENCY ?? "4"));
  const pool = pLimit(poolSize);

  const okRead = opts.octokitRead ?? octokitWrite;

  const tasks = opts.repos.map((full) =>
    pool(async () => {
      const [owner] = full.split("/");
      ownersSet.add(owner);

      let iss: PartnerIssue[] = [];
      try {
        const fullResync = process.env.FULL_RESYNC === "true";
        let since: string | undefined;
        if (!fullResync) {
          const prev = opts.prevSyncMeta?.[full]?.lastSyncISO;
          if (prev) {
            const fudgeMin = Math.max(0, Number(process.env.SYNC_SINCE_FUDGE_MINUTES ?? "5"));
            const t = new Date(prev).getTime();
            const sinceMs = isFinite(t) ? Math.max(0, t - fudgeMin * 60 * 1000) : Date.now();
            since = new Date(sinceMs).toISOString();
          }
        }
        iss = await fetchIssuesForRepo(okRead, full, since);
      } catch (e: any) {
        console.warn(`[sync] fetchIssues failed for ${full}: ${e?.status ?? e?.message ?? e}`);
        iss = [];
      }
      issues.push(...iss);

      for (const it of iss) {
        // Skip potential mirror issues to avoid recursion: body exactly a GitHub issue URL
        if (it.body && /^https?:\/\/(www\.)?github\.com\/[^\s]+\/issues\/\d+$/.test(it.body.trim())) {
          continue;
        }
        const hasPrice = it.labels.some((l) => /^(Price:|Pricing:)\s*/.test(l));
        const isOpen = it.state === "open";
        let dir: { number?: number; url?: string } | null = null;

        // Create/Update mirrors only for open + priced issues
        if (isOpen && hasPrice) {
          try {
            const res = await reconcileMirror(
              octokitWrite,
              { owner: opts.directoryOwner, repo: opts.directoryRepo },
              { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels },
              index,
              { dryRun }
            );
            dir = res;
            index[it.node_id] = { number: res.number!, url: res.url! };
          } catch (e) {
            console.warn(`[sync] mirror create/update failed for ${it.owner}/${it.repo}#${it.number}: ${e instanceof Error ? e.message : e}`);
          }
        } else if (!isOpen && index[it.node_id]) {
          // Close existing mirror when partner issue is closed
          try {
            const res = await reconcileMirror(
              octokitWrite,
              { owner: opts.directoryOwner, repo: opts.directoryRepo },
              { node_id: it.node_id, title: it.title, html_url: it.url, state: it.state, labels: it.labels },
              index,
              { dryRun }
            );
            dir = res;
          } catch (e) {
            console.warn(`[sync] mirror close failed for ${it.owner}/${it.repo}#${it.number}: ${e instanceof Error ? e.message : e}`);
          }
        }

        mirrorState[it.node_id] = computeMirrorStateEntry(it, dir, undefined);
      }

      try {
        const rawPrs = await fetchPRsForRepo(okRead, full);
        prs.push(...rawPrs);
      } catch (e: any) {
        console.warn(`[sync] fetchPRs failed for ${full}: ${e?.status ?? e?.message ?? e}`);
      }

      syncMeta[full] = { lastSyncISO: new Date().toISOString() };
    })
  );

  await Promise.all(tasks);

  const owners = await fetchOwnersAvatars(okRead, ownersSet);

  return { issues, mirrorState, prs, owners, twitterDelta, syncMeta };
}
