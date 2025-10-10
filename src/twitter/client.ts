import { twitterClient } from "./twitter";

export type TimelineTweet = {
  id: string;
  text: string;
  created_at?: string;
  pinned?: boolean;
};

export type TwitterUserInfo = {
  userId: string;
  pinned_tweet_id?: string;
};

export async function getUserInfo(): Promise<TwitterUserInfo | null> {
  if (!twitterClient) return null;
  try {
    const params: any = { "user.fields": "pinned_tweet_id" };
    const me = await twitterClient.v2.me(params);
    const pinned_tweet_id = (me?.data as any)?.pinned_tweet_id as string | undefined;
    return { userId: me.data.id, pinned_tweet_id };
  } catch (e) {
    console.error("Failed to fetch Twitter user info:", e);
    return null;
  }
}

export async function listUserTweets(options: {
  maxScan?: number;
  maxAgeDays?: number;
}): Promise<TimelineTweet[]> {
  if (!twitterClient) {
    const handle = process.env.TWITTER_HANDLE;
    if (handle) {
      const ids = await scrapeProfile(handle);
      return ids.map((id) => ({ id, text: "", created_at: undefined, pinned: false }));
    }
    return [];
  }
  const info = await getUserInfo();
  if (!info) return [];
  const { userId, pinned_tweet_id } = info;
  const maxScan = options.maxScan ?? 1000;
  const maxAgeDays = options.maxAgeDays ?? 365;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const tweets: TimelineTweet[] = [];
  try {
    const params: any = {
      exclude: ["replies", "retweets"],
      max_results: 100,
      "tweet.fields": ["created_at"],
    };
    const paginator = await twitterClient.v2.userTimeline(userId, params);
    for await (const tweet of paginator) {
      const id = String((tweet as any).id);
      const created_at = (tweet as any).created_at as string | undefined;
      const createdMs = created_at ? Date.parse(created_at) : NaN;
      const t: TimelineTweet = {
        id,
        text: (tweet as any).text || "",
        created_at,
        pinned: pinned_tweet_id ? id === pinned_tweet_id : false,
      };
      tweets.push(t);
      if (tweets.length >= maxScan) break;
      if (!isNaN(createdMs) && createdMs < cutoff) break;
    }
  } catch (e) {
    console.error("Failed to list user tweets:", e);
    return tweets;
  }
  return tweets;
}

export async function createTweet(text: string) {
  if (!twitterClient) return null;
  try {
    const { data } = await withBackoff(() => twitterClient!.v2.tweet(text));
    return data; // { id, text }
  } catch (e) {
    console.error("Failed to create tweet:", e);
    return null;
  }
}

export async function deleteTweetById(id: string) {
  if (!twitterClient) return false;
  try {
    const { data } = await withBackoff(() => twitterClient!.v2.deleteTweet(id));
    return Boolean((data as any)?.deleted ?? true);
  } catch (e: any) {
    // Tolerate 404 as idempotent delete
    if (e?.code === 404 || e?.status === 404) return true;
    console.error("Failed to delete tweet:", e);
    return false;
  }
}

export async function scrapeProfile(handle: string): Promise<string[]> {
  // Best-effort HTML fetch; dynamic client may hide content without JS
  try {
    const res = await fetch(`https://x.com/${handle}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await res.text();
    const matches = html.match(/\/status\/(\d+)/g) || [];
    const ids = Array.from(new Set(matches.map((m) => m.split("/").pop()!).filter(Boolean)));
    return ids as string[];
  } catch (e) {
    console.warn("Scrape fallback failed:", e);
    return [];
  }
}

async function withBackoff<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let wait = 500; // ms
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.code || e?.status;
      if (status === 429 || /rate limit/i.test(String(e?.message || ""))) {
        const jitter = Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, wait + jitter));
        wait = Math.min(wait * 2, 10000);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}
