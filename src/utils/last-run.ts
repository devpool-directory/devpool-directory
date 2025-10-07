import { commitLastRun } from "../git";

export type LastRunMap = Record<string, string>; // key: "owner/repo" => ISO timestamp

export async function initializeLastRun(): Promise<LastRunMap> {
  let lastRun: LastRunMap = {};
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/0x4007/devpool-directory/__STORAGE__/last-run.json"
    );
    if (!response.ok) throw new Error(String(response.status));
    lastRun = (await response.json()) as LastRunMap;
  } catch (_e) {
    // Create empty map if not present
    await commitLastRun(lastRun);
  }
  return lastRun;
}

