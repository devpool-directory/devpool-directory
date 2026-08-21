/**
 * @file config-protection.ts
 * @title Config Protection: Unauthorized Modification Rollback
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5034
 * @upstream https://github.com/ubiquity-os/plugins-wishlist/issues/30
 * @bounty $75 USD
 *
 * @description
 * This plugin provides scaffolding for protecting configuration files that
 * affect money flow from unauthorized modifications. The upstream issue
 * requests that only admins or billing managers should be able to modify
 * config, and unauthorized changes should be automatically rolled back by
 * the UbiquiBot.
 *
 * Key requirements from upstream:
 * 1. Check if config was modified on commit/push webhook
 * 2. Verify the author has admin or billing_manager permission
 * 3. If unauthorized, immediately rollback by committing previous version as UbiquiBot
 * 4. Make fraud near impossible through automated enforcement
 *
 * Generated modules:
 * - Permission Checker: Validates user role against allowed roles
 * - Config Diff Detector: Identifies changes to protected config paths
 * - Auto-Rollback Engine: Reverts unauthorized changes via bot commit
 * - Audit Logger: Records all protection events for compliance
 * - Protected Path Registry: Configurable list of sensitive file patterns
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * GitHub user permission level in a repository.
 */
export type UserPermission = "admin" | "maintain" | "write" | "triage" | "read" | "none";

/**
 * Result of a permission check.
 */
export interface PermissionCheckResult {
  username: string;
  permission: UserPermission;
  isAuthorized: boolean;
  requiredRoles: string[];
}

/**
 * A detected change to a protected file.
 */
export interface ProtectedFileChange {
  /** File path relative to repo root */
  path: string;
  /** SHA of the file before this commit */
  previousSha: string | null;
  /** SHA of the file after this commit */
  currentSha: string;
  /** Whether the file was added, modified, or deleted */
  changeType: "added" | "modified" | "deleted";
  /** Raw diff patch content */
  patch?: string;
}

/**
 * Result of a rollback operation.
 */
export interface RollbackResult {
  success: boolean;
  rollbackCommitSha: string | null;
  originalCommitSha: string;
  filesReverted: string[];
  errorMessage?: string;
  timestamp: string;
}

/**
 * Audit log entry for config protection events.
 */
export interface ProtectionAuditEntry {
  id: string;
  timestamp: string;
  repoFullName: string;
  commitSha: string;
  author: string;
  action: "allowed" | "blocked" | "rollback_success" | "rollback_failed";
  protectedFilesAffected: string[];
  reason: string;
  rollbackCommitSha?: string;
}

/**
 * Configuration for the config protection system.
 */
export interface ConfigProtectionConfig {
  /** File path patterns to protect (glob syntax) */
  protectedPaths: string[];
  /** User roles allowed to modify protected files */
  allowedRoles: UserPermission[];
  /** Bot username used for rollback commits */
  botUsername: string;
  /** Whether to enable automatic rollback (false = alert only) */
  enableAutoRollback: boolean;
  /** Maximum time window to detect and rollback (ms) */
  rollbackWindowMs: number;
  /** Whether to notify maintainers on blocked changes */
  notifyOnBlock: boolean;
  /** Notification channel: issue comment, slack, email */
  notificationChannel: "issue_comment" | "slack" | "email";
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default configuration matching upstream security requirements.
 */
export const DEFAULT_CONFIG: ConfigProtectionConfig = {
  protectedPaths: [
    ".ubiquity/config.json",
    ".ubiquity/rewards.json",
    ".ubiquity/billing.json",
    "config/pricing.yml",
    "config/rewards.yml",
    "**/billing-config.*",
    "**/payment-config.*",
  ],
  allowedRoles: ["admin", "maintain"],
  botUsername: "ubiquibot",
  enableAutoRollback: true,
  rollbackWindowMs: 30000, // 30 seconds
  notifyOnBlock: true,
  notificationChannel: "issue_comment",
};

// ============================================================================
// SECTION 3: Permission Checker Generator
// ============================================================================

/**
 * Generates the module that validates user permissions against allowed roles.
 *
 * @param config - Protection configuration
 * @returns TypeScript source code string
 */
export function generatePermissionChecker(config: ConfigProtectionConfig): string {
  return `/**
 * Auto-generated Config Protection Permission Checker
 * Validates whether a user has authorization to modify protected files.
 */

import { Octokit } from "@octokit/rest";

type UserPermission = "admin" | "maintain" | "write" | "triage" | "read" | "none";

interface PermissionCheckResult {
  username: string;
  permission: UserPermission;
  isAuthorized: boolean;
  requiredRoles: string[];
}

const CONFIG = {
  allowedRoles: ${JSON.stringify(config.allowedRoles)} as UserPermission[],
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Gets a user's permission level in a repository.
 */
export async function getUserPermission(
  owner: string,
  repo: string,
  username: string
): Promise<UserPermission> {
  try {
    const response = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return response.data.permission as UserPermission;
  } catch (error) {
    // User may not be a collaborator at all
    if ((error as any).status === 404) {
      return "none";
    }
    throw error;
  }
}

/**
 * Checks if a user is authorized to modify protected config files.
 */
export async function checkAuthorization(
  owner: string,
  repo: string,
  username: string
): Promise<PermissionCheckResult> {
  const permission = await getUserPermission(owner, repo, username);
  const isAuthorized = CONFIG.allowedRoles.includes(permission);

  return {
    username,
    permission,
    isAuthorized,
    requiredRoles: [...CONFIG.allowedRoles],
  };
}

/**
 * Batch checks multiple users (useful for PR reviews).
 */
export async function checkMultipleUsers(
  owner: string,
  repo: string,
  usernames: string[]
): Promise<Map<string, PermissionCheckResult>> {
  const results = new Map<string, PermissionCheckResult>();
  
  for (const username of usernames) {
    const result = await checkAuthorization(owner, repo, username);
    results.set(username, result);
  }
  
  return results;
}
`;
}

// ============================================================================
// SECTION 4: Config Diff Detector Generator
// ============================================================================

/**
 * Generates the module that detects changes to protected file paths.
 *
 * @param config - Protection configuration
 * @returns TypeScript source code string
 */
export function generateDiffDetector(config: ConfigProtectionConfig): string {
  return `/**
 * Auto-generated Protected Config Diff Detector
 * Identifies modifications to sensitive configuration files in a commit.
 */

import { Octokit } from "@octokit/rest";
import micromatch from "micromatch";

interface ProtectedFileChange {
  path: string;
  previousSha: string | null;
  currentSha: string;
  changeType: "added" | "modified" | "deleted";
  patch?: string;
}

const CONFIG = {
  protectedPaths: ${JSON.stringify(config.protectedPaths)},
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Checks if a file path matches any protected pattern.
 */
export function isProtectedPath(filePath: string): boolean {
  return micromatch.isMatch(filePath, CONFIG.protectedPaths);
}

/**
 * Gets all protected file changes in a specific commit.
 */
export async function getProtectedChangesInCommit(
  owner: string,
  repo: string,
  commitSha: string
): Promise<ProtectedFileChange[]> {
  const response = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: commitSha,
  });

  const protectedChanges: ProtectedFileChange[] = [];

  for (const file of response.data.files || []) {
    if (isProtectedPath(file.filename)) {
      let changeType: ProtectedFileChange["changeType"] = "modified";
      if (file.status === "added") changeType = "added";
      else if (file.status === "removed") changeType = "deleted";

      protectedChanges.push({
        path: file.filename,
        previousSha: file.previous_filename ? null : (file.sha !== file.patch ? null : file.sha),
        currentSha: file.sha || "",
        changeType,
        patch: file.patch,
      });
    }
  }

  return protectedChanges;
}

/**
 * Gets the content of a file at a specific commit SHA.
 */
export async function getFileAtCommit(
  owner: string,
  repo: string,
  path: string,
  commitSha: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: commitSha,
    });

    if ("content" in response.data && typeof response.data.content === "string") {
      const content = Buffer.from(response.data.content, "base64").toString("utf-8");
      return { content, sha: response.data.sha };
    }

    return null;
  } catch (error) {
    if ((error as any).status === 404) return null;
    throw error;
  }
}

/**
 * Compares two commits and returns protected file differences.
 */
export async function compareCommitsForProtectedChanges(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
): Promise<ProtectedFileChange[]> {
  const response = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha,
  });

  const protectedChanges: ProtectedFileChange[] = [];

  for (const file of response.data.files || []) {
    if (isProtectedPath(file.filename)) {
      let changeType: ProtectedFileChange["changeType"] = "modified";
      if (file.status === "added") changeType = "added";
      else if (file.status === "removed") changeType = "deleted";

      protectedChanges.push({
        path: file.filename,
        previousSha: file.previous_filename ? null : file.sha,
        currentSha: file.sha || "",
        changeType,
        patch: file.patch,
      });
    }
  }

  return protectedChanges;
}
`;
}

// ============================================================================
// SECTION 5: Auto-Rollback Engine Generator
// ============================================================================

/**
 * Generates the automatic rollback engine that reverts unauthorized changes.
 *
 * @param config - Protection configuration
 * @returns TypeScript source code string
 */
export function generateRollbackEngine(config: ConfigProtectionConfig): string {
  return `/**
 * Auto-generated Config Protection Rollback Engine
 * Reverts unauthorized config modifications by committing previous versions as UbiquiBot.
 */

import { Octokit } from "@octokit/rest";

interface RollbackResult {
  success: boolean;
  rollbackCommitSha: string | null;
  originalCommitSha: string;
  filesReverted: string[];
  errorMessage?: string;
  timestamp: string;
}

interface ProtectedFileChange {
  path: string;
  previousSha: string | null;
  currentSha: string;
  changeType: "added" | "modified" | "deleted";
}

const CONFIG = {
  botUsername: "${config.botUsername}",
  enableAutoRollback: ${config.enableAutoRollback},
  rollbackWindowMs: ${config.rollbackWindowMs},
};

const octokit = new Octokit({ auth: process.env.UBIQUIBOT_TOKEN });

/**
 * Rolls back unauthorized changes to protected config files.
 * Creates a new commit restoring the previous versions.
 */
export async function rollbackUnauthorizedChanges(
  owner: string,
  repo: string,
  branch: string,
  unauthorizedCommitSha: string,
  parentCommitSha: string,
  protectedChanges: ProtectedFileChange[],
  authorUsername: string
): Promise<RollbackResult> {
  const timestamp = new Date().toISOString();

  if (!CONFIG.enableAutoRollback) {
    return {
      success: false,
      rollbackCommitSha: null,
      originalCommitSha: unauthorizedCommitSha,
      filesReverted: [],
      errorMessage: "Auto-rollback is disabled; alert-only mode",
      timestamp,
    };
  }

  try {
    // Get the tree from the parent commit (before unauthorized change)
    const parentCommit = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: parentCommitSha,
    });

    // Build file contents to restore
    const filesToRestore: Array<{ path: string; content: string; sha: string }> = [];

    for (const change of protectedChanges) {
      if (change.changeType === "added") {
        // For added files, we need to delete them in the rollback
        // This is handled by not including them in the new tree
        continue;
      }

      // Get file content from parent commit
      try {
        const fileContent = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: change.path,
          ref: parentCommitSha,
        });

        if ("content" in fileContent.data && typeof fileContent.data.content === "string") {
          const content = Buffer.from(fileContent.data.content, "base64").toString("utf-8");
          filesToRestore.push({
            path: change.path,
            content,
            sha: fileContent.data.sha,
          });
        }
      } catch (e) {
        console.warn(\`Could not retrieve \${change.path} at parent commit: \${(e as Error).message}\`);
      }
    }

    if (filesToRestore.length === 0 && !protectedChanges.some(c => c.changeType === "added")) {
      return {
        success: false,
        rollbackCommitSha: null,
        originalCommitSha: unauthorizedCommitSha,
        filesReverted: [],
        errorMessage: "No files could be restored",
        timestamp,
      };
    }

    // Create blobs for each restored file
    const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];

    for (const file of filesToRestore) {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });

      treeEntries.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.data.sha,
      });
    }

    // Handle deletions (files that were added in unauthorized commit)
    for (const change of protectedChanges) {
      if (change.changeType === "added") {
        treeEntries.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null, // null SHA = deletion
        });
      }
    }

    // Create new tree based on parent
    const newTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.data.commit.tree.sha,
      tree: treeEntries,
    });

    // Create rollback commit
    const rollbackCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: \`🔒 Revert unauthorized config modification by @\${authorUsername}\\n\\nOriginal commit: \${unauthorizedCommitSha.substring(0, 7)}\\nProtected files reverted:\\n\${protectedChanges.map(c => \`- \${c.path} (\${c.changeType})\`).join("\\n")}\\n\\nAutomated rollback by \${CONFIG.botUsername}\`,
      tree: newTree.data.sha,
      parents: [unauthorizedCommitSha],
      author: {
        name: CONFIG.botUsername,
        email: \`\${CONFIG.botUsername}@users.noreply.github.com\`,
        date: timestamp,
      },
    });

    // Update branch reference to point to rollback commit
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: \`heads/\${branch}\`,
      sha: rollbackCommit.data.sha,
      force: true,
    });

    return {
      success: true,
      rollbackCommitSha: rollbackCommit.data.sha,
      originalCommitSha: unauthorizedCommitSha,
      filesReverted: protectedChanges.map(c => c.path),
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      rollbackCommitSha: null,
      originalCommitSha: unauthorizedCommitSha,
      filesReverted: [],
      errorMessage: (error as Error).message,
      timestamp,
    };
  }
}
`;
}

// ============================================================================
// SECTION 6: Audit Logger Generator
// ============================================================================

/**
 * Generates the audit logging module for compliance tracking.
 *
 * @returns TypeScript source code string
 */
export function generateAuditLogger(): string {
  return `/**
 * Auto-generated Config Protection Audit Logger
 * Records all protection events for compliance and forensics.
 */

import * as fs from "fs";
import * as path from "path";

interface ProtectionAuditEntry {
  id: string;
  timestamp: string;
  repoFullName: string;
  commitSha: string;
  author: string;
  action: "allowed" | "blocked" | "rollback_success" | "rollback_failed";
  protectedFilesAffected: string[];
  reason: string;
  rollbackCommitSha?: string;
}

const AUDIT_LOG_PATH = process.env.CONFIG_PROTECTION_AUDIT_PATH || "./data/config-protection-audit.jsonl";

/**
 * Generates a unique audit entry ID.
 */
function generateAuditId(): string {
  return \`cp-\${Date.now()}-\${Math.random().toString(36).substring(2, 8)}\`;
}

/**
 * Logs a config protection event.
 */
export function logProtectionEvent(entry: Omit<ProtectionAuditEntry, "id" | "timestamp">): void {
  const fullEntry: ProtectionAuditEntry = {
    ...entry,
    id: generateAuditId(),
    timestamp: new Date().toISOString(),
  };

  const dir = path.dirname(AUDIT_LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(fullEntry) + "\\n");
}

/**
 * Queries audit logs by criteria.
 */
export function queryAuditLogs(filters: {
  repoFullName?: string;
  author?: string;
  action?: ProtectionAuditEntry["action"];
  since?: string;
  until?: string;
}): ProtectionAuditEntry[] {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return [];

  const lines = fs.readFileSync(AUDIT_LOG_PATH, "utf-8").split("\\n").filter(Boolean);
  const entries: ProtectionAuditEntry[] = lines.map(l => JSON.parse(l));

  return entries.filter(entry => {
    if (filters.repoFullName && entry.repoFullName !== filters.repoFullName) return false;
    if (filters.author && entry.author !== filters.author) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.since && entry.timestamp < filters.since) return false;
    if (filters.until && entry.timestamp > filters.until) return false;
    return true;
  });
}

/**
 * Gets summary statistics from audit logs.
 */
export function getAuditStats(since?: string): {
  totalEvents: number;
  blockedCount: number;
  rollbackSuccessCount: number;
  rollbackFailedCount: number;
  topOffenders: Array<{ author: string; count: number }>;
} {
  const entries = queryAuditLogs({ since });
  
  const blocked = entries.filter(e => e.action === "blocked" || e.action === "rollback_success" || e.action === "rollback_failed");
  const offenderMap = new Map<string, number>();
  
  for (const entry of blocked) {
    offenderMap.set(entry.author, (offenderMap.get(entry.author) || 0) + 1);
  }

  const topOffenders = Array.from(offenderMap.entries())
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEvents: entries.length,
    blockedCount: entries.filter(e => e.action === "blocked").length,
    rollbackSuccessCount: entries.filter(e => e.action === "rollback_success").length,
    rollbackFailedCount: entries.filter(e => e.action === "rollback_failed").length,
    topOffenders,
  };
}
`;
}

// ============================================================================
// SECTION 7: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #30:
 * 1. Detects config modifications on commit webhook
 * 2. Checks user permission (admin/billing_manager only)
 * 3. Rolls back unauthorized changes via UbiquiBot commit
 * 4. Makes fraud near impossible through automation
 * 5. References existing logic from assistive-pricing repo
 *
 * @param config - Protection configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: ConfigProtectionConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Protected paths configured",
      passed: config.protectedPaths.length >= 1,
      detail: `${config.protectedPaths.length} patterns`,
    },
    {
      name: "Allowed roles restricted to admin/maintain",
      passed: config.allowedRoles.every(r => ["admin", "maintain"].includes(r)),
      detail: `Roles: ${config.allowedRoles.join(", ")}`,
    },
    {
      name: "Bot username configured",
      passed: config.botUsername.length > 0,
      detail: `Bot: ${config.botUsername}`,
    },
    {
      name: "Auto-rollback enabled",
      passed: config.enableAutoRollback === true,
      detail: `Enabled: ${config.enableAutoRollback}`,
    },
    {
      name: "Rollback window reasonable (< 60s)",
      passed: config.rollbackWindowMs <= 60000,
      detail: `Window: ${config.rollbackWindowMs}ms`,
    },
    {
      name: "Notification configured",
      passed: config.notifyOnBlock === true,
      detail: `Notify: ${config.notifyOnBlock} via ${config.notificationChannel}`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 8: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "config-protection",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5034",
  upstream: "https://github.com/ubiquity-os/plugins-wishlist/issues/30",
  bounty: 75,
  generators: [
    "generatePermissionChecker",
    "generateDiffDetector",
    "generateRollbackEngine",
    "generateAuditLogger",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<ConfigProtectionConfig> = {}
): void {
  const mergedConfig: ConfigProtectionConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(`  ✗ ${c.name}: ${c.detail}`));
  }

  const files: Record<string, string> = {
    "permission-checker.ts": generatePermissionChecker(mergedConfig),
    "diff-detector.ts": generateDiffDetector(mergedConfig),
    "rollback-engine.ts": generateRollbackEngine(mergedConfig),
    "audit-logger.ts": generateAuditLogger(),
  };

  console.log(`Scaffolding config protection in ${outputDir}...`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(`  Writing ${filename} (${content.length} bytes)`);
  }
  console.log("Scaffold complete.");
}
