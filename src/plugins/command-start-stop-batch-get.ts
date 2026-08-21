/**
 * @file command-start-stop-batch-get.ts
 * @description Scaffolding and generator utilities for enabling batch URL
 * processing in the GET endpoint of command-start-stop. Addresses rate-limit
 * concerns when checking hundreds of tasks individually.
 *
 * Upstream Issue: ubiquity-os-marketplace/command-start-stop#187
 * Problem: The GET endpoint only accepts a single URL, forcing clients like
 * devpool-directory and daemon-planner to make hundreds of sequential requests,
 * quickly hitting rate limits.
 * Solution: Implement a batch GET handler that accepts multiple URLs in a single
 * request, processes them concurrently with controlled concurrency, and returns
 * aggregated results while respecting upstream rate limits.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for batch GET processing.
 */
export interface BatchGetConfig {
  /** Maximum number of URLs allowed in a single batch request */
  maxBatchSize: number;
  /** Maximum concurrent URL fetches within a batch */
  maxConcurrency: number;
  /** Timeout in ms for individual URL fetches */
  perUrlTimeoutMs: number;
  /** Whether to continue processing remaining URLs if one fails */
  continueOnError: boolean;
  /** Rate limit buffer - pause between batches if needed */
  rateLimitBufferMs: number;
  /** Log level for batch operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of fetching a single URL within a batch.
 */
export interface BatchItemResult {
  url: string;
  success: boolean;
  statusCode?: number;
  body?: unknown;
  error?: string;
  latencyMs: number;
  retriesAttempted: number;
}

/**
 * Aggregated response for a batch GET request.
 */
export interface BatchGetResponse {
  totalUrls: number;
  successfulCount: number;
  failedCount: number;
  results: BatchItemResult[];
  totalLatencyMs: number;
  truncated: boolean;
  rateLimited: boolean;
}

/**
 * Generates TypeScript interfaces for the batch GET system.
 * @returns String containing interface definitions
 */
export function generateBatchGetInterfaces(): string {
  return `
/**
 * Interface for validating batch GET requests.
 */
export interface IBatchRequestValidator {
  /**
   * Validates that a batch request is well-formed and within limits.
   * @param urls - Array of URLs from the request
   * @returns Validation result with errors if any
   */
  validate(urls: string[]): { valid: boolean; errors: string[]; sanitizedUrls: string[] };
}

/**
 * Interface for concurrent URL fetching with rate-limit awareness.
 */
export interface IConcurrentFetcher {
  /**
   * Fetches multiple URLs concurrently with controlled parallelism.
   * @param urls - URLs to fetch
   * @param config - Batch processing configuration
   * @returns Array of individual fetch results
   */
  fetchAll(urls: string[], config: BatchGetConfig): Promise<BatchItemResult[]>;
}

/**
 * Interface for aggregating batch results into a unified response.
 */
export interface IBatchResultAggregator {
  /**
   * Combines individual fetch results into a batch response.
   * @param results - Individual URL fetch results
   * @param startTime - Timestamp when batch processing started
   * @returns Aggregated batch response
   */
  aggregate(results: BatchItemResult[], startTime: number): BatchGetResponse;
}
`;
}

/**
 * Generates the concurrent fetcher implementation.
 * @param config - Batch configuration
 * @returns String containing fetcher class implementation
 */
export function generateConcurrentFetcher(config: BatchGetConfig): string {
  return `
import type { IConcurrentFetcher, BatchItemResult, BatchGetConfig } from "./interfaces";

/**
 * Fetches multiple URLs with controlled concurrency and per-URL timeouts.
 * Respects rate limits by limiting parallel requests and adding buffers.
 */
export class ConcurrentBatchFetcher implements IConcurrentFetcher {
  private readonly config: BatchGetConfig;

  constructor(config: BatchGetConfig) {
    this.config = config;
  }

  async fetchAll(urls: string[], config: BatchGetConfig): Promise<BatchItemResult[]> {
    const results: BatchItemResult[] = [];
    const queue = [...urls];
    const activePromises: Promise<void>[] = [];
    let completedCount = 0;

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;

      const url = queue.shift()!;
      const startTime = Date.now();
      let retriesAttempted = 0;
      let lastError: string | undefined;

      try {
        // In production, use actual HTTP client with timeout
        // For scaffold, simulate fetch with random latency
        await new Promise(resolve =>
          setTimeout(resolve, Math.random() * config.perUrlTimeoutMs * 0.3)
        );

        const result: BatchItemResult = {
          url,
          success: true,
          statusCode: 200,
          body: { status: "ok", taskAvailable: true },
          latencyMs: Date.now() - startTime,
          retriesAttempted: 0,
        };

        results.push(result);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        retriesAttempted++;

        results.push({
          url,
          success: false,
          error: lastError,
          latencyMs: Date.now() - startTime,
          retriesAttempted,
        });
      }

      completedCount++;

      // Add rate-limit buffer between completions if configured
      if (config.rateLimitBufferMs > 0 && completedCount % config.maxConcurrency === 0) {
        await new Promise(resolve => setTimeout(resolve, config.rateLimitBufferMs));
      }

      // Process next item if queue has more
      if (queue.length > 0) {
        await processNext();
      }
    };

    // Start initial concurrency pool
    const initialBatch = Math.min(config.maxConcurrency, queue.length);
    for (let i = 0; i < initialBatch; i++) {
      activePromises.push(processNext());
    }

    await Promise.all(activePromises);

    return results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  }
}
`;
}

/**
 * Generates the batch request validator.
 * @returns String containing validator class implementation
 */
export function generateBatchValidator(): string {
  return `
import type { IBatchRequestValidator } from "./interfaces";

/**
 * Validates batch GET requests for size limits and URL format.
 */
export class BatchRequestValidator implements IBatchRequestValidator {
  private readonly maxBatchSize: number;

  constructor(maxBatchSize: number) {
    this.maxBatchSize = maxBatchSize;
  }

  validate(urls: string[]): { valid: boolean; errors: string[]; sanitizedUrls: string[] } {
    const errors: string[] = [];
    const sanitizedUrls: string[] = [];

    if (!Array.isArray(urls)) {
      return { valid: false, errors: ["URLs must be provided as an array"], sanitizedUrls: [] };
    }

    if (urls.length === 0) {
      return { valid: false, errors: ["At least one URL is required"], sanitizedUrls: [] };
    }

    if (urls.length > this.maxBatchSize) {
      errors.push(\`Batch size \${urls.length} exceeds maximum of \${this.maxBatchSize}. Only first \${this.maxBatchSize} will be processed.\`);
    }

    const urlPattern = /^https?:\\/\\/.+/i;
    for (const url of urls.slice(0, this.maxBatchSize)) {
      if (typeof url !== "string") {
        errors.push(\`Invalid URL type: expected string, got \${typeof url}\`);
        continue;
      }

      const trimmed = url.trim();
      if (!urlPattern.test(trimmed)) {
        errors.push(\`Invalid URL format: \${trimmed.substring(0, 50)}...\`);
        continue;
      }

      sanitizedUrls.push(trimmed);
    }

    return {
      valid: errors.length === 0 || sanitizedUrls.length > 0,
      errors,
      sanitizedUrls,
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the batch GET system.
 * @returns String containing Vitest test suite
 */
export function generateBatchGetTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { ConcurrentBatchFetcher, BatchRequestValidator } from "../command-start-stop-batch-get";

describe("Batch GET Endpoint", () => {
  let fetcher: ConcurrentBatchFetcher;
  let validator: BatchRequestValidator;

  beforeEach(() => {
    const config = {
      maxBatchSize: 100,
      maxConcurrency: 10,
      perUrlTimeoutMs: 5000,
      continueOnError: true,
      rateLimitBufferMs: 100,
      logLevel: "warn" as const,
    };

    fetcher = new ConcurrentBatchFetcher(config);
    validator = new BatchRequestValidator(100);
  });

  it("should validate well-formed batch requests", () => {
    const result = validator.validate([
      "https://example.com/task/1",
      "https://example.com/task/2",
    ]);

    expect(result.valid).toBe(true);
    expect(result.sanitizedUrls).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject empty URL arrays", () => {
    const result = validator.validate([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one URL is required");
  });

  it("should truncate oversized batches with warning", () => {
    const urls = Array.from({ length: 150 }, (_, i) => \`https://example.com/\${i}\`);
    const result = validator.validate(urls);

    expect(result.sanitizedUrls).toHaveLength(100);
    expect(result.errors.some(e => e.includes("exceeds maximum"))).toBe(true);
  });

  it("should filter invalid URL formats", () => {
    const result = validator.validate([
      "https://valid.com/task",
      "not-a-url",
      "ftp://wrong-protocol.com",
    ]);

    expect(result.sanitizedUrls).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should fetch all URLs and preserve order", async () => {
    const urls = [
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
    ];

    const config = {
      maxBatchSize: 100,
      maxConcurrency: 3,
      perUrlTimeoutMs: 1000,
      continueOnError: true,
      rateLimitBufferMs: 0,
      logLevel: "warn" as const,
    };

    const results = await fetcher.fetchAll(urls, config);

    expect(results).toHaveLength(3);
    expect(results[0].url).toBe("https://example.com/1");
    expect(results[1].url).toBe("https://example.com/2");
    expect(results[2].url).toBe("https://example.com/3");
  });
});
`;
}

/**
 * Main generator function for all batch GET artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<BatchGetConfig>
): Record<string, string> {
  const resolvedConfig: BatchGetConfig = {
    maxBatchSize: 100,
    maxConcurrency: 10,
    perUrlTimeoutMs: 5000,
    continueOnError: true,
    rateLimitBufferMs: 100,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateBatchGetInterfaces(),
    fetcher: generateConcurrentFetcher(resolvedConfig),
    validator: generateBatchValidator(),
    tests: generateBatchGetTests(),
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

  if (!artifacts.interfaces.includes("IBatchRequestValidator")) {
    errors.push("Missing IBatchRequestValidator interface");
  }

  if (!artifacts.interfaces.includes("IConcurrentFetcher")) {
    errors.push("Missing IConcurrentFetcher interface");
  }

  if (!artifacts.fetcher.includes("ConcurrentBatchFetcher")) {
    errors.push("Missing ConcurrentBatchFetcher class");
  }

  if (!artifacts.validator.includes("BatchRequestValidator")) {
    errors.push("Missing BatchRequestValidator class");
  }

  if (!artifacts.tests.includes("should fetch all URLs and preserve order")) {
    errors.push("Missing critical test for batch ordering");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateBatchGetInterfaces,
  generateConcurrentFetcher,
  generateBatchValidator,
  generateBatchGetTests,
};
