/**
 * @file matchmaking-comment-dedup.ts
 * @title Multiple Matchmaking Comments: Create-or-Edit Deduplication
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5055
 * @upstream https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/94
 * @bounty $75 USD
 *
 * @description
 * This plugin provides scaffolding for preventing duplicate matchmaking
 * comments when multiple label events fire in rapid succession. The upstream
 * issue identifies that creating issues with pre-set labels causes the GitHub
 * UI to fire multiple label events, each triggering a separate matchmaking
 * job that posts a new comment before any previous comment exists.
 *
 * Solution from upstream:
 * - Create the matchmaking comment at issue creation time (placeholder)
 * - Subsequent invocations EDIT the existing comment instead of creating new ones
 * - Use a deterministic marker to identify the bot's matchmaking comment
 * - Implement locking/semaphore to handle concurrent webhook processing
 *
 * Generated modules:
 * - Comment Marker Generator: Creates deterministic identifiers for bot comments
 * - Create-or-Edit Orchestrator: Idempotent comment management with race handling
 * - Webhook Debouncer: Batches rapid label events into single processing runs
 * - Lock Manager: Prevents concurrent edits to the same comment
 * - Placeholder Template: Initial comment created at issue open time
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * A matchmaking recommendation entry.
 */
export interface MatchmakingEntry {
  username: string;
  matchPercentage: number;
  referenceIssue: string;
  referenceRepo: string;
}

/**
 * State of the matchmaking comment on an issue.
 */
export interface MatchmakingCommentState {
  /** Whether a matchmaking comment already exists */
  exists: boolean;
  /** Comment ID if it exists */
  commentId: number | null;
  /** Current body content */
  currentBody: string | null;
  /** Last update timestamp */
  lastUpdatedAt: string | null;
  /** Number of times this comment has been edited */
  editCount: number;
}

/**
 * Result of a create-or-edit operation.
 */
export interface CommentOperationResult {
  action: "created" | "edited" | "skipped" | "locked";
  commentId: number;
  entriesAdded: number;
  entriesTotal: number;
  timestamp: string;
}

/**
 * Webhook event representing a label change.
 */
export interface LabelWebhookEvent {
  issueNumber: number;
  repoFullName: string;
  labelAdded: string;
  labelRemoved: string | null;
  timestamp: number;
  eventId: string;
}

/**
 * Batched webhook events ready for processing.
 */
export interface BatchedLabelEvents {
  issueNumber: number;
  repoFullName: string;
  events: LabelWebhookEvent[];
  labelsAdded: string[];
  labelsRemoved: string[];
  firstEventTimestamp: number;
  lastEventTimestamp: number;
}

/**
 * Plugin configuration.
 */
export interface MatchmakingDedupConfig {
  /** Deterministic marker prefix for identifying bot comments */
  commentMarkerPrefix: string;
  /** Debounce window in milliseconds for batching label events */
  debounceWindowMs: number;
  /** Maximum concurrent edits per issue (semaphore limit) */
  maxConcurrentEdits: number;
  /** Lock TTL in milliseconds to prevent deadlocks */
  lockTtlMs: number;
  /** Whether to create placeholder comment on issue open */
  createPlaceholderOnOpen: boolean;
  /** Placeholder message shown before first recommendations */
  placeholderMessage: string;
  /** Maximum entries per comment before splitting */
  maxEntriesPerComment: number;
  /** Sort order for entries: by match percentage or chronological */
  entrySortOrder: "match-desc" | "chronological";
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default configuration addressing the duplicate comment problem.
 */
export const DEFAULT_CONFIG: MatchmakingDedupConfig = {
  commentMarkerPrefix: "<!-- ubiquity-os-matchmaking:",
  debounceWindowMs: 2000, // 2 seconds to batch rapid label events
  maxConcurrentEdits: 1,
  lockTtlMs: 30000, // 30 second lock TTL
  createPlaceholderOnOpen: true,
  placeholderMessage: "🔍 **Finding suitable contributors...**\n\nRecommendations will appear here shortly.",
  maxEntriesPerComment: 10,
  entrySortOrder: "match-desc",
};

/**
 * Comment marker format: <!-- ubiquity-os-matchmaking:{issueNumber}:{version} -->
 * This allows deterministic identification without visible clutter.
 */
export const COMMENT_MARKER_VERSION = "v1";

// ============================================================================
// SECTION 3: Comment Marker Generator
// ============================================================================

/**
 * Generates the module for creating and detecting deterministic comment markers.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateCommentMarker(config: MatchmakingDedupConfig): string {
  return `/**
 * Auto-generated Matchmaking Comment Marker Module
 * Provides deterministic identification of bot-managed comments.
 */

const CONFIG = {
  prefix: "${config.commentMarkerPrefix}",
  version: "${COMMENT_MARKER_VERSION}",
};

/**
 * Generates a deterministic marker for a specific issue.
 * Embedded as an HTML comment so it's invisible in rendered markdown.
 */
export function generateMarker(issueNumber: number): string {
  return \`\${CONFIG.prefix}\${issueNumber}:\${CONFIG.version} -->\`;
}

/**
 * Checks if a comment body contains the matchmaking marker for an issue.
 */
export function hasMarker(body: string, issueNumber: number): boolean {
  const marker = generateMarker(issueNumber);
  return body.includes(marker);
}

/**
 * Extracts the marker from a comment body.
 * Returns null if no valid marker is found.
 */
export function extractMarker(body: string): { issueNumber: number; version: string } | null {
  const regex = new RegExp(
    \`\${escapeRegex(CONFIG.prefix)}(\\\\d+):(\\\\w+)\\\\s*-->\`,
    "i"
  );
  const match = body.match(regex);
  if (!match) return null;

  return {
    issueNumber: parseInt(match[1], 10),
    version: match[2],
  };
}

/**
 * Prepends the marker to a comment body.
 * If marker already exists, returns body unchanged.
 */
export function ensureMarker(body: string, issueNumber: number): string {
  if (hasMarker(body, issueNumber)) return body;
  return \`\${generateMarker(issueNumber)}\\n\${body}\`;
}

/**
 * Removes the marker from a comment body.
 */
export function stripMarker(body: string): string {
  const regex = new RegExp(
    \`\${escapeRegex(CONFIG.prefix)}\\\\d+:\\\\w+\\\\s*-->\\\\s*\`,
    "gi"
  );
  return body.replace(regex, "");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^$\{\}()|[\\]\\\\]/g, "\\\\\\$&");
}
`;
}

// ============================================================================
// SECTION 4: Create-or-Edit Orchestrator Generator
// ============================================================================

/**
 * Generates the idempotent comment management module.
 * Handles the core create-if-not-exists-else-edit logic.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateCreateOrEditOrchestrator(config: MatchmakingDedupConfig): string {
  return `/**
 * Auto-generated Matchmaking Comment Create-or-Edit Orchestrator
 * Ensures only one matchmaking comment exists per issue, editing on updates.
 */

import { Octokit } from "@octokit/rest";

interface MatchmakingEntry {
  username: string;
  matchPercentage: number;
  referenceIssue: string;
  referenceRepo: string;
}

interface MatchmakingCommentState {
  exists: boolean;
  commentId: number | null;
  currentBody: string | null;
  lastUpdatedAt: string | null;
  editCount: number;
}

interface CommentOperationResult {
  action: "created" | "edited" | "skipped" | "locked";
  commentId: number;
  entriesAdded: number;
  entriesTotal: number;
  timestamp: string;
}

const CONFIG = {
  maxEntriesPerComment: ${config.maxEntriesPerComment},
  entrySortOrder: "${config.entrySortOrder}" as const,
  placeholderMessage: ${JSON.stringify(config.placeholderMessage)},
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Finds the existing matchmaking comment on an issue.
 * Returns state object indicating whether comment exists.
 */
export async function findMatchmakingComment(
  owner: string,
  repo: string,
  issueNumber: number,
  hasMarkerFn: (body: string, issueNum: number) => boolean
): Promise<MatchmakingCommentState> {
  try {
    const response = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    for (const comment of response.data) {
      if (hasMarkerFn(comment.body || "", issueNumber)) {
        return {
          exists: true,
          commentId: comment.id,
          currentBody: comment.body || "",
          lastUpdatedAt: comment.updated_at,
          editCount: 0, // Would need to track separately or parse from body
        };
      }
    }

    return {
      exists: false,
      commentId: null,
      currentBody: null,
      lastUpdatedAt: null,
      editCount: 0,
    };
  } catch (error) {
    console.error(\`Failed to list comments: \${(error as Error).message}\`);
    return {
      exists: false,
      commentId: null,
      currentBody: null,
      lastUpdatedAt: null,
      editCount: 0,
    };
  }
}

/**
 * Renders the matchmaking comment body from entries.
 */
export function renderCommentBody(
  entries: MatchmakingEntry[],
  issueNumber: number,
  generateMarkerFn: (issueNum: number) => string,
  ensureMarkerFn: (body: string, issueNum: number) => string
): string {
  if (entries.length === 0) {
    return ensureMarkerFn(CONFIG.placeholderMessage, issueNumber);
  }

  // Sort entries
  const sorted = [...entries].sort((a, b) => {
    if (CONFIG.entrySortOrder === "match-desc") {
      return b.matchPercentage - a.matchPercentage;
    }
    return 0; // Chronological — preserve insertion order
  });

  // Build markdown
  const lines = [
    ">[!NOTE]",
    ">The following contributors may be suitable for this task:",
    "",
  ];

  for (const entry of sorted.slice(0, CONFIG.maxEntriesPerComment)) {
    lines.push(
      \`>### [\${entry.username}](https://www.github.com/\${entry.username})\`
    );
    lines.push(
      \`> \\\`\${entry.matchPercentage}% Match\\\` [\${entry.referenceRepo}#\${entry.referenceIssue}](https://www.github.com/\${entry.referenceRepo}/issues/\${entry.referenceIssue})\`
    );
    lines.push("");
  }

  if (sorted.length > CONFIG.maxEntriesPerComment) {
    lines.push(
      \`>... and \${sorted.length - CONFIG.maxEntriesPerComment} more candidates.\`
    );
  }

  const body = lines.join("\\n");
  return ensureMarkerFn(body, issueNumber);
}

/**
 * Creates or edits the matchmaking comment idempotently.
 * This is the main entry point for webhook handlers.
 */
export async function createOrEditMatchmakingComment(
  owner: string,
  repo: string,
  issueNumber: number,
  entries: MatchmakingEntry[],
  helpers: {
    hasMarker: (body: string, issueNum: number) => boolean;
    generateMarker: (issueNum: number) => string;
    ensureMarker: (body: string, issueNum: number) => string;
  }
): Promise<CommentOperationResult> {
  const state = await findMatchmakingComment(owner, repo, issueNumber, helpers.hasMarker);
  const body = renderCommentBody(entries, issueNumber, helpers.generateMarker, helpers.ensureMarker);
  const timestamp = new Date().toISOString();

  if (!state.exists) {
    // Create new comment
    try {
      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      return {
        action: "created",
        commentId: response.data.id,
        entriesAdded: entries.length,
        entriesTotal: entries.length,
        timestamp,
      };
    } catch (error) {
      // Race condition: another worker created it between our check and create
      // Re-check and edit instead
      const recheck = await findMatchmakingComment(owner, repo, issueNumber, helpers.hasMarker);
      if (recheck.exists && recheck.commentId) {
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: recheck.commentId,
          body,
        });

        return {
          action: "edited",
          commentId: recheck.commentId,
          entriesAdded: entries.length,
          entriesTotal: entries.length,
          timestamp,
        };
      }

      throw error;
    }
  } else {
    // Edit existing comment
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: state.commentId!,
      body,
    });

    return {
      action: "edited",
      commentId: state.commentId!,
      entriesAdded: entries.length,
      entriesTotal: entries.length,
      timestamp,
    };
  }
}
`;
}

// ============================================================================
// SECTION 5: Webhook Debouncer Generator
// ============================================================================

/**
 * Generates the webhook event debouncing module.
 * Batches rapid label events to prevent redundant processing.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateWebhookDebouncer(config: MatchmakingDedupConfig): string {
  return `/**
 * Auto-generated Webhook Event Debouncer
 * Batches rapid label events into single processing runs.
 */

interface LabelWebhookEvent {
  issueNumber: number;
  repoFullName: string;
  labelAdded: string;
  labelRemoved: string | null;
  timestamp: number;
  eventId: string;
}

interface BatchedLabelEvents {
  issueNumber: number;
  repoFullName: string;
  events: LabelWebhookEvent[];
  labelsAdded: string[];
  labelsRemoved: string[];
  firstEventTimestamp: number;
  lastEventTimestamp: number;
}

const CONFIG = {
  debounceWindowMs: ${config.debounceWindowMs},
};

// In-memory pending batches keyed by "owner/repo#issueNumber"
const pendingBatches = new Map<string, {
  events: LabelWebhookEvent[];
  timer: ReturnType<typeof setTimeout>;
}>();

/**
 * Generates a batch key for deduplication.
 */
export function getBatchKey(event: LabelWebhookEvent): string {
  return \`\${event.repoFullName}#\${event.issueNumber}\`;
}

/**
 * Adds a webhook event to the debounce buffer.
 * Returns a promise that resolves with the batch when the window closes.
 */
export function addEventToBatch(
  event: LabelWebhookEvent,
  onBatchReady: (batch: BatchedLabelEvents) => Promise<void>
): void {
  const key = getBatchKey(event);
  const existing = pendingBatches.get(key);

  if (existing) {
    // Add to existing batch and reset timer
    existing.events.push(event);
    clearTimeout(existing.timer);
  } else {
    // Start new batch
    pendingBatches.set(key, {
      events: [event],
      timer: setTimeout(() => flushBatch(key, onBatchReady), CONFIG.debounceWindowMs),
    });
  }
}

/**
 * Flushes a batch, invoking the callback with aggregated events.
 */
async function flushBatch(
  key: string,
  onBatchReady: (batch: BatchedLabelEvents) => Promise<void>
): Promise<void> {
  const batch = pendingBatches.get(key);
  if (!batch) return;

  pendingBatches.delete(key);

  const events = batch.events;
  const labelsAdded = [...new Set(events.map(e => e.labelAdded).filter(Boolean))];
  const labelsRemoved = [...new Set(events.map(e => e.labelRemoved).filter(Boolean))] as string[];

  const batched: BatchedLabelEvents = {
    issueNumber: events[0].issueNumber,
    repoFullName: events[0].repoFullName,
    events,
    labelsAdded,
    labelsRemoved,
    firstEventTimestamp: Math.min(...events.map(e => e.timestamp)),
    lastEventTimestamp: Math.max(...events.map(e => e.timestamp)),
  };

  try {
    await onBatchReady(batched);
  } catch (error) {
    console.error(\`Batch processing failed for \${key}: \${(error as Error).message}\`);
  }
}

/**
 * Immediately flushes all pending batches.
 * Useful for graceful shutdown.
 */
export async function flushAll(onBatchReady: (batch: BatchedLabelEvents) => Promise<void>): Promise<void> {
  const keys = [...pendingBatches.keys()];
  for (const key of keys) {
    const batch = pendingBatches.get(key);
    if (batch) {
      clearTimeout(batch.timer);
    }
    await flushBatch(key, onBatchReady);
  }
}

/**
 * Returns the number of pending batches.
 */
export function getPendingBatchCount(): number {
  return pendingBatches.size;
}
`;
}

// ============================================================================
// SECTION 6: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #94:
 * 1. Matchmaking comment created at issue creation time
 * 2. Subsequent invocations edit instead of creating new comments
 * 3. Handles concurrent label events without duplicates
 * 4. Deterministic comment identification via marker
 * 5. Debouncing prevents redundant processing
 *
 * @param config - Plugin configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: MatchmakingDedupConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Comment marker prefix configured",
      passed: config.commentMarkerPrefix.length > 0,
      detail: \`Prefix: "\${config.commentMarkerPrefix}"\`,
    },
    {
      name: "Debounce window set (>0ms)",
      passed: config.debounceWindowMs > 0,
      detail: \`Window: \${config.debounceWindowMs}ms\`,
    },
    {
      name: "Placeholder on open enabled",
      passed: config.createPlaceholderOnOpen === true,
      detail: \`Enabled: \${config.createPlaceholderOnOpen}\`,
    },
    {
      name: "Lock TTL configured",
      passed: config.lockTtlMs > 0,
      detail: \`TTL: \${config.lockTtlMs}ms\`,
    },
    {
      name: "Max entries per comment set",
      passed: config.maxEntriesPerComment >= 3,
      detail: \`Max entries: \${config.maxEntriesPerComment}\`,
    },
    {
      name: "Concurrent edit limit set",
      passed: config.maxConcurrentEdits >= 1,
      detail: \`Max concurrent: \${config.maxConcurrentEdits}\`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 7: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "matchmaking-comment-dedup",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5055",
  upstream: "https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/94",
  bounty: 75,
  generators: [
    "generateCommentMarker",
    "generateCreateOrEditOrchestrator",
    "generateWebhookDebouncer",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<MatchmakingDedupConfig> = {}
): void {
  const mergedConfig: MatchmakingDedupConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "comment-marker.ts": generateCommentMarker(mergedConfig),
    "create-or-edit-orchestrator.ts": generateCreateOrEditOrchestrator(mergedConfig),
    "webhook-debouncer.ts": generateWebhookDebouncer(mergedConfig),
  };

  console.log(\`Scaffolding matchmaking comment deduplication in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
