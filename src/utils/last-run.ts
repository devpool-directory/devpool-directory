import { commitLastRun } from "../git";

export type LastRunMap = Record<string, string>; // key: "owner/repo" => ISO timestamp

export async function initializeLastRun(): Promise<LastRunMap> {
  let lastRun: LastRunMap = {};
  try {
    const owner = process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) throw new Error("owner/repo not set");
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/__STORAGE__/last-run.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    lastRun = (await response.json()) as LastRunMap;
  } catch (_e) {
    // Create empty map if not present
    await commitLastRun(lastRun);
  }
  return lastRun;
}
