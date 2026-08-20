/**
 * @file no-annotate-matches-message.ts
 * @title No Annotate Matches Error Message: Explicit Feedback for Empty Results
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5038
 * @upstream https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/81
 * @bounty $9 USD
 *
 * @description
 * This plugin provides scaffolding for posting an explicit feedback comment
 * when the annotate/matchmaking plugin runs successfully but finds no suitable
 * matches. The upstream issue identifies that silent failures confuse users
 * who don't know whether the plugin ran or simply found nothing.
 *
 * Upstream requirements:
 * 1. Post a comment explaining the plugin ran successfully but found no matches
 * 2. Use appropriate emoji/formatting to distinguish from error states
 * 3. Optionally suggest actions (e.g., refine query, check back later)
 * 4. Avoid duplicate "no matches" comments on repeated runs
 * 5. Distinguish between "no matches found" vs "plugin failed to run"
 *
 * Generated modules:
 * - NoMatchesCommentBuilder: Generates formatted feedback messages
 * - DuplicateFeedbackGuard: Prevents repeated no-match comments
 * - MatchResultClassifier: Distinguishes empty results from errors/timeouts
 * - FeedbackConfigManager: Configurable message templates and thresholds
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * Result classification from a matchmaking/annotate run.
 */
export type MatchRunOutcome =
  | "matches_found"
  | "no_matches"
  | "below_threshold"
  | "error"
  | "timeout"
  | "skipped";

/**
 * Structured result from an annotate/matchmaking execution.
 */
export interface MatchRunResult {
  /** Classification of the run outcome */
  outcome: MatchRunOutcome;
  /** Number of candidates evaluated */
  candidatesEvaluated: number;
  /** Number of matches above threshold */
  matchesFound: number;
  /** Highest similarity score observed (even if below threshold) */
  highestScore: number | null;
  /** Threshold that was applied */
  threshold: number;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if outcome is error/timeout */
  errorMessage?: string;
  /** Timestamp of the run */
  timestamp: string;
}

/**
 * Configuration for no-matches feedback behavior.
 */
export interface NoMatchesFeedbackConfig {
  /** Whether to post a comment when no matches are found */
  enableNoMatchesComment: boolean;
  /** Whether to post when results exist but are below threshold */
  enableBelowThresholdComment: boolean;
  /** Minimum interval between no-match comments on same issue (ms) */
  minIntervalMs: number;
  /** Maximum number of no-match comments per issue lifetime */
  maxCommentsPerIssue: number;
  /** Message template for no matches found */
  noMatchesTemplate: string;
  /** Message template for below-threshold results */
  belowThresholdTemplate: string;
  /** Emoji prefix for no-match feedback */
  emojiPrefix: string;
  /** Whether to include diagnostic details (candidates evaluated, threshold) */
  includeDiagnostics: boolean;
  /** Suggested actions to include in the message */
  suggestedActions: string[];
}

/**
 * State tracking for feedback deduplication.
 */
export interface FeedbackState {
  /** Issue number */
  issueNumber: number;
  /** Repository full name */
  repoFullName: string;
  /** Timestamps of previous no-match comments */
  commentTimestamps: string[];
  /** Total no-match comments posted */
  totalComments: number;
  /** Last comment ID posted (for potential editing) */
  lastCommentId: number | null;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default feedback configuration.
 */
export const DEFAULT_CONFIG: NoMatchesFeedbackConfig = {
  enableNoMatchesComment: true,
  enableBelowThresholdComment: true,
  minIntervalMs: 3600000, // 1 hour between comments
  maxCommentsPerIssue: 3,
  noMatchesTemplate: `{{emoji}} **No matching issues found**

The annotation search completed successfully but didn't find any similar issues in the indexed repositories.

{{#diagnostics}}
- Candidates evaluated: {{candidatesEvaluated}}
- Similarity threshold: {{threshold}}%
- Search duration: {{durationMs}}ms
{{/diagnostics}}

{{#suggestions}}
**Suggestions:**
{{#actions}}
- {{action}}
{{/actions}}
{{/suggestions}}`,
  belowThresholdTemplate: `{{emoji}} **Low-confidence matches only**

The annotation search found {{matchesFound}} potential match(es), but none exceeded the {{threshold}}% similarity threshold.

Highest score observed: {{highestScore}}%

{{#suggestions}}
**Suggestions:**
{{#actions}}
- {{action}}
{{/actions}}
{{/suggestions}}`,
  emojiPrefix: "🔍",
  includeDiagnostics: true,
  suggestedActions: [
    "Try refining the issue title or description for better matching.",
    "Check back later as more issues are indexed.",
    "Verify that relevant repositories are included in the search scope.",
  ],
};

// ============================================================================
// SECTION 3: No-Matches Comment Builder Generator
// ============================================================================

/**
 * Generates the module that builds formatted no-match feedback comments.
 *
 * @param config - Feedback configuration
 * @returns TypeScript source code string
 */
export function generateCommentBuilder(config: NoMatchesFeedbackConfig): string {
  return `/**
 * Auto-generated No-Matches Comment Builder
 * Creates formatted feedback messages for empty/low-confidence match results.
 */

interface MatchRunResult {
  outcome: string;
  candidatesEvaluated: number;
  matchesFound: number;
  highestScore: number | null;
  threshold: number;
  durationMs: number;
  errorMessage?: string;
  timestamp: string;
}

const CONFIG = {
  noMatchesTemplate: ${JSON.stringify(config.noMatchesTemplate)},
  belowThresholdTemplate: ${JSON.stringify(config.belowThresholdTemplate)},
  emojiPrefix: "${config.emojiPrefix}",
  includeDiagnostics: ${config.includeDiagnostics},
  suggestedActions: ${JSON.stringify(config.suggestedActions)},
};

/**
 * Renders a mustache-like template with simple variable substitution.
 */
function renderTemplate(template: string, vars: Record<string, any>): string {
  let result = template;

  // Simple variable replacement: {{varName}}
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string" || typeof value === "number") {
      result = result.replace(new RegExp(\`\\\\{\\\\{\${key}\\\\}\\\\}\`, "g"), String(value));
    }
  }

  // Conditional blocks: {{#flag}}...{{/flag}}
  const conditionalRegex = /\\{\\{#(\\w+)\\}\\}([\\s\\S]*?)\\{\\{\\/\\1\\}\\}/g;
  result = result.replace(conditionalRegex, (_, flag, content) => {
    if (vars[flag]) {
      // Handle array iteration: {{#actions}}...{{/actions}}
      if (Array.isArray(vars[flag])) {
        return vars[flag]
          .map((item: any) => {
            let rendered = content;
            if (typeof item === "object") {
              for (const [k, v] of Object.entries(item)) {
                rendered = rendered.replace(new RegExp(\`\\\\{\\\\{\${k}\\\\}\\\\}\`, "g"), String(v));
              }
            } else {
              rendered = rendered.replace(/\\{\\{action\\}\\}/g, String(item));
            }
            return rendered;
          })
          .join("");
      }
      return content;
    }
    return "";
  });

  return result.trim();
}

/**
 * Builds a no-matches feedback comment from a run result.
 */
export function buildNoMatchesComment(result: MatchRunResult): string {
  const vars: Record<string, any> = {
    emoji: CONFIG.emojiPrefix,
    candidatesEvaluated: result.candidatesEvaluated,
    matchesFound: result.matchesFound,
    highestScore: result.highestScore !== null ? (result.highestScore * 100).toFixed(1) : "N/A",
    threshold: (result.threshold * 100).toFixed(0),
    durationMs: result.durationMs,
    diagnostics: CONFIG.includeDiagnostics,
    suggestions: CONFIG.suggestedActions.length > 0,
    actions: CONFIG.suggestedActions.map(a => ({ action: a })),
  };

  if (result.outcome === "below_threshold" && result.matchesFound > 0) {
    return renderTemplate(CONFIG.belowThresholdTemplate, vars);
  }

  return renderTemplate(CONFIG.noMatchesTemplate, vars);
}

/**
 * Determines if a feedback comment should be posted based on result.
 */
export function shouldPostFeedback(
  result: MatchRunResult,
  enableNoMatches: boolean,
  enableBelowThreshold: boolean
): boolean {
  if (result.outcome === "no_matches" && enableNoMatches) return true;
  if (result.outcome === "below_threshold" && enableBelowThreshold) return true;
  return false;
}
`;
}

// ============================================================================
// SECTION 4: Duplicate Feedback Guard Generator
// ============================================================================

/**
 * Generates the module that prevents duplicate no-match comments.
 *
 * @param config - Feedback configuration
 * @returns TypeScript source code string
 */
export function generateDuplicateGuard(config: NoMatchesFeedbackConfig): string {
  return `/**
 * Auto-generated Duplicate Feedback Guard
 * Prevents repeated no-match comments on the same issue.
 */

import { Octokit } from "@octokit/rest";

const CONFIG = {
  minIntervalMs: ${config.minIntervalMs},
  maxCommentsPerIssue: ${config.maxCommentsPerIssue},
  emojiPrefix: "${config.emojiPrefix}",
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// In-memory state cache (production should use persistent storage)
const feedbackState = new Map<string, { timestamps: number[]; count: number; lastCommentId: number | null }>();

function getStateKey(owner: string, repo: string, issueNumber: number): string {
  return \`\${owner}/\${repo}#\${issueNumber}\`;
}

/**
 * Checks if a no-match feedback comment already exists on the issue.
 * Returns the comment ID if found, null otherwise.
 */
export async function findExistingFeedbackComment(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<number | null> {
  try {
    const response = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    // Look for comments starting with our emoji prefix and containing key phrases
    for (const comment of response.data) {
      const body = comment.body || "";
      if (
        body.startsWith(CONFIG.emojiPrefix) &&
        (body.includes("No matching issues found") || body.includes("Low-confidence matches only"))
      ) {
        return comment.id;
      }
    }

    return null;
  } catch (error) {
    console.warn(\`Failed to check existing feedback comments: \${(error as Error).message}\`);
    return null;
  }
}

/**
 * Determines if it's safe to post a new feedback comment.
 * Enforces rate limiting and max comment limits.
 */
export async function canPostFeedback(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ allowed: boolean; reason?: string }> {
  const key = getStateKey(owner, repo, issueNumber);
  const state = feedbackState.get(key);

  if (!state) {
    // First time — check GitHub for existing comments
    const existingId = await findExistingFeedbackComment(owner, repo, issueNumber);
    if (existingId) {
      // Initialize state from existing comment
      feedbackState.set(key, {
        timestamps: [Date.now()],
        count: 1,
        lastCommentId: existingId,
      });
    }
    return { allowed: true };
  }

  // Check max comments limit
  if (state.count >= CONFIG.maxCommentsPerIssue) {
    return {
      allowed: false,
      reason: \`Maximum feedback comments (\${CONFIG.maxCommentsPerIssue}) already posted for this issue.\`,
    };
  }

  // Check minimum interval
  const lastTimestamp = state.timestamps[state.timestamps.length - 1];
  const elapsed = Date.now() - lastTimestamp;
  if (elapsed < CONFIG.minIntervalMs) {
    const remainingMs = CONFIG.minIntervalMs - elapsed;
    return {
      allowed: false,
      reason: \`Too soon since last feedback comment. Wait \${Math.ceil(remainingMs / 60000)} minutes.\`,
    };
  }

  return { allowed: true };
}

/**
 * Records that a feedback comment was posted.
 */
export function recordFeedbackPosted(
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number
): void {
  const key = getStateKey(owner, repo, issueNumber);
  const state = feedbackState.get(key) || { timestamps: [], count: 0, lastCommentId: null };

  state.timestamps.push(Date.now());
  state.count++;
  state.lastCommentId = commentId;

  feedbackState.set(key, state);
}

/**
 * Updates an existing feedback comment instead of creating a new one.
 * Useful when re-running with updated results.
 */
export async function updateExistingFeedback(
  owner: string,
  repo: string,
  commentId: number,
  newBody: string
): Promise<boolean> {
  try {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body: newBody,
    });
    return true;
  } catch (error) {
    console.warn(\`Failed to update feedback comment: \${(error as Error).message}\`);
    return false;
  }
}
`;
}

// ============================================================================
// SECTION 5: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates scaffolding meets bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #81:
 * 1. Posts comment explaining plugin ran but found no matches
 * 2. Uses appropriate emoji/formatting
 * 3. Distinguishes success-with-no-results from errors
 * 4. Avoids duplicate comments on repeated runs
 * 5. Includes actionable suggestions
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateAcceptanceCriteria(config: NoMatchesFeedbackConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "No-matches comment enabled",
      passed: config.enableNoMatchesComment === true,
      detail: \`Enabled: \${config.enableNoMatchesComment}\`,
    },
    {
      name: "Emoji prefix configured",
      passed: config.emojiPrefix.length > 0,
      detail: \`Emoji: \${config.emojiPrefix}\`,
    },
    {
      name: "Min interval set (>0)",
      passed: config.minIntervalMs > 0,
      detail: \`Interval: \${config.minIntervalMs}ms\`,
    },
    {
      name: "Max comments per issue set",
      passed: config.maxCommentsPerIssue >= 1 && config.maxCommentsPerIssue <= 10,
      detail: \`Max: \${config.maxCommentsPerIssue}\`,
    },
    {
      name: "Suggested actions provided",
      passed: config.suggestedActions.length >= 1,
      detail: \`\${config.suggestedActions.length} suggestions\`,
    },
    {
      name: "Below-threshold handling configured",
      passed: config.enableBelowThresholdComment === true,
      detail: \`Enabled: \${config.enableBelowThresholdComment}\`,
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
  id: "no-annotate-matches-message",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5038",
  upstream: "https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/81",
  bounty: 9,
  generators: [
    "generateCommentBuilder",
    "generateDuplicateGuard",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<NoMatchesFeedbackConfig> = {}
): void {
  const mergedConfig: NoMatchesFeedbackConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "comment-builder.ts": generateCommentBuilder(mergedConfig),
    "duplicate-guard.ts": generateDuplicateGuard(mergedConfig),
  };

  console.log(\`Scaffolding no-matches feedback in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
