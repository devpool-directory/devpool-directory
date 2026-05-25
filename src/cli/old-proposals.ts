#!/usr/bin/env -S node --enable-source-maps
import process from "node:process";
import type { PartnerIssue } from "../artifacts/types";
import { readJsonFromStorage } from "../artifacts/storage";
import { getOctokitRead } from "../github/client";
import { buildOldProposalConfig, handleOldProposals } from "../proposals/old-proposals";

async function main() {
  const config = buildOldProposalConfig();
  const proposals = (await readJsonFromStorage<PartnerIssue[]>("partner-open-proposals.json")) ?? [];
  // Proposal updates are written to partner repositories, not directory mirrors.
  // getOctokitRead prefers GH_TOKEN when present, which is the cross-repo token
  // already used by sync jobs for broad partner access.
  const octokit = getOctokitRead();
  const actions = await handleOldProposals({ octokit, proposals, config });

  console.log(
    JSON.stringify(
      {
        dryRun: config.dryRun,
        scanned: proposals.length,
        requestedUpdates: actions.filter((action) => action.type === "request-update").length,
        closed: actions.filter((action) => action.type === "close").length,
        skipped: actions.filter((action) => action.type === "skip").length,
        actions,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
