/**
 * @file command-start-stop-dynamic-function-name.ts
 * @description Scaffolding and generator utilities for dynamically determining
 * Azure function names based on repository name and user login to prevent URL
 * collisions across different Azure instances.
 *
 * Upstream Issue: ubiquity-os-marketplace/command-start-stop#164
 * Problem: Function names must be unique across Azure instances due to URL
 * uniqueness requirements. Currently stored in secrets, but should be derived
 * from repo name and user login with override capability.
 * Solution: Generate deterministic function names from repo+user context with
 * collision avoidance and manual override support.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for dynamic function naming.
 */
export interface DynamicNamingConfig {
  /** Prefix for all generated function names */
  namePrefix: string;
  /** Maximum length for generated function names (Azure limit: 63 chars) */
  maxLength: number;
  /** Separator between name components */
  separator: string;
  /** Whether to include hash suffix for collision avoidance */
  includeHashSuffix: boolean;
  /** Length of hash suffix when enabled */
  hashLength: number;
  /** Environment variable name for manual override */
  overrideEnvVar: string;
  /** Log level for naming operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Context for generating a function name.
 */
export interface NamingContext {
  repoOwner: string;
  repoName: string;
  userLogin: string;
  functionName?: string;
  environment?: string;
}

/**
 * Result of function name generation.
 */
export interface GeneratedFunctionName {
  fullName: string;
  baseName: string;
  hashSuffix: string | null;
  source: "generated" | "override" | "provided";
  truncated: boolean;
  originalLength: number;
  context: NamingContext;
}

/**
 * Generates TypeScript interfaces for the dynamic naming system.
 */
export function generateDynamicNamingInterfaces(): string {
  return `
/**
 * Interface for generating unique Azure function names from repository context.
 */
export interface IFunctionNameGenerator {
  /**
   * Generates a unique function name based on repository and user context.
   * @param context - Repository and user information
   * @returns Generated function name with metadata
   */
  generate(context: NamingContext): Promise<GeneratedFunctionName>;

  /**
   * Validates that a function name meets Azure requirements.
   * @param name - Function name to validate
   * @returns Validation result
   */
  validate(name: string): { valid: boolean; errors: string[] };
}

/**
 * Interface for resolving function names with override support.
 */
export interface IFunctionNameResolver {
  /**
   * Resolves the effective function name, checking overrides first.
   * @param context - Naming context
   * @returns Resolved function name
   */
  resolve(context: NamingContext): Promise<string>;

  /**
   * Checks if an override is configured for the given context.
   * @param context - Naming context
   * @returns Override value or null
   */
  getOverride(context: NamingContext): string | null;
}

/**
 * Interface for managing function name registry to detect collisions.
 */
export interface IFunctionNameRegistry {
  /**
   * Registers a generated function name to track usage.
   * @param name - Generated function name
   * @param context - Source context
   */
  register(name: string, context: NamingContext): Promise<void>;

  /**
   * Checks if a function name is already registered.
   * @param name - Function name to check
   * @returns True if name exists in registry
   */
  exists(name: string): Promise<boolean>;
}
`;
}

/**
 * Generates the function name generator implementation.
 */
export function generateFunctionNameGenerator(config: DynamicNamingConfig): string {
  return `
import type { IFunctionNameGenerator, GeneratedFunctionName, NamingContext } from "./interfaces";
import { createHash } from "crypto";

/**
 * Generates deterministic Azure function names from repository context
 * with collision avoidance via hash suffixes.
 */
export class FunctionNameGenerator implements IFunctionNameGenerator {
  private readonly config: DynamicNamingConfig;

  constructor(config: DynamicNamingConfig) {
    this.config = config;
  }

  async generate(context: NamingContext): Promise<GeneratedFunctionName> {
    // Use provided name if available
    if (context.functionName) {
      return {
        fullName: context.functionName,
        baseName: context.functionName,
        hashSuffix: null,
        source: "provided",
        truncated: false,
        originalLength: context.functionName.length,
        context,
      };
    }

    // Build base name from context
    const parts = [
      this.config.namePrefix,
      context.repoOwner,
      context.repoName,
      context.userLogin,
    ].filter(Boolean);

    let baseName = parts.join(this.config.separator);
    let hashSuffix: string | null = null;

    // Add hash suffix for collision avoidance if enabled
    if (this.config.includeHashSuffix) {
      const hashInput = \`\${context.repoOwner}/\${context.repoName}/\${context.userLogin}\`;
      const hash = createHash("sha256")
        .update(hashInput)
        .digest("hex")
        .substring(0, this.config.hashLength);
      hashSuffix = hash;
      baseName = \`\${baseName}\${this.config.separator}\${hash}\`;
    }

    // Sanitize for Azure naming requirements
    baseName = this.sanitize(baseName);

    // Check truncation
    const originalLength = baseName.length;
    const truncated = originalLength > this.config.maxLength;
    const fullName = truncated
      ? baseName.substring(0, this.config.maxLength)
      : baseName;

    console[this.config.logLevel]?.(
      \`[FunctionNaming] Generated: \${fullName} (source: generated, truncated: \${truncated})\`
    );

    return {
      fullName,
      baseName: truncated ? fullName : baseName,
      hashSuffix,
      source: "generated",
      truncated,
      originalLength,
      context,
    };
  }

  validate(name: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!name || name.length === 0) {
      errors.push("Function name cannot be empty");
      return { valid: false, errors };
    }

    if (name.length > 63) {
      errors.push(\`Function name exceeds Azure limit of 63 characters (got \${name.length})\`);
    }

    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
      errors.push("Function name must start with a letter and contain only alphanumeric characters and hyphens");
    }

    if (name.endsWith("-")) {
      errors.push("Function name cannot end with a hyphen");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private sanitize(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
`;
}

/**
 * Generates the function name resolver with override support.
 */
export function generateFunctionNameResolver(config: DynamicNamingConfig): string {
  return `
import type { IFunctionNameResolver, NamingContext } from "./interfaces";
import { FunctionNameGenerator } from "./generator";

/**
 * Resolves function names with environment variable override support.
 */
export class FunctionNameResolver implements IFunctionNameResolver {
  private readonly config: DynamicNamingConfig;
  private readonly generator: FunctionNameGenerator;

  constructor(config: DynamicNamingConfig) {
    this.config = config;
    this.generator = new FunctionNameGenerator(config);
  }

  async resolve(context: NamingContext): Promise<string> {
    // Check for override first
    const override = this.getOverride(context);
    if (override) {
      console[this.config.logLevel]?.(
        \`[FunctionNaming] Using override: \${override}\`
      );
      return override;
    }

    // Generate name from context
    const generated = await this.generator.generate(context);
    return generated.fullName;
  }

  getOverride(context: NamingContext): string | null {
    // Check environment variable for override
    // Format: {OVERRIDE_ENV_VAR}_{REPO_OWNER}_{REPO_NAME}_{USER_LOGIN}
    const envKey = [
      this.config.overrideEnvVar,
      context.repoOwner,
      context.repoName,
      context.userLogin,
    ]
      .join("_")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");

    const override = process.env[envKey];
    return override ?? null;
  }
}
`;
}

/**
 * Generates test scaffolding for the dynamic naming system.
 */
export function generateDynamicNamingTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { FunctionNameGenerator, FunctionNameResolver } from "../command-start-stop-dynamic-function-name";

describe("Dynamic Function Naming", () => {
  let generator: FunctionNameGenerator;
  let resolver: FunctionNameResolver;

  beforeEach(() => {
    const config = {
      namePrefix: "cmd",
      maxLength: 63,
      separator: "-",
      includeHashSuffix: true,
      hashLength: 8,
      overrideEnvVar: "FUNCTION_NAME_OVERRIDE",
      logLevel: "warn" as const,
    };

    generator = new FunctionNameGenerator(config);
    resolver = new FunctionNameResolver(config);
  });

  it("should generate deterministic names from context", async () => {
    const context = {
      repoOwner: "ubiquity-os-marketplace",
      repoName: "command-start-stop",
      userLogin: "contributor",
    };

    const result = await generator.generate(context);

    expect(result.source).toBe("generated");
    expect(result.fullName).toContain("cmd");
    expect(result.fullName).toContain("ubiquity-os-marketplace");
    expect(result.hashSuffix).toHaveLength(8);
  });

  it("should produce consistent hashes for same input", async () => {
    const context = {
      repoOwner: "owner",
      repoName: "repo",
      userLogin: "user",
    };

    const result1 = await generator.generate(context);
    const result2 = await generator.generate(context);

    expect(result1.fullName).toBe(result2.fullName);
    expect(result1.hashSuffix).toBe(result2.hashSuffix);
  });

  it("should use provided function name when available", async () => {
    const context = {
      repoOwner: "owner",
      repoName: "repo",
      userLogin: "user",
      functionName: "custom-function-name",
    };

    const result = await generator.generate(context);

    expect(result.source).toBe("provided");
    expect(result.fullName).toBe("custom-function-name");
    expect(result.hashSuffix).toBeNull();
  });

  it("should truncate names exceeding max length", async () => {
    const context = {
      repoOwner: "very-long-repository-owner-name",
      repoName: "extremely-long-repository-name-for-testing",
      userLogin: "contributor-with-long-username",
    };

    const result = await generator.generate(context);

    expect(result.fullName.length).toBeLessThanOrEqual(63);
    expect(result.truncated).toBe(true);
  });

  it("should validate Azure naming requirements", () => {
    expect(generator.validate("valid-name").valid).toBe(true);
    expect(generator.validate("").valid).toBe(false);
    expect(generator.validate("123-invalid").valid).toBe(false);
    expect(generator.validate("ends-with-").valid).toBe(false);
    expect(generator.validate("a".repeat(64)).valid).toBe(false);
  });

  it("should sanitize invalid characters", async () => {
    const context = {
      repoOwner: "Owner_With.Special",
      repoName: "Repo@Name!",
      userLogin: "User#Name",
    };

    const result = await generator.generate(context);

    expect(result.fullName).toMatch(/^[a-z0-9-]+$/);
    expect(result.fullName).not.toContain("_");
    expect(result.fullName).not.toContain(".");
  });
});
`;
}

/**
 * Main generator function for all dynamic naming artifacts.
 */
export function generateAllArtifacts(
  config?: Partial<DynamicNamingConfig>
): Record<string, string> {
  const resolvedConfig: DynamicNamingConfig = {
    namePrefix: "cmd",
    maxLength: 63,
    separator: "-",
    includeHashSuffix: true,
    hashLength: 8,
    overrideEnvVar: "FUNCTION_NAME_OVERRIDE",
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateDynamicNamingInterfaces(),
    generator: generateFunctionNameGenerator(resolvedConfig),
    resolver: generateFunctionNameResolver(resolvedConfig),
    tests: generateDynamicNamingTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IFunctionNameGenerator")) {
    errors.push("Missing IFunctionNameGenerator interface");
  }

  if (!artifacts.interfaces.includes("IFunctionNameResolver")) {
    errors.push("Missing IFunctionNameResolver interface");
  }

  if (!artifacts.interfaces.includes("IFunctionNameRegistry")) {
    errors.push("Missing IFunctionNameRegistry interface");
  }

  if (!artifacts.generator.includes("FunctionNameGenerator")) {
    errors.push("Missing FunctionNameGenerator class");
  }

  if (!artifacts.resolver.includes("FunctionNameResolver")) {
    errors.push("Missing FunctionNameResolver class");
  }

  if (!artifacts.tests.includes("should generate deterministic names from context")) {
    errors.push("Missing critical test for deterministic naming");
  }

  if (!artifacts.tests.includes("should validate Azure naming requirements")) {
    errors.push("Missing test for Azure validation");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateDynamicNamingInterfaces,
  generateFunctionNameGenerator,
  generateFunctionNameResolver,
  generateDynamicNamingTests,
};
