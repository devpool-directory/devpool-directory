/**
 * Upgrade to `voyage-4-large` for better performance
 *
 * Provides configuration and migration utilities for upgrading text-vector-embeddings
 * from Voyage 2 to voyage-4-large model. Includes model mapping, dimension updates,
 * and backward compatibility helpers.
 *
 * Addresses: devpool-directory#5928 / ubiquity-os-marketplace/text-vector-embeddings#133
 */

export type VoyageModelVersion = "voyage-2" | "voyage-3" | "voyage-3-lite" | "voyage-4-large";

export interface ModelConfig {
  modelId: VoyageModelVersion;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
  supportsBinaryQuantization: boolean;
}

const MODEL_CONFIGS: Record<VoyageModelVersion, ModelConfig> = {
  "voyage-2": {
    modelId: "voyage-2",
    dimensions: 1536,
    maxTokens: 4096,
    batchSize: 128,
    supportsBinaryQuantization: false,
  },
  "voyage-3": {
    modelId: "voyage-3",
    dimensions: 1024,
    maxTokens: 32768,
    batchSize: 128,
    supportsBinaryQuantization: true,
  },
  "voyage-3-lite": {
    modelId: "voyage-3-lite",
    dimensions: 512,
    maxTokens: 32768,
    batchSize: 128,
    supportsBinaryQuantization: true,
  },
  "voyage-4-large": {
    modelId: "voyage-4-large",
    dimensions: 2048,
    maxTokens: 65536,
    batchSize: 64,
    supportsBinaryQuantization: true,
  },
};

export const DEFAULT_MODEL: VoyageModelVersion = "voyage-4-large";

/**
 * Returns the configuration for a given model version.
 * Defaults to voyage-4-large if unspecified or unknown.
 */
export function getModelConfig(model?: string): ModelConfig {
  if (model && model in MODEL_CONFIGS) {
    return MODEL_CONFIGS[model as VoyageModelVersion];
  }
  return MODEL_CONFIGS[DEFAULT_MODEL];
}

/**
 * Validates that an environment variable or config value points to a supported model.
 * Returns warning if using deprecated/old model.
 */
export function validateModelSelection(modelId: string): {
  valid: boolean;
  config: ModelConfig;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!(modelId in MODEL_CONFIGS)) {
    warnings.push(
      `Unknown model '${modelId}'. Falling back to ${DEFAULT_MODEL}. Supported: ${Object.keys(MODEL_CONFIGS).join(", ")}`
    );
    return { valid: false, config: MODEL_CONFIGS[DEFAULT_MODEL], warnings };
  }

  if (modelId === "voyage-2") {
    warnings.push(
      "voyage-2 is deprecated. Recommend upgrading to voyage-4-large for better performance and larger context."
    );
  }

  return {
    valid: true,
    config: MODEL_CONFIGS[modelId as VoyageModelVersion],
    warnings,
  };
}

/**
 * Computes optimal batch size for voyage-4-large based on available memory estimate.
 * voyage-4-large has higher per-token cost; smaller batches prevent OOM.
 */
export function computeOptimalBatchSize(
  modelId: VoyageModelVersion = DEFAULT_MODEL,
  availableMemoryMb: number = 512
): number {
  const config = getModelConfig(modelId);

  // Rough heuristic: voyage-4-large uses ~4x memory per token vs voyage-2
  const memoryPerTokenKb = modelId === "voyage-4-large" ? 8 : 2;
  const maxTokensInMemory = Math.floor((availableMemoryMb * 1024) / memoryPerTokenKb);
  const maxBatchByMemory = Math.floor(maxTokensInMemory / config.maxTokens);

  return Math.min(config.batchSize, Math.max(1, maxBatchByMemory));
}

/**
 * Generates migration notes when upgrading from one model to another.
 */
export function generateMigrationNotes(
  fromModel: VoyageModelVersion,
  toModel: VoyageModelVersion = DEFAULT_MODEL
): string[] {
  const notes: string[] = [];
  const from = getModelConfig(fromModel);
  const to = getModelConfig(toModel);

  if (from.dimensions !== to.dimensions) {
    notes.push(
      `⚠️ Dimension change: ${from.dimensions} → ${to.dimensions}. Existing embeddings must be regenerated.`
    );
  }

  if (to.maxTokens > from.maxTokens) {
    notes.push(
      `✅ Context window increased: ${from.maxTokens} → ${to.maxTokens} tokens.`
    );
  }

  if (to.batchSize < from.batchSize) {
    notes.push(
      `⚠️ Batch size reduced: ${from.batchSize} → ${to.batchSize}. Adjust pipeline throughput accordingly.`
    );
  }

  if (!from.supportsBinaryQuantization && to.supportsBinaryQuantization) {
    notes.push(
      `✅ Binary quantization now supported. Consider enabling for storage/cost savings.`
    );
  }

  if (notes.length === 0) {
    notes.push("No breaking changes detected for this upgrade path.");
  }

  return notes;
}

export { MODEL_CONFIGS };
