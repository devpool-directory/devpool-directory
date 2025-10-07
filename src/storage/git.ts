import { Octokit } from "@octokit/rest";
import { info } from "../util/log.js";

export type Change = { path: string; content: string };

export async function ensureBranch(octokit: Octokit, owner: string, repo: string, branch: string) {
  try {
    await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  } catch {
    const { data: main } = await octokit.repos.get({ owner, repo });
    const defaultBranch = main.default_branch;
    const { data: baseRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseRef.object.sha });
    info(`Created data branch ${branch} from ${defaultBranch}`);
  }
}

export async function commitChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  changes: Change[]
) {
  if (changes.length === 0) return;

  const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const baseSha = refData.object.sha;
  const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: baseSha });

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content }))
  });

  const { data: commit } = await octokit.git.createCommit({ owner, repo, message, tree: tree.sha, parents: [baseSha] });
  await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });
}

