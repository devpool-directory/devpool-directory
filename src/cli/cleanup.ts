#!/usr/bin/env -S node --enable-source-maps
import { Octokit } from "@octokit/rest";
import { getOctokitRead, getOctokitWrite } from "../github/client.js";

function parsePartnerUrl(text: string): { owner: string; repo: string; number: number } | null {
  if (!text) return null;
  const t = text.trim().replace("https://www.github.com/", "https://github.com/");
  const m = t.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

function hasPrice(labels: string[]): boolean {
  return (labels || []).some((l) => /^Price:\s*/.test(String(l)));
}

async function main() {
  const owner = process.env.DIRECTORY_OWNER || (process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "");
  const repo = process.env.DIRECTORY_REPO || (process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "");
  if (!owner || !repo) throw new Error("DIRECTORY_OWNER and DIRECTORY_REPO required");

  const okRead = getOctokitRead();
  const okWrite = getOctokitWrite();

  const dirIssues: Array<any> = await okWrite.paginate((okWrite as any).issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });

  // Group by partner URL if present; collect invalids
  const byKey = new Map<string, any[]>();
  const invalid: any[] = [];
  for (const it of dirIssues) {
    const key = parsePartnerUrl(it.body || "");
    if (!key) {
      invalid.push(it);
      continue;
    }
    const k = `${key.owner}/${key.repo}#${key.number}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(it);
  }

  let deleted = 0;
  let updated = 0;
  let kept = 0;

  // Delete all issues that do not point to a partner issue URL
  for (const it of invalid) {
    try {
      await (okWrite as any).issues.delete({ owner, repo, issue_number: it.number });
      deleted++;
    } catch {
      // fallback to GraphQL delete
      try {
        await (okWrite as any).request("POST /graphql", {
          query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }",
          id: it.node_id,
        });
        deleted++;
      } catch {}
    }
  }

  // Process each partner group: validate partner, enforce priced-only mirror, dedupe and state sync
  for (const [k, list] of byKey) {
    // Keep oldest; others deleted
    list.sort((a, b) => a.number - b.number);
    const keep = list[0];
    const dups = list.slice(1);
    const [pOwner, rest] = k.split("/");
    const [pRepo, numStr] = rest.split("#");
    const pNum = Number(numStr);

    // Fetch partner issue
    let partner: any | null = null;
    try {
      const { data } = await okRead.issues.get({ owner: pOwner, repo: pRepo, issue_number: pNum });
      partner = data;
    } catch {
      // Partner not found -> delete all mirrors in this group
      for (const it of list) {
        try { await (okWrite as any).request("POST /graphql", { query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }", id: it.node_id }); deleted++; } catch {}
      }
      continue;
    }

    const partnerLabels = (partner.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)).filter(Boolean);
    const priced = hasPrice(partnerLabels);
    if (!priced) {
      // Should not exist in directory: delete all mirrors in this group
      for (const it of list) {
        try { await (okWrite as any).request("POST /graphql", { query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }", id: it.node_id }); deleted++; } catch {}
      }
      continue;
    }

    // Dedupe: delete all duplicates beyond the oldest
    for (const it of dups) {
      try { await (okWrite as any).request("POST /graphql", { query: "mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }", id: it.node_id }); deleted++; } catch {}
    }

    // Sync state & labels on the kept issue
    const desiredState: "open" | "closed" = partner.state === "open" ? "open" : "closed";
    const desiredReason: "completed" | "not_planned" | undefined = partner.state === "closed" ? (partner.state_reason === "not_planned" ? "not_planned" : "completed") : undefined;
    try {
      const needsStateUpdate = keep.state !== desiredState;
      const needsLabelUpdate = JSON.stringify(keep.labels?.map((l: any) => (typeof l === "string" ? l : l.name)).sort()) !== JSON.stringify([...partnerLabels].sort());
      if (needsStateUpdate || needsLabelUpdate) {
        await (okWrite as any).issues.update({
          owner,
          repo,
          issue_number: keep.number,
          state: desiredState,
          state_reason: desiredReason,
          labels: partnerLabels,
          title: partner.title ?? keep.title,
          body: `https://github.com/${pOwner}/${pRepo}/issues/${pNum}`,
        });
        updated++;
      }
      kept++;
    } catch {
      // best-effort; continue
    }
  }

  console.log(JSON.stringify({ deleted, updated, kept, scanned: dirIssues.length }));
}

main().catch((err) => { console.error(err); process.exit(1); });
