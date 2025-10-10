import dotenv from "dotenv";
dotenv.config();
import { readJsonFromStorage } from "../artifacts/storage";
import { initializeTwitterMap } from "../twitter/initialize-twitter-map";
import { buildDesiredSet } from "../twitter/desired";
import { listUserTweets } from "../twitter/client";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue } from "../directory/directory";

async function main() {
  const includeAssigned = process.env.INCLUDE_ASSIGNED === "true";
  const maxScan = Number(process.env.MAX_TWEETS_SCAN || 1000);
  const maxAgeDays = Number(process.env.TWEET_SCAN_MAX_AGE_DAYS || 365);

  let issues = (await readJsonFromStorage<GitHubIssue[]>("partner-open-issues.json")) || [];
  if (!issues || issues.length === 0) {
    const alt = await readJsonFromStorage<GitHubIssue[]>("devpool-issues.json");
    if (alt) issues = alt;
  }
  const desired = buildDesiredSet(issues || [], { includeAssigned });
  const twitterMap = await initializeTwitterMap();
  const current = await listUserTweets({ maxScan, maxAgeDays });

  const currentIds = new Set(current.map((t) => t.id));

  const missingForDesired: string[] = [];
  for (const node_id of desired.keys()) {
    const tw = twitterMap[node_id];
    if (!tw || !currentIds.has(tw)) missingForDesired.push(node_id);
  }

  const undesiredManaged: string[] = [];
  for (const [node_id, twid] of Object.entries(twitterMap)) {
    if (!desired.has(node_id) && currentIds.has(twid)) {
      undesiredManaged.push(twid);
    }
  }

  const ok = missingForDesired.length === 0 && undesiredManaged.length === 0;
  const report = {
    owner: DEVPOOL_OWNER_NAME,
    repo: DEVPOOL_REPO_NAME,
    desiredCount: desired.size,
    currentCount: current.length,
    missingForDesired,
    undesiredManaged,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("twitter:audit failed:", e);
  process.exit(1);
});

