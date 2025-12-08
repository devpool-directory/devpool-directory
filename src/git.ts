import type { Octokit as RestOctokit } from "@octokit/rest";
import { Octokit } from "@octokit/rest";
import { Statistics } from "./directory/statistics";
let gitChanges: Array<{ path: string; content: string }> = [];

async function gitCommit(data: unknown, fileName: string) {
  try {
    gitChanges.push({
      path: fileName,
      content: JSON.stringify(data),
    });
  } catch (error) {
    console.error(`Error stringifying data for ${fileName}:`, error);
    throw error;
  }
}

import type { TwitterMap } from "./twitter/initialize-twitter-map";

const MAX_PAYLOAD_SIZE = 100000000; // 100MB per commit, adjust as needed

export async function gitPush() {
  if (gitChanges.length === 0) {
    console.log("No changes to commit");
    return;
  }

  try {
    const owner = process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) throw new Error("owner/repo not set");
    const token = process.env.GITHUB_TOKEN || process.env.DEVPOOL_GITHUB_API_TOKEN;
    const octokit = new Octokit({ auth: token });
    const branch = "__STORAGE__"; // Special branch for automated data updates
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = refData.object.sha;

    let currentChanges: Array<{ path: string; content: string }> = [];
    let currentSize = 0;

    for (const change of gitChanges) {
      const changeSize = Buffer.byteLength(change.content, "utf8");
      if (currentSize + changeSize > MAX_PAYLOAD_SIZE) {
        await commitChanges(octokit, owner, repo, branch, latestCommitSha, currentChanges);
        currentChanges = [];
        currentSize = 0;
      }
      currentChanges.push(change);
      currentSize += changeSize;
    }

    if (currentChanges.length > 0) {
      await commitChanges(octokit, owner, repo, branch, latestCommitSha, currentChanges);
    }

    // Clear the changes after successful push
    gitChanges = [];
  } catch (error) {
    console.error("Error committing changes:", error);
    throw error;
  }
}

async function commitChanges(
  octokit: RestOctokit,
  owner: string,
  repo: string,
  branch: string,
  baseSha: string,
  changes: Array<{ path: string; content: string }>
) {
  if (changes.length === 0) return;

  // Create tree for the changes
  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseSha,
    tree: changes.map((change) => ({
      path: change.path,
      mode: "100644",
      type: "blob",
      content: change.content,
    })),
  });

  // Create commit
  const { data: commitData } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "chore: update files",
    tree: treeData.sha,
    parents: [baseSha],
  });

  // Update the reference to point to the new commit
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commitData.sha,
  });

  console.log(`Committed to ${branch}: ${commitData.sha}`);
}

export async function commitStatistics(statistics: Statistics) {
  try {
    await gitCommit(statistics, "devpool-statistics.json");
  } catch (error) {
    console.error(`Error preparing devpool statistics for github file: ${error}`);
  }
}

export async function commitTasks(tasks: unknown[]) {
  try {
    await gitCommit(tasks, "devpool-issues.json");
  } catch (error) {
    console.error(`Error preparing devpool issues for github file: ${error}`);
  }
}

export async function commitPullRequests(tasks: unknown[]) {
  try {
    await gitCommit(tasks, "devpool-pull-requests.json");
  } catch (error) {
    console.error(`Error preparing devpool pull requests for github file: ${error}`);
  }
}

export async function commitPartnerAvatars(tasks: unknown[]) {
  try {
    await gitCommit(tasks, "devpool-partner-avatars.json");
  } catch (error) {
    console.error(`Error preparing devpool avatars for github file: ${error}`);
  }
}

export async function commitTwitterMap(twitterMap: TwitterMap) {
  try {
    await gitCommit(twitterMap, "twitter-map.json");
  } catch (error) {
    console.error(`Error preparing twitter map for github file: ${error}`);
  }
}

// Generic artifact writer for __STORAGE__ branch JSON files.
// Use this to stage arbitrary JSON artifacts (plan/current/delta/summary).
export async function commitArtifact(fileName: string, data: unknown) {
  try {
    await gitCommit(data, fileName);
  } catch (error) {
    console.error(`Error preparing artifact for github file ${fileName}: ${error}`);
  }
}
