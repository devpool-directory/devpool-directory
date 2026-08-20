/**
 * @file structured-outputs.ts
 * @description Scaffolding and generator utilities for enforcing structured outputs
 * in LLM integrations, with specific support for DeepSeek models via OpenRouter.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#369
 * Bounty Value: $600 USD (estimated based on integration issues)
 * 
 * This module provides:
 * - Structured output schema validation and enforcement
 * - OpenRouter API integration with model capability detection
 * - Fallback strategies for models without native structured output support
 * - Schema registry for reward generation outputs
 * - Response parsing and validation utilities
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Supported structured output formats.
 */
export enum StructuredOutputFormat {
  JSON = "json",
  JSON_SCHEMA = "json_schema",
  REGEX = "regex",
}

/**
 * Model capability descriptor for structured outputs.
 */
export interface ModelCapability {
  /** Model identifier on OpenRouter */
  modelId: string;
  /** Whether the model supports native structured outputs */
  supportsStructuredOutputs: boolean;
  /** Supported output formats */
  supportedFormats: StructuredOutputFormat[];
  /** Whether the model is free-tier */
  isFreeTier: boolean;
  /** Pricing info if available */
  pricing?: {
    prompt: number;
    completion: number;
  };
}

/**
 * Schema definition for structured outputs.
 */
export interface OutputSchema {
  /** Unique schema identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** JSON Schema definition */
  jsonSchema: Record<string, unknown>;
  /** Optional regex pattern for fallback validation */
  regexPattern?: string;
  /** Description of expected output structure */
  description: string;
  /** Version for migration tracking */
  version: string;
}

/**
 * Configuration for structured output enforcement.
 */
export interface StructuredOutputConfig {
  /** OpenRouter API key */
  openrouterApiKey: string;
  /** Default model to use */
  defaultModel: string;
  /** Fallback model if primary doesn't support structured outputs */
  fallbackModel: string;
  /** Maximum retries for schema validation failures */
  maxRetries: number;
  /** Whether to enable strict mode (fail on validation error) */
  strictMode: boolean;
  /** Custom schemas to register */
  customSchemas: OutputSchema[];
}

/**
 * Result of a structured output generation attempt.
 */
export interface StructuredOutputResult<T = unknown> {
  /** Whether generation succeeded and validated */
  success: boolean;
  /** Parsed and validated output data */
  data?: T;
  /** Raw response from the model */
  rawResponse: string;
  /** Model used for generation */
  modelUsed: string;
  /** Number of retries attempted */
  retryCount: number;
  /** Validation errors if failed */
  validationErrors: string[];
  /** Whether fallback model was used */
  usedFallback: boolean;
}

/**
 * Reward generation output schema type.
 */
export interface RewardGenerationOutput {
  /** Array of reward distributions */
  rewards: Array<{
    /** GitHub username of beneficiary */
    username: string;
    /** Reward amount in base units */
    amount: string;
    /** Reason/category for reward */
    reason: string;
    /** Confidence score 0-1 */
    confidence: number;
  }>;
  /** Total reward amount */
  totalAmount: string;
  /** Currency/token symbol */
  currency: string;
  /** Generation metadata */
  metadata: {
    issueNumber: number;
    repo: string;
    timestamp: string;
    modelUsed: string;
  };
}

// ============================================================================
// MODEL CAPABILITY DETECTOR
// ============================================================================

/**
 * Detects and caches model capabilities for structured outputs.
 * Queries OpenRouter API for model metadata.
 */
export class ModelCapabilityDetector {
  private apiKey: string;
  private cache: Map<string, ModelCapability> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Get capability info for a specific model.
   * 
   * @param modelId - OpenRouter model identifier
   * @returns Model capability descriptor
   */
  async getCapability(modelId: string): Promise<ModelCapability | null> {
    if (this.cache.has(modelId)) {
      return this.cache.get(modelId)!;
    }

    try {
      const response = await fetch(`https://openrouter.ai/api/v1/models/${modelId}`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch model info for ${modelId}: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      
      // Parse supported parameters from OpenRouter response
      const supportedParams = data.supported_parameters || [];
      const supportsStructured = supportedParams.includes("structured_outputs") ||
                                  supportedParams.includes("json_object") ||
                                  supportedParams.includes("response_format");

      const capability: ModelCapability = {
        modelId,
        supportsStructuredOutputs: supportsStructured,
        supportedFormats: supportsStructured 
          ? [StructuredOutputFormat.JSON, StructuredOutputFormat.JSON_SCHEMA]
          : [],
        isFreeTier: data.pricing?.prompt === "0" || data.pricing?.completion === "0",
        pricing: data.pricing ? {
          prompt: parseFloat(data.pricing.prompt),
          completion: parseFloat(data.pricing.completion),
        } : undefined,
      };

      this.cache.set(modelId, capability);
      return capability;

    } catch (error) {
      console.error(`Error fetching model capability for ${modelId}:`, error);
      return null;
    }
  }

  /**
   * Find best available model for structured outputs.
   * Prefers non-free models with native support, falls back gracefully.
   * 
   * @param preferredModel - User's preferred model
   * @param fallbackModel - Configured fallback model
   * @returns Best available model ID and whether it supports structured outputs
   */
  async findBestModel(
    preferredModel: string,
    fallbackModel: string
  ): Promise<{ modelId: string; supportsStructured: boolean }> {
    const preferred = await this.getCapability(preferredModel);
    
    if (preferred?.supportsStructuredOutputs) {
      return { modelId: preferredModel, supportsStructured: true };
    }

    const fallback = await this.getCapability(fallbackModel);
    
    if (fallback?.supportsStructuredOutputs) {
      return { modelId: fallbackModel, supportsStructured: true };
    }

    // Neither supports structured outputs natively
    // Return preferred model anyway - we'll use post-hoc validation
    return { 
      modelId: preferred ? preferredModel : fallbackModel, 
      supportsStructured: false 
    };
  }

  /**
   * List all DeepSeek models with structured output support.
   * Useful for discovering available options.
   */
  async listDeepSeekStructuredModels(): Promise<ModelCapability[]> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json() as { data: any[] };
      const results: ModelCapability[] = [];

      for (const model of data.data) {
        if (model.id.toLowerCase().includes("deepseek")) {
          const capability = await this.getCapability(model.id);
          if (capability?.supportsStructuredOutputs) {
            results.push(capability);
          }
        }
      }

      return results;

    } catch (error) {
      console.error("Error listing DeepSeek models:", error);
      return [];
    }
  }
}

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

/**
 * Registry for managing output schemas.
 * Provides validation and lookup capabilities.
 */
export class SchemaRegistry {
  private schemas: Map<string, OutputSchema> = new Map();

  constructor(initialSchemas: OutputSchema[] = []) {
    for (const schema of initialSchemas) {
      this.register(schema);
    }
  }

  /**
   * Register a new output schema.
   */
  register(schema: OutputSchema): void {
    this.schemas.set(schema.id, schema);
  }

  /**
   * Get a schema by ID.
   */
  get(id: string): OutputSchema | undefined {
    return this.schemas.get(id);
  }

  /**
   * Validate data against a registered schema.
   * Uses JSON Schema validation logic.
   * 
   * @param schemaId - Schema identifier
   * @param data - Data to validate
   * @returns Validation result with errors
   */
  validate(schemaId: string, data: unknown): { valid: boolean; errors: string[] } {
    const schema = this.schemas.get(schemaId);
    
    if (!schema) {
      return { valid: false, errors: [`Unknown schema: ${schemaId}`] };
    }

    const errors: string[] = [];

    // Basic structural validation
    if (typeof data !== "object" || data === null) {
      errors.push("Data must be a non-null object");
      return { valid: false, errors };
    }

    // Validate required fields from schema
    const requiredFields = (schema.jsonSchema as any).required || [];
    for (const field of requiredFields) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Type checking for known properties
    const properties = (schema.jsonSchema as any).properties || {};
    for (const [key, propDef] of Object.entries(properties)) {
      if (key in data) {
        const value = (data as any)[key];
        const expectedType = (propDef as any).type;
        
        if (expectedType && !this.checkType(value, expectedType)) {
          errors.push(`Field "${key}" has wrong type: expected ${expectedType}, got ${typeof value}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if a value matches an expected JSON Schema type.
   */
  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case "string": return typeof value === "string";
      case "number": return typeof value === "number" && !isNaN(value);
      case "integer": return typeof value === "number" && Number.isInteger(value);
      case "boolean": return typeof value === "boolean";
      case "array": return Array.isArray(value);
      case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
      default: return true; // Unknown types pass
    }
  }

  /**
   * Get JSON Schema string for API calls.
   */
  getJsonSchemaString(schemaId: string): string | null {
    const schema = this.schemas.get(schemaId);
    return schema ? JSON.stringify(schema.jsonSchema) : null;
  }
}

// ============================================================================
// STRUCTURED OUTPUT GENERATOR
// ============================================================================

/**
 * Main engine for generating validated structured outputs.
 * Handles model selection, API calls, and validation retries.
 */
export class StructuredOutputGenerator {
  private config: StructuredOutputConfig;
  private detector: ModelCapabilityDetector;
  private registry: SchemaRegistry;

  constructor(config: StructuredOutputConfig) {
    this.config = config;
    this.detector = new ModelCapabilityDetector(config.openrouterApiKey);
    this.registry = new SchemaRegistry(config.customSchemas);
  }

  /**
   * Generate structured output with validation and retries.
   * 
   * @param prompt - Input prompt for the model
   * @param schemaId - Schema to validate against
   * @param options - Generation options
   * @returns Validated structured output result
   */
  async generate<T = unknown>(
    prompt: string,
    schemaId: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      forceModel?: string;
    } = {}
  ): Promise<StructuredOutputResult<T>> {
    const schema = this.registry.get(schemaId);
    if (!schema) {
      return {
        success: false,
        rawResponse: "",
        modelUsed: "",
        retryCount: 0,
        validationErrors: [`Unknown schema: ${schemaId}`],
        usedFallback: false,
      };
    }

    // Determine best model
    const { modelId, supportsStructured } = await this.detector.findBestModel(
      options.forceModel || this.config.defaultModel,
      this.config.fallbackModel
    );

    let lastRawResponse = "";
    let lastErrors: string[] = [];
    let retryCount = 0;
    let usedFallback = false;

    while (retryCount <= this.config.maxRetries) {
      try {
        // Build request with structured output enforcement
        const requestBody = this.buildRequestBody(
          prompt,
          schema,
          modelId,
          supportsStructured,
          options
        );

        // Call OpenRouter API
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.openrouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ubiquity.dev",
            "X-Title": "Ubiquity OS Rewards",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json() as any;
        lastRawResponse = result.choices?.[0]?.message?.content || "";

        // Parse and validate
        const parsed = this.parseResponse(lastRawResponse);
        const validation = this.registry.validate(schemaId, parsed);

        if (validation.valid) {
          return {
            success: true,
            data: parsed as T,
            rawResponse: lastRawResponse,
            modelUsed: modelId,
            retryCount,
            validationErrors: [],
            usedFallback,
          };
        }

        lastErrors = validation.errors;

        // If strict mode, don't retry
        if (this.config.strictMode) {
          break;
        }

        retryCount++;

      } catch (error) {
        lastErrors = [error instanceof Error ? error.message : String(error)];
        retryCount++;
      }
    }

    // All retries exhausted or strict mode failure
    return {
      success: false,
      rawResponse: lastRawResponse,
      modelUsed: modelId,
      retryCount,
      validationErrors: lastErrors,
      usedFallback,
    };
  }

  /**
   * Build OpenRouter API request body with structured output parameters.
   */
  private buildRequestBody(
    prompt: string,
    schema: OutputSchema,
    modelId: string,
    supportsStructured: boolean,
    options: { temperature?: number; maxTokens?: number }
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: [
        {
          role: "system",
          content: `You must respond with valid JSON matching this schema:\n${JSON.stringify(schema.jsonSchema, null, 2)}\n\nDo not include any text outside the JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
    };

    // Add structured output parameters if model supports them
    if (supportsStructured) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: schema.id,
          strict: true,
          schema: schema.jsonSchema,
        },
      };
    }

    return body;
  }

  /**
   * Parse raw response into structured data.
   * Handles various response formats and extracts JSON.
   */
  private parseResponse(raw: string): unknown {
    const trimmed = raw.trim();

    // Try direct JSON parse first
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to extraction
    }

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object in response
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }

    // Return empty object as last resort
    return {};
  }
}

// ============================================================================
// REWARD GENERATION INTEGRATION
// ============================================================================

/**
 * Pre-defined schema for reward generation outputs.
 */
export const REWARD_GENERATION_SCHEMA: OutputSchema = {
  id: "reward_generation_v1",
  name: "Reward Generation Output",
  version: "1.0.0",
  description: "Structured output for AI-generated reward distributions",
  jsonSchema: {
    type: "object",
    required: ["rewards", "totalAmount", "currency", "metadata"],
    properties: {
      rewards: {
        type: "array",
        items: {
          type: "object",
          required: ["username", "amount", "reason", "confidence"],
          properties: {
            username: { type: "string", description: "GitHub username" },
            amount: { type: "string", description: "Reward amount in wei" },
            reason: { type: "string", description: "Category or justification" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      totalAmount: { type: "string", description: "Sum of all rewards in wei" },
      currency: { type: "string", description: "Token symbol (e.g., UBQ)" },
      metadata: {
        type: "object",
        required: ["issueNumber", "repo", "timestamp", "modelUsed"],
        properties: {
          issueNumber: { type: "integer" },
          repo: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          modelUsed: { type: "string" },
        },
      },
    },
  },
};

/**
 * Create a configured generator for reward generation.
 * 
 * @param apiKey - OpenRouter API key
 * @returns Configured StructuredOutputGenerator instance
 */
export function createRewardGenerator(apiKey: string): StructuredOutputGenerator {
  return new StructuredOutputGenerator({
    openrouterApiKey: apiKey,
    defaultModel: "deepseek/deepseek-chat-v3-0324",
    fallbackModel: "google/gemini-pro-1.5",
    maxRetries: 3,
    strictMode: false,
    customSchemas: [REWARD_GENERATION_SCHEMA],
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if a model ID is likely a DeepSeek model.
 */
export function isDeepSeekModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("deepseek");
}

/**
 * Get documentation URL for structured outputs.
 */
export function getStructuredOutputsDocsUrl(): string {
  return "https://openrouter.ai/docs/features/structured-outputs";
}

/**
 * Get model browser URL filtered for structured output support.
 */
export function getModelBrowserUrl(): string {
  return "https://openrouter.ai/models?arch=DeepSeek&fmt=cards&supported_parameters=structured_outputs";
}
