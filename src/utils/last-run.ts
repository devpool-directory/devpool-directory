import { commitLastRun } from "../git";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME } from "../directory/directory";

export type LastRunMap = Record<string, string>; // key: "owner/repo" => ISO timestamp

export async function initializeLastRun(): Promise<LastRunMap> {
  let lastRun: LastRunMap = {};
  try {
    const url = `https://raw.githubusercontent.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}/__STORAGE__/last-run.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    lastRun = (await response.json()) as LastRunMap;
  } catch (_e) {
    // Create empty map if not present
    await commitLastRun(lastRun);
  }
  return lastRun;
}
