/**
 * @file spec-rewriter-pr-context.ts
 * @description Scaffolding and generator utilities for enriching the /rewrite
 * command with active PR context. Addresses the issue where specification
 * rewrites miss critical technical details that only exist in PR code, reviews,
 * and comments rather than the original issue conversation.
 *
 * Upstream Issue: ubiquity-os-marketplace/daemon-spec-rewriter#12
 * Problem: The /rewrite command only sees issue conversation, missing accepted
 * implementation details, review feedback, and code-level specifications that
 * constitute de facto spec updates. Contributors shouldn't need to manually
 * transcribe their implementation back into the issue.
 * Solution: Implement a PR context aggregator that fetches and synthesizes
 * code diffs, review threads, and PR comments into a structured context object
 * that the rewriter can use to produce accurate, implementation-aware specs.
 */

import type { PluginContext, PullRequest, ReviewThread } from "./types";

/**
 * Configuration for PR context aggregation.
 */
export interface PrContextConfig {
  /** Maximum number of files to include in diff context */
  maxFilesInDiff: number;
  /** Maximum lines per file to include in context */
  maxLinesPerFile: number;
  /** Include resolved review threads in context */
  includeResolvedThreads: boolean;
  /** Include PR description in context */
  includePrDescription: boolean;
  /** Minimum review comment length to consider meaningful */
  minReviewCommentLength: number;
  /** Log level for context aggregation */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Structured representation of PR-derived specification context.
 */
export interface PrSpecContext {
  prNumber: number;
  prTitle: string;
  prDescription: string | null;
  author: string;
  state: string;
  filesChanged: FileChangeSummary[];
  reviewThreads: ReviewThreadSummary[];
  prComments: PrCommentSummary[];
  acceptedChanges: AcceptedChange[];
  totalAdditions: number;
  totalDeletions: number;
  contextGeneratedAt: string;
}

/**
 * Summary of changes in a single file.
 */
export interface FileChangeSummary {
  filename: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patchSnippet: string;
  isTestFile: boolean;
  isConfigFile: boolean;
}

/**
 * Summary of a review thread relevant to specification.
 */
export interface ReviewThreadSummary {
  threadId: string;
  path: string;
  line: number;
  author: string;
  body: string;
  resolved: boolean;
  replyCount: number;
  hasMaintainerReply: boolean;
  createdAt: string;
}

/**
 * Summary of a top-level PR comment.
 */
export interface PrCommentSummary {
  commentId: number;
  author: string;
  body: string;
  createdAt: string;
  isMaintainer: boolean;
}

/**
 * A change that was accepted through review without explicit spec mention.
 */
export interface AcceptedChange {
  filePath: string;
  description: string;
  source: "code_diff" | "review_approval" | "maintainer_comment";
  confidence: number;
}

/**
 * Generates TypeScript interfaces for the PR context system.
 * @returns String containing interface definitions
 */
export function generatePrContextInterfaces(): string {
  return `
/**
 * Interface for fetching and aggregating PR context for spec rewriting.
 */
export interface IPrContextAggregator {
  /**
   * Aggregates all relevant PR data into a structured spec context.
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Aggregated PR specification context
   */
  aggregate(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PrSpecContext>;
}

/**
 * Interface for extracting specification-relevant information from diffs.
 */
export interface IDiffSpecExtractor {
  /**
   * Extracts implicit specification changes from code diffs.
   * @param files - Array of changed file summaries
   * @returns Array of accepted changes inferred from code
   */
  extractFromDiff(files: FileChangeSummary[]): AcceptedChange[];
}

/**
 * Interface for synthesizing review feedback into spec updates.
 */
export interface IReviewSynthesizer {
  /**
   * Synthesizes review threads into specification-relevant insights.
   * @param threads - Review threads from the PR
   * @returns Array of accepted changes or spec clarifications from reviews
   */
  synthesizeReviews(threads: ReviewThreadSummary[]): AcceptedChange[];
}

/**
 * Interface for formatting aggregated context for LLM consumption.
 */
export interface IContextFormatter {
  /**
   * Formats PR spec context into a prompt-ready string for the rewriter.
   * @param context - Aggregated PR context
   * @returns Formatted context string optimized for token efficiency
   */
  formatForRewriter(context: PrSpecContext): string;
}
`;
}

/**
 * Generates the PR context aggregator implementation.
 * @param config - Context configuration
 * @returns String containing aggregator class implementation
 */
export function generateContextAggregator(config: PrContextConfig): string {
  return `
import type { IPrContextAggregator, PrSpecContext } from "./interfaces";

/**
 * Aggregates PR data from multiple GitHub API sources into a unified
 * specification context for the /rewrite command.
 */
export class PrContextAggregator implements IPrContextAggregator {
  private readonly config: PrContextConfig;

  constructor(config: PrContextConfig) {
    this.config = config;
  }

  async aggregate(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PrSpecContext> {
    console[this.config.logLevel]?.(
      \`[PrContext] Aggregating context for \${owner}/\${repo}#\${prNumber}\`
    );

    // In production: parallel fetch from GitHub API
    // const [pr, files, threads, comments] = await Promise.all([...]);

    // Scaffold placeholder data
    const filesChanged: FileChangeSummary[] = [];
    const reviewThreads: ReviewThreadSummary[] = [];
    const prComments: PrCommentSummary[] = [];

    const context: PrSpecContext = {
      prNumber,
      prTitle: "", // Populated from API
      prDescription: this.config.includePrDescription ? "" : null,
      author: "",
      state: "open",
      filesChanged: filesChanged.slice(0, this.config.maxFilesInDiff),
      reviewThreads: this.config.includeResolvedThreads
        ? reviewThreads
        : reviewThreads.filter(t => !t.resolved),
      prComments,
      acceptedChanges: [], // Populated by extractors
      totalAdditions: 0,
      totalDeletions: 0,
      contextGeneratedAt: new Date().toISOString(),
    };

    return context;
  }
}
`;
}

/**
 * Generates the diff spec extractor implementation.
 * @returns String containing extractor class implementation
 */
export function generateDiffExtractor(): string {
  return `
import type { IDiffSpecExtractor, FileChangeSummary, AcceptedChange } from "./interfaces";

/**
 * Extracts implicit specification changes from code diffs by identifying
 * structural changes, new interfaces, API modifications, and behavioral shifts.
 */
export class DiffSpecExtractor implements IDiffSpecExtractor {
  extractFromDiff(files: FileChangeSummary[]): AcceptedChange[] {
    const changes: AcceptedChange[] = [];

    for (const file of files) {
      // Skip test and config files for spec extraction
      if (file.isTestFile || file.isConfigFile) continue;

      // Detect new files as new feature/spec additions
      if (file.status === "added") {
        changes.push({
          filePath: file.filename,
          description: \`New module added: \${file.filename} (+\${file.additions} lines)\`,
          source: "code_diff",
          confidence: 0.8,
        });
        continue;
      }

      // Detect significant modifications as spec updates
      if (file.status === "modified" && file.additions > 10) {
        changes.push({
          filePath: file.filename,
          description: \`Significant modification: +\${file.additions}/-\${file.deletions} lines in \${file.filename}\`,
          source: "code_diff",
          confidence: 0.6,
        });
      }

      // Detect deletions as spec removals or refactors
      if (file.status === "deleted") {
        changes.push({
          filePath: file.filename,
          description: \`Module removed: \${file.filename}\`,
          source: "code_diff",
          confidence: 0.9,
        });
      }
    }

    return changes;
  }
}
`;
}

/**
 * Generates the context formatter for LLM consumption.
 * @returns String containing formatter class implementation
 */
export function generateContextFormatter(): string {
  return `
import type { IContextFormatter, PrSpecContext } from "./interfaces";

/**
 * Formats PR spec context into a token-efficient prompt for the rewriter LLM.
 * Prioritizes high-confidence accepted changes and maintains traceability.
 */
export class PrContextFormatter implements IContextFormatter {
  formatForRewriter(context: PrSpecContext): string {
    const lines: string[] = [];

    lines.push("## PR Context for Specification Rewrite");
    lines.push("");
    lines.push(\`**PR**: #\${context.prNumber} - \${context.prTitle}\`);
    lines.push(\`**Author**: @\${context.author}\`);
    lines.push(\`**State**: \${context.state}\`);
    lines.push(\`**Stats**: +\${context.totalAdditions}/-\${context.totalDeletions} across \${context.filesChanged.length} files\`);
    lines.push("");

    // Accepted changes section (highest priority)
    if (context.acceptedChanges.length > 0) {
      lines.push("### Accepted Implementation Changes");
      lines.push("_These changes have been implemented and accepted through review. They represent de facto specification updates._");
      lines.push("");
      for (const change of context.acceptedChanges) {
        const confidencePct = Math.round(change.confidence * 100);
        lines.push(\`- [\${change.source} | \${confidencePct}%] \${change.description}\`);
      }
      lines.push("");
    }

    // Key files section
    if (context.filesChanged.length > 0) {
      lines.push("### Modified Files");
      for (const file of context.filesChanged.slice(0, 10)) {
        lines.push(\`- \`\${file.filename}\` (\${file.status}: +\${file.additions}/-\${file.deletions})\`);
      }
      lines.push("");
    }

    // Review insights section
    const unresolvedThreads = context.reviewThreads.filter(t => !t.resolved);
    if (unresolvedThreads.length > 0) {
      lines.push("### Active Review Discussions");
      for (const thread of unresolvedThreads.slice(0, 5)) {
        lines.push(\`- \`\${thread.path}:\${thread.line}\` by @\${thread.author}: \${thread.body.substring(0, 100)}...\`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("_Use this context to update the specification to reflect the actual implemented solution. Do not discard accepted implementation details._");

    return lines.join("\\n");
  }
}
`;
}

/**
 * Generates test scaffolding for the PR context system.
 * @returns String containing Vitest test suite
 */
export function generatePrContextTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { PrContextAggregator, DiffSpecExtractor, PrContextFormatter } from "../spec-rewriter-pr-context";
import type { FileChangeSummary, PrSpecContext } from "../../types";

describe("PR Context for Spec Rewriter", () => {
  let aggregator: PrContextAggregator;
  let extractor: DiffSpecExtractor;
  let formatter: PrContextFormatter;

  beforeEach(() => {
    const config = {
      maxFilesInDiff: 20,
      maxLinesPerFile: 100,
      includeResolvedThreads: false,
      includePrDescription: true,
      minReviewCommentLength: 20,
      logLevel: "warn" as const,
    };

    aggregator = new PrContextAggregator(config);
    extractor = new DiffSpecExtractor();
    formatter = new PrContextFormatter();
  });

  it("should extract new files as accepted changes", () => {
    const files: FileChangeSummary[] = [
      {
        filename: "src/new-feature.ts",
        status: "added",
        additions: 150,
        deletions: 0,
        patchSnippet: "",
        isTestFile: false,
        isConfigFile: false,
      },
    ];

    const changes = extractor.extractFromDiff(files);
    expect(changes).toHaveLength(1);
    expect(changes[0].source).toBe("code_diff");
    expect(changes[0].description).toContain("New module added");
  });

  it("should skip test files in spec extraction", () => {
    const files: FileChangeSummary[] = [
      {
        filename: "tests/new-feature.test.ts",
        status: "added",
        additions: 200,
        deletions: 0,
        patchSnippet: "",
        isTestFile: true,
        isConfigFile: false,
      },
    ];

    const changes = extractor.extractFromDiff(files);
    expect(changes).toHaveLength(0);
  });

  it("should format context with accepted changes section", () => {
    const context: PrSpecContext = {
      prNumber: 185,
      prTitle: "Implement batch GET endpoint",
      prDescription: "Adds batch processing",
      author: "contributor",
      state: "open",
      filesChanged: [],
      reviewThreads: [],
      prComments: [],
      acceptedChanges: [
        {
          filePath: "src/batch-get.ts",
          description: "New batch endpoint module",
          source: "code_diff",
          confidence: 0.8,
        },
      ],
      totalAdditions: 418,
      totalDeletions: 0,
      contextGeneratedAt: new Date().toISOString(),
    };

    const formatted = formatter.formatForRewriter(context);
    expect(formatted).toContain("Accepted Implementation Changes");
    expect(formatted).toContain("batch-get.ts");
    expect(formatted).toContain("80%");
  });

  it("should aggregate context without errors", async () => {
    const context = await aggregator.aggregate("ubiquity-os-marketplace", "command-start-stop", 185);
    expect(context.prNumber).toBe(185);
    expect(context.contextGeneratedAt).toBeDefined();
  });
});
`;
}

/**
 * Main generator function for all PR context artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<PrContextConfig>
): Record<string, string> {
  const resolvedConfig: PrContextConfig = {
    maxFilesInDiff: 20,
    maxLinesPerFile: 100,
    includeResolvedThreads: false,
    includePrDescription: true,
    minReviewCommentLength: 20,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generatePrContextInterfaces(),
    aggregator: generateContextAggregator(resolvedConfig),
    extractor: generateDiffExtractor(),
    formatter: generateContextFormatter(),
    tests: generatePrContextTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 * @param artifacts - Generated code artifacts
 * @returns Validation result
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IPrContextAggregator")) {
    errors.push("Missing IPrContextAggregator interface");
  }

  if (!artifacts.interfaces.includes("IDiffSpecExtractor")) {
    errors.push("Missing IDiffSpecExtractor interface");
  }

  if (!artifacts.interfaces.includes("IContextFormatter")) {
    errors.push("Missing IContextFormatter interface");
  }

  if (!artifacts.aggregator.includes("PrContextAggregator")) {
    errors.push("Missing PrContextAggregator class");
  }

  if (!artifacts.extractor.includes("DiffSpecExtractor")) {
    errors.push("Missing DiffSpecExtractor class");
  }

  if (!artifacts.formatter.includes("PrContextFormatter")) {
    errors.push("Missing PrContextFormatter class");
  }

  if (!artifacts.tests.includes("should extract new files as accepted changes")) {
    errors.push("Missing critical test for diff extraction");
  }

  if (!artifacts.tests.includes("should format context with accepted changes section")) {
    errors.push("Missing test for context formatting");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generatePrContextInterfaces,
  generateContextAggregator,
  generateDiffExtractor,
  generateContextFormatter,
  generatePrContextTests,
};
