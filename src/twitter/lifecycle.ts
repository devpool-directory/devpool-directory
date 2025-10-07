import type { TwitterApi } from "twitter-api-v2";

export async function postTweet(client: TwitterApi | undefined, text: string): Promise<string | null> {
  if (!client) return null;
  try {
    const { data } = await client.v2.tweet(text);
    return data?.id ?? null;
  } catch (err: any) {
    // Soft-fail on Twitter errors (e.g., 429 rate limits). Log and continue.
    const code = err?.code ?? err?.status ?? "unknown";
    const title = err?.data?.title ?? err?.title ?? "";
    console.warn(`[twitter] tweet failed (${code}) ${title}`);
    return null;
  }
}

export async function deleteTweet(client: TwitterApi | undefined, id: string): Promise<boolean> {
  if (!client) return false;
  try {
    const { data } = await client.v2.deleteTweet(id);
    return Boolean(data?.deleted);
  } catch {
    return false;
  }
}
