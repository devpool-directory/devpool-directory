import { octokit } from "./directory";

const avatarMemo = new Map<string, { ownerName: string; avatar_url?: string }>();

export async function getPartnerAvatars(ownerName: string): Promise<{ ownerName: string; avatar_url?: string }> {
  if (avatarMemo.has(ownerName)) return avatarMemo.get(ownerName)!;
  try {
    const { data: user } = await octokit.request("GET /users/{username}", {
      username: ownerName,
    });

    const result = { ownerName, avatar_url: user?.avatar_url || undefined };
    avatarMemo.set(ownerName, result);
    return result;
  } catch (error) {
    console.error(`Error fetching organization for ${ownerName}:`, error);
    return { ownerName, avatar_url: undefined };
  }
}
