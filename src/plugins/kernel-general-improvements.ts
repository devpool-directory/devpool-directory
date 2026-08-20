/**
 * General Improvements for UbiquityOS Kernel
 *
 * Comprehensive utility suite addressing multiple kernel improvements:
 * - Safe response parsing with crash protection
 * - Dynamic environment/config resolution
 * - Comment filtering for embeddings (length, HTML, bot guard)
 * - Embedding deduplication and normalization
 * - Graceful shutdown handling
 * - Version/commit metadata helpers
 *
 * Addresses: devpool-directory#5902 / ubiquity-os/ubiquity-os-kernel#300
 */

// ─── Response Parsing ────────────────────────────────────────────────

export interface SafeParseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rawInput: string;
}

/**
 * Safely parses JSON responses from plugins/AI, never throwing.
 * Handles malformed JSON, truncated payloads, and non-object responses.
 */
export function safeParseResponse<T = unknown>(raw: string): SafeParseResult<T> {
  if (!raw || typeof raw !== "string") {
    return { success: false, error: "Empty or non-string input", rawInput: String(raw) };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return { success: false, error: `Expected object, got ${typeof parsed}`, rawInput: raw };
    }
    return { success: true, data: parsed as T, rawInput: raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `JSON parse failed: ${msg}`, rawInput: raw };
  }
}

// ─── Dynamic Environment Resolution ──────────────────────────────────

export type KernelEnvironment = "dev" | "test" | "local" | "prod";

export interface EnvironmentConfig {
  environment: KernelEnvironment;
  configFile: string;
  aiEndpoint: string;
  maxRunDurationMs: number;
}

const ENV_MAP: Record<KernelEnvironment, EnvironmentConfig> = {
  dev: {
    environment: "dev",
    configFile: "ubiquity-os.config.dev.yml",
    aiEndpoint: "https://ai.ubq.fi/dev",
    maxRunDurationMs: 3600000, // 1 hour
  },
  test: {
    environment: "test",
    configFile: "ubiquity-os.config.test.yml",
    aiEndpoint: "https://ai.ubq.fi/test",
    maxRunDurationMs: 3600000,
  },
  local: {
    environment: "local",
    configFile: "ubiquity-os.config.local.yml",
    aiEndpoint: "http://localhost:8787",
    maxRunDurationMs: 3600000,
  },
  prod: {
    environment: "prod",
    configFile: "ubiquity-os.config.yml",
    aiEndpoint: "https://ai.ubq.fi",
    maxRunDurationMs: 21600000, // 6 hours for agentic runs
  },
};

/**
 * Resolves kernel environment config from ENVIRONMENT variable or defaults to prod.
 * Supports hot-swappable configs via dynamic environment detection.
 */
export function resolveEnvironment(envVar?: string): EnvironmentConfig {
  const normalized = (envVar || "prod").toLowerCase() as KernelEnvironment;
  return ENV_MAP[normalized] || ENV_MAP.prod;
}

/**
 * Upgrades run duration for agentic workflows (1h → 6h).
 */
export function upgradeAgenticAuth(config: EnvironmentConfig): EnvironmentConfig {
  return { ...config, maxRunDurationMs: 21600000 };
}

// ─── Comment Filtering for Embeddings ────────────────────────────────

export interface EmbeddingFilterOptions {
  minCommentLength: number;
  minSpecLength: number;
  stripHtmlComments: boolean;
  excludeBots: boolean;
  botPatterns: string[];
}

const DEFAULT_FILTER_OPTIONS: EmbeddingFilterOptions = {
  minCommentLength: 64,
  minSpecLength: 32,
  stripHtmlComments: true,
  excludeBots: true,
  botPatterns: ["[bot]", "-bot", "github-actions", "dependabot", "ubiquity-os"],
};

/**
 * Determines whether a comment should be included in embeddings database.
 * Filters out short comments, bot comments, and optionally strips HTML.
 */
export function shouldEmbedComment(
  body: string,
  author: string,
  isIssueSpec: boolean = false,
  options: EmbeddingFilterOptions = DEFAULT_FILTER_OPTIONS
): { include: boolean; reason?: string } {
  const minLen = isIssueSpec ? options.minSpecLength : options.minCommentLength;

  if (!body || body.trim().length < minLen) {
    return { include: false, reason: `Below minimum length (${minLen} chars)` };
  }

  if (options.excludeBots) {
    const lowerAuthor = author.toLowerCase();
    for (const pattern of options.botPatterns) {
      if (lowerAuthor.includes(pattern)) {
        return { include: false, reason: `Bot author matched pattern '${pattern}'` };
      }
    }
  }

  return { include: true };
}

/**
 * Strips HTML comments from text before embedding.
 */
export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/**
 * Normalizes an embedding document for unified storage.
 * Combines issue, comment, and review comment types into a single schema.
 */
export interface NormalizedEmbeddingDoc {
  id: string;
  type: "issue" | "comment" | "review_comment";
  owner: string;
  repo: string;
  number: number;
  author: string;
  body: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export function normalizeEmbeddingDocument(
  type: NormalizedEmbeddingDoc["type"],
  owner: string,
  repo: string,
  number: number,
  author: string,
  body: string,
  createdAt: string,
  metadata: Record<string, unknown> = {}
): NormalizedEmbeddingDoc {
  let processedBody = body;
  if (DEFAULT_FILTER_OPTIONS.stripHtmlComments) {
    processedBody = stripHtmlComments(processedBody);
  }

  return {
    id: `${owner}/${repo}#${number}:${type}:${createdAt}`,
    type,
    owner,
    repo,
    number,
    author,
    body: processedBody,
    createdAt,
    metadata,
  };
}

// ─── Deduplication ───────────────────────────────────────────────────

/**
 * Computes simple Jaccard similarity between two strings for dedup threshold.
 * Returns value between 0 and 1.
 */
export function computeSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Checks if a new document is a duplicate of any existing one above threshold.
 * Default threshold: 80% as specified in issue.
 */
export function isDuplicate(
  newBody: string,
  existingBodies: string[],
  threshold: number = 0.8
): boolean {
  for (const existing of existingBodies) {
    if (computeSimilarity(newBody, existing) >= threshold) {
      return true;
    }
  }
  return false;
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

export interface ShutdownHandler {
  cleanup: () => Promise<void>;
  signal: string;
}

/**
 * Registers graceful shutdown handlers for SIGINT/SIGTERM.
 * Ensures pending operations complete before process exit.
 */
export function registerGracefulShutdown(
  cleanupFn: () => Promise<void>
): () => void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${signal}] Graceful shutdown initiated...`);
    try {
      await cleanupFn();
      console.log(`[${signal}] Cleanup complete. Exiting.`);
    } catch (e) {
      console.error(`[${signal}] Cleanup failed:`, e);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));

  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
}

// ─── Version Metadata ────────────────────────────────────────────────

export interface VersionInfo {
  version: string;
  commitHash: string;
  buildDate: string;
  environment: KernelEnvironment;
}

/**
 * Generates version info for /help command display.
 */
export function getVersionInfo(
  version: string,
  commitHash: string,
  environment: KernelEnvironment = "prod"
): VersionInfo {
  return {
    version,
    commitHash: commitHash.substring(0, 7),
    buildDate: new Date().toISOString(),
    environment,
  };
}

export { DEFAULT_FILTER_OPTIONS };
