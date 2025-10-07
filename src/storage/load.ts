import { Octokit } from "@octokit/rest";

export async function loadArtifact<T = any>(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<T | null> {
  try {
    const resp = await octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(resp.data)) return null;
    const file = resp.data as unknown as { content?: string };
    if (!file || typeof file.content !== "string") return null;
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as T;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}
