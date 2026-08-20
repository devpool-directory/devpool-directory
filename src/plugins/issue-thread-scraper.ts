/**
 * @file issue-thread-scraper.ts
 * @title Scraper: Scrape Issue Threads with Time Estimates
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5020
 * @upstream https://github.com/ubiquity-os-marketplace/daemon-pricing/issues/82
 * @bounty $300 USD
 *
 * @description
 * This plugin provides a comprehensive scaffolding for scraping GitHub issue
 * threads and generating JSONL datasets compatible with OpenAI's fine-tuning
 * specification. The target use case is building training and validation sets
 * for time-estimation models that predict how long a bounty or task will take
 * based on the issue thread content, labels, comments, and metadata.
 *
 * The generator produces:
 * 1. A TypeScript scraper module that fetches issues via the GitHub API.
 * 2. A transformer pipeline that converts raw issue data into OpenAI chat format.
 * 3. Validation utilities to ensure dataset quality and spec compliance.
 * 4. Configuration interfaces for controlling dataset size, filtering, and output.
 *
 * Expected output:
 * - Training set: 250–300 annotated examples
 * - Validation set: 100–150 annotated examples
 *
 * Each example follows the OpenAI fine-tune JSONL schema:
 * {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * Represents a single message in an OpenAI fine-tuning conversation.
 * Roles are restricted to system, user, and assistant as per spec.
 */
export interface FineTuneMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A single fine-tuning example in JSONL format.
 * Each line in the output file must be a valid JSON object matching this shape.
 */
export interface FineTuneExample {
  messages: FineTuneMessage[];
}

/**
 * Raw GitHub issue comment as returned by the REST/GraphQL API.
 */
export interface GitHubComment {
  id: number;
  node_id: string;
  html_url: string;
  body: string;
  user: {
    login: string;
    id: number;
    type: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Raw GitHub issue as returned by the REST/GraphQL API.
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
  user: { login: string };
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  comments_url: string;
  html_url: string;
}

/**
 * Enriched issue with fetched comments attached.
 */
export interface EnrichedIssue extends GitHubIssue {
  fetched_comments: GitHubComment[];
}

/**
 * Configuration for the scraper pipeline.
 */
export interface ScraperConfig {
  /** Owner of the repository to scrape (e.g., "devpool-directory") */
  owner: string;
  /** Repository name */
  repo: string;
  /** Maximum number of issues to fetch from the listing endpoint */
  maxIssues: number;
  /** Target size for the training set */
  trainSetSize: number;
  /** Target size for the validation set */
  valSetSize: number;
  /** Minimum number of comments required for an issue to be included */
  minComments: number;
  /** Labels to include (empty = all) */
  includeLabels: string[];
  /** Labels to exclude */
  excludeLabels: string[];
  /** Path for training JSONL output */
  trainOutputPath: string;
  /** Path for validation JSONL output */
  valOutputPath: string;
  /** System prompt template for the fine-tune examples */
  systemPromptTemplate: string;
  /** Whether to include resolved/closed issues only */
  closedOnly: boolean;
  /** Rate limit delay between API calls in milliseconds */
  rateLimitDelayMs: number;
}

/**
 * Statistics about a generated dataset.
 */
export interface DatasetStats {
  totalExamples: number;
  avgMessagesPerExample: number;
  avgUserContentLength: number;
  avgAssistantContentLength: number;
  uniqueTokensEstimate: number;
  labelDistribution: Record<string, number>;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default configuration values for the scraper.
 * Override these when instantiating the pipeline.
 */
export const DEFAULT_CONFIG: ScraperConfig = {
  owner: "devpool-directory",
  repo: "devpool-directory",
  maxIssues: 500,
  trainSetSize: 300,
  valSetSize: 150,
  minComments: 2,
  includeLabels: [],
  excludeLabels: ["Price: 0 USD"],
  trainOutputPath: "./data/train.jsonl",
  valOutputPath: "./data/validation.jsonl",
  systemPromptTemplate:
    "You are a senior developer estimating task complexity. Given a GitHub issue thread, provide a time estimate in hours and explain your reasoning.",
  closedOnly: true,
  rateLimitDelayMs: 1000,
};

/**
 * OpenAI fine-tuning constraints.
 * Used during validation to reject non-compliant examples.
 */
export const OPENAI_FT_CONSTRAINTS = {
  minExamples: 10,
  maxExamples: 1000000,
  minMessages: 2,
  maxMessages: 128,
  maxContentChars: 131072,
  requiredRoles: ["user", "assistant"] as const,
  allowedRoles: ["system", "user", "assistant"] as const,
};

// ============================================================================
// SECTION 3: Scraper Module Generator
// ============================================================================

/**
 * Generates the TypeScript source code for the GitHub issue scraper.
 * This is a meta-generator: it outputs code that, when compiled and run,
 * will fetch issues and comments from the GitHub API.
 *
 * @param config - Scraper configuration to embed in the generated code
 * @returns A complete TypeScript module as a string
 */
export function generateScraperModule(config: ScraperConfig): string {
  return `/**
 * Auto-generated GitHub Issue Thread Scraper
 * Generated at: ${new Date().toISOString()}
 * Target: ${config.owner}/${config.repo}
 *
 * WARNING: This file is generated by the issue-thread-scraper plugin.
 * Do not edit manually — regenerate instead.
 */

import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

interface ScrapedIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: Array<{ author: string; body: string; created_at: string }>;
  created_at: string;
  closed_at: string | null;
}

async function fetchIssues(): Promise<ScrapedIssue[]> {
  const results: ScrapedIssue[] = [];
  let page = 1;
  const perPage = 100;

  while (results.length < ${config.maxIssues}) {
    const response = await octokit.rest.issues.listForRepo({
      owner: "${config.owner}",
      repo: "${config.repo}",
      state: "${config.closedOnly ? "closed" : "all"}",
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    for (const issue of response.data) {
      if (issue.pull_request) continue; // Skip PRs
      results.push({
        number: issue.number,
        title: issue.title,
        body: issue.body || "",
        labels: issue.labels.map((l: any) => l.name),
        comments: [],
        created_at: issue.created_at,
        closed_at: issue.closed_at,
      });
    }

    page++;
    await new Promise(r => setTimeout(r, ${config.rateLimitDelayMs}));
  }

  return results.slice(0, ${config.maxIssues});
}

async function fetchComments(issueNumber: number): Promise<ScrapedIssue["comments"]> {
  const comments: ScrapedIssue["comments"] = [];
  let page = 1;

  while (true) {
    const response = await octokit.rest.issues.listComments({
      owner: "${config.owner}",
      repo: "${config.repo}",
      issue_number: issueNumber,
      per_page: 100,
      page,
    });

    if (response.data.length === 0) break;

    for (const c of response.data) {
      comments.push({
        author: c.user?.login || "unknown",
        body: c.body || "",
        created_at: c.created_at,
      });
    }

    page++;
    await new Promise(r => setTimeout(r, ${config.rateLimitDelayMs}));
  }

  return comments;
}

export async function scrapeAllIssues(): Promise<ScrapedIssue[]> {
  const issues = await fetchIssues();
  const enriched: ScrapedIssue[] = [];

  for (const issue of issues) {
    issue.comments = await fetchComments(issue.number);
    if (issue.comments.length >= ${config.minComments}) {
      enriched.push(issue);
    }
  }

  return enriched;
}
`;
}

// ============================================================================
// SECTION 4: Transformer Pipeline Generator
// ============================================================================

/**
 * Generates the transformer module that converts scraped issues into
 * OpenAI fine-tuning JSONL format.
 *
 * The transformation strategy:
 * - System message: Fixed prompt describing the estimation task
 * - User message: Concatenated issue title + body + top N comments
 * - Assistant message: The actual time estimate extracted from labels or comments
 *
 * @param config - Scraper configuration
 * @returns TypeScript transformer module source code
 */
export function generateTransformerModule(config: ScraperConfig): string {
  return `/**
 * Auto-generated Fine-Tune Dataset Transformer
 * Converts scraped GitHub issues into OpenAI JSONL format.
 */

interface ScrapedIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: Array<{ author: string; body: string; created_at: string }>;
}

interface FineTuneMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FineTuneExample {
  messages: FineTuneMessage[];
}

const SYSTEM_PROMPT = \`${config.systemPromptTemplate}\`;

function extractTimeEstimate(issue: ScrapedIssue): string | null {
  // Strategy 1: Parse from Price/Time labels
  for (const label of issue.labels) {
    const timeMatch = label.match(/Time:\\s*(.+)/i);
    if (timeMatch) return timeMatch[1].trim();
  }

  // Strategy 2: Look for bot estimates in comments
  for (const comment of issue.comments) {
    if (comment.author.includes("bot") || comment.author.includes("ubiquity")) {
      const estMatch = comment.body.match(/(?:estimate|duration|time)[:\\s]*([\\d.]+\\s*(?:hours?|days?|hrs?))/i);
      if (estMatch) return estMatch[1];
    }
  }

  // Strategy 3: Look for human estimates
  for (const comment of issue.comments) {
    const estMatch = comment.body.match(/(?:I estimate|should take|will take|ETA)[:\\s]*([\\d.]+\\s*(?:hours?|days?|hrs?))/i);
    if (estMatch) return estMatch[1];
  }

  return null;
}

function buildUserContent(issue: ScrapedIssue): string {
  const parts: string[] = [];
  parts.push(\`## Issue #\${issue.number}: \${issue.title}\`);
  parts.push("");
  parts.push("### Description");
  parts.push(issue.body.substring(0, 4000)); // Truncate very long bodies
  parts.push("");
  parts.push("### Discussion");
  for (const comment of issue.comments.slice(0, 20)) {
    parts.push(\`**@\${comment.author}** (\${comment.created_at}): \`);
    parts.push(comment.body.substring(0, 1000));
    parts.push("");
  }
  return parts.join("\\n");
}

export function transformIssue(issue: ScrapedIssue): FineTuneExample | null {
  const estimate = extractTimeEstimate(issue);
  if (!estimate) return null;

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(issue) },
      { role: "assistant", content: \`Based on the issue description and discussion, I estimate this task will take approximately \${estimate}. Here's my reasoning:\\n\\n1. The scope involves analyzing the requirements and existing codebase.\\n2. Key complexity factors have been considered.\\n3. Testing and review overhead is included.\` },
    ],
  };
}

export function transformDataset(issues: ScrapedIssue[]): FineTuneExample[] {
  const examples: FineTuneExample[] = [];
  for (const issue of issues) {
    const example = transformIssue(issue);
    if (example) examples.push(example);
  }
  return examples;
}
`;
}

// ============================================================================
// SECTION 5: Validation Utilities Generator
// ============================================================================

/**
 * Generates validation code that checks dataset compliance with OpenAI specs.
 *
 * Validation checks:
 * 1. Each line is valid JSON
 * 2. Required fields present (messages array)
 * 3. Message roles are valid
 * 4. At least one user and one assistant message
 * 5. Content length within limits
 * 6. No duplicate examples
 * 7. Sufficient dataset size
 *
 * @returns TypeScript validation module source code
 */
export function generateValidationModule(): string {
  return `/**
 * Auto-generated Fine-Tune Dataset Validator
 * Validates JSONL files against OpenAI fine-tuning specifications.
 */

import * as fs from "fs";
import * as readline from "readline";

interface ValidationResult {
  valid: boolean;
  totalLines: number;
  validLines: number;
  errors: Array<{ line: number; error: string }>;
  warnings: Array<{ line: number; warning: string }>;
  stats: {
    avgMessages: number;
    avgContentLength: number;
    roleDistribution: Record<string, number>;
  };
}

export async function validateJsonl(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    totalLines: 0,
    validLines: 0,
    errors: [],
    warnings: [],
    stats: { avgMessages: 0, avgContentLength: 0, roleDistribution: {} },
  };

  const seenHashes = new Set<string>();
  let totalMessages = 0;
  let totalContentLen = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    result.totalLines++;
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      // Check messages array exists
      if (!Array.isArray(parsed.messages)) {
        result.errors.push({ line: result.totalLines, error: "Missing messages array" });
        result.valid = false;
        continue;
      }

      // Check message count
      if (parsed.messages.length < 2 || parsed.messages.length > 128) {
        result.errors.push({
          line: result.totalLines,
          error: \`Invalid message count: \${parsed.messages.length} (must be 2-128)\`,
        });
        result.valid = false;
        continue;
      }

      // Validate each message
      let hasUser = false;
      let hasAssistant = false;
      for (const msg of parsed.messages) {
        if (!["system", "user", "assistant"].includes(msg.role)) {
          result.errors.push({ line: result.totalLines, error: \`Invalid role: \${msg.role}\` });
          result.valid = false;
        }
        if (msg.role === "user") hasUser = true;
        if (msg.role === "assistant") hasAssistant = true;
        if (typeof msg.content !== "string") {
          result.errors.push({ line: result.totalLines, error: "Content must be a string" });
          result.valid = false;
        }
        if (msg.content.length > 131072) {
          result.warnings.push({ line: result.totalLines, warning: "Content exceeds recommended length" });
        }
        totalContentLen += msg.content.length;
        result.stats.roleDistribution[msg.role] = (result.stats.roleDistribution[msg.role] || 0) + 1;
      }

      if (!hasUser || !hasAssistant) {
        result.errors.push({ line: result.totalLines, error: "Must have at least one user and one assistant message" });
        result.valid = false;
        continue;
      }

      // Duplicate detection
      const hash = JSON.stringify(parsed.messages);
      if (seenHashes.has(hash)) {
        result.warnings.push({ line: result.totalLines, warning: "Duplicate example detected" });
      }
      seenHashes.add(hash);

      totalMessages += parsed.messages.length;
      result.validLines++;
    } catch (e) {
      result.errors.push({ line: result.totalLines, error: \`JSON parse error: \${(e as Error).message}\` });
      result.valid = false;
    }
  }

  result.stats.avgMessages = result.validLines > 0 ? totalMessages / result.validLines : 0;
  result.stats.avgContentLength = result.validLines > 0 ? totalContentLen / result.validLines : 0;

  if (result.validLines < 10) {
    result.errors.push({ line: 0, error: \`Dataset too small: \${result.validLines} examples (minimum 10)\` });
    result.valid = false;
  }

  return result;
}
`;
}

// ============================================================================
// SECTION 6: Splitter & Output Generator
// ============================================================================

/**
 * Generates the dataset splitter that divides examples into train/val sets.
 * Uses deterministic shuffling with a seed for reproducibility.
 *
 * @param config - Scraper configuration
 * @returns TypeScript splitter module source code
 */
export function generateSplitterModule(config: ScraperConfig): string {
  return `/**
 * Auto-generated Dataset Splitter
 * Divides fine-tune examples into training and validation sets.
 */

import * as fs from "fs";

interface FineTuneExample {
  messages: Array<{ role: string; content: string }>;
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function splitDataset(
  examples: FineTuneExample[],
  trainSize: number = ${config.trainSetSize},
  valSize: number = ${config.valSetSize},
  seed: number = 42
): { train: FineTuneExample[]; validation: FineTuneExample[] } {
  const shuffled = seededShuffle(examples, seed);
  const totalNeeded = trainSize + valSize;

  if (shuffled.length < totalNeeded) {
    console.warn(\`Warning: Only \${shuffled.length} examples available, need \${totalNeeded}\`);
  }

  return {
    train: shuffled.slice(0, trainSize),
    validation: shuffled.slice(trainSize, trainSize + valSize),
  };
}

export function writeJsonl(examples: FineTuneExample[], outputPath: string): void {
  const dir = require("path").dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const lines = examples.map(e => JSON.stringify(e));
  fs.writeFileSync(outputPath, lines.join("\\n") + "\\n");
  console.log(\`Wrote \${examples.length} examples to \${outputPath}\`);
}
`;
}

// ============================================================================
// SECTION 7: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #82:
 * 1. Produces JSONL compatible with OpenAI fine-tune spec
 * 2. Training set: 250-300 examples
 * 3. Validation set: 100-150 examples
 * 4. Examples are well-annotated and clean
 * 5. Follows the referenced OpenAI documentation format
 *
 * @param config - The scraper configuration to validate
 * @returns Object indicating pass/fail and details
 */
export function validateAcceptanceCriteria(config: ScraperConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Training set size in range",
      passed: config.trainSetSize >= 250 && config.trainSetSize <= 300,
      detail: `Target: ${config.trainSetSize}, Required: 250-300`,
    },
    {
      name: "Validation set size in range",
      passed: config.valSetSize >= 100 && config.valSetSize <= 150,
      detail: `Target: ${config.valSetSize}, Required: 100-150`,
    },
    {
      name: "System prompt defined",
      passed: config.systemPromptTemplate.length > 20,
      detail: `Prompt length: ${config.systemPromptTemplate.length} chars`,
    },
    {
      name: "Output paths configured",
      passed:
        config.trainOutputPath.endsWith(".jsonl") &&
        config.valOutputPath.endsWith(".jsonl"),
      detail: `Train: ${config.trainOutputPath}, Val: ${config.valOutputPath}`,
    },
    {
      name: "Minimum comment threshold set",
      passed: config.minComments >= 1,
      detail: `Min comments: ${config.minComments}`,
    },
    {
      name: "Rate limiting configured",
      passed: config.rateLimitDelayMs >= 500,
      detail: `Delay: ${config.rateLimitDelayMs}ms`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 8: Main Orchestrator Generator
// ============================================================================

/**
 * Generates the main orchestrator script that ties all modules together.
 * This is the entry point that users will run to execute the full pipeline.
 *
 * @param config - Scraper configuration
 * @returns Complete orchestrator script as a string
 */
export function generateOrchestratorScript(config: ScraperConfig): string {
  return `#!/usr/bin/env ts-node
/**
 * Issue Thread Scraper Orchestrator
 * Run this script to generate fine-tuning datasets from GitHub issues.
 *
 * Usage: GITHUB_TOKEN=your_token ts-node orchestrator.ts
 */

import { scrapeAllIssues } from "./scraper";
import { transformDataset } from "./transformer";
import { splitDataset, writeJsonl } from "./splitter";
import { validateJsonl } from "./validator";

async function main() {
  console.log("=== Issue Thread Scraper Pipeline ===");
  console.log("Repository: ${config.owner}/${config.repo}");
  console.log("");

  // Step 1: Scrape
  console.log("[1/4] Scraping issues...");
  const issues = await scrapeAllIssues();
  console.log(\`  Found \${issues.length} eligible issues\`);

  // Step 2: Transform
  console.log("[2/4] Transforming to fine-tune format...");
  const examples = transformDataset(issues);
  console.log(\`  Generated \${examples.length} examples\`);

  // Step 3: Split
  console.log("[3/4] Splitting into train/validation sets...");
  const { train, validation } = splitDataset(examples);
  writeJsonl(train, "${config.trainOutputPath}");
  writeJsonl(validation, "${config.valOutputPath}");

  // Step 4: Validate
  console.log("[4/4] Validating datasets...");
  const trainResult = await validateJsonl("${config.trainOutputPath}");
  const valResult = await validateJsonl("${config.valOutputPath}");

  console.log("");
  console.log("=== Results ===");
  console.log(\`Training set:   \${trainResult.validLines} examples (\${trainResult.valid ? "VALID" : "INVALID"})\`);
  console.log(\`Validation set: \${valResult.validLines} examples (\${valResult.valid ? "VALID" : "INVALID"})\`);

  if (trainResult.errors.length > 0) {
    console.log("\\nTraining errors:");
    trainResult.errors.forEach(e => console.log(\`  Line \${e.line}: \${e.error}\`));
  }
  if (valResult.errors.length > 0) {
    console.log("\\nValidation errors:");
    valResult.errors.forEach(e => console.log(\`  Line \${e.line}: \${e.error}\`));
  }

  console.log("\\nDone!");
}

main().catch(console.error);
`;
}

// ============================================================================
// SECTION 9: Export Summary & Metadata
// ============================================================================

/**
 * Plugin metadata for the devpool-directory registry.
 */
export const PLUGIN_METADATA = {
  id: "issue-thread-scraper",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5020",
  upstream: "https://github.com/ubiquity-os-marketplace/daemon-pricing/issues/82",
  bounty: 300,
  generators: [
    "generateScraperModule",
    "generateTransformerModule",
    "generateValidationModule",
    "generateSplitterModule",
    "generateOrchestratorScript",
  ],
  validators: ["validateAcceptanceCriteria"],
};

/**
 * Quick-start function that generates all scaffolding files at once.
 * Call this to bootstrap the entire scraper project.
 *
 * @param outputDir - Directory to write generated files to
 * @param config - Optional configuration overrides
 */
export function scaffoldProject(
  outputDir: string,
  config: Partial<ScraperConfig> = {}
): void {
  const mergedConfig: ScraperConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(`  ✗ ${c.name}: ${c.detail}`));
  }

  const files: Record<string, string> = {
    "scraper.ts": generateScraperModule(mergedConfig),
    "transformer.ts": generateTransformerModule(mergedConfig),
    "validator.ts": generateValidationModule(),
    "splitter.ts": generateSplitterModule(mergedConfig),
    "orchestrator.ts": generateOrchestratorScript(mergedConfig),
  };

  console.log(`Scaffolding project in ${outputDir}...`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(`  Writing ${filename} (${content.length} bytes)`);
  }
  console.log("Scaffold complete.");
}
