#!/usr/bin/env -S node --enable-source-maps
/**
 * Processes closed directory issues and invokes automatic transfers for
 * completed partner issues with a price label and assignee.
 *
 * Usage: node dist/cli/transfer.js [--dry-run] [--force]
 */

import process from "node:process";
import { getOctokitRead, getOctokitWrite } from "../github/client";
import { processCompletedIssueTransfer } from "../transfer/automatic-transfer";
import { loadConfig } from "../config/load";

function parsePartnerUrl(text: string): { owner: string; repo: string; number: number } | null {
  if (!text) return null;
  const normalized = text.trim().replace("https://www.github.com/", "https://github.com/");
  const match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const owner = process.env.DIRECTORY_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0] || "";
  const repo = process.env.DIRECTORY_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
  if (!owner || !repo) throw new Error("DIRECTORY_OWNER and DIRECTORY_REPO required");

  const guard = process.env.WRITE_TARGET_REPO;
  const target = `${owner}/${repo}`;
  if (guard && guard !== target) throw new Error(`write-blocked: target ${target} != enforced ${guard}`);

  let permitUrl = process.env.PERMIT_URL || "https://pay.ubq.fi";
  let evmKeyEnv = "EVT_PRIVATE_KEY";
  try {
    const cfg = loadConfig();
    if (!cfg.permit_generation?.transfer) {
      console.log("permit_generation.transfer is disabled in config; exiting.");
      return;
    }
    permitUrl = process.env.PERMIT_URL || cfg.permit_generation.permit_url || permitUrl;
    evmKeyEnv = cfg.permit_generation.evm_private_key_env || evmKeyEnv;
  } catch {
    // fall back to env defaults
  }

  const evmPrivateKey = process.env[evmKeyEnv] || "";
  if (!evmPrivateKey && !dry) {
    console.error(`${evmKeyEnv} is required for automatic transfers.`);
    process.exit(1);
  }

  const okRead = getOctokitRead();
  const okWrite = dry ? null : getOctokitWrite();

  const closedIssues: any[] = await okRead.paginate(okRead.issues.listForRepo, {
    owner,
    repo,
    state: "closed",
    per_page: 100,
  });

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (const issue of closedIssues) {
    const labels = (issue.labels || []).map((l: any) => (typeof l === "string" ? l : l.name));
    if (!labels.some((l: string) => /^Price:\s*/.test(l))) {
      continue;
    }

    const partnerRef = parsePartnerUrl(String(issue.body || ""));
    if (!partnerRef) {
      skipped++;
      continue;
    }

    let partner: any;
    try {
      const { data } = await okRead.issues.get({
        owner: partnerRef.owner,
        repo: partnerRef.repo,
        issue_number: partnerRef.number,
      });
      partner = data;
    } catch {
      skipped++;
      continue;
    }

    const outcome = await processCompletedIssueTransfer({
      directoryIssue: issue,
      partner,
      permitUrl,
      evmPrivateKey,
      owner,
      repo,
      dry,
      force,
      octokitWrite: okWrite,
    });

    if (outcome === "skipped") {
      skipped++;
      continue;
    }

    processed++;
    if (outcome === "success") {
      successful++;
      console.log(`  Transfer successful for #${issue.number}`);
    } else {
      failed++;
      console.error(`  Transfer failed for #${issue.number}`);
    }
  }

  console.log(
    JSON.stringify({
      processed,
      successful,
      failed,
      skipped,
      dry,
      owner,
      repo,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
