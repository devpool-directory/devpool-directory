import type { TwitterMap } from "../twitter/initialize-twitter-map";
import fs from "node:fs";
import path from "node:path";

function getOwnerRepo() {
  const owner = process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];
  if (!owner || !repo) throw new Error("DEVPOOL_OWNER_NAME/DEVPOOL_REPO_NAME (or DIRECTORY_OWNER/DIRECTORY_REPO) must be set");
  return { owner, repo };
}

export async function readJsonFromStorage<T = any>(fileName: string): Promise<T | null> {
  const { owner, repo } = getOwnerRepo();
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/__STORAGE__/${fileName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (_) {
    return null;
  }
}

export async function writeArtifacts(changes: Array<{ path: string; data: unknown }>) {
  try {
    const mod = await import("../git");
    for (const change of changes) {
      await mod.commitArtifact(change.path, change.data);
    }
  } catch (_e) {
    // Fallback: write locally for inspection
    for (const change of changes) {
      const p = path.resolve(process.cwd(), change.path);
      fs.writeFileSync(p, JSON.stringify(change.data, null, 2));
    }
  }
}

export async function writeTwitterMap(next: TwitterMap) {
  try {
    const mod = await import("../git");
    await mod.commitTwitterMap(next);
  } catch (_e) {
    fs.writeFileSync(path.resolve(process.cwd(), "twitter-map.json"), JSON.stringify(next, null, 2));
  }
}
