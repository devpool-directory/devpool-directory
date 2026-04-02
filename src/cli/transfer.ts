#!/usr/bin/env -S node --enable-source-maps
/**
 * transfer.ts - Automatic Transfer CLI
 *
 * Processes directory issues that are closed with "completed" reason and have
 * a price label. For each such issue, if `permit_generation.transfer: true` is
 * configured, invokes the permit generation service with `transfer: true` to
 * automatically transfer funds to the assignee.
 *
 * Usage:
 *   node dist/cli/transfer.js [--dry-run] [--force]
 *
 * Environment variables:
 *   DIRECTORY_OWNER      - Owner of the directory repository
 *   DIRECTORY_REPO        - Name of the directory repository
 *   EVT_PRIVATE_KEY      - Encrypted EVM private key for signing transfers
 *   PERMIT_URL            - Override permit generation service URL
 *   GH_TOKEN              - GitHub token for API access
 */

import process from "node:process";
import { getOctokitRead } from "../github/client.js";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME } from "../directory/directory.js";

interface PermitDescriptor {
  username: string;
  amount: string;
  address: string;
  task: {
    id: string;
    number: number;
    url: string;
  };
  transfer: boolean;
  evmPrivateKeyEncrypted: string;
}

interface TransferResult {
  issue_number: number;
  assignee: string;
  amount: string;
  success: boolean;
  error?: string;
  tx_hash?: string;
}

interface PriceLabel {
  name: string;
  value?: string;
}

function parsePriceFromLabels(labels: (string | PriceLabel)[]): string | null {
  for (const label of labels || []) {
    const name = typeof label === "string" ? label : label?.name;
    const match = String(name).match(/^Price:\s*\$?([\d,]+(?:\.\d{1,2})?)/);
    if (match) {
      return match[1].replace(",", "");
    }
  }
  return null;
}

async function invokePermitGeneration(
  permitUrl: string,
  permits: PermitDescriptor[],
  dry: boolean
): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
  if (dry) {
    console.log(`[DRY RUN] Would invoke permit generation at ${permitUrl}`);
    console.log(`[DRY RUN] Permits:`, JSON.stringify(permits, null, 2));
    return { success: true };
  }

  try {
    const response = await fetch(`${permitUrl}/permit-generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permits }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = (await response.json()) as { tx_hash?: string; error?: string };
    return { success: true, tx_hash: data.tx_hash, error: data.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const owner = process.env.DIRECTORY_OWNER || DEVPOOL_OWNER_NAME;
  const repo = process.env.DIRECTORY_REPO || DEVPOOL_REPO_NAME;
  const permitUrl = process.env.PERMIT_URL || "https://pay.ubq.fi";
  const evmPrivateKey = process.env.EVT_PRIVATE_KEY || "";

  if (!evmPrivateKey && !dry) {
    console.error("EVT_PRIVATE_KEY environment variable is required for automatic transfers.");
    console.error("Set it as a secret in your CI environment or .env file.");
    process.exit(1);
  }

  const octokit = getOctokitRead();

  console.log(`Scanning completed issues in ${owner}/${repo}...`);

  // Fetch all closed issues from the directory
  const allIssues: any[] = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state: "closed",
    per_page: 100,
  } as any);

  // Filter to issues with a price label that have an assignee
  const completableIssues = allIssues.filter((issue) => {
    if (!issue.assignee) return false;
    const labels = (issue.labels || []).map((l: any) => (typeof l === "string" ? l : l.name));
    const hasPrice = labels.some((l: string) => /^Price:\s*/.test(l));
    const isCompleted = issue.state_reason === "completed";
    // Only process if not already processed (no "Transfer: Completed" label) or if --force
    const labelsLower = labels.map((l: string) => l.toLowerCase());
    const alreadyTransferred = labelsLower.some((l: string) => l.includes("transfer:"));
    return hasPrice && isCompleted && (force || !alreadyTransferred);
  });

  console.log(`Found ${completableIssues.length} completed priced issues to process.`);

  const results: TransferResult[] = [];

  for (const issue of completableIssues) {
    const labels = (issue.labels || []).map((l: any) => (typeof l === "string" ? l : l.name));
    const priceStr = parsePriceFromLabels(labels);
    const assignee = issue.assignee?.login;

    if (!priceStr || !assignee) {
      console.log(`Skipping #${issue.number}: missing price or assignee.`);
      continue;
    }

    // Parse partner issue URL from body
    const partnerUrl = String(issue.body || "").trim();
    if (!partnerUrl.startsWith("https://github.com/")) {
      console.log(`Skipping #${issue.number}: invalid partner URL in body.`);
      continue;
    }

    // Build permit descriptor
    const permit: PermitDescriptor = {
      username: assignee,
      amount: priceStr,
      address: "", // Will be looked up by the permit service
      task: {
        id: issue.node_id,
        number: issue.number,
        url: issue.html_url,
      },
      transfer: true,
      evmPrivateKeyEncrypted: evmPrivateKey,
    };

    console.log(`Processing #${issue.number} (${assignee}, $${priceStr})...`);

    const result = await invokePermitGeneration(permitUrl, [permit], dry);

    const transferResult: TransferResult = {
      issue_number: issue.number,
      assignee,
      amount: `$${priceStr}`,
      success: result.success,
      error: result.error,
      tx_hash: result.tx_hash,
    };

    if (result.success) {
      console.log(`✅ Transfer successful for #${issue.number}: ${assignee} $${priceStr}${result.tx_hash ? ` (tx: ${result.tx_hash})` : ""}`);

      // Add "Transfer: Completed" label to mark as processed
      if (!dry) {
        try {
          await (octokit as any).issues.addLabels({
            owner,
            repo,
            issue_number: issue.number,
            labels: ["Transfer: Completed"],
          });
        } catch (labelErr) {
          console.warn(`Failed to add transfer label to #${issue.number}:`, labelErr);
        }
      }
    } else {
      console.error(`❌ Transfer failed for #${issue.number}: ${result.error}`);
    }

    results.push(transferResult);
  }

  const summary = {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    dry,
    results,
  };

  console.log("\n=== Transfer Summary ===");
  console.log(`Total: ${summary.total}`);
  console.log(`Successful: ${summary.successful}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Transfer CLI error:", err);
  process.exit(1);
});
