import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME } from "../directory/directory";
import { commitArtifact, commitTwitterMap } from "../git";
import { TwitterMap } from "../twitter/initialize-twitter-map";

export async function readJsonFromStorage<T = any>(fileName: string): Promise<T | null> {
  const url = `https://raw.githubusercontent.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}/__STORAGE__/${fileName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (_) {
    return null;
  }
}

export async function writeArtifacts(changes: Array<{ path: string; data: unknown }>) {
  for (const change of changes) {
    await commitArtifact(change.path, change.data);
  }
}

export async function writeTwitterMap(next: TwitterMap) {
  await commitTwitterMap(next);
}

