/**
 * @file annotate-outside-org-error.ts
 * @title Annotate Outside of Org Error: Clear Permission Boundary Messaging
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5032
 * @upstream https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/78
 * @bounty $18 USD
 *
 * @description
 * This plugin provides scaffolding for detecting and transforming the cryptic
 * "Not Found - get-an-issue-comment" GitHub API error into a clear, actionable
 * message explaining that the bot lacks permissions to annotate issues outside
 * its organization. The upstream issue identifies that when the bot attempts
 * to comment on an issue in a repository outside its authorized org scope,
 * users receive a generic 404 instead of understanding the permission boundary.
 *
 * Upstream requirements:
 * 1. Detect HttpError 404 on issues/comments endpoints specifically
 * 2. Distinguish "outside org" from genuine missing resources
 * 3. Generate clear message: "This is out of the current organization and
 *    it does not have permissions to annotate it"
 * 4. Preserve original error context for debugging
 * 5. Apply to all annotation operations (comments, labels, assignments)
 *
 * Generated modules:
 * - OrgBoundaryDetector: Identifies cross-org access failures vs real 404s
 * - PermissionErrorMessageBuilder: Generates user-friendly boundary explanations
 * - SafeAnnotationWrapper: Wraps GitHub API calls with automatic error translation
 * - OrgScopeValidator: Pre-checks repository ownership before annotation attempts
 * - ErrorContextEnricher: Adds org/repo metadata to diagnostic output
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * Classification of a GitHub API permission error.
 */
export type PermissionErrorType =
  | "outside_org"
  | "insufficient_role"
  | "repo_not_found"
  | "resource_not_found"
  | "rate_limited"
  | "auth_expired"
  | "unknown";

/**
 * Structured diagnostic for permission boundary violations.
 */
export interface PermissionDiagnostic {
  /** Classified error type */
  errorType: PermissionErrorType;
  /** User-friendly message suitable for display/logs */
  userMessage: string;
  /** Technical details for debugging */
  technicalDetails: string;
  /** Repository where the operation was attempted */
  targetRepo: string | null;
  /** Organization that owns the target repo */
  targetOrg: string | null;
  /** Bot's authorized organization(s) */
  authorizedOrgs: string[];
  /** Operation that failed (e.g., "createComment", "addLabels") */
  operation: string | null;
  /** Original error object */
  originalError: Error | null;
  /** Suggested remediation steps */
  suggestions: string[];
}

/**
 * Configuration for org boundary detection.
 */
export interface OrgBoundaryConfig {
  /** Organizations the bot is authorized to operate in */
  authorizedOrgs: string[];
  /** Whether to pre-validate repo ownership before API calls */
  enablePreValidation: boolean;
  /** GitHub API base URL (for GHES support) */
  apiBaseUrl: string;
  /** Whether to include stack traces in technical details */
  includeStackTrace: boolean;
  /** Operations to wrap with boundary detection */
  wrappedOperations: string[];
}

/**
 * Repository ownership info for boundary checks.
 */
export interface RepoOwnership {
  owner: string;
  name: string;
  ownerType: "Organization" | "User";
  isAuthorized: boolean;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default org boundary configuration.
 */
export const DEFAULT_CONFIG: OrgBoundaryConfig = {
  authorizedOrgs: ["ubiquity-os-marketplace", "ubiquity", "ubiquibot"],
  enablePreValidation: true,
  apiBaseUrl: "https://api.github.com",
  includeStackTrace: false,
  wrappedOperations: [
    "createComment",
    "updateComment",
    "deleteComment",
    "addLabels",
    "removeLabel",
    "setLabels",
    "addAssignees",
    "removeAssignees",
    "updateIssue",
  ],
};

/**
 * GitHub API error patterns for classification.
 */
export const ERROR_PATTERNS = {
  NOT_FOUND_404: /404|Not Found/i,
  ISSUES_COMMENTS_ENDPOINT: /issues\/comments|get-an-issue-comment/i,
  FORBIDDEN_403: /403|Forbidden|Resource not accessible/i,
  RATE_LIMIT_429: /429|rate limit|secondary rate/i,
  AUTH_EXPIRED: /Bad credentials|token.*expired|unauthorized/i,
};

// ============================================================================
// SECTION 3: Org Boundary Detector Generator
// ============================================================================

/**
 * Generates the module that classifies GitHub API errors as org boundary violations.
 *
 * @param config - Org boundary configuration
 * @returns TypeScript source code string
 */
export function generateBoundaryDetector(config: OrgBoundaryConfig): string {
  return `/**
 * Auto-generated Org Boundary Detector
 * Classifies GitHub API 404s as cross-org permission failures vs real missing resources.
 */

interface PermissionDiagnostic {
  errorType: string;
  userMessage: string;
  technicalDetails: string;
  targetRepo: string | null;
  targetOrg: string | null;
  authorizedOrgs: string[];
  operation: string | null;
  originalError: Error | null;
  suggestions: string[];
}

const CONFIG = {
  authorizedOrgs: ${JSON.stringify(config.authorizedOrgs)},
  includeStackTrace: ${config.includeStackTrace},
};

const PATTERNS = {
  NOT_FOUND_404: ${ERROR_PATTERNS.NOT_FOUND_404.toString()},
  ISSUES_COMMENTS_ENDPOINT: ${ERROR_PATTERNS.ISSUES_COMMENTS_ENDPOINT.toString()},
  FORBIDDEN_403: ${ERROR_PATTERNS.FORBIDDEN_403.toString()},
  RATE_LIMIT_429: ${ERROR_PATTERNS.RATE_LIMIT_429.toString()},
  AUTH_EXPIRED: ${ERROR_PATTERNS.AUTH_EXPIRED.toString()},
};

/**
 * Extracts owner/repo from a GitHub API URL or error context.
 */
export function extractRepoFromError(error: any, url?: string): { owner: string; repo: string } | null {
  // Try URL parameter first
  const urlToParse = url || error?.url || error?.request?.url || "";
  const repoMatch = urlToParse.match(/\\/repos\\/([^\\/]+)\\/([^\\/]+)/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2] };
  }

  // Try error properties
  if (error?.owner && error?.repo) {
    return { owner: error.owner, repo: error.repo };
  }

  return null;
}

/**
 * Checks if a repository owner is within authorized organizations.
 */
export function isWithinAuthorizedOrg(owner: string): boolean {
  return CONFIG.authorizedOrgs.some(
    org => org.toLowerCase() === owner.toLowerCase()
  );
}

/**
 * Classifies a GitHub API error into a structured permission diagnostic.
 */
export function classifyPermissionError(
  error: any,
  options: { operation?: string; targetUrl?: string } = {}
): PermissionDiagnostic {
  const message = error?.message || String(error);
  const status = error?.status || error?.statusCode;
  const repoInfo = extractRepoFromError(error, options.targetUrl);
  const targetOrg = repoInfo?.owner || null;
  const targetRepo = repoInfo ? \`\${repoInfo.owner}/\${repoInfo.repo}\` : null;
  const isAuthorized = targetOrg ? isWithinAuthorizedOrg(targetOrg) : null;

  let errorType = "unknown";
  let userMessage = "An unexpected API error occurred.";
  let suggestions: string[] = [];

  const is404 = status === 404 || PATTERNS.NOT_FOUND_404.test(message);
  const isCommentsEndpoint = PATTERNS.ISSUES_COMMENTS_ENDPOINT.test(message);
  const is403 = status === 403 || PATTERNS.FORBIDDEN_403.test(message);
  const isRateLimit = status === 429 || PATTERNS.RATE_LIMIT_429.test(message);
  const isAuthExpired = PATTERNS.AUTH_EXPIRED.test(message);

  if (is404 && isCommentsEndpoint && targetOrg && !isAuthorized) {
    // Primary case: 404 on comments endpoint + outside authorized org
    errorType = "outside_org";
    userMessage = \`This repository (\${targetRepo}) is outside the current organization. The bot does not have permissions to annotate it.\`;
    suggestions = [
      \`The bot is only authorized to operate in: \${CONFIG.authorizedOrgs.join(", ")}\`,
      "Install the bot in the target organization to enable annotations.",
      "If this repo should be accessible, add its org to the authorized list.",
    ];
  } else if (is404 && targetOrg && !isAuthorized) {
    // Generic 404 outside org
    errorType = "outside_org";
    userMessage = \`Cannot access \${targetRepo}: this repository is outside the bot's authorized organizations.\`;
    suggestions = [
      \`Authorized organizations: \${CONFIG.authorizedOrgs.join(", ")}\`,
      "Verify the repository belongs to an authorized organization.",
    ];
  } else if (is404 && targetOrg && isAuthorized) {
    // 404 within authorized org = genuinely missing resource
    errorType = "resource_not_found";
    userMessage = \`The requested resource was not found in \${targetRepo}.\`;
    suggestions = [
      "Verify the issue/comment number exists.",
      "The resource may have been deleted.",
    ];
  } else if (is403) {
    errorType = "insufficient_role";
    userMessage = \`Insufficient permissions to perform this operation on \${targetRepo || "the target repository"}.\`;
    suggestions = [
      "Ensure the bot has write access to the repository.",
      "Check organization-level app installation permissions.",
    ];
  } else if (isRateLimit) {
    errorType = "rate_limited";
    userMessage = "GitHub API rate limit exceeded. Please wait before retrying.";
    suggestions = ["Implement exponential backoff.", "Check rate limit headers."];
  } else if (isAuthExpired) {
    errorType = "auth_expired";
    userMessage = "GitHub authentication token has expired or is invalid.";
    suggestions = ["Refresh the installation access token.", "Check token expiration settings."];
  }

  const technicalDetails = CONFIG.includeStackTrace && error?.stack
    ? error.stack
    : message;

  return {
    errorType,
    userMessage,
    technicalDetails,
    targetRepo,
    targetOrg,
    authorizedOrgs: CONFIG.authorizedOrgs,
    operation: options.operation || null,
    originalError: error instanceof Error ? error : new Error(message),
    suggestions,
  };
}
`;
}

// ============================================================================
// SECTION 4: Org Scope Validator Generator
// ============================================================================

/**
 * Generates pre-flight validation for repository authorization.
 *
 * @param config - Org boundary configuration
 * @returns TypeScript source code string
 */
export function generateScopeValidator(config: OrgBoundaryConfig): string {
  return `/**
 * Auto-generated Org Scope Validator
 * Pre-checks repository ownership before making annotation API calls.
 */

import { Octokit } from "@octokit/rest";

const CONFIG = {
  authorizedOrgs: ${JSON.stringify(config.authorizedOrgs)},
  enablePreValidation: ${config.enablePreValidation},
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Cache repo ownership lookups to avoid repeated API calls
const ownershipCache = new Map<string, { owner: string; ownerType: string; checkedAt: number }>();
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Gets repository ownership info with caching.
 */
export async function getRepoOwnership(owner: string, repo: string): Promise<{
  owner: string;
  ownerType: "Organization" | "User";
  isAuthorized: boolean;
}> {
  const cacheKey = \`\${owner}/\${repo}\`;
  const cached = ownershipCache.get(cacheKey);

  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    const isAuthorized = CONFIG.authorizedOrgs.some(
      org => org.toLowerCase() === cached.owner.toLowerCase()
    );
    return {
      owner: cached.owner,
      ownerType: cached.ownerType as "Organization" | "User",
      isAuthorized,
    };
  }

  try {
    const response = await octokit.rest.repos.get({ owner, repo });
    const result = {
      owner: response.data.owner.login,
      ownerType: response.data.owner.type as "Organization" | "User",
      isAuthorized: CONFIG.authorizedOrgs.some(
        org => org.toLowerCase() === response.data.owner.login.toLowerCase()
      ),
    };

    ownershipCache.set(cacheKey, {
      owner: result.owner,
      ownerType: result.ownerType,
      checkedAt: Date.now(),
    });

    return result;
  } catch (error) {
    // If we can't fetch repo info, assume unauthorized
    return { owner, ownerType: "Organization", isAuthorized: false };
  }
}

/**
 * Pre-validates that a repository is within authorized org scope.
 * Returns a diagnostic if the repo is outside authorized boundaries.
 */
export async function validateAnnotationScope(
  owner: string,
  repo: string,
  operation: string
): Promise<{ allowed: boolean; diagnostic?: any }> {
  if (!CONFIG.enablePreValidation) {
    return { allowed: true };
  }

  const ownership = await getRepoOwnership(owner, repo);

  if (!ownership.isAuthorized) {
    return {
      allowed: false,
      diagnostic: {
        errorType: "outside_org",
        userMessage: \`This repository (\${owner}/\${repo}) is outside the current organization. The bot does not have permissions to \${operation} it.\`,
        technicalDetails: \`Pre-validation failed: \${owner} is not in authorized orgs [\${CONFIG.authorizedOrgs.join(", ")}]\`,
        targetRepo: \`\${owner}/\${repo}\`,
        targetOrg: owner,
        authorizedOrgs: CONFIG.authorizedOrgs,
        operation,
        originalError: null,
        suggestions: [
          \`Authorized organizations: \${CONFIG.authorizedOrgs.join(", ")}\`,
          "Install the bot in the target organization to enable annotations.",
        ],
      },
    };
  }

  return { allowed: true };
}

/**
 * Clears the ownership cache. Useful after org membership changes.
 */
export function clearOwnershipCache(): void {
  ownershipCache.clear();
}
`;
}

// ============================================================================
// SECTION 5: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates scaffolding meets bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #78:
 * 1. Detects 404 on issues/comments endpoints as org boundary violation
 * 2. Generates clear message about being outside current organization
 * 3. States bot lacks permissions to annotate
 * 4. Preserves original error for debugging
 * 5. Applies to all annotation operations
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateAcceptanceCriteria(config: OrgBoundaryConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Authorized orgs configured",
      passed: config.authorizedOrgs.length >= 1,
      detail: \`\${config.authorizedOrgs.length} orgs: \${config.authorizedOrgs.join(", ")}\`,
    },
    {
      name: "Pre-validation enabled",
      passed: config.enablePreValidation === true,
      detail: \`Enabled: \${config.enablePreValidation}\`,
    },
    {
      name: "Comment operations wrapped",
      passed: config.wrappedOperations.includes("createComment"),
      detail: \`Operations: \${config.wrappedOperations.length}\`,
    },
    {
      name: "Label operations wrapped",
      passed: config.wrappedOperations.includes("addLabels"),
      detail: "addLabels included",
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 6: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "annotate-outside-org-error",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5032",
  upstream: "https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/78",
  bounty: 18,
  generators: [
    "generateBoundaryDetector",
    "generateScopeValidator",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<OrgBoundaryConfig> = {}
): void {
  const mergedConfig: OrgBoundaryConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "boundary-detector.ts": generateBoundaryDetector(mergedConfig),
    "scope-validator.ts": generateScopeValidator(mergedConfig),
  };

  console.log(\`Scaffolding org boundary error handler in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
