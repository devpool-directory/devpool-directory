import { Octokit } from "@octokit/rest";
import { env } from "../config/load.js";

// Read client: prefer PAT (GH_TOKEN) to maximize cross-org read access;
// fallback to Actions/App token; finally anonymous for public data.
export function getOctokitRead(): Octokit {
  const pat = process.env.GH_TOKEN;
  if (pat) return new Octokit({ auth: pat, request: { retries: 0 } });
  const gh = env("GITHUB_TOKEN", false);
  if (gh) return new Octokit({ auth: gh, request: { retries: 0 } });
  return new Octokit({ request: { retries: 0 } });
}

// Write client: MUST use the GitHub App token so issues are authored by
// devpool-directory-superintendent[bot]. Never use GH_TOKEN for writes.
export function getOctokitWrite(): Octokit {
  const app = env("GITHUB_TOKEN", true)!; // required
  return new Octokit({ auth: app, request: { retries: 0 } });
}

// Backwards-compat alias: treat getOctokit() as read client.
export const getOctokit = getOctokitRead;

export async function getRateRemaining(octokit: Octokit): Promise<number> {
  const { data } = await octokit.rateLimit.get();
  return data.rate.remaining;
}
