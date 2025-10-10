import dotenv from "dotenv";
dotenv.config();
import { readJsonFromStorage, writeArtifacts } from "../artifacts/storage";
import { initializeTwitterMap, TwitterMap } from "../twitter/initialize-twitter-map";
import { buildDesiredSet } from "../twitter/desired";
import { listUserTweets } from "../twitter/client";
import { plan as planDiff } from "../twitter/plan";
import { gitPush } from "../git";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue } from "../directory/directory";

async function main() {
  const includeAssigned = process.env.INCLUDE_ASSIGNED === "true";
  const maxScan = Number(process.env.MAX_TWEETS_SCAN || 1000);
  const maxAgeDays = Number(process.env.TWEET_SCAN_MAX_AGE_DAYS || 365);
  const deleteWindowDays = Number(process.env.DELETE_WINDOW_DAYS || 0);
  const tweetRegexRaw = process.env.TWEET_REGEX;
  const tweetRegex = tweetRegexRaw ? new RegExp(tweetRegexRaw, "i") : undefined;

  // Load artifacts (prefer partner-open-issues.json; fallback to devpool-issues.json)
  let issues = (await readJsonFromStorage<GitHubIssue[]>("partner-open-issues.json")) || [];
  if (!issues || issues.length === 0) {
    const alt = await readJsonFromStorage<GitHubIssue[]>("devpool-issues.json");
    if (alt) issues = alt;
  }

  const desired = buildDesiredSet(issues || [], { includeAssigned });
  const twitterMap: TwitterMap = await initializeTwitterMap();
  const current = await listUserTweets({ maxScan, maxAgeDays });
  const pl = planDiff({ desiredMap: desired, currentTweets: current, twitterMap, opts: { deleteWindowDays, tweetRegex } });

  // Write artifacts
  await writeArtifacts([
    { path: "twitter-plan.json", data: pl },
    { path: "twitter-current.json", data: current },
  ]);
  try {
    await gitPush();
  } catch (e) {
    console.warn("Skipping git push for plan (likely missing token):", e instanceof Error ? e.message : e);
  }

  // Console summary
  const desiredCount = desired.size;
  const currentManaged = current.filter((t) => Object.values(twitterMap).includes(t.id)).length;
  console.log(
    JSON.stringify(
      {
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        desiredCount,
        currentManaged,
        createsPlanned: Object.keys(pl.creates).length,
        deletesPlanned: pl.deletes.length,
        keep: pl.keep.length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("twitter:plan failed:", e);
  process.exit(1);
});
