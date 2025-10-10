import { DesiredItem } from "./desired";
import { TimelineTweet } from "./client";

export type Plan = {
  creates: Record<string, string>; // node_id -> tweet text
  deletes: string[]; // tweet ids
  keep: string[]; // tweet ids
};

export function plan({
  desiredMap,
  currentTweets,
  twitterMap,
  opts,
}: {
  desiredMap: Map<string, DesiredItem>;
  currentTweets: TimelineTweet[];
  twitterMap: Record<string, string>;
  opts?: {
    deleteWindowDays?: number;
    tweetRegex?: RegExp;
  };
}): Plan {
  const deleteWindowDays = opts?.deleteWindowDays ?? 0;
  const tweetRegex = opts?.tweetRegex ?? /https?:\/\/(?:www\.)?github\.com\/[^\/]+\/[^\/]+\/issues\/\d+/i;

  const now = Date.now();
  const graceCutoff = now - deleteWindowDays * 24 * 60 * 60 * 1000;
  const desiredUrls = new Set(Array.from(desiredMap.values()).map((d) => d.issue_url));
  const currentIds = new Set(currentTweets.map((t) => t.id));
  const managedIds = new Set(Object.values(twitterMap));
  const pinnedIds = new Set(currentTweets.filter((t) => t.pinned).map((t) => t.id));

  const creates: Record<string, string> = {};
  const deletes: string[] = [];
  const keep: string[] = [];

  // Creates and keep
  for (const [node_id, d] of desiredMap.entries()) {
    const mappedId = twitterMap[node_id];
    if (mappedId) {
      // If no current tweets are available (offline/scrape failure), avoid false creates
      if (currentIds.size === 0 || currentIds.has(mappedId)) {
        keep.push(mappedId);
        continue;
      }
      // Mapped but missing on current timeline => recreate
      creates[node_id] = d.text;
      continue;
    }
    // Not mapped at all => create
    creates[node_id] = d.text;
  }

  // Managed deletes: mapped but not desired
  for (const [node_id, tweet_id] of Object.entries(twitterMap)) {
    if (desiredMap.has(node_id)) continue;
    if (!currentIds.has(tweet_id)) continue; // already gone
    if (pinnedIds.has(tweet_id)) continue; // don't delete pinned
    const t = currentTweets.find((ct) => ct.id === tweet_id);
    if (t?.created_at) {
      const ms = Date.parse(t.created_at);
      if (!isNaN(ms) && ms > graceCutoff) continue;
    }
    deletes.push(tweet_id);
  }

  // Unmanaged legacy deletes: tweet contains GH issue link not in desired URLs
  for (const t of currentTweets) {
    if (managedIds.has(t.id)) continue;
    if (pinnedIds.has(t.id)) continue;
    // optional grace
    if (t.created_at) {
      const ms = Date.parse(t.created_at);
      if (!isNaN(ms) && ms > graceCutoff) continue;
    }
    const m = t.text && t.text.match(tweetRegex);
    if (m) {
      const url = m[0];
      if (!desiredUrls.has(url)) {
        deletes.push(t.id);
      }
    }
  }

  // Ordering: creates newest issues first; deletes oldest tweets first; unmanaged prior to managed
  const createEntries = Object.entries(creates).sort((a, b) => {
    const da = desiredMap.get(a[0])?.updated_at;
    const db = desiredMap.get(b[0])?.updated_at;
    const ma = da ? Date.parse(da) : 0;
    const mb = db ? Date.parse(db) : 0;
    return mb - ma;
  });
  const createsOrdered: Record<string, string> = {};
  for (const [k, v] of createEntries) createsOrdered[k] = v;

  const idToTweet = new Map(currentTweets.map((t) => [t.id, t] as const));
  const deletesOrdered = [...deletes].sort((a, b) => {
    const ta = idToTweet.get(a);
    const tb = idToTweet.get(b);
    const uma = ta && !managedIds.has(ta.id) ? 0 : 1;
    const umb = tb && !managedIds.has(tb.id) ? 0 : 1;
    if (uma !== umb) return uma - umb; // unmanaged first
    const ma = ta?.created_at ? Date.parse(ta.created_at) : 0;
    const mb = tb?.created_at ? Date.parse(tb.created_at) : 0;
    return ma - mb; // oldest first
  });

  return { creates: createsOrdered, deletes: deletesOrdered, keep };
}
