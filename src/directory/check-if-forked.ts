import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, octokit } from "./directory";

export async function checkIfForked(owner?: string, repo?: string): Promise<boolean> {
  const targetOwner = owner || process.env.DEVPOOL_OWNER_NAME || DEVPOOL_OWNER_NAME;
  const targetRepo = repo || process.env.DEVPOOL_REPO_NAME || DEVPOOL_REPO_NAME;
  try {
    const response = await octokit.rest.repos.get({ owner: targetOwner, repo: targetRepo });
    return response.data.fork || false;
  } catch {
    return false;
  }
}
