import { Octokit } from "@octokit/rest";

export async function loadArtifact<T = any>(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<T | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    const file = Array.isArray(data) ? null : data;
    if (!file || typeof file === "string") return null as any;
    // @ts-expect-error
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as T;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

