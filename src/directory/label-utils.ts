import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubLabel, octokit } from "./directory";

// Function to check if a label exists
export async function ensureLabelExists(labelName: string, labelColor: string, labelDescription: string): Promise<void> {
  try {
    // Fetch all labels in the repository
    let labels = [] as GitHubLabel[];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await octokit.rest.issues.listLabelsForRepo({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        per_page: 100,
        page: page,
      });

      labels = labels.concat(response.data);

      if (response.data.length < 100) {
        hasNextPage = false;
      } else {
        page++;
      }
    }

    // Check if the label already exists
    const isLabelPresent = labels.some((label) => label.name === labelName);

    // If the label does not exist, create it
    if (!isLabelPresent) {
      await octokit.rest.issues.createLabel({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        name: labelName,
        color: "ededed",
        description: labelDescription,
      });
      console.log(`Created label "${labelName}"`);
    }
  } catch (error) {
    console.error(`Error ensuring label "${labelName}" exists:`, error);
    throw error; // Rethrow the error after logging
  }
}

// Ensure a batch of labels exist in the repository. Creates any that are missing.
export async function ensureLabelsExist(labelNames: string[]): Promise<void> {
  try {
    // Fetch all labels once (paged)
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

    const existingNames = new Set(existingLabels.map((l) => l.name));

    for (const name of labelNames) {
      if (!name || existingNames.has(name)) continue;
      try {
        await octokit.rest.issues.createLabel({
          owner: DEVPOOL_OWNER_NAME,
          repo: DEVPOOL_REPO_NAME,
          name,
          color: "ededed",
          description: "",
        });
        console.log(`Created label "${name}"`);
        existingNames.add(name);
      } catch (err: any) {
        // Ignore race where label was created concurrently
        if (err && err.status === 422) {
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
