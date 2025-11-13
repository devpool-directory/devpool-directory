import { Octokit } from "@octokit/rest";
import { env } from "../config/load";

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

// Delete client: prefer GH_TOKEN (owner PAT with delete permissions) when present;
// fall back to the App token. This is limited to hard-deletion operations.
export function getOctokitDelete(): Octokit {
  const pat = process.env.GH_TOKEN || env("GH_TOKEN", false);
  if (pat) return new Octokit({ auth: pat as string, request: { retries: 0 } });
  return getOctokitWrite();
}

export async function getRateRemaining(octokit: Octokit): Promise<number> {
  const { data } = await octokit.rateLimit.get();
  return data.rate.remaining;
}
