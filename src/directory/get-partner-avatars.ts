import { GitHubOrganization, octokit } from "./directory";

const avatarMemo = new Map<string, { ownerName: string; avatar_url?: string }>();

export async function getPartnerAvatars(ownerName: string): Promise<{ ownerName: string; avatar_url?: string }> {
  if (avatarMemo.has(ownerName)) return avatarMemo.get(ownerName)!;
  try {
    const orgResp: GitHubOrganization[] = await octokit.paginate({
      method: "GET",
      url: `/users/${ownerName}`,
    });

    const org = orgResp.find((org) => org.login === ownerName);

    const result = { ownerName, avatar_url: org ? org.avatar_url : undefined };
    avatarMemo.set(ownerName, result);
    return result;
  } catch (error) {
    console.error(`Error fetching organization for ${ownerName}:`, error);
    return { ownerName, avatar_url: undefined };
  }
}
