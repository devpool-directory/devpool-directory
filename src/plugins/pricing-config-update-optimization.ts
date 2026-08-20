/**
 * @file pricing-config-update-optimization.ts
 * @description Scaffolding and generator utilities for optimizing configuration
 * update calls in daemon-pricing. Addresses the issue where regex-based config
 * parsing triggers unnecessary organization-wide label updates whenever the
 * configuration changes, even when the semantic content hasn't changed.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-pricing#139
 * Problem: Plugin uses regex to parse configuration, leading to unneeded
 * update calls across the organization for labels whenever config changes.
 * Solution: Implement semantic configuration diffing with structured parsing
 * instead of regex, and add change detection that only triggers updates when
 * meaningful configuration values actually change.
 */

import type { PluginContext, PricingConfig, LabelUpdate } from "./types";

/**
 * Configuration for the optimized config update system.
 */
export interface ConfigUpdateOptimizerConfig {
  /** Whether to use structured JSON/YAML parsing instead of regex */
  useStructuredParsing: boolean;
  /** Enable semantic diffing to detect meaningful changes only */
  enableSemanticDiff: boolean;
  /** Debounce interval in ms for batching rapid config changes */
  debounceIntervalMs: number;
  /** Maximum number of label updates to batch before forcing flush */
  maxBatchSize: number;
  /** Log level for tracking skipped vs executed updates */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Represents a parsed configuration snapshot for comparison.
 */
export interface ConfigSnapshot {
  rawContent: string;
  parsedValues: Record<string, unknown>;
  checksum: string;
  timestamp: string;
  sourceFile: string;
}

/**
 * Result of comparing two configuration snapshots.
 */
export interface ConfigDiffResult {
  hasMeaningfulChanges: boolean;
  changedKeys: string[];
  addedKeys: string[];
  removedKeys: string[];
  unchangedKeys: string[];
  previousChecksum: string;
  currentChecksum: string;
  shouldTriggerUpdate: boolean;
  reason: string;
}

/**
 * Generates TypeScript interfaces for structured config parsing.
 * @returns String containing interface definitions
 */
export function generateStructuredParserInterfaces(): string {
  return `
/**
 * Interface for structured configuration parsers that replace regex-based parsing.
 * Supports multiple formats (JSON, YAML, TOML) with proper type safety.
 */
export interface IStructuredConfigParser {
  /**
   * Parses raw configuration content into a typed structure.
   * @param content - Raw configuration file content
   * @param format - Expected format (json, yaml, toml)
   * @returns Parsed configuration object
   * @throws ParseError if content is malformed
   */
  parse(content: string, format: "json" | "yaml" | "toml"): Record<string, unknown>;

  /**
   * Validates that parsed configuration matches expected schema.
   * @param config - Parsed configuration object
   * @returns Validation result with errors if any
   */
  validate(config: Record<string, unknown>): { valid: boolean; errors: string[] };

  /**
   * Serializes configuration back to string format.
   * @param config - Configuration object to serialize
   * @param format - Target output format
   * @returns Serialized configuration string
   */
  serialize(config: Record<string, unknown>, format: "json" | "yaml" | "toml"): string;
}

/**
 * Interface for semantic configuration differ.
 * Compares configurations based on meaningful value changes, not just text diffs.
 */
export interface ISemanticConfigDiffer {
  /**
   * Compares two configuration snapshots and identifies meaningful changes.
   * @param previous - Previous configuration state
   * @param current - Current configuration state
   * @returns Diff result indicating whether updates are needed
   */
  diff(previous: ConfigSnapshot, current: ConfigSnapshot): ConfigDiffResult;

  /**
   * Calculates a deterministic checksum for a configuration snapshot.
   * Normalizes key ordering and whitespace to ensure consistent hashing.
   * @param config - Configuration to hash
   * @returns SHA-256 checksum string
   */
  calculateChecksum(config: Record<string, unknown>): string;
}

/**
 * Interface for batched label update manager.
 * Prevents excessive API calls by grouping updates intelligently.
 */
export interface ILabelUpdateBatcher {
  /**
   * Queues a label update for batched execution.
   * @param update - Label update to queue
   * @returns Number of items currently in batch
   */
  queue(update: LabelUpdate): number;

  /**
   * Flushes all queued updates, executing them in optimized batches.
   * @returns Number of updates successfully executed
   */
  flush(): Promise<number>;

  /**
   * Returns current batch statistics for monitoring.
   */
  getStats(): { queued: number; lastFlush: string; avgBatchSize: number };
}
`;
}

/**
 * Generates structured parser implementations replacing regex.
 * @param config - Optimizer configuration
 * @returns String containing parser class implementations
 */
export function generateStructuredParsers(config: ConfigUpdateOptimizerConfig): string {
  return `
import type { IStructuredConfigParser } from "./interfaces";

/**
 * JSON configuration parser with schema validation.
 * Replaces fragile regex-based JSON extraction.
 */
export class JsonConfigParser implements IStructuredConfigParser {
  parse(content: string, format: "json" | "yaml" | "toml"): Record<string, unknown> {
    if (format !== "json") {
      throw new Error(\`JsonConfigParser cannot handle format: \${format}\`);
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Configuration must be a JSON object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new Error(\`Failed to parse JSON config: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required pricing configuration fields
    if (!config.pricing && !config.labels && !config.rates) {
      errors.push("Configuration must contain at least one of: pricing, labels, rates");
    }

    // Validate nested structure types
    if (config.pricing && typeof config.pricing !== "object") {
      errors.push("'pricing' must be an object");
    }

    if (config.labels && !Array.isArray(config.labels)) {
      errors.push("'labels' must be an array");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  serialize(config: Record<string, unknown>, format: "json" | "yaml" | "toml"): string {
    if (format !== "json") {
      throw new Error(\`JsonConfigParser cannot serialize to format: \${format}\`);
    }
    return JSON.stringify(config, null, 2);
  }
}

/**
 * Multi-format parser factory that selects appropriate parser based on file extension or content.
 */
export class UniversalConfigParser implements IStructuredConfigParser {
  private readonly jsonParser = new JsonConfigParser();

  parse(content: string, format: "json" | "yaml" | "toml"): Record<string, unknown> {
    switch (format) {
      case "json":
        return this.jsonParser.parse(content, format);
      case "yaml":
        // In production, integrate js-yaml or similar library
        throw new Error("YAML parsing requires external dependency - scaffold placeholder");
      case "toml":
        // In production, integrate @iarna/toml or similar library
        throw new Error("TOML parsing requires external dependency - scaffold placeholder");
      default:
        throw new Error(\`Unsupported configuration format: \${format}\`);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    return this.jsonParser.validate(config);
  }

  serialize(config: Record<string, unknown>, format: "json" | "yaml" | "toml"): string {
    switch (format) {
      case "json":
        return this.jsonParser.serialize(config, format);
      default:
        throw new Error(\`Serialization for \${format} not implemented in scaffold\`);
    }
  }
}
`;
}

/**
 * Generates semantic differ implementation for detecting meaningful changes.
 * @param config - Optimizer configuration
 * @returns String containing differ class implementation
 */
export function generateSemanticDiffer(config: ConfigUpdateOptimizerConfig): string {
  return `
import type { ISemanticConfigDiffer, ConfigSnapshot, ConfigDiffResult } from "./interfaces";
import { createHash } from "crypto";

/**
 * Semantic configuration differ that identifies meaningful value changes.
 * Avoids triggering updates for formatting-only or comment-only changes.
 */
export class SemanticConfigDiffer implements ISemanticConfigDiffer {
  diff(previous: ConfigSnapshot, current: ConfigSnapshot): ConfigDiffResult {
    const prevKeys = new Set(Object.keys(previous.parsedValues));
    const currKeys = new Set(Object.keys(current.parsedValues));

    const addedKeys = [...currKeys].filter(k => !prevKeys.has(k));
    const removedKeys = [...prevKeys].filter(k => !currKeys.has(k));
    const commonKeys = [...currKeys].filter(k => prevKeys.has(k));

    const changedKeys: string[] = [];
    const unchangedKeys: string[] = [];

    for (const key of commonKeys) {
      const prevValue = JSON.stringify(previous.parsedValues[key]);
      const currValue = JSON.stringify(current.parsedValues[key]);

      if (prevValue !== currValue) {
        changedKeys.push(key);
      } else {
        unchangedKeys.push(key);
      }
    }

    const hasMeaningfulChanges = 
      addedKeys.length > 0 || 
      removedKeys.length > 0 || 
      changedKeys.length > 0;

    const shouldTriggerUpdate = hasMeaningfulChanges;

    let reason: string;
    if (!hasMeaningfulChanges) {
      reason = "No semantic changes detected - only formatting or comments changed";
    } else {
      const parts: string[] = [];
      if (addedKeys.length > 0) parts.push(\`\${addedKeys.length} keys added\`);
      if (removedKeys.length > 0) parts.push(\`\${removedKeys.length} keys removed\`);
      if (changedKeys.length > 0) parts.push(\`\${changedKeys.length} keys modified\`);
      reason = \`Semantic changes detected: \${parts.join(", ")}\`;
    }

    return {
      hasMeaningfulChanges,
      changedKeys,
      addedKeys,
      removedKeys,
      unchangedKeys,
      previousChecksum: previous.checksum,
      currentChecksum: current.checksum,
      shouldTriggerUpdate,
      reason,
    };
  }

  calculateChecksum(config: Record<string, unknown>): string {
    // Normalize by sorting keys recursively and removing undefined values
    const normalized = this.normalizeForHashing(config);
    const serialized = JSON.stringify(normalized);
    return createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Recursively normalizes configuration for deterministic hashing.
   * Sorts object keys and filters out undefined/null values.
   */
  private normalizeForHashing(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeForHashing(item));
    }

    if (typeof value === "object") {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      for (const key of keys) {
        const v = (value as Record<string, unknown>)[key];
        if (v !== undefined) {
          sorted[key] = this.normalizeForHashing(v);
        }
      }
      return sorted;
    }

    return value;
  }
}
`;
}

/**
 * Generates batched update manager to reduce API call frequency.
 * @param config - Optimizer configuration
 * @returns String containing batcher implementation
 */
export function generateUpdateBatcher(config: ConfigUpdateOptimizerConfig): string {
  return `
import type { ILabelUpdateBatcher, LabelUpdate } from "./interfaces";

/**
 * Batches label updates to minimize organization-wide API calls.
 * Implements debouncing and size-based flushing.
 */
export class LabelUpdateBatcher implements ILabelUpdateBatcher {
  private readonly queue: LabelUpdate[] = [];
  private readonly config: ConfigUpdateOptimizerConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushTimestamp: string | null = null;
  private totalFlushedBatches = 0;
  private totalFlushedItems = 0;

  constructor(config: ConfigUpdateOptimizerConfig) {
    this.config = config;
  }

  queue(update: LabelUpdate): number {
    this.queue.push(update);

    // Auto-flush if batch size threshold reached
    if (this.queue.length >= this.config.maxBatchSize) {
      void this.flush();
      return 0;
    }

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, this.config.debounceIntervalMs);

    return this.queue.length;
  }

  async flush(): Promise<number> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.queue.length === 0) {
      return 0;
    }

    const batch = this.queue.splice(0);
    
    // In production, execute actual GitHub API calls here
    // For scaffold, simulate successful execution
    console[this.config.logLevel](
      \`Flushing \${batch.length} label updates in single batch\`
    );

    this.lastFlushTimestamp = new Date().toISOString();
    this.totalFlushedBatches++;
    this.totalFlushedItems += batch.length;

    return batch.length;
  }

  getStats(): { queued: number; lastFlush: string; avgBatchSize: number } {
    return {
      queued: this.queue.length,
      lastFlush: this.lastFlushTimestamp ?? "never",
      avgBatchSize: this.totalFlushedBatches > 0 
        ? this.totalFlushedItems / this.totalFlushedBatches 
        : 0,
    };
  }
}
`;
}

/**
 * Generates test scaffolding for config optimization verification.
 * @returns String containing Vitest test suite
 */
export function generateOptimizerTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { SemanticConfigDiffer } from "../pricing-config-update-optimization";
import type { ConfigSnapshot } from "../../types";

describe("Config Update Optimization", () => {
  let differ: SemanticConfigDiffer;

  beforeEach(() => {
    differ = new SemanticConfigDiffer();
  });

  it("should detect no changes for identical configs", () => {
    const snapshot: ConfigSnapshot = {
      rawContent: '{"pricing": {"baseRate": 100}}',
      parsedValues: { pricing: { baseRate: 100 } },
      checksum: "abc123",
      timestamp: new Date().toISOString(),
      sourceFile: "config.json",
    };

    const result = differ.diff(snapshot, snapshot);
    expect(result.hasMeaningfulChanges).toBe(false);
    expect(result.shouldTriggerUpdate).toBe(false);
  });

  it("should detect value changes", () => {
    const prev: ConfigSnapshot = {
      rawContent: '{"pricing": {"baseRate": 100}}',
      parsedValues: { pricing: { baseRate: 100 } },
      checksum: "abc123",
      timestamp: new Date().toISOString(),
      sourceFile: "config.json",
    };

    const curr: ConfigSnapshot = {
      rawContent: '{"pricing": {"baseRate": 150}}',
      parsedValues: { pricing: { baseRate: 150 } },
      checksum: "def456",
      timestamp: new Date().toISOString(),
      sourceFile: "config.json",
    };

    const result = differ.diff(prev, curr);
    expect(result.hasMeaningfulChanges).toBe(true);
    expect(result.changedKeys).toContain("pricing");
    expect(result.shouldTriggerUpdate).toBe(true);
  });

  it("should ignore formatting-only changes", () => {
    const prev: ConfigSnapshot = {
      rawContent: '{"pricing":{"baseRate":100}}',
      parsedValues: { pricing: { baseRate: 100 } },
      checksum: "abc123",
      timestamp: new Date().toISOString(),
      sourceFile: "config.json",
    };

    const curr: ConfigSnapshot = {
      rawContent: '{\\n  "pricing": {\\n    "baseRate": 100\\n  }\\n}',
      parsedValues: { pricing: { baseRate: 100 } },
      checksum: "abc123", // Same checksum after normalization
      timestamp: new Date().toISOString(),
      sourceFile: "config.json",
    };

    const result = differ.diff(prev, curr);
    expect(result.hasMeaningfulChanges).toBe(false);
    expect(result.reason).toContain("No semantic changes");
  });

  it("should produce deterministic checksums regardless of key order", () => {
    const config1 = { b: 2, a: 1, c: 3 };
    const config2 = { c: 3, a: 1, b: 2 };

    const checksum1 = differ.calculateChecksum(config1);
    const checksum2 = differ.calculateChecksum(config2);

    expect(checksum1).toBe(checksum2);
  });
});
`;
}

/**
 * Main generator function for all pricing config optimization artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<ConfigUpdateOptimizerConfig>
): Record<string, string> {
  const resolvedConfig: ConfigUpdateOptimizerConfig = {
    useStructuredParsing: true,
    enableSemanticDiff: true,
    debounceIntervalMs: 5000,
    maxBatchSize: 50,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateStructuredParserInterfaces(),
    parsers: generateStructuredParsers(resolvedConfig),
    differ: generateSemanticDiffer(resolvedConfig),
    batcher: generateUpdateBatcher(resolvedConfig),
    tests: generateOptimizerTests(),
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

  if (!artifacts.interfaces.includes("IStructuredConfigParser")) {
    errors.push("Missing IStructuredConfigParser interface");
  }

  if (!artifacts.interfaces.includes("ISemanticConfigDiffer")) {
    errors.push("Missing ISemanticConfigDiffer interface");
  }

  if (!artifacts.parsers.includes("JsonConfigParser")) {
    errors.push("Missing JsonConfigParser implementation");
  }

  if (!artifacts.differ.includes("SemanticConfigDiffer")) {
    errors.push("Missing SemanticConfigDiffer implementation");
  }

  if (!artifacts.batcher.includes("LabelUpdateBatcher")) {
    errors.push("Missing LabelUpdateBatcher implementation");
  }

  if (!artifacts.tests.includes("should ignore formatting-only changes")) {
    errors.push("Missing critical test for formatting-only change detection");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateStructuredParserInterfaces,
  generateStructuredParsers,
  generateSemanticDiffer,
  generateUpdateBatcher,
  generateOptimizerTests,
};
