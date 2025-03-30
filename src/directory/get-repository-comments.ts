import { GithubComment, octokit } from "./directory";

export async function getRepositoryComments(ownerName: string, repoName: string) {
  // Check if the repository is archived
  const { data: repo } = await octokit.rest.repos.get({
    owner: ownerName,
    repo: repoName,
  });

  if (repo.archived) {
    console.warn(`Warning: Repository ${ownerName}/${repoName} is archived. Skipping comment retrieval.`);
    return [];
  }

  // https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#list-issue-comments-for-a-repository
  // "Every pull request is an issue, but not every issue is a pull request."
  const issueComments: GithubComment[] = await octokit.paginate({
    method: "GET",
    url: `/repos/${ownerName}/${repoName}/issues/comments`,
  });

  return issueComments;
}
