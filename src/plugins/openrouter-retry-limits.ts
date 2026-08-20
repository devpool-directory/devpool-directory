/**
 * @file openrouter-retry-limits.ts
 * @description Scaffolding and generator utilities for migrating from OpenAI-specific
 * token rate limiting to OpenRouter request-based limits. Integrates SDK retry
 * function and uses OpenRouter API for dynamic chunk sizing.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#330
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - OpenRouter model metadata fetcher for token/context limits
 * - Dynamic chunk size calculator based on model capabilities
 * - SDK retry function integration replacing custom retry logic
 * - Request-based rate limit handler (vs token-based)
 * - Content evaluator module integration patch
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Model limits retrieved from OpenRouter API.
 */
export interface OpenRouterModelLimits {
  /** Model identifier */
  modelId: string;
  /** Maximum context length in tokens */
  contextLength: number;
  /** Maximum completion tokens */
  maxCompletionTokens: number;
  /** Pricing per prompt token (USD) */
  promptPrice?: number;
  /** Pricing per completion token (USD) */
  completionPrice?: number;
  /** Whether the model supports streaming */
  supportsStreaming: boolean;
  /** Architecture family */
  architecture?: string;
}

/**
 * Configuration for OpenRouter integration.
 */
export interface OpenRouterConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Base URL for OpenRouter API */
  baseUrl: string;
  /** Default model if not specified */
  defaultModel: string;
  /** Cache TTL for model metadata in milliseconds */
  metadataCacheTtlMs: number;
  /** Safety margin percentage for chunk sizing (0-100) */
  chunkSafetyMarginPercent: number;
  /** Reserved tokens for system prompts and formatting */
  reservedSystemTokens: number;
}

/**
 * Chunk sizing result for content evaluation.
 */
export interface ChunkSizingResult {
  /** Recommended chunk size in tokens */
  recommendedChunkSize: number;
  /** Maximum safe chunk size accounting for margins */
  maxSafeChunkSize: number;
  /** Model context length used for calculation */
  modelContextLength: number;
  /** Reserved tokens subtracted */
  reservedTokens: number;
  /** Safety margin applied */
  safetyMarginPercent: number;
  /** Whether this is from cache or fresh fetch */
  fromCache: boolean;
}

/**
 * Rate limit state for request-based limiting.
 */
export interface RateLimitState {
  /** Requests remaining in current window */
  requestsRemaining: number;
  /** Tokens remaining in current window (if applicable) */
  tokensRemaining?: number;
  /** Unix timestamp when the window resets */
  resetAt: number;
  /** Total requests allowed per window */
  limitRequests: number;
  /** Total tokens allowed per window (if applicable) */
  limitTokens?: number;
}

/**
 * SDK retry function signature.
 */
export type SdkRetryFunction = <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    onRetry?: (error: Error, attempt: number) => void;
  }
) => Promise<T>;

// ============================================================================
// OPENROUTER METADATA FETCHER
// ============================================================================

/**
 * Fetches and caches model metadata from OpenRouter API.
 */
export class OpenRouterMetadataFetcher {
  private config: OpenRouterConfig;
  private cache: Map<string, { data: OpenRouterModelLimits; fetchedAt: number }> = new Map();

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Get model limits, using cache if available and fresh.
   * 
   * @param modelId - OpenRouter model identifier
   * @returns Model limits or null if fetch fails
   */
  async getModelLimits(modelId: string): Promise<{ limits: OpenRouterModelLimits | null; fromCache: boolean }> {
    const cached = this.cache.get(modelId);
    const now = Date.now();

    if (cached && (now - cached.fetchedAt) < this.config.metadataCacheTtlMs) {
      return { limits: cached.data, fromCache: true };
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models/${modelId}`, {
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch model metadata for ${modelId}: ${response.status}`);
        return { limits: cached?.data || null, fromCache: !!cached };
      }

      const data = await response.json() as any;
      
      const limits: OpenRouterModelLimits = {
        modelId,
        contextLength: data.context_length ?? 4096,
        maxCompletionTokens: data.max_completion_tokens ?? data.context_length ?? 4096,
        promptPrice: data.pricing?.prompt ? parseFloat(data.pricing.prompt) : undefined,
        completionPrice: data.pricing?.completion ? parseFloat(data.pricing.completion) : undefined,
        supportsStreaming: data.supports_streaming ?? true,
        architecture: data.architecture,
      };

      this.cache.set(modelId, { data: limits, fetchedAt: now });
      return { limits, fromCache: false };
    } catch (error) {
      console.error(`Error fetching model metadata for ${modelId}:`, error);
      return { limits: cached?.data || null, fromCache: !!cached };
    }
  }

  /**
   * List all available models with their limits.
   */
  async listModels(): Promise<OpenRouterModelLimits[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json() as { data: any[] };
      const results: OpenRouterModelLimits[] = [];

      for (const model of data.data) {
        const limits: OpenRouterModelLimits = {
          modelId: model.id,
          contextLength: model.context_length ?? 4096,
          maxCompletionTokens: model.max_completion_tokens ?? model.context_length ?? 4096,
          promptPrice: model.pricing?.prompt ? parseFloat(model.pricing.prompt) : undefined,
          completionPrice: model.pricing?.completion ? parseFloat(model.pricing.completion) : undefined,
          supportsStreaming: model.supports_streaming ?? true,
          architecture: model.architecture,
        };
        results.push(limits);
        
        // Also populate cache
        this.cache.set(model.id, { data: limits, fetchedAt: Date.now() });
      }

      return results;
    } catch (error) {
      console.error("Error listing models:", error);
      return [];
    }
  }

  /**
   * Clear the metadata cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// CHUNK SIZE CALCULATOR
// ============================================================================

/**
 * Calculates optimal chunk sizes for content evaluation based on model limits.
 */
export class ChunkSizeCalculator {
  private config: OpenRouterConfig;
  private metadataFetcher: OpenRouterMetadataFetcher;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.metadataFetcher = new OpenRouterMetadataFetcher(config);
  }

  /**
   * Calculate recommended chunk size for a given model.
   * Accounts for system prompts, safety margins, and output reservation.
   * 
   * @param modelId - OpenRouter model identifier
   * @param estimatedOutputTokens - Expected output tokens to reserve
   * @returns Chunk sizing recommendation
   */
  async calculateChunkSize(
    modelId: string,
    estimatedOutputTokens: number = 1024
  ): Promise<ChunkSizingResult> {
    const { limits, fromCache } = await this.metadataFetcher.getModelLimits(modelId);

    if (!limits) {
      // Fallback to conservative defaults
      return {
        recommendedChunkSize: 2048,
        maxSafeChunkSize: 2048,
        modelContextLength: 4096,
        reservedTokens: this.config.reservedSystemTokens + estimatedOutputTokens,
        safetyMarginPercent: this.config.chunkSafetyMarginPercent,
        fromCache: false,
      };
    }

    const totalReserved = this.config.reservedSystemTokens + estimatedOutputTokens;
    const availableForInput = limits.contextLength - totalReserved;
    
    // Apply safety margin
    const safetyFactor = 1 - (this.config.chunkSafetyMarginPercent / 100);
    const maxSafeChunkSize = Math.floor(availableForInput * safetyFactor);
    
    // Recommended is slightly more conservative for batch processing
    const recommendedChunkSize = Math.floor(maxSafeChunkSize * 0.9);

    return {
      recommendedChunkSize: Math.max(recommendedChunkSize, 512), // Minimum viable chunk
      maxSafeChunkSize: Math.max(maxSafeChunkSize, 512),
      modelContextLength: limits.contextLength,
      reservedTokens: totalReserved,
      safetyMarginPercent: this.config.chunkSafetyMarginPercent,
      fromCache,
    };
  }

  /**
   * Split content into appropriately sized chunks for evaluation.
   * 
   * @param content - Text content to split
   * @param modelId - Target model
   * @param tokenizer - Token counting function (tokens per character estimate if unavailable)
   * @returns Array of content chunks
   */
  async splitIntoChunks(
    content: string,
    modelId: string,
    tokenizer?: (text: string) => number
  ): Promise<string[]> {
    const sizing = await this.calculateChunkSize(modelId);
    const chunkTokenLimit = sizing.recommendedChunkSize;
    
    // Estimate tokens if no tokenizer provided (rough: 1 token ≈ 4 chars)
    const estimateTokens = tokenizer || ((text: string) => Math.ceil(text.length / 4));
    
    const chunks: string[] = [];
    let remaining = content;
    
    while (remaining.length > 0) {
      const estimatedTokens = estimateTokens(remaining);
      
      if (estimatedTokens <= chunkTokenLimit) {
        chunks.push(remaining);
        break;
      }
      
      // Binary search for right split point
      let low = 0;
      let high = remaining.length;
      let bestSplit = Math.floor(remaining.length * (chunkTokenLimit / estimatedTokens));
      
      // Refine split point
      for (let i = 0; i < 10; i++) {
        const mid = Math.floor((low + high) / 2);
        const tokens = estimateTokens(remaining.slice(0, mid));
        
        if (tokens <= chunkTokenLimit) {
          bestSplit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      // Try to break at sentence/paragraph boundary
      const splitPoint = this.findNaturalBreakPoint(remaining, bestSplit);
      chunks.push(remaining.slice(0, splitPoint).trim());
      remaining = remaining.slice(splitPoint).trim();
    }
    
    return chunks.filter(c => c.length > 0);
  }

  /**
   * Find a natural break point near the target position.
   */
  private findNaturalBreakPoint(text: string, targetPos: number): number {
    // Look for paragraph breaks first
    const paraBreak = text.lastIndexOf("\n\n", targetPos);
    if (paraBreak > targetPos * 0.7) return paraBreak + 2;
    
    // Then sentence breaks
    const sentenceBreak = Math.max(
      text.lastIndexOf(". ", targetPos),
      text.lastIndexOf("! ", targetPos),
      text.lastIndexOf("? ", targetPos)
    );
    if (sentenceBreak > targetPos * 0.7) return sentenceBreak + 2;
    
    // Then word breaks
    const wordBreak = text.lastIndexOf(" ", targetPos);
    if (wordBreak > targetPos * 0.5) return wordBreak + 1;
    
    // Hard cut as last resort
    return targetPos;
  }
}

// ============================================================================
// RATE LIMIT HANDLER
// ============================================================================

/**
 * Handles OpenRouter's request-based rate limits.
 * Unlike OpenAI, OpenRouter primarily limits by requests per minute, not tokens.
 */
export class OpenRouterRateLimiter {
  private state: RateLimitState = {
    requestsRemaining: 60,
    resetAt: Date.now() + 60000,
    limitRequests: 60,
  };

  /**
   * Update rate limit state from API response headers.
   * 
   * @param headers - Response headers from OpenRouter API
   */
  updateFromHeaders(headers: Headers | Record<string, string>): void {
    const get = (name: string): string | null => {
      if (headers instanceof Headers) return headers.get(name);
      return headers[name.toLowerCase()] || headers[name] || null;
    };

    const remaining = get("x-ratelimit-remaining-requests");
    const limit = get("x-ratelimit-limit-requests");
    const reset = get("x-ratelimit-reset-requests");

    if (remaining !== null) this.state.requestsRemaining = parseInt(remaining, 10);
    if (limit !== null) this.state.limitRequests = parseInt(limit, 10);
    if (reset !== null) this.state.resetAt = parseInt(reset, 10) * 1000;

    // Token limits (optional, some models have them)
    const tokensRemaining = get("x-ratelimit-remaining-tokens");
    const tokensLimit = get("x-ratelimit-limit-tokens");
    if (tokensRemaining !== null) this.state.tokensRemaining = parseInt(tokensRemaining, 10);
    if (tokensLimit !== null) this.state.limitTokens = parseInt(tokensLimit, 10);
  }

  /**
   * Check if we should wait before making another request.
   * 
   * @returns Milliseconds to wait, or 0 if OK to proceed
   */
  getWaitTime(): number {
    if (this.state.requestsRemaining > 0) return 0;
    
    const now = Date.now();
    if (now >= this.state.resetAt) return 0;
    
    return this.state.resetAt - now;
  }

  /**
   * Wait if necessary before making a request.
   */
  async waitForAvailability(): Promise<void> {
    const waitMs = this.getWaitTime();
    if (waitMs > 0) {
      console.log(`[RateLimiter] Waiting ${waitMs}ms for rate limit reset`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Get current rate limit state.
   */
  getState(): RateLimitState {
    return { ...this.state };
  }
}

// ============================================================================
// SDK RETRY INTEGRATION
// ============================================================================

/**
 * Wraps OpenRouter API calls with SDK retry function.
 * Replaces custom retry logic with standardized SDK approach.
 */
export class OpenRouterClient {
  private config: OpenRouterConfig;
  private rateLimiter: OpenRouterRateLimiter;
  private sdkRetry?: SdkRetryFunction;

  constructor(config: OpenRouterConfig, sdkRetry?: SdkRetryFunction) {
    this.config = config;
    this.rateLimiter = new OpenRouterRateLimiter();
    this.sdkRetry = sdkRetry;
  }

  /**
   * Make an API request with automatic retries and rate limiting.
   * 
   * @param path - API endpoint path
   * @param options - Fetch options
   * @returns Response data
   */
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    
    const executeRequest = async (): Promise<T> => {
      // Wait for rate limit if needed
      await this.rateLimiter.waitForAvailability();

      const response = await fetch(url, {
        ...options,
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ubiquity.dev",
          "X-Title": "Ubiquity OS Rewards",
          ...(options.headers || {}),
        },
      });

      // Update rate limit state from response
      this.rateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
      }

      return response.json() as Promise<T>;
    };

    // Use SDK retry if available, otherwise simple retry
    if (this.sdkRetry) {
      return this.sdkRetry(executeRequest, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        onRetry: (error, attempt) => {
          console.warn(`[OpenRouter] Retry ${attempt}: ${error.message}`);
        },
      });
    }

    // Fallback: manual retry with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        return await executeRequest();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < 3) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Generate chat completion with retry and rate limiting.
   */
  async chatCompletion(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number } }> {
    const response = await this.request<any>("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.1,
      }),
    });

    return {
      content: response.choices?.[0]?.message?.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      },
    };
  }
}

// ============================================================================
// CONTENT EVALUATOR INTEGRATION
// ============================================================================

/**
 * Generates integration patch for content evaluator module.
 * Replaces OpenAI-specific token limiting with OpenRouter-based approach.
 * 
 * @returns TypeScript code to patch content evaluator
 */
export function generateContentEvaluatorPatch(): string {
  return `/**
 * Integration patch: Migrate content evaluator to OpenRouter.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#330
 * 
 * REPLACES: OpenAI-specific token rate limit checks
 * WITH: OpenRouter request-based limits + dynamic chunk sizing
 */

import { ChunkSizeCalculator, OpenRouterClient, OpenRouterConfig } from "./openrouter-retry-limits";
import { retry } from "@ubiquity-os/plugin-sdk";

// Initialize once at module level
const openRouterConfig: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: process.env.EVAL_MODEL || "google/gemini-pro-1.5",
  metadataCacheTtlMs: 300000, // 5 minutes
  chunkSafetyMarginPercent: 15,
  reservedSystemTokens: 1024,
};

const chunkCalculator = new ChunkSizeCalculator(openRouterConfig);
const openRouterClient = new OpenRouterClient(openRouterConfig, retry);

/**
 * FIXED: Evaluate content with dynamic chunk sizing.
 * Replaces hardcoded token limits with model-aware calculations.
 */
export async function evaluateContentWithDynamicChunking(
  content: string,
  evaluationPrompt: string,
  modelId?: string
): Promise<string> {
  const model = modelId || openRouterConfig.defaultModel;
  
  // Get model-appropriate chunk size
  const sizing = await chunkCalculator.calculateChunkSize(model);
  console.log(\`[Evaluator] Using chunk size \${sizing.recommendedChunkSize} for \${model} (context: \${sizing.modelContextLength})\`);
  
  // Split content into appropriately sized chunks
  const chunks = await chunkCalculator.splitIntoChunks(content, model);
  
  if (chunks.length === 1) {
    // Single chunk - direct evaluation
    const result = await openRouterClient.chatCompletion({
      model,
      messages: [
        { role: "system", content: evaluationPrompt },
        { role: "user", content: chunks[0] },
      ],
      maxTokens: 4096,
    });
    return result.content;
  }
  
  // Multiple chunks - map-reduce evaluation
  const chunkEvaluations: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(\`[Evaluator] Processing chunk \${i + 1}/\${chunks.length}\`);
    
    const result = await openRouterClient.chatCompletion({
      model,
      messages: [
        { role: "system", content: \`\${evaluationPrompt}\\n\\nEvaluate this portion (\${i + 1} of \${chunks.length}).\` },
        { role: "user", content: chunks[i] },
      ],
      maxTokens: 2048,
    });
    
    chunkEvaluations.push(result.content);
  }
  
  // Synthesize final evaluation
  const synthesis = await openRouterClient.chatCompletion({
    model,
    messages: [
      { role: "system", content: "Synthesize these partial evaluations into a single comprehensive assessment." },
      { role: "user", content: chunkEvaluations.join("\\n\\n---\\n\\n") },
    ],
    maxTokens: 4096,
  });
  
  return synthesis.content;
}

/**
 * FIXED: Get token limits for a model.
 * Replaces OpenAI-specific tiktoken/model lookup.
 */
export async function getModelTokenLimits(modelId: string): Promise<{
  contextLength: number;
  maxCompletionTokens: number;
}> {
  const fetcher = new (await import("./openrouter-retry-limits")).OpenRouterMetadataFetcher(openRouterConfig);
  const { limits } = await fetcher.getModelLimits(modelId);
  
  return {
    contextLength: limits?.contextLength ?? 4096,
    maxCompletionTokens: limits?.maxCompletionTokens ?? 4096,
  };
}
`;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default OpenRouter configuration.
 */
export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "google/gemini-pro-1.5",
  metadataCacheTtlMs: 300000,
  chunkSafetyMarginPercent: 15,
  reservedSystemTokens: 1024,
};

/**
 * Create configured client from environment.
 */
export function createClientFromEnv(sdkRetry?: SdkRetryFunction): OpenRouterClient {
  const config: OpenRouterConfig = {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL || "google/gemini-pro-1.5",
    metadataCacheTtlMs: parseInt(process.env.OPENROUTER_CACHE_TTL_MS || "300000", 10),
    chunkSafetyMarginPercent: parseInt(process.env.OPENROUTER_CHUNK_MARGIN_PERCENT || "15", 10),
    reservedSystemTokens: parseInt(process.env.OPENROUTER_RESERVED_TOKENS || "1024", 10),
  };

  return new OpenRouterClient(config, sdkRetry);
}
