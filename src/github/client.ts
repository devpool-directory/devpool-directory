import { Octokit } from "@octokit/rest";
import { env } from "../config/load.js";

export function getOctokit(): Octokit {
  const token = process.env.GH_TOKEN || env("GITHUB_TOKEN", true)!;
  return new Octokit({ auth: token, request: { retries: 0 } });
}

export async function getRateRemaining(octokit: Octokit): Promise<number> {
  const { data } = await octokit.rateLimit.get();
  return data.rate.remaining;
}
