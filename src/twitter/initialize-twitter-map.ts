
export type TwitterMap = Record<string, string>;

export async function initializeTwitterMap() {
  let twitterMap: TwitterMap = {};
  try {
    const owner = process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) throw new Error("owner/repo not set");
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/__STORAGE__/twitter-map.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    twitterMap = await response.json();
  } catch (error) {
    console.log("Couldn't fetch twitter map, creating a new one");
    try {
      const storage = await import("../artifacts/storage");
      await storage.writeTwitterMap(twitterMap);
    } catch (_e) {
      // swallow
    }
  }
  return twitterMap;
}
