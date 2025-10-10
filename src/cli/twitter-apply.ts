import dotenv from "dotenv";
dotenv.config();
import { readJsonFromStorage, writeArtifacts, writeTwitterMap } from "../artifacts/storage";
import { initializeTwitterMap, TwitterMap } from "../twitter/initialize-twitter-map";
import { buildDesiredSet } from "../twitter/desired";
import { listUserTweets } from "../twitter/client";
import { plan as planDiff } from "../twitter/plan";
import { applyPlan } from "../twitter/apply";
import { gitPush } from "../git";

type GitHubIssue = any;

async function main() {
  const includeAssigned = process.env.INCLUDE_ASSIGNED === "true";
  const maxScan = Number(process.env.MAX_TWEETS_SCAN || 1000);
  const maxAgeDays = Number(process.env.TWEET_SCAN_MAX_AGE_DAYS || 365);
  const deleteWindowDays = Number(process.env.DELETE_WINDOW_DAYS || 0);
  const createBudget = Number(process.env.TWEET_BUDGET_CREATE || 10);
  const deleteBudget = Number(process.env.TWEET_BUDGET_DELETE || 200);
  const isDry = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
  const tweetRegexRaw = process.env.TWEET_REGEX;
  const tweetRegex = tweetRegexRaw ? new RegExp(tweetRegexRaw, "i") : undefined;

  // Read artifacts or recompute plan
  let issues = (await readJsonFromStorage<GitHubIssue[]>("partner-open-issues.json")) || [];
  if (!issues || issues.length === 0) {
    const alt = await readJsonFromStorage<GitHubIssue[]>("devpool-issues.json");
    if (alt) issues = alt;
  }
  const desired = buildDesiredSet(issues || [], { includeAssigned });
  const twitterMap: TwitterMap = await initializeTwitterMap();
  const current = await listUserTweets({ maxScan, maxAgeDays });
  const plStored = await readJsonFromStorage<any>("twitter-plan.json");
  const pl = plStored || planDiff({ desiredMap: desired, currentTweets: current, twitterMap, opts: { deleteWindowDays, tweetRegex } });

  if (isDry) {
    console.log("DRY_RUN=true — skipping tweet create/delete and map writes. Plan summary:");
    console.log(JSON.stringify({ creates: Object.keys(pl.creates).length, deletes: pl.deletes.length, keep: pl.keep.length }, null, 2));
    return;
  }

  const delta = await applyPlan({ creates: pl.creates, deletes: pl.deletes, budgets: { createBudget, deleteBudget }, twitterMap });
  await writeTwitterMap(twitterMap);
  await writeArtifacts([
    { path: "twitter-delta.json", data: delta },
  ]);
  try {
    const mod = await import("../git");
    await mod.gitPush();
  } catch (e) {
    console.warn("Skipping git push for apply (likely missing token):", e instanceof Error ? e.message : e);
  }

  const desiredCount = desired.size;
  const currentManaged = current.filter((t) => Object.values(twitterMap).includes(t.id)).length;
  const summary = {
    owner: process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER,
    repo: process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO,
    desiredCount,
    currentManaged,
    createsApplied: Object.keys(delta.created).length,
    deletesApplied: delta.deleted.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("twitter:apply failed:", e);
  process.exit(1);
});
