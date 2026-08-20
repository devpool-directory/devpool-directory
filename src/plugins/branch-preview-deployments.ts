/**
 * All Branches Supported for Previews
 *
 * Enables per-branch preview deployments with dynamic subdomain naming
 * and automatic cleanup on branch deletion. Replaces the generic "preview-"
 * prefix with sanitized branch names (e.g., feat/widget → feat-widget-pay.ubq.fi).
 *
 * Addresses: devpool-directory#5899 / ubiquity/deno-deploy-workflow#7
 */

export interface PreviewDeployment {
  branchName: string;
  projectName: string;
  domain: string;
  createdAt: number;
  lastDeployedAt?: number;
  status: "active" | "deleting" | "deleted";
}

export interface DeploymentConfig {
  baseDomain: string;
  maxProjects: number;
  sanitizePattern: RegExp;
  replacementChar: string;
}

const DEFAULT_CONFIG: DeploymentConfig = {
  baseDomain: "pay.ubq.fi",
  maxProjects: 100,
  sanitizePattern: /[^a-z0-9-]/g,
  replacementChar: "-",
};

/**
 * Sanitizes a branch name into a valid DNS-compatible subdomain prefix.
 * Converts slashes and invalid chars to hyphens, lowercases, trims.
 */
export function sanitizeBranchName(
  branchName: string,
  config: DeploymentConfig = DEFAULT_CONFIG
): string {
  return branchName
    .toLowerCase()
    .replace(config.sanitizePattern, config.replacementChar)
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .substring(0, 63); // DNS label max length
}

/**
 * Generates the preview project name and domain for a given branch.
 * Format: {sanitized-branch}-{baseApp}.{baseDomain}
 */
export function generatePreviewTarget(
  branchName: string,
  appSuffix: string = "pay",
  config: DeploymentConfig = DEFAULT_CONFIG
): { projectName: string; domain: string } {
  const sanitized = sanitizeBranchName(branchName, config);
  const projectName = `${sanitized}-${appSuffix}`;
  const domain = `${projectName}.${config.baseDomain}`;
  return { projectName, domain };
}

/**
 * Determines whether a branch should trigger a new preview deployment.
 * Excludes default/main branches which use production deployment.
 */
export function shouldCreatePreview(
  branchName: string,
  defaultBranch: string = "main"
): boolean {
  return branchName !== defaultBranch && branchName !== "master";
}

/**
 * Detects branches that have been deleted and need their preview projects cleaned up.
 * Compares known deployments against current remote branch list.
 */
export function detectStalePreviews(
  activeDeployments: PreviewDeployment[],
  currentRemoteBranches: string[]
): PreviewDeployment[] {
  const normalizedBranches = new Set(
    currentRemoteBranches.map((b) => b.toLowerCase())
  );

  return activeDeployments.filter(
    (d) =>
      d.status === "active" &&
      !normalizedBranches.has(d.branchName.toLowerCase())
  );
}

/**
 * Marks stale previews for deletion. Returns updated deployment list
 * and the list of project names to delete from Deno Deploy.
 */
export function markForCleanup(
  deployments: PreviewDeployment[],
  stalePreviews: PreviewDeployment[],
  timestamp: number = Date.now()
): {
  updatedDeployments: PreviewDeployment[];
  projectsToDelete: string[];
} {
  const staleSet = new Set(stalePreviews.map((s) => s.projectName));
  const projectsToDelete: string[] = [];

  const updatedDeployments = deployments.map((d) => {
    if (staleSet.has(d.projectName)) {
      projectsToDelete.push(d.projectName);
      return { ...d, status: "deleting" as const };
    }
    return d;
  });

  return { updatedDeployments, projectsToDelete };
}

/**
 * Creates or updates a preview deployment record after successful deploy.
 */
export function recordPreviewDeployment(
  branchName: string,
  appSuffix: string = "pay",
  existingDeployments: PreviewDeployment[] = [],
  config: DeploymentConfig = DEFAULT_CONFIG
): {
  deployment: PreviewDeployment;
  isNew: boolean;
} {
  const target = generatePreviewTarget(branchName, appSuffix, config);
  const now = Date.now();

  const existing = existingDeployments.find(
    (d) => d.projectName === target.projectName
  );

  if (existing) {
    return {
      deployment: {
        ...existing,
        lastDeployedAt: now,
        status: "active",
      },
      isNew: false,
    };
  }

  return {
    deployment: {
      branchName,
      projectName: target.projectName,
      domain: target.domain,
      createdAt: now,
      lastDeployedAt: now,
      status: "active",
    },
    isNew: true,
  };
}

/**
 * Validates that adding a new preview won't exceed project limits.
 */
export function canCreateNewPreview(
  activeDeployments: PreviewDeployment[],
  config: DeploymentConfig = DEFAULT_CONFIG
): { allowed: boolean; reason?: string } {
  const activeCount = activeDeployments.filter(
    (d) => d.status === "active"
  ).length;

  if (activeCount >= config.maxProjects) {
    return {
      allowed: false,
      reason: `Project limit reached (${activeCount}/${config.maxProjects}). Delete stale previews first.`,
    };
  }

  return { allowed: true };
}

/**
 * Generates a summary report of all preview deployments.
 */
export function generatePreviewReport(
  deployments: PreviewDeployment[]
): string {
  const active = deployments.filter((d) => d.status === "active");
  const deleting = deployments.filter((d) => d.status === "deleting");
  const deleted = deployments.filter((d) => d.status === "deleted");

  const lines = [
    "## Preview Deployments Report",
    "",
    `| Status | Count |`,
    `|--------|-------|`,
    `| Active | ${active.length} |`,
    `| Deleting | ${deleting.length} |`,
    `| Deleted | ${deleted.length} |`,
    "",
  ];

  if (active.length > 0) {
    lines.push("### Active Previews");
    lines.push("| Branch | Domain | Last Deployed |");
    lines.push("|--------|--------|---------------|");
    for (const d of active) {
      const lastDeploy = d.lastDeployedAt
        ? new Date(d.lastDeployedAt).toISOString()
        : "Never";
      lines.push(`| ${d.branchName} | ${d.domain} | ${lastDeploy} |`);
    }
  }

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
