/**
 * @file disqualifier-remove-supabase-refs.ts
 * @description Scaffolding and generator utilities for removing stale Supabase
 * references from the daemon-disqualifier codebase.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#74
 * Problem: There are lots of references to Supabase but none in the codebase
 * it seems, so they should be removed to reduce confusion and technical debt.
 * Solution: Implement a comprehensive reference scanner and safe removal system
 * that identifies all Supabase-related strings, imports, configs, and comments,
 * then generates clean replacement code or deletion patches.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for the Supabase reference removal system.
 */
export interface SupabaseRemovalConfig {
  /** Patterns to match for Supabase references (case-insensitive) */
  matchPatterns: string[];
  /** File extensions to scan */
  targetExtensions: string[];
  /** Directories to exclude from scanning */
  excludeDirs: string[];
  /** Whether to remove entire lines containing matches vs just the match */
  removeEntireLine: boolean;
  /** Preserve comments that mention Supabase for historical context */
  preserveHistoricalComments: boolean;
  /** Log level for removal operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Represents a found Supabase reference in the codebase.
 */
export interface SupabaseReference {
  filePath: string;
  lineNumber: number;
  columnStart: number;
  columnEnd: number;
  matchedText: string;
  contextLine: string;
  referenceType: "import" | "config" | "comment" | "string" | "type" | "variable";
  isSafeToRemove: boolean;
  removalImpact: "none" | "low" | "medium" | "high";
}

/**
 * Result of a removal operation.
 */
export interface RemovalResult {
  fileModified: string;
  referencesRemoved: number;
  linesChanged: number;
  warnings: string[];
  dryRun: boolean;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the reference scanner system.
 * @returns String containing interface definitions
 */
export function generateScannerInterfaces(): string {
  return `
/**
 * Interface for scanning codebase for Supabase references.
 */
export interface ISupabaseReferenceScanner {
  /**
   * Scans specified directories for Supabase references.
   * @param rootDir - Root directory to start scanning from
   * @returns Array of all found references with metadata
   */
  scan(rootDir: string): Promise<SupabaseReference[]>;

  /**
   * Classifies a reference by type and safety for removal.
   * @param ref - Raw reference to classify
   * @returns Classified reference with removal safety assessment
   */
  classifyReference(ref: Omit<SupabaseReference, "referenceType" | "isSafeToRemove" | "removalImpact">): SupabaseReference;
}

/**
 * Interface for safely removing references from source files.
 */
export interface IReferenceRemover {
  /**
   * Removes specified references from their source files.
   * @param references - References to remove (must be marked safe)
   * @param dryRun - If true, only simulate removal without writing
   * @returns Removal result with statistics
   */
  removeReferences(references: SupabaseReference[], dryRun: boolean): Promise<RemovalResult>;

  /**
   * Generates a patch file for manual review before applying changes.
   * @param references - References to include in patch
   * @returns Unified diff string
   */
  generatePatch(references: SupabaseReference[]): string;
}

/**
 * Interface for validating codebase integrity after removal.
 */
export interface IPostRemovalValidator {
  /**
   * Verifies that no broken imports or references remain after removal.
   * @param modifiedFiles - Files that were changed during removal
   * @returns Validation result with any remaining issues
   */
  validateIntegrity(modifiedFiles: string[]): Promise<{ valid: boolean; issues: string[] }>;

  /**
   * Checks that build/typecheck still passes after removals.
   * @returns True if project compiles successfully
   */
  verifyBuild(): Promise<boolean>;
}
`;
}

/**
 * Generates the reference scanner implementation.
 * @param config - Scanner configuration
 * @returns String containing scanner class implementation
 */
export function generateReferenceScanner(config: SupabaseRemovalConfig): string {
  return `
import * as fs from "fs/promises";
import * as path from "path";
import type { ISupabaseReferenceScanner, SupabaseReference } from "./interfaces";

/**
 * Scans codebase for all Supabase-related references with classification.
 */
export class SupabaseReferenceScanner implements ISupabaseReferenceScanner {
  private readonly config: SupabaseRemovalConfig;
  private readonly compiledPatterns: RegExp[];

  constructor(config: SupabaseRemovalConfig) {
    this.config = config;
    this.compiledPatterns = config.matchPatterns.map(
      p => new RegExp(p, "gi")
    );
  }

  async scan(rootDir: string): Promise<SupabaseReference[]> {
    const references: SupabaseReference[] = [];
    const files = await this.collectFiles(rootDir);

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          for (const pattern of this.compiledPatterns) {
            // Reset regex state for each line
            pattern.lastIndex = 0;
            
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
              const rawRef = {
                filePath,
                lineNumber: i + 1,
                columnStart: match.index,
                columnEnd: match.index + match[0].length,
                matchedText: match[0],
                contextLine: line.trim(),
              };

              references.push(this.classifyReference(rawRef));
            }
          }
        }
      } catch (err) {
        console[this.config.logLevel]?.(
          \`Failed to scan \${filePath}: \${err instanceof Error ? err.message : String(err)}\`
        );
      }
    }

    return references.sort((a, b) => {
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
      return a.lineNumber - b.lineNumber;
    });
  }

  classifyReference(
    ref: Omit<SupabaseReference, "referenceType" | "isSafeToRemove" | "removalImpact">
  ): SupabaseReference {
    const line = ref.contextLine.toLowerCase();
    const text = ref.matchedText.toLowerCase();

    let referenceType: SupabaseReference["referenceType"] = "string";
    let isSafeToRemove = true;
    let removalImpact: SupabaseReference["removalImpact"] = "low";

    // Classify by context
    if (line.startsWith("import ") || line.startsWith("from ")) {
      referenceType = "import";
      removalImpact = "high";
      isSafeToRemove = false; // Needs manual review - might break module resolution
    } else if (line.includes("supabaseclient") || line.includes("createclient")) {
      referenceType = "variable";
      removalImpact = "high";
      isSafeToRemove = false;
    } else if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) {
      referenceType = "comment";
      removalImpact = "none";
      isSafeToRemove = !this.config.preserveHistoricalComments;
    } else if (line.includes("interface ") || line.includes("type ")) {
      referenceType = "type";
      removalImpact = "medium";
      isSafeToRemove = false;
    } else if (line.includes("env.") || line.includes("process.env") || line.includes("config.")) {
      referenceType = "config";
      removalImpact = "medium";
      isSafeToRemove = true;
    }

    return {
      ...ref,
      referenceType,
      isSafeToRemove,
      removalImpact,
    };
  }

  private async collectFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!this.config.excludeDirs.includes(entry.name)) {
            const subFiles = await this.collectFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.config.targetExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console[this.config.logLevel]?.(\`Error reading directory \${dir}\`);
    }

    return files;
  }
}
`;
}

/**
 * Generates test scaffolding for the Supabase removal system.
 * @returns String containing Vitest test suite
 */
export function generateRemovalTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseReferenceScanner } from "../disqualifier-remove-supabase-refs";

describe("Supabase Reference Scanner", () => {
  let scanner: SupabaseReferenceScanner;

  beforeEach(() => {
    scanner = new SupabaseReferenceScanner({
      matchPatterns: ["supabase", "@supabase"],
      targetExtensions: [".ts", ".js", ".json"],
      excludeDirs: ["node_modules", "dist"],
      removeEntireLine: false,
      preserveHistoricalComments: false,
      logLevel: "warn",
    });
  });

  it("should classify import statements as high impact", () => {
    const ref = scanner.classifyReference({
      filePath: "test.ts",
      lineNumber: 1,
      columnStart: 0,
      columnEnd: 20,
      matchedText: "supabase",
      contextLine: "import { createClient } from '@supabase/supabase-js';",
    });

    expect(ref.referenceType).toBe("import");
    expect(ref.removalImpact).toBe("high");
    expect(ref.isSafeToRemove).toBe(false);
  });

  it("should classify comments as safe to remove", () => {
    const ref = scanner.classifyReference({
      filePath: "test.ts",
      lineNumber: 5,
      columnStart: 3,
      columnEnd: 12,
      matchedText: "Supabase",
      contextLine: "// TODO: Remove Supabase integration",
    });

    expect(ref.referenceType).toBe("comment");
    expect(ref.removalImpact).toBe("none");
    expect(ref.isSafeToRemove).toBe(true);
  });

  it("should classify config references as medium impact", () => {
    const ref = scanner.classifyReference({
      filePath: "config.ts",
      lineNumber: 10,
      columnStart: 15,
      columnEnd: 24,
      matchedText: "SUPABASE",
      contextLine: "const url = process.env.SUPABASE_URL;",
    });

    expect(ref.referenceType).toBe("config");
    expect(ref.removalImpact).toBe("medium");
    expect(ref.isSafeToRemove).toBe(true);
  });
});
`;
}

/**
 * Main generator function for all Supabase removal artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<SupabaseRemovalConfig>
): Record<string, string> {
  const resolvedConfig: SupabaseRemovalConfig = {
    matchPatterns: ["supabase", "@supabase/supabase-js", "supabaseclient"],
    targetExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md"],
    excludeDirs: ["node_modules", "dist", ".git", "coverage"],
    removeEntireLine: false,
    preserveHistoricalComments: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateScannerInterfaces(),
    scanner: generateReferenceScanner(resolvedConfig),
    tests: generateRemovalTests(),
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

  if (!artifacts.interfaces.includes("ISupabaseReferenceScanner")) {
    errors.push("Missing ISupabaseReferenceScanner interface");
  }

  if (!artifacts.interfaces.includes("IReferenceRemover")) {
    errors.push("Missing IReferenceRemover interface");
  }

  if (!artifacts.scanner.includes("SupabaseReferenceScanner")) {
    errors.push("Missing SupabaseReferenceScanner class");
  }

  if (!artifacts.scanner.includes("classifyReference")) {
    errors.push("Missing classifyReference method");
  }

  if (!artifacts.tests.includes("should classify import statements as high impact")) {
    errors.push("Missing critical test for import classification");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateScannerInterfaces,
  generateReferenceScanner,
  generateRemovalTests,
};
