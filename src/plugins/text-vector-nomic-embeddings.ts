/**
 * @file text-vector-nomic-embeddings.ts
 * @description Scaffolding and generator utilities for integrating Nomic Embed v1.5
 * alongside existing Voyage embeddings with separate index spaces.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-vector-embeddings#111
 * Requirements:
 * - Add Nomic Embed v1.5 model support (~86.2% accuracy vs ~75-77% for Voyage)
 * - Maintain separate vector indices per model (Nomic space vs Voyage space)
 * - Handle token limit differences (Nomic: 8,192 tokens, Voyage: 32,000 tokens)
 * - Route queries to correct index based on embedding model used
 * - Support fallback to Voyage for comments exceeding Nomic's token capacity
 */

import type { PluginContext, EmbeddingResult, VectorIndex } from "./types";

/**
 * Configuration for dual-model embedding system.
 */
export interface DualEmbeddingConfig {
  /** Maximum tokens for Nomic Embed v1.5 */
  nomicMaxTokens: number;
  /** Maximum tokens for Voyage-3-large */
  voyageMaxTokens: number;
  /** Whether to automatically fall back to Voyage when content exceeds Nomic limit */
  enableAutoFallback: boolean;
  /** Similarity function for Nomic vectors */
  nomicSimilarityFunction: "cosine" | "dot_product" | "euclidean";
  /** Similarity function for Voyage vectors */
  voyageSimilarityFunction: "cosine" | "dot_product" | "euclidean";
  /** Log level for embedding operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Identifies which embedding model produced a vector.
 */
export type EmbeddingModelId = "nomic-embed-v1.5" | "voyage-3-large";

/**
 * Result of an embedding operation with model provenance.
 */
export interface TaggedEmbedding {
  modelId: EmbeddingModelId;
  vector: number[];
  tokenCount: number;
  truncated: boolean;
  originalLength: number;
  indexSpace: string;
  createdAt: string;
}

/**
 * Query routing decision for similarity search.
 */
export interface SearchRoutingDecision {
  targetIndex: string;
  modelId: EmbeddingModelId;
  reason: string;
  estimatedTokenCount: number;
  requiresFallback: boolean;
}

/**
 * Generates TypeScript interfaces for the dual-model embedding system.
 * @returns String containing interface definitions
 */
export function generateDualEmbeddingInterfaces(): string {
  return `
/**
 * Interface for embedding providers that produce tagged vectors.
 */
export interface ITaggedEmbeddingProvider {
  /**
   * Generates an embedding with full model provenance metadata.
   * @param text - Input text to embed
   * @returns Tagged embedding with model ID and token statistics
   */
  embed(text: string): Promise<TaggedEmbedding>;

  /**
   * Returns the maximum token capacity of this model.
   */
  getMaxTokens(): number;

  /**
   * Returns the identifier for this embedding model.
   */
  getModelId(): EmbeddingModelId;

  /**
   * Returns the name of the vector index space for this model.
   */
  getIndexSpace(): string;
}

/**
 * Interface for managing separate vector indices per model.
 */
export interface IModelIndexManager {
  /**
   * Stores a tagged embedding in its appropriate model-specific index.
   * @param embedding - The tagged embedding to store
   * @param documentId - Unique identifier for the source document
   */
  store(embedding: TaggedEmbedding, documentId: string): Promise<void>;

  /**
   * Searches within a specific model's index space.
   * @param queryVector - Query embedding vector
   * @param modelId - Which model's index to search
   * @param topK - Number of results to return
   * @returns Array of matching document IDs with scores
   */
  search(
    queryVector: number[],
    modelId: EmbeddingModelId,
    topK: number
  ): Promise<Array<{ documentId: string; score: number }>>;

  /**
   * Lists all available index spaces.
   */
  listIndexSpaces(): string[];
}

/**
 * Interface for routing queries to the correct index based on content characteristics.
 */
export interface ISearchRouter {
  /**
   * Determines which index to query based on input text properties.
   * @param queryText - The search query text
   * @returns Routing decision with target index and fallback info
   */
  routeQuery(queryText: string): Promise<SearchRoutingDecision>;

  /**
   * Estimates token count for a given text without full tokenization.
   * @param text - Text to estimate
   * @returns Estimated token count
   */
  estimateTokenCount(text: string): number;
}
`;
}

/**
 * Generates the Nomic embedding provider implementation.
 * @param config - Dual embedding configuration
 * @returns String containing provider class implementation
 */
export function generateNomicProvider(config: DualEmbeddingConfig): string {
  return `
import type { ITaggedEmbeddingProvider, TaggedEmbedding, EmbeddingModelId } from "./interfaces";

/**
 * Nomic Embed v1.5 provider with 8,192 token limit and high retrieval accuracy.
 * Produces vectors in "nomic-space" index that must not be mixed with Voyage vectors.
 */
export class NomicEmbeddingProvider implements ITaggedEmbeddingProvider {
  private readonly config: DualEmbeddingConfig;
  private readonly modelId: EmbeddingModelId = "nomic-embed-v1.5";
  private readonly indexSpace = "nomic-v1.5-index";

  constructor(config: DualEmbeddingConfig) {
    this.config = config;
  }

  async embed(text: string): Promise<TaggedEmbedding> {
    const estimatedTokens = this.estimateTokenCount(text);
    const truncated = estimatedTokens > this.config.nomicMaxTokens;

    if (truncated) {
      console[this.config.logLevel]?.(
        \`[Nomic] Input exceeds \${this.config.nomicMaxTokens} token limit (\${estimatedTokens} estimated). Truncation will occur.\`
      );
    }

    // In production, call Nomic API here
    // For scaffold, simulate embedding generation
    const vector = new Array(768).fill(0).map(() => Math.random() * 2 - 1);

    return {
      modelId: this.modelId,
      vector,
      tokenCount: Math.min(estimatedTokens, this.config.nomicMaxTokens),
      truncated,
      originalLength: text.length,
      indexSpace: this.indexSpace,
      createdAt: new Date().toISOString(),
    };
  }

  getMaxTokens(): number {
    return this.config.nomicMaxTokens;
  }

  getModelId(): EmbeddingModelId {
    return this.modelId;
  }

  getIndexSpace(): string {
    return this.indexSpace;
  }

  private estimateTokenCount(text: string): number {
    // Rough heuristic: ~4 chars per token for English text
    // In production, use tiktoken or model-specific tokenizer
    return Math.ceil(text.length / 4);
  }
}
`;
}

/**
 * Generates the search router implementation.
 * @param config - Dual embedding configuration
 * @returns String containing router class implementation
 */
export function generateSearchRouter(config: DualEmbeddingConfig): string {
  return `
import type { ISearchRouter, SearchRoutingDecision, EmbeddingModelId } from "./interfaces";

/**
 * Routes embedding queries to the appropriate model index based on
 * content length and token capacity constraints.
 */
export class EmbeddingSearchRouter implements ISearchRouter {
  private readonly config: DualEmbeddingConfig;

  constructor(config: DualEmbeddingConfig) {
    this.config = config;
  }

  async routeQuery(queryText: string): Promise<SearchRoutingDecision> {
    const estimatedTokens = this.estimateTokenCount(queryText);
    const fitsInNomic = estimatedTokens <= this.config.nomicMaxTokens;

    if (fitsInNomic) {
      return {
        targetIndex: "nomic-v1.5-index",
        modelId: "nomic-embed-v1.5",
        reason: \`Query fits within Nomic token limit (\${estimatedTokens}/\${this.config.nomicMaxTokens})\`,
        estimatedTokenCount: estimatedTokens,
        requiresFallback: false,
      };
    }

    if (this.config.enableAutoFallback) {
      return {
        targetIndex: "voyage-3-large-index",
        modelId: "voyage-3-large",
        reason: \`Query exceeds Nomic limit (\${estimatedTokens} > \${this.config.nomicMaxTokens}). Falling back to Voyage.\`,
        estimatedTokenCount: estimatedTokens,
        requiresFallback: true,
      };
    }

    return {
      targetIndex: "nomic-v1.5-index",
      modelId: "nomic-embed-v1.5",
      reason: \`Query exceeds Nomic limit but fallback disabled. Truncation will occur.\`,
      estimatedTokenCount: estimatedTokens,
      requiresFallback: false,
    };
  }

  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
`;
}

/**
 * Generates test scaffolding for the dual-model embedding system.
 * @returns String containing Vitest test suite
 */
export function generateDualEmbeddingTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { NomicEmbeddingProvider, EmbeddingSearchRouter } from "../text-vector-nomic-embeddings";

describe("Dual Model Embedding System", () => {
  let nomicProvider: NomicEmbeddingProvider;
  let router: EmbeddingSearchRouter;

  beforeEach(() => {
    const config = {
      nomicMaxTokens: 8192,
      voyageMaxTokens: 32000,
      enableAutoFallback: true,
      nomicSimilarityFunction: "cosine" as const,
      voyageSimilarityFunction: "cosine" as const,
      logLevel: "warn" as const,
    };

    nomicProvider = new NomicEmbeddingProvider(config);
    router = new EmbeddingSearchRouter(config);
  });

  it("should produce tagged embeddings with correct model ID", async () => {
    const result = await nomicProvider.embed("test query");
    expect(result.modelId).toBe("nomic-embed-v1.5");
    expect(result.indexSpace).toBe("nomic-v1.5-index");
    expect(result.vector).toHaveLength(768);
  });

  it("should flag truncation when input exceeds token limit", async () => {
    const longText = "word ".repeat(40000); // ~40k tokens estimated
    const result = await nomicProvider.embed(longText);
    expect(result.truncated).toBe(true);
    expect(result.tokenCount).toBe(8192);
  });

  it("should route short queries to Nomic index", async () => {
    const decision = await router.routeQuery("short query");
    expect(decision.modelId).toBe("nomic-embed-v1.5");
    expect(decision.requiresFallback).toBe(false);
  });

  it("should route long queries to Voyage when fallback enabled", async () => {
    const longQuery = "word ".repeat(40000);
    const decision = await router.routeQuery(longQuery);
    expect(decision.modelId).toBe("voyage-3-large");
    expect(decision.requiresFallback).toBe(true);
  });

  it("should report correct max tokens for Nomic", () => {
    expect(nomicProvider.getMaxTokens()).toBe(8192);
  });
});
`;
}

/**
 * Main generator function for all Nomic embedding artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<DualEmbeddingConfig>
): Record<string, string> {
  const resolvedConfig: DualEmbeddingConfig = {
    nomicMaxTokens: 8192,
    voyageMaxTokens: 32000,
    enableAutoFallback: true,
    nomicSimilarityFunction: "cosine",
    voyageSimilarityFunction: "cosine",
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateDualEmbeddingInterfaces(),
    nomicProvider: generateNomicProvider(resolvedConfig),
    router: generateSearchRouter(resolvedConfig),
    tests: generateDualEmbeddingTests(),
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

  if (!artifacts.interfaces.includes("ITaggedEmbeddingProvider")) {
    errors.push("Missing ITaggedEmbeddingProvider interface");
  }

  if (!artifacts.interfaces.includes("IModelIndexManager")) {
    errors.push("Missing IModelIndexManager interface");
  }

  if (!artifacts.interfaces.includes("ISearchRouter")) {
    errors.push("Missing ISearchRouter interface");
  }

  if (!artifacts.nomicProvider.includes("NomicEmbeddingProvider")) {
    errors.push("Missing NomicEmbeddingProvider class");
  }

  if (!artifacts.router.includes("EmbeddingSearchRouter")) {
    errors.push("Missing EmbeddingSearchRouter class");
  }

  if (!artifacts.tests.includes("should route short queries to Nomic index")) {
    errors.push("Missing critical test for Nomic routing");
  }

  if (!artifacts.tests.includes("should route long queries to Voyage when fallback enabled")) {
    errors.push("Missing critical test for Voyage fallback");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateDualEmbeddingInterfaces,
  generateNomicProvider,
  generateSearchRouter,
  generateDualEmbeddingTests,
};
