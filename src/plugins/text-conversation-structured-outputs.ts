/**
 * @file text-conversation-structured-outputs.ts
 * @description Scaffolding and generator utilities for enforcing structured outputs
 * in text-conversation-rewards using OpenRouter models that support JSON schema
 * enforcement. Addresses the need for reliable, parseable LLM responses when
 * generating reward calculations and permit data.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#369
 * Context: DeepSeek and other models on OpenRouter now support structured outputs
 * via the `response_format` parameter. This ensures reward generation always
 * produces valid JSON matching the expected schema, eliminating parse failures.
 * Solution: Implement a structured output adapter that wraps OpenRouter API calls
 * with schema validation, fallback handling for unsupported models, and
 * post-generation verification.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for structured output enforcement.
 */
export interface StructuredOutputConfig {
  /** OpenRouter model IDs that support structured outputs */
  supportedModels: string[];
  /** Fallback model ID when primary doesn't support structured outputs */
  fallbackModelId: string;
  /** Maximum retry attempts for schema validation failures */
  maxRetries: number;
  /** Whether to strictly enforce schema or allow best-effort parsing */
  strictMode: boolean;
  /** Log level for structured output operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * JSON schema definition for structured output enforcement.
 */
export interface OutputSchema {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

/**
 * Result of a structured output generation attempt.
 */
export interface StructuredOutputResult<T = unknown> {
  success: boolean;
  data?: T;
  rawResponse?: string;
  validationErrors: string[];
  modelUsed: string;
  retriesAttempted: number;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the structured output system.
 * @returns String containing interface definitions
 */
export function generateStructuredOutputInterfaces(): string {
  return `
/**
 * Interface for generating structured outputs via OpenRouter.
 */
export interface IStructuredOutputGenerator {
  /**
   * Generates a response conforming to the provided JSON schema.
   * @param prompt - The input prompt for the LLM
   * @param schema - JSON schema the output must conform to
   * @param preferredModel - Optional model ID preference
   * @returns Structured output result with parsed data or errors
   */
  generate<T = unknown>(
    prompt: string,
    schema: OutputSchema,
    preferredModel?: string
  ): Promise<StructuredOutputResult<T>>;
}

/**
 * Interface for validating LLM output against a JSON schema.
 */
export interface ISchemaValidator {
  /**
   * Validates a parsed object against a JSON schema.
   * @param data - Parsed object to validate
   * @param schema - Schema to validate against
   * @returns Validation result with any errors found
   */
  validate(data: unknown, schema: OutputSchema): { valid: boolean; errors: string[] };
}

/**
 * Interface for selecting appropriate models for structured outputs.
 */
export interface IModelSelector {
  /**
   * Selects the best available model supporting structured outputs.
   * @param preferred - User's preferred model ID
   * @returns Selected model ID and whether it supports structured outputs natively
   */
  select(preferred?: string): { modelId: string; nativeSupport: boolean };
}

/**
 * Interface for post-generation repair of near-valid outputs.
 */
export interface IOutputRepairer {
  /**
   * Attempts to repair a malformed but recoverable JSON response.
   * @param raw - Raw LLM response string
   * @param schema - Target schema for repair guidance
   * @returns Repaired object or null if unrecoverable
   */
  repair(raw: string, schema: OutputSchema): unknown | null;
}
`;
}

/**
 * Generates the model selector implementation.
 * @param config - Structured output configuration
 * @returns String containing selector class implementation
 */
export function generateModelSelector(config: StructuredOutputConfig): string {
  return `
import type { IModelSelector } from "./interfaces";

/**
 * Selects optimal models for structured output generation based on
 * availability and native schema enforcement support.
 */
export class StructuredOutputModelSelector implements IModelSelector {
  private readonly supportedModels: Set<string>;
  private readonly fallbackModel: string;

  constructor() {
    this.supportedModels = new Set(${JSON.stringify(config.supportedModels)});
    this.fallbackModel = "${config.fallbackModelId}";
  }

  select(preferred?: string): { modelId: string; nativeSupport: boolean } {
    // If preferred model supports structured outputs, use it
    if (preferred && this.supportedModels.has(preferred)) {
      return { modelId: preferred, nativeSupport: true };
    }

    // Otherwise fall back to first supported model
    const firstSupported = [...this.supportedModels][0];
    if (firstSupported) {
      console.info?.(
        \`[ModelSelector] Preferred model '\${preferred ?? "none"}' lacks structured output support. Using '\${firstSupported}' instead.\`
      );
      return { modelId: firstSupported, nativeSupport: true };
    }

    // Last resort: use fallback even without native support
    console.warn?.(
      \`[ModelSelector] No structured-output-capable models available. Falling back to '\${this.fallbackModel}' with post-hoc validation.\`
    );
    return { modelId: this.fallbackModel, nativeSupport: false };
  }
}
`;
}

/**
 * Generates the schema validator implementation.
 * @returns String containing validator class implementation
 */
export function generateSchemaValidator(): string {
  return `
import type { ISchemaValidator, OutputSchema } from "./interfaces";

/**
 * Validates LLM output against JSON schemas using structural checks.
 * In production, integrate ajv or similar JSON Schema validator.
 */
export class JsonSchemaValidator implements ISchemaValidator {
  validate(data: unknown, schema: OutputSchema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (data === null || data === undefined) {
      errors.push("Output is null or undefined");
      return { valid: false, errors };
    }

    if (typeof data !== "object") {
      errors.push(\`Expected object but got \${typeof data}\`);
      return { valid: false, errors };
    }

    // Check required fields from schema
    const schemaObj = schema.schema as Record<string, unknown>;
    const required = (schemaObj.required as string[]) ?? [];
    const properties = (schemaObj.properties as Record<string, unknown>) ?? {};

    for (const field of required) {
      if (!(field in (data as Record<string, unknown>))) {
        errors.push(\`Missing required field: \${field}\`);
      }
    }

    // Type-check known properties
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key in properties) {
        const propSchema = properties[key] as Record<string, unknown>;
        const expectedType = propSchema.type as string;
        if (expectedType && typeof value !== expectedType) {
          errors.push(\`Field '\${key}' expected type '\${expectedType}' but got '\${typeof value}'\`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
`;
}

/**
 * Generates the structured output generator implementation.
 * @param config - Structured output configuration
 * @returns String containing generator class implementation
 */
export function generateStructuredOutputGenerator(config: StructuredOutputConfig): string {
  return `
import type { IStructuredOutputGenerator, IModelSelector, ISchemaValidator, IOutputRepairer, OutputSchema, StructuredOutputResult } from "./interfaces";
import { StructuredOutputModelSelector } from "./model-selector";
import { JsonSchemaValidator } from "./schema-validator";

/**
 * Generates structured outputs via OpenRouter with automatic model selection,
 * schema enforcement, and retry logic for validation failures.
 */
export class OpenRouterStructuredOutputGenerator implements IStructuredOutputGenerator {
  private readonly config: StructuredOutputConfig;
  private readonly modelSelector: IModelSelector;
  private readonly validator: ISchemaValidator;

  constructor(config: StructuredOutputConfig) {
    this.config = config;
    this.modelSelector = new StructuredOutputModelSelector();
    this.validator = new JsonSchemaValidator();
  }

  async generate<T = unknown>(
    prompt: string,
    schema: OutputSchema,
    preferredModel?: string
  ): Promise<StructuredOutputResult<T>> {
    const { modelId, nativeSupport } = this.modelSelector.select(preferredModel);
    let retriesAttempted = 0;
    let lastRawResponse: string | undefined;
    let lastValidationErrors: string[] = [];

    while (retriesAttempted <= this.config.maxRetries) {
      try {
        // In production: call OpenRouter API with response_format parameter
        // const response = await openrouter.chat.completions.create({
        //   model: modelId,
        //   messages: [{ role: "user", content: prompt }],
        //   response_format: nativeSupport ? { type: "json_schema", json_schema: schema } : undefined,
        // });

        // Scaffold placeholder
        console[this.config.logLevel]?.(
          \`[StructuredOutput] Generating with model '\${modelId}' (native: \${nativeSupport}), attempt \${retriesAttempted + 1}/\${this.config.maxRetries + 1}\`
        );

        // Simulate successful structured response
        const simulatedData = {} as T;
        const validation = this.validator.validate(simulatedData, schema);

        if (validation.valid) {
          return {
            success: true,
            data: simulatedData,
            rawResponse: JSON.stringify(simulatedData),
            validationErrors: [],
            modelUsed: modelId,
            retriesAttempted,
            timestamp: new Date().toISOString(),
          };
        }

        lastValidationErrors = validation.errors;
        retriesAttempted++;

        if (retriesAttempted <= this.config.maxRetries) {
          console[this.config.logLevel]?.(
            \`[StructuredOutput] Validation failed (\${validation.errors.length} errors). Retrying...\`
          );
        }
      } catch (err) {
        lastValidationErrors = [err instanceof Error ? err.message : String(err)];
        retriesAttempted++;
      }
    }

    return {
      success: false,
      rawResponse: lastRawResponse,
      validationErrors: lastValidationErrors,
      modelUsed: modelId,
      retriesAttempted,
      timestamp: new Date().toISOString(),
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the structured output system.
 * @returns String containing Vitest test suite
 */
export function generateStructuredOutputTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { StructuredOutputModelSelector, JsonSchemaValidator } from "../text-conversation-structured-outputs";
import type { OutputSchema } from "../../types";

describe("Structured Outputs", () => {
  let selector: StructuredOutputModelSelector;
  let validator: JsonSchemaValidator;
  let testSchema: OutputSchema;

  beforeEach(() => {
    selector = new StructuredOutputModelSelector();
    validator = new JsonSchemaValidator();
    testSchema = {
      name: "reward_output",
      description: "Reward calculation result",
      schema: {
        type: "object",
        required: ["amount", "recipient", "reason"],
        properties: {
          amount: { type: "number" },
          recipient: { type: "string" },
          reason: { type: "string" },
        },
      },
    };
  });

  it("should select preferred model when it supports structured outputs", () => {
    const result = selector.select("deepseek/deepseek-chat-v3");
    expect(result.nativeSupport).toBe(true);
    expect(result.modelId).toBe("deepseek/deepseek-chat-v3");
  });

  it("should fall back when preferred model lacks support", () => {
    const result = selector.select("unsupported-model");
    expect(result.nativeSupport).toBe(true);
    expect(result.modelId).not.toBe("unsupported-model");
  });

  it("should validate correct output successfully", () => {
    const data = { amount: 100, recipient: "0xabc", reason: "Code review" };
    const result = validator.validate(data, testSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject output missing required fields", () => {
    const data = { amount: 100 };
    const result = validator.validate(data, testSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("recipient"))).toBe(true);
  });

  it("should reject output with wrong types", () => {
    const data = { amount: "not-a-number", recipient: "0xabc", reason: "test" };
    const result = validator.validate(data, testSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("type"))).toBe(true);
  });

  it("should reject null output", () => {
    const result = validator.validate(null, testSchema);
    expect(result.valid).toBe(false);
  });
});
`;
}

/**
 * Main generator function for all structured output artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<StructuredOutputConfig>
): Record<string, string> {
  const resolvedConfig: StructuredOutputConfig = {
    supportedModels: [
      "deepseek/deepseek-chat-v3",
      "google/gemini-pro-1.5",
      "openai/gpt-4o",
    ],
    fallbackModelId: "deepseek/deepseek-chat",
    maxRetries: 2,
    strictMode: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateStructuredOutputInterfaces(),
    modelSelector: generateModelSelector(resolvedConfig),
    validator: generateSchemaValidator(),
    generator: generateStructuredOutputGenerator(resolvedConfig),
    tests: generateStructuredOutputTests(),
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

  if (!artifacts.interfaces.includes("IStructuredOutputGenerator")) {
    errors.push("Missing IStructuredOutputGenerator interface");
  }

  if (!artifacts.interfaces.includes("ISchemaValidator")) {
    errors.push("Missing ISchemaValidator interface");
  }

  if (!artifacts.interfaces.includes("IModelSelector")) {
    errors.push("Missing IModelSelector interface");
  }

  if (!artifacts.modelSelector.includes("StructuredOutputModelSelector")) {
    errors.push("Missing StructuredOutputModelSelector class");
  }

  if (!artifacts.validator.includes("JsonSchemaValidator")) {
    errors.push("Missing JsonSchemaValidator class");
  }

  if (!artifacts.generator.includes("OpenRouterStructuredOutputGenerator")) {
    errors.push("Missing OpenRouterStructuredOutputGenerator class");
  }

  if (!artifacts.tests.includes("should select preferred model when it supports structured outputs")) {
    errors.push("Missing critical test for model selection");
  }

  if (!artifacts.tests.includes("should validate correct output successfully")) {
    errors.push("Missing test for schema validation");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateStructuredOutputInterfaces,
  generateModelSelector,
  generateSchemaValidator,
  generateStructuredOutputGenerator,
  generateStructuredOutputTests,
};
