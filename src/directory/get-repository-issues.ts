import { GitHubIssue, octokit } from "./directory";

const issuesMemo = new Map<string, GitHubIssue[]>();

export async function getRepositoryIssues(ownerName: string, repoName: string, forceRefresh = false, sinceIso?: string) {
  const cacheKey = `${ownerName}/${repoName}|state=all|since=${sinceIso ?? "_"}`;
  if (!forceRefresh && issuesMemo.has(cacheKey)) {
    return issuesMemo.get(cacheKey)!;
  }
  // Check if the repository is archived
  const { data: repo } = await octokit.rest.repos.get({
    owner: ownerName,
    repo: repoName,
  });

  if (repo.archived) {
    console.warn(`Warning: Repository ${ownerName}/${repoName} is archived. Skipping issue retrieval.`);
    return [];
  }

  // get all project issues (opened and closed); optionally since last run
  const sinceParam = sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : "";
  let issues: GitHubIssue[] = await octokit.paginate({
    method: "GET",
    url: `/repos/${ownerName}/${repoName}/issues?state=all${sinceParam}`,
    per_page: 100,
  });
  // remove PRs from the project issues
  issues = issues.filter((issue) => !issue.pull_request);

  issuesMemo.set(cacheKey, issues);
  return issues;
}
