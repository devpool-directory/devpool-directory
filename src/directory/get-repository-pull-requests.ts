import { GitHubPullRequest, octokit } from "./directory";

const prMemo = new Map<string, GitHubPullRequest[]>();

export async function getRepositoryPullRequests(ownerName: string, repoName: string, forceRefresh = false) {
  const cacheKey = `${ownerName}/${repoName}`;
  if (!forceRefresh && prMemo.has(cacheKey)) {
    return prMemo.get(cacheKey)!;
  }
  // Check if the repository is archived
  const { data: repo } = await octokit.rest.repos.get({
    owner: ownerName,
    repo: repoName,
  });

  if (repo.archived) {
    console.warn(`Warning: Repository ${ownerName}/${repoName} is archived. Skipping pull request retrieval.`);
    return [];
  }

  // get all pull requests (opened and closed)
  const pullRequests: GitHubPullRequest[] = await octokit.paginate({
    method: "GET",
    url: `/repos/${ownerName}/${repoName}/pulls`,
    per_page: 100,
  });

  prMemo.set(cacheKey, pullRequests);
  return pullRequests;
}
