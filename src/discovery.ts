import { Octokit } from "@octokit/rest";

export async function discoverRepos(octokit: Octokit, cfg: {
  include: string[];
  exclude: string[];
  explicit_urls?: string[];
}): Promise<string[]> {
  const set = new Set<string>();

  // Explicit URLs
  for (const url of cfg.explicit_urls ?? []) {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
    if (m) set.add(`${m[1]}/${m[2]}`);
  }

  // Includes: org or full repo
  for (const inc of cfg.include ?? []) {
    if (inc.includes("/")) {
      set.add(inc);
    } else {
      const org = inc;
      const repos = await octokit.paginate(octokit.repos.listForOrg, { org, type: "all", per_page: 100 });
      for (const r of repos) set.add(`${org}/${r.name}`);
    }
  }

  // Excludes: org or full repo
  for (const exc of cfg.exclude ?? []) {
    if (exc.includes("/")) {
      set.delete(exc);
    } else {
      const prefix = `${exc}/`;
      for (const v of Array.from(set.values())) if (v.startsWith(prefix)) set.delete(v);
    }
  }

  return Array.from(set.values()).sort();
}

