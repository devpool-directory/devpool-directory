#!/usr/bin/env -S node --enable-source-maps
import { getOctokitRead } from "../github/client";

async function main() {
  const repoEnv = process.env.GITHUB_REPOSITORY ?? "";
  const owner = process.env.DIRECTORY_OWNER ?? repoEnv.split("/")[0] ?? "";
  const repo = process.env.DIRECTORY_REPO ?? repoEnv.split("/")[1] ?? "";
  const branch = process.env.DATA_BRANCH ?? "__STORAGE__";

  const octokit = getOctokitRead();
  let summary: any = null;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "summary.json", ref: branch });
    const content = Buffer.from((data as any).content, "base64").toString("utf8");
    summary = JSON.parse(content);
  } catch (e) {
    console.log("DevPool Directory v2 — no summary.json found on data branch");
    return;
  }

  const lines: string[] = [];
  lines.push(`DevPool Directory v2 — Sync Summary`);
  lines.push("");
  lines.push(`- Repos processed: ${summary.reposProcessed}`);
  lines.push(`- Shards: ${summary.shards}`);
  lines.push(`- Issues: ${summary.issuesOpen} open, ${summary.issuesClosed} closed`);
  lines.push(`- PRs: ${summary.prs}`);
  lines.push(`- Mirrors: ${summary.mirrors}`);
  lines.push(`- Owners: ${summary.owners}`);
  lines.push(`- Tweets: ${summary.tweetsCreated} posted, ${summary.tweetsDeleted} deleted`);
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
