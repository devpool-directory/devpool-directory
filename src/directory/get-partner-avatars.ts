import { GitHubOrganization, octokit } from "./directory";

export async function getPartnerAvatars(ownerName: string): Promise<{ownerName: string, avatar_url?: string}> {
  try {
    const orgResp: GitHubOrganization[] = await octokit.paginate({
      method: "GET",
      url: `/users/${ownerName}`
    });

    const org = orgResp.find((org) => org.login === ownerName);

    return {ownerName, avatar_url: org ? org.avatar_url : undefined};
  } catch (error) {
    console.error(`Error fetching organization for ${ownerName}:`, error);
    return {ownerName, avatar_url: undefined};
  }
}
