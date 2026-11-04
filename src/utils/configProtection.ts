/**
 * Config Protection Utility (#5034)
 *
 * Protects UbiquityOS and DevPool configuration files from unauthorized modifications.
 * Only administrators, billing managers, and trusted bots are allowed to alter configurations
 * that govern monetary flow, bounty pricing, and bot automation logic.
 *
 * When an unauthorized change is detected on a commit, push, or pull request event,
 * this utility generates an automated rollback plan to revert the protected files
 * to their previous versions and produces security alert notifications to prevent fraud.
 *
 * References:
 * - Issue #5034: "Config Protection"
 * - Upstream Bounty: ubiquity-os/plugins-wishlist#30
 */

import * as path from "node:path";

/**
 * Standard protected configuration file patterns.
 */
export const DEFAULT_PROTECTED_CONFIG_PATTERNS: readonly string[] = Object.freeze([
  ".ubiquity-os.config.yml",
  ".ubiquity-os.config.yaml",
  ".github/.ubiquity-os.config.yml",
  ".github/.ubiquity-os.config.yaml",
  ".ubiquibot-config.yml",
  ".ubiquibot-config.yaml",
  ".github/ubiquibot-config.yml",
  ".github/ubiquibot-config.yaml",
  "config/devpool.config.json",
  ".devpoolrc.json",
]);

/**
 * Default authorized bot identifiers.
 */
export const DEFAULT_TRUSTED_BOTS: readonly string[] = Object.freeze([
  "ubiquibot[bot]",
  "ubiquity-os[bot]",
  "devpool-directory-superintendent[bot]",
  "github-actions[bot]",
]);

/**
 * Default authorized roles for modifying configuration.
 */
export const DEFAULT_AUTHORIZED_ROLES: readonly string[] = Object.freeze([
  "admin",
  "billing_manager",
  "owner",
]);

/**
 * User permission representation for config change authorization.
 */
export interface AuthorPermission {
  login: string;
  role?: "admin" | "billing_manager" | "owner" | "maintainer" | "write" | "read" | "triage" | "none" | string;
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
    maintain?: boolean;
    triage?: boolean;
  };
  isBillingManager?: boolean;
  isOrgAdmin?: boolean;
  isBot?: boolean;
}

/**
 * Represents a changed file in a commit or pull request.
 */
export interface FileChange {
  filename: string;
  status?: "added" | "modified" | "removed" | "renamed" | "unchanged" | string;
  previousFilename?: string;
  patch?: string;
  content?: string | null;
  previousContent?: string | null;
}

/**
 * Configuration options for config protection evaluation.
 */
export interface ConfigProtectionOptions {
  /** Custom protected file path patterns */
  protectedPatterns?: string[];
  /** Allowed roles (defaults to admin, billing_manager, owner) */
  allowedRoles?: string[];
  /** Explicitly allowed user logins (whitelist) */
  allowedLogins?: string[];
  /** Explicitly trusted bot logins */
  trustedBots?: string[];
  /** Whether to require strict billing_manager or admin role only */
  strictBillingCheck?: boolean;
  /** Custom bot commit author metadata */
  botAuthor?: {
    name: string;
    email: string;
  };
}

/**
 * Evaluation status of a configuration change inspection.
 */
export type ProtectionStatus = "safe" | "authorized" | "unauthorized_modification";

/**
 * Detailed result of config modification evaluation.
 */
export interface ConfigProtectionEvaluation {
  status: ProtectionStatus;
  isProtectedFileModified: boolean;
  isAuthorized: boolean;
  author: string;
  violatingFiles: string[];
  protectedFilesDetected: string[];
  reason: string;
  timestamp: string;
}

/**
 * Restoration item specification for rolling back unauthorized edits.
 */
export interface FileRevertTarget {
  path: string;
  action: "restore" | "delete";
  restoreContent: string | null;
  previousFilename?: string;
}

/**
 * Complete rollback commit plan to be executed by bot automation.
 */
export interface RevertPlan {
  shouldRevert: boolean;
  targetBranch: string;
  revertAuthor: {
    name: string;
    email: string;
  };
  commitMessage: string;
  filesToRestore: FileRevertTarget[];
  alertComment: string;
}

/**
 * Push event commit structure.
 */
export interface PushCommit {
  id: string;
  message?: string;
  author?: {
    name?: string;
    email?: string;
    username?: string;
  };
  committer?: {
    name?: string;
    email?: string;
    username?: string;
  };
  added?: string[];
  removed?: string[];
  modified?: string[];
}

/**
 * Webhook push payload subset.
 */
export interface PushWebhookPayload {
  ref?: string;
  before?: string;
  after?: string;
  repository?: {
    full_name?: string;
    default_branch?: string;
  };
  pusher?: {
    name?: string;
    email?: string;
  };
  sender?: {
    login: string;
    type?: string;
    site_admin?: boolean;
  };
  commits?: PushCommit[];
  head_commit?: PushCommit;
}

/**
 * Normalizes a file path for consistent matching against config patterns.
 */
export function normalizeConfigPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== "string") {
    return "";
  }
  // Remove leading and trailing slashes/whitespace and normalize
  const cleaned = rawPath.trim().replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "").replace(/[\/\\]+/g, "/");
  return path.posix.normalize(cleaned).toLowerCase();
}

/**
 * Checks whether a given file path corresponds to a protected configuration file.
 */
export function isProtectedConfigPath(filePath: string, customPatterns?: string[]): boolean {
  if (!filePath || typeof filePath !== "string") {
    return false;
  }
  const normalized = normalizeConfigPath(filePath);
  const patterns = customPatterns && customPatterns.length > 0
    ? customPatterns.map((p) => normalizeConfigPath(p))
    : DEFAULT_PROTECTED_CONFIG_PATTERNS.map((p) => normalizeConfigPath(p));

  return patterns.some((pattern) => {
    if (normalized === pattern) {
      return true;
    }
    // Match root configuration or path ending with pattern
    if (pattern.startsWith(".github/") && normalized === pattern) {
      return true;
    }
    // Basename match for exact config file names in root
    const base = path.posix.basename(normalized);
    const patternBase = path.posix.basename(pattern);
    if (!pattern.includes("/") && base === patternBase) {
      return true;
    }
    return false;
  });
}

/**
 * Filters a list of file paths down to those that are protected configurations,
 * deduplicating equivalent normalized paths.
 */
export function filterProtectedFiles(files: string[], customPatterns?: string[]): string[] {
  if (!Array.isArray(files)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of files) {
    if (f && isProtectedConfigPath(f, customPatterns)) {
      const normalized = normalizeConfigPath(f);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result;
}

/**
 * Determines whether an author is authorized to modify protected configuration files.
 */
export function isUserAuthorizedForConfigChange(
  author: AuthorPermission,
  options?: ConfigProtectionOptions
): boolean {
  if (!author || !author.login) {
    return false;
  }

  const loginLower = author.login.toLowerCase();

  // 1. Check trusted bots
  const trustedBots = (options?.trustedBots ?? DEFAULT_TRUSTED_BOTS).map((b) => b.toLowerCase());
  if (author.isBot || trustedBots.includes(loginLower)) {
    return true;
  }

  // 2. Check explicit allowed logins whitelist
  if (options?.allowedLogins && options.allowedLogins.length > 0) {
    const allowed = options.allowedLogins.map((u) => u.toLowerCase());
    if (allowed.includes(loginLower)) {
      return true;
    }
  }

  // 3. Check explicit billing manager and org admin flags
  if (author.isBillingManager === true) {
    return true;
  }
  if (author.isOrgAdmin === true) {
    return true;
  }

  // 4. Check role
  const allowedRoles = (options?.allowedRoles ?? DEFAULT_AUTHORIZED_ROLES).map((r) => r.toLowerCase());
  const roleLower = (author.role ?? "").toLowerCase();
  if (roleLower && allowedRoles.includes(roleLower)) {
    return true;
  }

  // 5. Check permissions object if present
  if (author.permissions) {
    if (author.permissions.admin === true) {
      return true;
    }
    if (!options?.strictBillingCheck && author.permissions.maintain === true && allowedRoles.includes("maintainer")) {
      return true;
    }
  }

  return false;
}

/**
 * Inspects a collection of modified files and checks if an unauthorized user touched protected configs.
 */
export function inspectConfigModification(params: {
  author: AuthorPermission;
  changedFiles: (string | FileChange)[];
  options?: ConfigProtectionOptions;
}): ConfigProtectionEvaluation {
  const { author, changedFiles, options } = params;
  const authorLogin = author?.login ?? "unknown";
  const timestamp = new Date().toISOString();

  // Extract filenames from string | FileChange
  const fileNames = changedFiles.map((item) => (typeof item === "string" ? item : item.filename));
  const detectedProtected = filterProtectedFiles(fileNames, options?.protectedPatterns);

  if (detectedProtected.length === 0) {
    return {
      status: "safe",
      isProtectedFileModified: false,
      isAuthorized: true,
      author: authorLogin,
      violatingFiles: [],
      protectedFilesDetected: [],
      reason: "No protected configuration files were modified.",
      timestamp,
    };
  }

  const authorized = isUserAuthorizedForConfigChange(author, options);

  if (authorized) {
    return {
      status: "authorized",
      isProtectedFileModified: true,
      isAuthorized: true,
      author: authorLogin,
      violatingFiles: [],
      protectedFilesDetected: detectedProtected,
      reason: `User @${authorLogin} is authorized (role/admin/bot permission confirmed) to modify protected configuration.`,
      timestamp,
    };
  }

  return {
    status: "unauthorized_modification",
    isProtectedFileModified: true,
    isAuthorized: false,
    author: authorLogin,
    violatingFiles: detectedProtected,
    protectedFilesDetected: detectedProtected,
    reason: `Unauthorized config modification detected: user @${authorLogin} lacks admin or billing_manager permissions to edit: ${detectedProtected.join(", ")}.`,
    timestamp,
  };
}

/**
 * Generates an automated rollback plan to revert unauthorized configuration tampering.
 */
export function generateRevertPlan(params: {
  evaluation: ConfigProtectionEvaluation;
  targetBranch?: string;
  fileChanges?: FileChange[];
  options?: ConfigProtectionOptions;
  context?: {
    repo?: string;
    commitSha?: string;
    prNumber?: number;
  };
}): RevertPlan {
  const { evaluation, targetBranch = "development", fileChanges = [], options, context } = params;

  if (evaluation.status !== "unauthorized_modification" || evaluation.violatingFiles.length === 0) {
    return {
      shouldRevert: false,
      targetBranch,
      revertAuthor: options?.botAuthor ?? {
        name: "UbiquiBot",
        email: "bot@ubq.fi",
      },
      commitMessage: "no-op: configuration change authorized or unaffected",
      filesToRestore: [],
      alertComment: "",
    };
  }

  const botAuthor = options?.botAuthor ?? {
    name: "UbiquiBot",
    email: "bot@ubq.fi",
  };

  const filesToRestore: FileRevertTarget[] = [];
  const changeMap = new Map<string, FileChange>();
  for (const fc of fileChanges) {
    changeMap.set(normalizeConfigPath(fc.filename), fc);
  }

  for (const violatingFile of evaluation.violatingFiles) {
    const key = normalizeConfigPath(violatingFile);
    const fc = changeMap.get(key);

    if (fc) {
      if (fc.status === "added") {
        filesToRestore.push({
          path: violatingFile,
          action: "delete",
          restoreContent: null,
          previousFilename: fc.previousFilename,
        });
      } else {
        filesToRestore.push({
          path: violatingFile,
          action: "restore",
          restoreContent: fc.previousContent ?? null,
          previousFilename: fc.previousFilename,
        });
      }
    } else {
      filesToRestore.push({
        path: violatingFile,
        action: "restore",
        restoreContent: null,
      });
    }
  }

  const fileListText = evaluation.violatingFiles.map((f) => `\`${f}\``).join(", ");
  const shortSha = context?.commitSha ? ` (${context.commitSha.slice(0, 7)})` : "";
  const commitMessage = `revert: rollback unauthorized modification to ${fileListText} by @${evaluation.author}${shortSha} (#5034)`;

  const alertComment = formatFraudAlertMarkdown(evaluation, context);

  return {
    shouldRevert: true,
    targetBranch,
    revertAuthor: botAuthor,
    commitMessage,
    filesToRestore,
    alertComment,
  };
}

/**
 * Formats a GitHub Markdown security alert explaining the unauthorized tampering and rollback.
 */
export function formatFraudAlertMarkdown(
  evaluation: ConfigProtectionEvaluation,
  context?: { repo?: string; commitSha?: string; prNumber?: number }
): string {
  const user = evaluation.author;
  const files = evaluation.violatingFiles.map((f) => `- \`${f}\``).join("\n");
  const commitInfo = context?.commitSha ? ` in commit \`${context.commitSha.slice(0, 7)}\`` : "";
  const prInfo = context?.prNumber ? ` for pull request #${context.prNumber}` : "";

  return [
    `> [!WARNING]`,
    `> **Config Protection Alert: Unauthorized Configuration Change Detected**`,
    `>`,
    `> An unauthorized attempt to modify configuration files governing monetary flow and bot rules was detected${commitInfo}${prInfo}.`,
    `>`,
    `> **Author:** @${user}`,
    `> **Target Files:**`,
    files,
    `>`,
    `> **Action Taken:**`,
    `> In accordance with UbiquityOS security policy, only users with \`admin\` or \`billing_manager\` permissions are authorized to modify protected configuration files.`,
    `> The unauthorized changes will be automatically rolled back to their previous version by the bot.`,
    `>`,
    `> _Reference: Config Protection (#5034)_`,
  ].join("\n");
}

/**
 * Evaluates a GitHub webhook push payload for unauthorized configuration modifications.
 */
export function evaluatePushPayload(
  payload: PushWebhookPayload,
  authorPermissionResolver: (login: string) => AuthorPermission | Promise<AuthorPermission>,
  options?: ConfigProtectionOptions
): Promise<{ evaluation: ConfigProtectionEvaluation; revertPlan: RevertPlan }> {
  return (async () => {
    const senderLogin = payload.sender?.login ?? payload.pusher?.name ?? "unknown";
    const authorPerm = await Promise.resolve(authorPermissionResolver(senderLogin));

    const changedFileSet = new Set<string>();
    const fileChanges: FileChange[] = [];

    if (payload.commits && Array.isArray(payload.commits)) {
      for (const commit of payload.commits) {
        if (commit.added) {
          for (const f of commit.added) {
            changedFileSet.add(f);
            fileChanges.push({ filename: f, status: "added" });
          }
        }
        if (commit.modified) {
          for (const f of commit.modified) {
            changedFileSet.add(f);
            fileChanges.push({ filename: f, status: "modified" });
          }
        }
        if (commit.removed) {
          for (const f of commit.removed) {
            changedFileSet.add(f);
            fileChanges.push({ filename: f, status: "removed" });
          }
        }
      }
    }

    const evaluation = inspectConfigModification({
      author: authorPerm,
      changedFiles: Array.from(changedFileSet),
      options,
    });

    const targetBranch = payload.ref ? payload.ref.replace(/^refs\/heads\//, "") : "development";
    const revertPlan = generateRevertPlan({
      evaluation,
      targetBranch,
      fileChanges,
      options,
      context: {
        repo: payload.repository?.full_name,
        commitSha: payload.after ?? payload.head_commit?.id,
      },
    });

    return { evaluation, revertPlan };
  })();
}
