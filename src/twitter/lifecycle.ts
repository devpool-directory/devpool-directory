import type { TwitterApi } from "twitter-api-v2";

export async function postTweet(client: TwitterApi | undefined, text: string): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.v2.tweet(text);
  return data?.id ?? null;
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

