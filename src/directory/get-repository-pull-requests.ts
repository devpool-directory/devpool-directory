import { GitHubPullRequest, octokit } from "./directory";

export async function getRepositoryPullRequests(ownerName: string, repoName: string) {
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
  });

  return pullRequests;
}
