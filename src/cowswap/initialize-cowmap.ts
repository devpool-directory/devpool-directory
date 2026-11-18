export type CowMap = Record<string, string>;

export async function initializeCowMap(): Promise<CowMap> {
  let cowMap: CowMap = {};
  try {
    const owner = process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) throw new Error("owner/repo not set");
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/__STORAGE__/cow-map.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    cowMap = await response.json();
  } catch (error) {
    console.log("Couldn't fetch cow map, creating a new one");
  }
  return cowMap;
}