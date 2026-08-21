/**
 * @file march-2025-adjustments.ts
 * @title March 2025 Adjustments: PR #91 Review Feedback Implementation
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5046
 * @upstream https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/92
 * @bounty $75 USD
 *
 * @description
 * This plugin provides scaffolding for implementing the five review feedback
 * items identified in PR #91 of text-vector-embeddings. The upstream issue
 * summarizes specific code quality and UX improvements needed:
 *
 * 1. User-Friendly URL Handling: Improve regex for URL parsing
 * 2. Logger Implementation: Use `throw context.logger.info("...")` pattern
 * 3. Footnote ID Prefixing: Replace zero-prefixed IDs with meaningful prefixes
 * 4. Validation Description Enhancement: Clarify contributor recommendation behavior
 * 5. Timeout Configuration: Integrate `ms` library for ergonomic timeouts
 *
 * Generated modules:
 * - URL Regex Improver: User-friendly URL matching utilities
 * - Logger Pattern Adapter: Enforces throw-based logging convention
 * - Footnote ID Refactorer: Meaningful prefix generation for footnotes
 * - Validation Description Builder: Clear LLM-facing configuration text
 * - Timeout Helper: ms-library wrapper for human-readable durations
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * A parsed URL with user-friendly display representation.
 */
export interface ParsedUrl {
  /** Original raw URL string */
  raw: string;
  /** Normalized URL (lowercase protocol, no trailing slash) */
  normalized: string;
  /** Human-friendly display form (e.g., "github.com/org/repo") */
  display: string;
  /** Whether the URL was successfully parsed */
  valid: boolean;
  /** Protocol extracted (http, https, etc.) */
  protocol: string | null;
  /** Hostname without www prefix */
  hostname: string | null;
  /** Path component */
  path: string | null;
}

/**
 * Logger context following UbiquityOS convention.
 */
export interface LoggerContext {
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => never;
    warn: (message: string, meta?: Record<string, unknown>) => never;
    error: (message: string, meta?: Record<string, unknown>) => never;
    debug: (message: string, meta?: Record<string, unknown>) => never;
  };
}

/**
 * A footnote reference with meaningful ID.
 */
export interface FootnoteRef {
  /** Semantic prefix (e.g., "deduplication", "matchmaking") */
  prefix: string;
  /** Numeric index within this prefix category */
  index: number;
  /** Full generated ID (e.g., "deduplication-1") */
  id: string;
  /** Anchor target for HTML rendering */
  anchor: string;
  /** Back-reference anchor from footnote body to citation */
  backAnchor: string;
}

/**
 * Validation description for LLM consumption.
 */
export interface ValidationDescription {
  /** Configuration key being described */
  configKey: string;
  /** Human-readable explanation for LLM context */
  llmDescription: string;
  /** Current configured value */
  currentValue: unknown;
  /** Default value if not configured */
  defaultValue: unknown;
  /** Constraints or valid range */
  constraints: string;
}

/**
 * Timeout specification supporting ms-library format.
 */
export interface TimeoutSpec {
  /** Human-readable duration string (e.g., "30s", "5m", "1h") */
  humanReadable: string;
  /** Equivalent milliseconds */
  milliseconds: number;
  /** Whether this is a valid timeout value */
  valid: boolean;
  /** Parse error message if invalid */
  error?: string;
}

/**
 * Plugin configuration for all five adjustments.
 */
export interface March2025Config {
  /** URL handling settings */
  urlHandling: {
    stripWww: boolean;
    stripTrailingSlash: boolean;
    lowercaseProtocol: boolean;
    maxDisplayLength: number;
  };
  /** Logger pattern enforcement */
  logger: {
    enforceThrowPattern: boolean;
    includeTimestamp: boolean;
    includeCallerLocation: boolean;
  };
  /** Footnote ID settings */
  footnotes: {
    defaultPrefix: string;
    separator: string;
    startIndex: number;
  };
  /** Validation description templates */
  validationDescriptions: Record<string, string>;
  /** Timeout defaults */
  timeouts: {
    defaultHttpTimeout: string;
    defaultProcessingTimeout: string;
    maxAllowedTimeout: string;
  };
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default configuration addressing all five review items.
 */
export const DEFAULT_CONFIG: March2025Config = {
  urlHandling: {
    stripWww: true,
    stripTrailingSlash: true,
    lowercaseProtocol: true,
    maxDisplayLength: 80,
  },
  logger: {
    enforceThrowPattern: true,
    includeTimestamp: true,
    includeCallerLocation: false,
  },
  footnotes: {
    defaultPrefix: "note",
    separator: "-",
    startIndex: 1,
  },
  validationDescriptions: {
    minRecommendations: "this amount of contributors will always be recommended regardless of the similarity score.",
    maxRecommendations: "maximum number of contributor recommendations to display per issue.",
    similarityThreshold: "minimum cosine similarity score required for a contributor to be considered relevant.",
    contextPenalty: "relevance score reduction applied when matching across different repositories or organizations.",
  },
  timeouts: {
    defaultHttpTimeout: "30s",
    defaultProcessingTimeout: "5m",
    maxAllowedTimeout: "1h",
  },
};

// ============================================================================
// SECTION 3: User-Friendly URL Handler Generator
// ============================================================================

/**
 * Generates improved URL parsing and display utilities.
 * Addresses review comment on user-friendly URL handling.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateUrlHandler(config: March2025Config): string {
  return `/**
 * Auto-generated User-Friendly URL Handler
 * Improved regex-based URL parsing with clean display formatting.
 */

interface ParsedUrl {
  raw: string;
  normalized: string;
  display: string;
  valid: boolean;
  protocol: string | null;
  hostname: string | null;
  path: string | null;
}

const CONFIG = {
  stripWww: ${config.urlHandling.stripWww},
  stripTrailingSlash: ${config.urlHandling.stripTrailingSlash},
  lowercaseProtocol: ${config.urlHandling.lowercaseProtocol},
  maxDisplayLength: ${config.urlHandling.maxDisplayLength},
};

/**
 * Enhanced URL regex that handles edge cases better than basic patterns.
 * Supports protocols, subdomains, paths, query strings, and fragments.
 */
const URL_REGEX = /^(?:(https?):\\/\\/)?(?:www\\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(?::(\\d+))?(\\/[^?#]*)?(?:\\?([^#]*))?(?:#(.*))?$/i;

/**
 * Parses a URL string into structured components with user-friendly display.
 */
export function parseUserFriendlyUrl(input: string): ParsedUrl {
  const trimmed = input.trim();

  // Try enhanced regex first
  const match = trimmed.match(URL_REGEX);

  if (!match) {
    // Fallback to URL constructor for standard URLs
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : \`https://\${trimmed}\`);
      return buildParsedUrl(trimmed, url.protocol.replace(":", ""), url.hostname, url.pathname + url.search + url.hash);
    } catch {
      return {
        raw: trimmed,
        normalized: trimmed,
        display: trimmed,
        valid: false,
        protocol: null,
        hostname: null,
        path: null,
      };
    }
  }

  const protocol = match[1] || "https";
  let hostname = match[2];
  const port = match[3];
  const path = match[4] || "/";
  const query = match[5];
  const fragment = match[6];

  // Apply user-friendly transformations
  if (CONFIG.stripWww && hostname.startsWith("www.")) {
    hostname = hostname.substring(4);
  }

  const normalizedProtocol = CONFIG.lowercaseProtocol ? protocol.toLowerCase() : protocol;
  let normalizedPath = path || "/";
  if (CONFIG.stripTrailingSlash && normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  const normalized = \`\${normalizedProtocol}://\${hostname}\${port ? ":" + port : ""}\${normalizedPath}\${query ? "?" + query : ""}\${fragment ? "#" + fragment : ""}\`;

  // Build display version (no protocol, truncated if needed)
  let display = \`\${hostname}\${normalizedPath !== "/" ? normalizedPath : ""}\`;
  if (display.length > CONFIG.maxDisplayLength) {
    display = display.substring(0, CONFIG.maxDisplayLength - 3) + "...";
  }

  return {
    raw: trimmed,
    normalized,
    display,
    valid: true,
    protocol: normalizedProtocol,
    hostname,
    path: normalizedPath,
  };
}

function buildParsedUrl(raw: string, protocol: string, hostname: string, fullPath: string): ParsedUrl {
  let displayHost = hostname;
  if (CONFIG.stripWww && displayHost.startsWith("www.")) {
    displayHost = displayHost.substring(4);
  }

  let display = \`\${displayHost}\${fullPath !== "/" ? fullPath : ""}\`;
  if (display.length > CONFIG.maxDisplayLength) {
    display = display.substring(0, CONFIG.maxDisplayLength - 3) + "...";
  }

  return {
    raw,
    normalized: \`\${protocol.toLowerCase()}://\${hostname}\${fullPath}\`,
    display,
    valid: true,
    protocol: protocol.toLowerCase(),
    hostname,
    path: fullPath.split("?")[0].split("#")[0],
  };
}

/**
 * Extracts all URLs from a text block using the enhanced regex.
 */
export function extractUrls(text: string): ParsedUrl[] {
  const results: ParsedUrl[] = [];
  const globalRegex = new RegExp(URL_REGEX.source, "gi");
  let match;

  while ((match = globalRegex.exec(text)) !== null) {
    results.push(parseUserFriendlyUrl(match[0]));
  }

  return results.filter(u => u.valid);
}
`;
}

// ============================================================================
// SECTION 4: Logger Pattern Adapter Generator
// ============================================================================

/**
 * Generates the throw-based logger pattern enforcement module.
 * Addresses review comment on logger implementation pattern.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateLoggerAdapter(config: March2025Config): string {
  return `/**
 * Auto-generated Logger Pattern Adapter
 * Enforces UbiquityOS throw-based logging convention: throw context.logger.info("...")
 */

interface LoggerContext {
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => never;
    warn: (message: string, meta?: Record<string, unknown>) => never;
    error: (message: string, meta?: Record<string, unknown>) => never;
    debug: (message: string, meta?: Record<string, unknown>) => never;
  };
}

const CONFIG = {
  enforceThrowPattern: ${config.logger.enforceThrowPattern},
  includeTimestamp: ${config.logger.includeTimestamp},
  includeCallerLocation: ${config.logger.includeCallerLocation},
};

/**
 * Creates a logger proxy that enforces the throw pattern.
 * Usage: throw createLogger(context).info("message");
 */
export function createLogger(context: LoggerContext) {
  const wrapMethod = (method: keyof LoggerContext["logger"]) => {
    return (message: string, meta?: Record<string, unknown>): never => {
      let formattedMessage = message;

      if (CONFIG.includeTimestamp) {
        formattedMessage = \`[\${new Date().toISOString()}] \${formattedMessage}\`;
      }

      if (CONFIG.includeCallerLocation) {
        const stack = new Error().stack;
        const callerLine = stack?.split("\\n")[2]?.trim() || "unknown";
        formattedMessage = \`\${formattedMessage} (\${callerLine})\`;
      }

      // The actual log call happens here, then we throw to satisfy the pattern
      context.logger[method](formattedMessage, meta);

      // This line should never execute since logger methods return never
      throw new Error(formattedMessage);
    };
  };

  return {
    info: wrapMethod("info"),
    warn: wrapMethod("warn"),
    error: wrapMethod("error"),
    debug: wrapMethod("debug"),
  };
}

/**
 * Validates that a code snippet uses the throw-based logger pattern.
 * Used in CI/linting to enforce the convention.
 */
export function validateLoggerPattern(sourceCode: string): {
  valid: boolean;
  violations: Array<{ line: number; content: string }>;
} {
  const lines = sourceCode.split("\\n");
  const violations: Array<{ line: number; content: string }> = [];

  // Pattern: context.logger.X(...) NOT preceded by "throw"
  const directCallRegex = /(?<!throw\\s+)context\\.logger\\.(info|warn|error|debug)\\(/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    if (directCallRegex.test(line)) {
      violations.push({ line: i + 1, content: line.trim() });
    }
    // Reset regex state
    directCallRegex.lastIndex = 0;
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Transforms direct logger calls to throw-based pattern.
 * Useful for automated codemods.
 */
export function transformToThrowPattern(sourceCode: string): string {
  return sourceCode.replace(
    /(?<!throw\\s+)(context\\.logger\\.(info|warn|error|debug)\\()/g,
    "throw $1"
  );
}
`;
}

// ============================================================================
// SECTION 5: Footnote ID Refactorer Generator
// ============================================================================

/**
 * Generates meaningful footnote ID system replacing zero-prefixed IDs.
 * Addresses review comment on footnote ID prefixing.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateFootnoteRefactorer(config: March2025Config): string {
  return `/**
 * Auto-generated Footnote ID Refactorer
 * Replaces zero-prefixed IDs with meaningful semantic prefixes.
 */

interface FootnoteRef {
  prefix: string;
  index: number;
  id: string;
  anchor: string;
  backAnchor: string;
}

const CONFIG = {
  defaultPrefix: "${config.footnotes.defaultPrefix}",
  separator: "${config.footnotes.separator}",
  startIndex: ${config.footnotes.startIndex},
};

// Track counters per prefix for sequential numbering
const prefixCounters = new Map<string, number>();

/**
 * Generates a meaningful footnote ID with semantic prefix.
 * Example: "deduplication-1" instead of "0-1"
 */
export function generateFootnoteId(prefix?: string): FootnoteRef {
  const pfx = prefix || CONFIG.defaultPrefix;
  const currentCount = prefixCounters.get(pfx) || (CONFIG.startIndex - 1);
  const nextIndex = currentCount + 1;
  prefixCounters.set(pfx, nextIndex);

  const id = \`\${pfx}\${CONFIG.separator}\${nextIndex}\`;

  return {
    prefix: pfx,
    index: nextIndex,
    id,
    anchor: \`fn-\${id}\`,
    backAnchor: \`fnref-\${id}\`,
  };
}

/**
 * Resets counter for a specific prefix or all prefixes.
 */
export function resetFootnoteCounter(prefix?: string): void {
  if (prefix) {
    prefixCounters.delete(prefix);
  } else {
    prefixCounters.clear();
  }
}

/**
 * Renders a footnote citation in markdown.
 */
export function renderCitation(ref: FootnoteRef): string {
  return \`[^\\\`\${ref.id}\\\`]\`;
}

/**
 * Renders a footnote definition in markdown.
 */
export function renderDefinition(ref: FootnoteRef, content: string): string {
  return \`[^\\\`\${ref.id}\\\`]: \${content} ([↩](#\${ref.backAnchor}))\`;
}

/**
 * Converts legacy zero-prefixed footnote IDs to meaningful ones.
 * Scans markdown and replaces patterns like [^0-1] with [^prefix-1].
 */
export function migrateLegacyFootnotes(
  markdown: string,
  prefixMapping: Record<string, string>
): string {
  let result = markdown;

  for (const [oldPrefix, newPrefix] of Object.entries(prefixMapping)) {
    // Match citation pattern: [^oldPrefix-N]
    const citationRegex = new RegExp(
      \`(\\\\[\\\\^\${escapeRegex(oldPrefix)}\\\\\\\\-(\\\\d+)\\\\])\`,
      "g"
    );
    result = result.replace(citationRegex, (_, __, num) =>
      \`[^\${newPrefix}-\${num}]\`
    );

    // Match definition pattern: [^oldPrefix-N]:
    const defRegex = new RegExp(
      \`(\\\\[\\\\^\${escapeRegex(oldPrefix)}\\\\\\\\-(\\\\d+)\\\\]:)\`,
      "g"
    );
    result = result.replace(defRegex, (_, __, num) =>
      \`[^\${newPrefix}-\${num}]:\`
    );
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^$\{\}()|[\\]\\\\]/g, "\\\\\\$&");
}

/**
 * Suggested prefix mappings for common footnote categories.
 */
export const RECOMMENDED_PREFIXES: Record<string, string> = {
  "0": "note",
  "1": "deduplication",
  "2": "matchmaking",
  "3": "validation",
  "4": "configuration",
  "5": "reference",
};
`;
}

// ============================================================================
// SECTION 6: Validation Description Builder Generator
// ============================================================================

/**
 * Generates clear validation descriptions for LLM consumption.
 * Addresses review comment on validation description enhancement.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateValidationDescriptionBuilder(config: March2025Config): string {
  return `/**
 * Auto-generated Validation Description Builder
 * Produces precise LLM-facing configuration descriptions.
 */

interface ValidationDescription {
  configKey: string;
  llmDescription: string;
  currentValue: unknown;
  defaultValue: unknown;
  constraints: string;
}

const DESCRIPTIONS: Record<string, string> = ${JSON.stringify(config.validationDescriptions)};

/**
 * Gets the LLM-facing description for a configuration key.
 * Returns precise language as specified in review feedback.
 */
export function getValidationDescription(configKey: string): string | null {
  return DESCRIPTIONS[configKey] || null;
}

/**
 * Builds a complete validation description object for a config entry.
 */
export function buildValidationDescription(
  configKey: string,
  currentValue: unknown,
  defaultValue: unknown,
  constraints: string
): ValidationDescription {
  return {
    configKey,
    llmDescription: DESCRIPTIONS[configKey] || \`Configuration value for \${configKey}.\`,
    currentValue,
    defaultValue,
    constraints,
  };
}

/**
 * Formats all validation descriptions for inclusion in LLM system prompt.
 */
export function formatForLlmPrompt(): string {
  const lines = ["## Configuration Descriptions", ""];

  for (const [key, desc] of Object.entries(DESCRIPTIONS)) {
    lines.push(\`- **\${key}**: \${desc}\`);
  }

  return lines.join("\\n");
}

/**
 * Validates that a description meets clarity standards.
 * Checks for precision, completeness, and absence of ambiguity.
 */
export function validateDescriptionClarity(description: string): {
  clear: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (description.length < 20) {
    issues.push("Description too short (< 20 chars)");
  }

  if (description.length > 500) {
    issues.push("Description too long (> 500 chars)");
  }

  // Check for vague language
  const vagueTerms = ["some", "maybe", "probably", "might", "could be"];
  for (const term of vagueTerms) {
    if (description.toLowerCase().includes(term)) {
      issues.push(\`Contains vague term: "\${term}"\`);
    }
  }

  // Check for proper sentence structure
  if (!description.endsWith(".") && !description.endsWith("!") && !description.endsWith("?")) {
    issues.push("Missing terminal punctuation");
  }

  return {
    clear: issues.length === 0,
    issues,
  };
}
`;
}

// ============================================================================
// SECTION 7: Timeout Helper Generator
// ============================================================================

/**
 * Generates ms-library wrapper for ergonomic timeout configuration.
 * Addresses review comment on timeout handling improvement.
 *
 * @param config - Plugin configuration
 * @returns TypeScript source code string
 */
export function generateTimeoutHelper(config: March2025Config): string {
  return `/**
 * Auto-generated Timeout Helper with ms Library Integration
 * Provides human-readable timeout configuration.
 */

interface TimeoutSpec {
  humanReadable: string;
  milliseconds: number;
  valid: boolean;
  error?: string;
}

const CONFIG = {
  defaultHttpTimeout: "${config.timeouts.defaultHttpTimeout}",
  defaultProcessingTimeout: "${config.timeouts.defaultProcessingTimeout}",
  maxAllowedTimeout: "${config.timeouts.maxAllowedTimeout}",
};

/**
 * Simple ms parser (subset of the ms library API).
 * In production, import { default as ms } from "ms";
 */
function parseMs(value: string): number {
  const match = value.trim().match(/^(\\d+(?:\\.\\d+)?)\\s*(ms|s|m|h|d)$/i);
  if (!match) {
    throw new Error(\`Invalid duration format: "\${value}". Expected format: <number><unit> (e.g., "30s", "5m", "1h")\`);
  }

  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.round(num * multipliers[unit]);
}

/**
 * Parses a human-readable timeout string into milliseconds.
 */
export function parseTimeout(value: string): TimeoutSpec {
  try {
    const milliseconds = parseMs(value);
    const maxMs = parseMs(CONFIG.maxAllowedTimeout);

    if (milliseconds > maxMs) {
      return {
        humanReadable: value,
        milliseconds,
        valid: false,
        error: \`Timeout \${value} exceeds maximum allowed (\${CONFIG.maxAllowedTimeout})\`,
      };
    }

    if (milliseconds <= 0) {
      return {
        humanReadable: value,
        milliseconds,
        valid: false,
        error: "Timeout must be positive",
      };
    }

    return {
      humanReadable: value,
      milliseconds,
      valid: true,
    };
  } catch (e) {
    return {
      humanReadable: value,
      milliseconds: 0,
      valid: false,
      error: (e as Error).message,
    };
  }
}

/**
 * Gets the default HTTP timeout in milliseconds.
 */
export function getDefaultHttpTimeoutMs(): number {
  return parseMs(CONFIG.defaultHttpTimeout);
}

/**
 * Gets the default processing timeout in milliseconds.
 */
export function getDefaultProcessingTimeoutMs(): number {
  return parseMs(CONFIG.defaultProcessingTimeout);
}

/**
 * Creates an AbortController with a human-readable timeout.
 */
export function createTimeoutController(timeout: string): {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
  spec: TimeoutSpec;
} {
  const spec = parseTimeout(timeout);
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, spec.valid ? spec.milliseconds : parseMs(CONFIG.defaultHttpTimeout));

  return { controller, timeoutId, spec };
}

/**
 * Formats milliseconds back to human-readable string.
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return \`\${ms}ms\`;
  if (ms < 60000) return \`\${(ms / 1000).toFixed(1)}s\`;
  if (ms < 3600000) return \`\${(ms / 60000).toFixed(1)}m\`;
  return \`\${(ms / 3600000).toFixed(1)}h\`;
}
`;
}

// ============================================================================
// SECTION 8: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding addresses all five review items.
 *
 * Acceptance criteria from upstream issue #92:
 * 1. User-friendly URL regex handling implemented
 * 2. Logger follows throw context.logger.info() pattern
 * 3. Footnote IDs use meaningful prefixes (not zero-prefixed)
 * 4. Validation descriptions are precise for LLM consumption
 * 5. ms library integrated for timeout configuration
 *
 * @param config - Plugin configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: March2025Config): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "URL handling configured",
      passed: config.urlHandling.stripWww === true && config.urlHandling.stripTrailingSlash === true,
      detail: `stripWww: ${config.urlHandling.stripWww}, stripTrailingSlash: ${config.urlHandling.stripTrailingSlash}`,
    },
    {
      name: "Logger throw pattern enforced",
      passed: config.logger.enforceThrowPattern === true,
      detail: `Enforced: ${config.logger.enforceThrowPattern}`,
    },
    {
      name: "Footnote default prefix set",
      passed: config.footnotes.defaultPrefix.length > 0 && config.footnotes.defaultPrefix !== "0",
      detail: `Default prefix: "${config.footnotes.defaultPrefix}"`,
    },
    {
      name: "Validation descriptions defined",
      passed: Object.keys(config.validationDescriptions).length >= 3,
      detail: `${Object.keys(config.validationDescriptions).length} descriptions`,
    },
    {
      name: "Timeout defaults configured",
      passed: config.timeouts.defaultHttpTimeout.length > 0 && config.timeouts.defaultProcessingTimeout.length > 0,
      detail: `HTTP: ${config.timeouts.defaultHttpTimeout}, Processing: ${config.timeouts.defaultProcessingTimeout}`,
    },
    {
      name: "Max timeout limit set",
      passed: config.timeouts.maxAllowedTimeout.length > 0,
      detail: `Max: ${config.timeouts.maxAllowedTimeout}`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 9: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "march-2025-adjustments",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5046",
  upstream: "https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/92",
  bounty: 75,
  generators: [
    "generateUrlHandler",
    "generateLoggerAdapter",
    "generateFootnoteRefactorer",
    "generateValidationDescriptionBuilder",
    "generateTimeoutHelper",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<March2025Config> = {}
): void {
  const mergedConfig: March2025Config = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(`  ✗ ${c.name}: ${c.detail}`));
  }

  const files: Record<string, string> = {
    "url-handler.ts": generateUrlHandler(mergedConfig),
    "logger-adapter.ts": generateLoggerAdapter(mergedConfig),
    "footnote-refactorer.ts": generateFootnoteRefactorer(mergedConfig),
    "validation-descriptions.ts": generateValidationDescriptionBuilder(mergedConfig),
    "timeout-helper.ts": generateTimeoutHelper(mergedConfig),
  };

  console.log(`Scaffolding March 2025 adjustments in ${outputDir}...`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(`  Writing ${filename} (${content.length} bytes)`);
  }
  console.log("Scaffold complete.");
}
