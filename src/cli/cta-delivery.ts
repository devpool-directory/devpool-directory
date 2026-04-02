#!/usr/bin/env -S node --enable-source-maps
/**
 * CTA Delivery Automation
 *
 * Accepts a repository URL, triggers the text-conversation-rewards workflow
 * on that repo (via workflow_dispatch), and records org usage for the
 * "one free report per org" safety constraint.
 *
 * Usage:
 *   npm run build && node dist/cli/cta-delivery.js <repo-url> [--email user@example.com]
 *
 * Environment:
 *   GH_TOKEN         - PAT with repo + workflow scopes
 *   WORKFLOW_REPO    - org/repo owning the target workflow (default: ubiquity-os-marketplace)
 *   WORKFLOW_FILE    - workflow filename (default: compute.yml)
 *   WORKFLOW_REF     - branch/tag to run from (default: main)
 *   CTA_STATE_FILE   - path to JSON tracking org usage (default: .cta-state.json in cwd)
 */

import { getOctokitWrite, getOctokitRead } from "../github/client";
import { env } from "../config/load";
import { info, warn, error } from "../util/log";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ── Types ────────────────────────────────────────────────────────────────────

interface CtaState {
  /** org -> timestamp of last triggered report */
  orgsTriggered: Record<string, string>;
}

interface TriggerResult {
  success: boolean;
  runId?: number;
  runUrl?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  // Accepts: https://github.com/owner/repo, owner/repo, github.com/owner/repo
  const m = input.match(/(?:github\.com\/)?([^\/]+)\/([^\/\s]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function isPrivateRepo(octokit: ReturnType<typeof getOctokitRead>, owner: string, repo: string): Promise<boolean> {
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return data.private ?? false;
  } catch {
    return false; // assume public if we can't tell
  }
}

async function getWorkflowId(
  octokit: ReturnType<typeof getOctokitWrite>,
  workflowOwner: string,
  workflowRepo: string,
  workflowFile: string
): Promise<string | null> {
  try {
    const { data } = await octokit.actions.listRepoWorkflows({ owner: workflowOwner, repo: workflowRepo });
    const wf = data.workflows.find((w) => w.path.endsWith(workflowFile));
    return wf ? String(wf.id) : null;
  } catch (e) {
    error("Failed to list workflows", e);
    return null;
  }
}

function loadState(statePath: string): CtaState {
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, "utf8")) as CtaState;
    }
  } catch {}
  return { orgsTriggered: {} };
}

function saveState(statePath: string, state: CtaState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

// ── Core Logic ────────────────────────────────────────────────────────────────

/**
 * Triggers workflow_dispatch on the target repo for the text-conversation-rewards action.
 */
async function triggerWorkflow(
  octokit: ReturnType<typeof getOctokitWrite>,
  targetOwner: string,
  targetRepo: string,
  workflowOwner: string,
  workflowRepo: string,
  workflowFile: string,
  workflowRef: string
): Promise<TriggerResult> {
  const workflowId = await getWorkflowId(octokit, workflowOwner, workflowRepo, workflowFile);
  if (!workflowId) {
    return { success: false, error: `Workflow '${workflowFile}' not found in ${workflowOwner}/${workflowRepo}` };
  }

  // Prepare inputs for text-conversation-rewards
  // These inputs are required by the action.yml
  const inputs: Record<string, string> = {
    eventName: "workflow_dispatch",
    ref: workflowRef,
    // stateId and eventPayload are dynamic; use a generated UUID-like stateId
    stateId: `cta-${targetOwner}-${targetRepo}-${Date.now()}`,
    eventPayload: JSON.stringify({
      action: "workflow_dispatch",
      repository: { owner: { login: targetOwner }, name: { name: targetRepo } },
    }),
    settings: JSON.stringify({ allowOnlyRoles: ["contributor", "collaborator", "member", "owner"] }),
    authToken: process.env.WF_AUTH_TOKEN || "",
  };

  try {
    const { data } = await octokit.actions.createWorkflowDispatch({
      owner: workflowOwner,
      repo: workflowRepo,
      workflow_id: workflowId,
      ref: workflowRef,
      inputs,
      // Note: dispatch happens on the workflow repo itself, targeting the target repo
      // For cross-repo triggering we need to use the workflow file from the org's marketplace
    } as any);

    info(`Workflow dispatch sent for ${targetOwner}/${targetRepo}`);

    // Poll for the run
    const runId = await pollForRun(octokit, workflowOwner, workflowRepo, targetOwner, targetRepo, workflowId);
    return {
      success: true,
      runId,
      runUrl: runId ? `https://github.com/${workflowOwner}/${workflowRepo}/actions/runs/${runId}` : undefined,
    };
  } catch (e: any) {
    error("Workflow dispatch failed", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

async function pollForRun(
  octokit: ReturnType<typeof getOctokitWrite>,
  workflowOwner: string,
  workflowRepo: string,
  targetOwner: string,
  targetRepo: string,
  workflowId: string,
  maxAttempts = 10,
  intervalMs = 5000
): Promise<number | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await octokit.actions.listWorkflowRuns({
        owner: workflowOwner,
        repo: workflowRepo,
        workflow_id: workflowId,
        actor: workflowOwner,
        per_page: 5,
      } as any);
      const run = data.workflow_runs?.find(
        (r: any) =>
          r.head_branch === targetOwner && // Using branch convention to link to target org
          r.status !== "queued"
      );
      if (run) return run.id;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return undefined;
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
CTA Delivery Automation

Usage:
  node dist/cli/cta-delivery.js <repo-url> [--email user@example.com]

Description:
  - Accepts a GitHub repository URL
  - Triggers text-conversation-rewards workflow on the repo
  - Enforces one-free-report-per-org safety constraint
  - Tracks org usage in .cta-state.json

Environment:
  GH_TOKEN          PAT with repo + workflow scopes
  WORKFLOW_REPO     org/repo with the workflow (default: ubiquity-os-marketplace/text-conversation-rewards)
  WORKFLOW_FILE     workflow filename (default: compute.yml)
  WORKFLOW_REF      branch/tag (default: main)
  CTA_STATE_FILE    path to state JSON (default: .cta-state.json in cwd)
  WF_AUTH_TOKEN     auth token passed to the workflow
  SMTP_*            email settings (future)

Example:
  node dist/cli/cta-delivery.js https://github.com/myorg/myrepo --email user@example.com
`);
    process.exit(0);
  }

  const repoUrl = args[0];
  const emailArg = args.find((a) => a.startsWith("--email="));
  const userEmail = emailArg ? emailArg.split("=")[1] : null;

  // Parse repo URL
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    error("Invalid repository URL", repoUrl);
    process.exit(1);
  }
  const { owner, repo } = parsed;
  info(`Target repo: ${owner}/${repo}`);

  // Config
  const workflowRepoSpec = env("WORKFLOW_REPO", false) || "ubiquity-os-marketplace/text-conversation-rewards";
  const [workflowOwner, workflowRepoName] = workflowRepoSpec.split("/");
  const workflowFile = env("WORKFLOW_FILE", false) || "compute.yml";
  const workflowRef = env("WORKFLOW_REF", false) || "main";
  const stateFile = env("CTA_STATE_FILE", false) || path.join(process.cwd(), ".cta-state.json");

  const octokit = getOctokitWrite();

  // ── Safety: One free report per org ────────────────────────────────────────
  const state = loadState(stateFile);
  if (state.orgsTriggered[owner]) {
    warn(
      `Organization '${owner}' has already received a report on ${state.orgsTriggered[owner]}.`,
      "One free report per org is enforced for safety."
    );
    console.log(`\n⚠️  Already claimed: ${owner} received a report on ${state.orgsTriggered[owner]}`);
    console.log("Please contact support if you believe this is an error.");
    process.exit(0); // exit 0 — not an error, just already used
  }

  // ── Validate repo is public ─────────────────────────────────────────────────
  const octokitRead = getOctokitRead();
  const isPrivate = await isPrivateRepo(octokitRead, owner, repo);
  if (isPrivate) {
    warn(`Repository ${owner}/${repo} is private. Skipping as per safety requirements.`);
    console.log("\n🔒 Private repositories are not eligible for automated CTA reports.");
    process.exit(0);
  }

  // ── Trigger workflow ─────────────────────────────────────────────────────────
  info(`Triggering workflow on ${owner}/${repo}...`);
  const result = await triggerWorkflow(
    octokit,
    owner,
    repo,
    workflowOwner,
    workflowRepoName,
    workflowFile,
    workflowRef
  );

  if (!result.success) {
    error("Workflow trigger failed", result.error);
    process.exit(1);
  }

  // ── Record org usage ─────────────────────────────────────────────────────────
  state.orgsTriggered[owner] = new Date().toISOString();
  saveState(stateFile, state);
  info(`Recorded usage for org: ${owner}`, state.orgsTriggered[owner]);

  // ── Output summary ───────────────────────────────────────────────────────────
  console.log("\n✅ CTA Delivery triggered successfully!");
  console.log(`   Org:        ${owner}`);
  console.log(`   Repo:       ${repo}`);
  if (result.runUrl) console.log(`   Run URL:    ${result.runUrl}`);
  console.log(`   State file: ${stateFile}`);
  if (userEmail) console.log(`   Email:      ${userEmail} (email delivery — see docs)`);

  info("CTA Delivery complete", { owner, repo, runId: result.runId });
}

main().catch((e) => {
  error("Unhandled error", e);
  process.exit(1);
});
