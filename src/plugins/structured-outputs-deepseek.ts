/**
 * Structured Outputs for DeepSeek Models
 *
 * Provides configuration and validation utilities for enforcing structured
 * outputs with DeepSeek models via OpenRouter. Includes model capability
 * detection, schema formatting, and fallback handling for models that
 * do not support structured outputs.
 *
 * Addresses: devpool-directory#5922 / ubiquity-os-marketplace/text-conversation-rewards#369
 */

export interface ModelCapability {
  id: string;
  name: string;
  supportsStructuredOutputs: boolean;
  isFree: boolean;
  architecture: string;
}

export interface StructuredOutputConfig {
  modelId: string;
  jsonSchema: Record<string, unknown>;
  strict: boolean;
  fallbackModelId?: string;
}

export interface ValidationResponse {
  valid: boolean;
  parsed?: unknown;
  error?: string;
  usedFallback: boolean;
}

// Known DeepSeek models with structured output support on OpenRouter
const DEEPSEEK_MODELS: ModelCapability[] = [
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3 0324",
    supportsStructuredOutputs: true,
    isFree: false,
    architecture: "DeepSeek",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    supportsStructuredOutputs: true,
    isFree: false,
    architecture: "DeepSeek",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat (V2)",
    supportsStructuredOutputs: false,
    isFree: false,
    architecture: "DeepSeek",
  },
  {
    id: "deepseek/deepseek-coder",
    name: "DeepSeek Coder",
    supportsStructuredOutputs: false,
    isFree: false,
    architecture: "DeepSeek",
  },
];

/**
 * Checks whether a given model ID supports structured outputs.
 */
export function supportsStructuredOutputs(modelId: string): boolean {
  const model = DEEPSEEK_MODELS.find(
    (m) => m.id === modelId || m.id.endsWith(`/${modelId}`)
  );
  return model?.supportsStructuredOutputs ?? false;
}

/**
 * Returns list of DeepSeek models that support structured outputs.
 * Optionally filter to only paid models (free ones currently lack support).
 */
export function getCompatibleModels(includeFree: boolean = false): ModelCapability[] {
  return DEEPSEEK_MODELS.filter(
    (m) => m.supportsStructuredOutputs && (includeFree || !m.isFree)
  );
}

/**
 * Validates that a JSON schema is compatible with OpenRouter's structured output format.
 * OpenRouter requires schemas to have type: "object" at root and no unsupported keywords.
 */
export function validateJsonSchema(schema: Record<string, unknown>): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!schema || typeof schema !== "object") {
    return { valid: false, warnings: ["Schema must be a non-null object."] };
  }

  if (schema.type !== "object") {
    warnings.push(
      `Root schema type should be "object" for structured outputs, got "${schema.type}".`
    );
  }

  if (!schema.properties && !schema.$ref) {
    warnings.push(
      "Schema has no 'properties' or '$ref'. Structured output may be empty."
    );
  }

  // Check for commonly unsupported keywords in strict mode
  const unsupportedKeywords = [
    "additionalProperties",
    "patternProperties",
    "propertyNames",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
  ];

  for (const keyword of unsupportedKeywords) {
    if (keyword in schema) {
      warnings.push(
        `Keyword '${keyword}' may not be supported in strict structured output mode.`
      );
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Builds an OpenRouter-compatible request body with structured output enforcement.
 * Falls back to a compatible model if the requested one doesn't support it.
 */
export function buildStructuredOutputRequest(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  jsonSchema: Record<string, unknown>,
  options: { strict?: boolean; temperature?: number } = {}
): {
  requestBody: Record<string, unknown>;
  effectiveModelId: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let effectiveModelId = modelId;

  if (!supportsStructuredOutputs(modelId)) {
    const compatible = getCompatibleModels();
    if (compatible.length > 0) {
      effectiveModelId = compatible[0].id;
      warnings.push(
        `Model '${modelId}' does not support structured outputs. Falling back to '${effectiveModelId}'.`
      );
    } else {
      warnings.push(
        `Model '${modelId}' does not support structured outputs and no fallback is available.`
      );
    }
  }

  const schemaValidation = validateJsonSchema(jsonSchema);
  warnings.push(...schemaValidation.warnings);

  const requestBody: Record<string, unknown> = {
    model: effectiveModelId,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "structured_response",
        strict: options.strict ?? true,
        schema: jsonSchema,
      },
    },
  };

  if (options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

  return { requestBody, effectiveModelId, warnings };
}

/**
 * Safely parses a structured output response, returning typed result or error.
 */
export function parseStructuredResponse<T = unknown>(
  rawContent: string,
  expectedSchema?: Record<string, unknown>
): ValidationResponse {
  try {
    const parsed = JSON.parse(rawContent) as T;
    return { valid: true, parsed, usedFallback: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `JSON parse failed: ${message}`, usedFallback: false };
  }
}

export { DEEPSEEK_MODELS };
