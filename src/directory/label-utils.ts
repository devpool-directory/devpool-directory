import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubLabel, octokit } from "./directory";

let repoLabelCache: Set<string> | null = null;
let labelsFetchedAt = 0;
const LABELS_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAllRepoLabelNames(): Promise<Set<string>> {
  const withinTtl = Date.now() - labelsFetchedAt < LABELS_TTL_MS;
  if (repoLabelCache && withinTtl) return repoLabelCache;
  let existingLabels: GitHubLabel[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const res = await octokit.rest.issues.listLabelsForRepo({
      owner: DEVPOOL_OWNER_NAME,
      repo: DEVPOOL_REPO_NAME,
      per_page: 100,
      page,
    });
    existingLabels = existingLabels.concat(res.data);
    hasNext = res.data.length === 100;
    page++;
  }
  repoLabelCache = new Set(existingLabels.map((l) => l.name));
  labelsFetchedAt = Date.now();
  return repoLabelCache;
}

// Function to check if a label exists
export async function ensureLabelExists(labelName: string, labelColor: string, labelDescription: string): Promise<void> {
  try {
    const existingNames = await getAllRepoLabelNames();
    const isLabelPresent = existingNames.has(labelName);

    // If the label does not exist, create it
    if (!isLabelPresent) {
      const created = await octokit.rest.issues.createLabel({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        name: labelName,
        color: "ededed",
        description: labelDescription,
      });
      console.log(`Created label "${labelName}"`);
      // update cache eagerly
      if (!repoLabelCache) repoLabelCache = new Set();
      repoLabelCache.add(created.data.name);
    }
  } catch (error) {
    console.error(`Error ensuring label "${labelName}" exists:`, error);
    throw error; // Rethrow the error after logging
  }
}

// Ensure a batch of labels exist in the repository. Creates any that are missing.
export async function ensureLabelsExist(labelNames: string[]): Promise<void> {
  try {
    // Fetch labels using cache
    const existingNames = await getAllRepoLabelNames();

    for (const name of labelNames) {
      if (!name || existingNames.has(name)) continue;
      try {
        const created = await octokit.rest.issues.createLabel({
          owner: DEVPOOL_OWNER_NAME,
          repo: DEVPOOL_REPO_NAME,
          name,
          color: "ededed",
          description: "",
        });
        console.log(`Created label "${name}"`);
        existingNames.add(name);
        if (!repoLabelCache) repoLabelCache = new Set();
        repoLabelCache.add(created.data.name);
      } catch (err: any) {
        // Ignore race where label was created concurrently
        if (err && err.status === 422) {
          existingNames.add(name);
          continue;
        }
        console.error(`Failed to create label "${name}":`, err);
        throw err;
      }
    }
  } catch (error) {
    console.error("Error ensuring labels exist:", error);
    throw error;
  }
}
