import { calculateStatistics } from "./directory/calculate-statistics";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue, GitHubPullRequest, OrgNameAndAvatarUrl } from "./directory/directory";
import { getPartnerAvatars } from "./directory/get-partner-avatars";
import { getPartnerUrls as getPartnerRepoUrls } from "./directory/get-partner-urls";
import { getRepoCredentials } from "./directory/get-repo-credentials";
import { getRepositoryIssues } from "./directory/get-repository-issues";
import { getRepositoryPullRequests } from "./directory/get-repository-pull-requests";
import { Statistics } from "./directory/statistics";
import { syncPartnerRepoIssues } from "./directory/sync-partner-repo-issues";
import { commitPartnerAvatars, commitPullRequests, commitStatistics, commitTasks, commitLastRun } from "./git";
import { initializeTwitterMap, TwitterMap } from "./twitter/initialize-twitter-map";
import { initializeLastRun } from "./utils/last-run";

export async function main() {
  const twitterMap: TwitterMap = await initializeTwitterMap();
  let directoryIssues: GitHubIssue[] = await getRepositoryIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);
  const lastRun = await initializeLastRun();
  const partnerRepoUrls = await getPartnerRepoUrls();
  const taskList: GitHubIssue[] = [];
  const pullRequestList: GitHubPullRequest[] = [];
  const partnerAvatarMap: Map<string, OrgNameAndAvatarUrl> = new Map();

  // for each project URL
  for (const partnerRepoUrl of partnerRepoUrls) {
    // get owner and repository names from project URL
    const [ownerName, repoName] = getRepoCredentials(partnerRepoUrl);
    const since = lastRun[`${ownerName}/${repoName}`];
    // Warm issues for this repo using `since` to minimize calls on repeated runs
    const _ = await getRepositoryIssues(ownerName, repoName, false, since);
    const result: GitHubIssue[] = await syncPartnerRepoIssues({ partnerRepoUrl, directoryIssues, twitterMap });
    taskList.push(...result);
    // get all pull requests (opened and closed)
    const pullRequests: GitHubPullRequest[] = await getRepositoryPullRequests(ownerName, repoName);
    pullRequestList.push(...pullRequests);

    // get partner profile picture if not already in the map
    if (!partnerAvatarMap.has(ownerName)) {
      const org: OrgNameAndAvatarUrl = await getPartnerAvatars(ownerName);
      partnerAvatarMap.set(ownerName, org);
    }

    // Bump last-run for this repo to now
    lastRun[`${ownerName}/${repoName}`] = new Date().toISOString();
  }

  const partnerAvatarList: OrgNameAndAvatarUrl[] = Array.from(partnerAvatarMap.values());

  await commitTasks(taskList);
  await commitPullRequests(pullRequestList);
  await commitPartnerAvatars(partnerAvatarList);

  // Calculate total rewards from devpool issues
  const { rewards, tasks } = await calculateStatistics(directoryIssues);
  const statistics: Statistics = { rewards, tasks };

  await commitStatistics(statistics);
  await commitLastRun(lastRun);
}
