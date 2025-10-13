#!/usr/bin/env -S node --enable-source-maps
import { getOctokitWrite } from "../github/client.js";

async function main() {
  const owner = process.env.DIRECTORY_OWNER || (process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "");
  const repo = process.env.DIRECTORY_REPO || (process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "");
  if (!owner || !repo) throw new Error("DIRECTORY_OWNER and DIRECTORY_REPO required");
  const target = `${owner}/${repo}`;
  const guard = process.env.WRITE_TARGET_REPO;
  if (guard && guard !== target) throw new Error(`write-blocked: target ${target} != enforced ${guard}`);

  const input = (process.env.NUMBERS || "").trim();
  if (!input) throw new Error("NUMBERS env must be a comma-separated list of issue numbers");
  const numbers = input.split(/[,\s]+/).map((s) => Number(s)).filter((n) => Number.isFinite(n));
  if (!numbers.length) throw new Error("No valid issue numbers provided");

  const ok = getOctokitWrite();
  let closed = 0;
  for (const issue_number of numbers) {
    try {
      await (ok as any).issues.update({ owner, repo, issue_number, state: "closed" });
      closed++;
    } catch (e) {
      // continue best effort
    }
  }
  console.log(JSON.stringify({ target, requested: numbers.length, closed }));
}

main().catch((err) => { console.error(err); process.exit(1); });

