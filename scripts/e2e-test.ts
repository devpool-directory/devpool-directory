import { octokit, DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue } from "../src/directory/directory";
import { getRepositoryIssues } from "../src/directory/get-repository-issues";
import { syncPartnerRepoIssues } from "../src/directory/sync-partner-repo-issues";
import { getRepoCredentials } from "../src/directory/get-repo-credentials";
import { initializeTwitterMap } from "../src/twitter/initialize-twitter-map";

async function logRate(tag: string) {
  try {
    const { data } = await (octokit as any).rest.rateLimit.get();
    const rate = data.rate;
    console.log(`[rate:${tag}] remaining=${rate.remaining}/${rate.limit} reset=${new Date(rate.reset * 1000).toISOString()}`);
  } catch (e) {
    console.warn(`[rate:${tag}] unable to read`, e);
  }
}

async function main() {
  const testingRepoUrl = process.env.E2E_PARTNER_URL || `https://github.com/devpool-directory/devpool-directory-testing`;
  const [partnerOwner, partnerRepo] = getRepoCredentials(testingRepoUrl);

  console.log(`DEVPOOL repo: ${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}`);
  console.log(`PARTNER repo: ${partnerOwner}/${partnerRepo}`);

  await logRate("start");

  const twitterMap = await initializeTwitterMap();
  let directoryIssues: GitHubIssue[] = await getRepositoryIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);

  const createdOrOpen = await syncPartnerRepoIssues({
    partnerRepoUrl: testingRepoUrl,
    directoryIssues,
    twitterMap,
  });

  console.log(`Synced ${createdOrOpen.length} partner issues (open) from ${partnerOwner}/${partnerRepo}`);

  await logRate("end");
}

main().catch((e) => {
  console.error("E2E error:", e);
  process.exit(1);
});

