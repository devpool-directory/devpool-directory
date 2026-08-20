/**
 * @file llm-retry-mechanism.ts
 * @description Scaffolding and generator utilities for implementing a robust retry
 * mechanism for LLM failures. Handles token limit errors, truncated JSON responses,
 * network failures, and rate limiting with automatic prompt splitting.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#236
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Error classifier distinguishing fatal vs recoverable LLM errors
 * - Automatic prompt splitting for token limit exceeded errors
 * - Truncated JSON response recovery with partial parsing
 * - Configurable retry limits with exponential backoff
 * - User notification system for ongoing retries
 * - Integration patch for existing LLM call sites
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Classification of LLM error types for retry decisions.
 */
export enum LlmErrorType {
  /** Token limit exceeded - can retry with smaller prompt */
  TOKEN_LIMIT_EXCEEDED = "token_limit_exceeded",
  /** Rate limited (429) - can retry after delay */
  RATE_LIMITED = "rate_limited",
  /** Network/timeout error - can retry immediately */
  NETWORK_ERROR = "network_error",
  /** Response was truncated mid-JSON - can retry or repair */
  TRUNCATED_RESPONSE = "truncated_response",
  /** Invalid API key or auth - fatal, no retry */
  AUTH_ERROR = "auth_error",
  /** Model not found or unavailable - fatal, no retry */
  MODEL_ERROR = "model_error",
  /** Malformed request - fatal, no retry */
  INVALID_REQUEST = "invalid_request",
  /** Unknown error - treat as potentially recoverable */
  UNKNOWN = "unknown",
}

/**
 * Result of classifying an LLM error.
 */
export interface ClassifiedLlmError {
  type: LlmErrorType;
  isRecoverable: boolean;
  originalError: Error;
  statusCode?: number;
  message: string;
  suggestedAction: "retry" | "split_prompt" | "wait_and_retry" | "abort";
  waitMs?: number;
  maxTokens?: number; // For token limit errors
}

/**
 * Configuration for the LLM retry mechanism.
 */
export interface LlmRetryConfig {
  /** Maximum number of retry attempts per call */
  maxRetries: number;
  /** Base delay in ms for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay cap in ms */
  maxDelayMs: number;
  /** Whether to enable automatic prompt splitting */
  enablePromptSplitting: boolean;
  /** Minimum chunk size when splitting prompts (tokens) */
  minChunkTokens: number;
  /** Maximum chunk size reduction factor per retry (0.5 = halve each time) */
  chunkReductionFactor: number;
  /** Whether to post status messages during retries */
  notifyOnRetry: boolean;
  /** Callback for posting retry notifications */
  onRetryNotification?: (message: string, attempt: number, maxAttempts: number) => Promise<void>;
  /** Patterns indicating token limit errors across different APIs */
  tokenLimitPatterns: RegExp[];
  /** Patterns indicating rate limit errors */
  rateLimitPatterns: RegExp[];
  /** Headers that indicate rate limiting */
  rateLimitHeaders: string[];
}

/**
 * Result of an LLM call with retry metadata.
 */
export interface LlmCallResult<T = string> {
  success: boolean;
  data?: T;
  error?: ClassifiedLlmError;
  attemptsMade: number;
  totalLatencyMs: number;
  wasSplit: boolean;
  chunksProcessed: number;
  retriedErrors: string[];
}

/**
 * Represents a chunk of a split prompt.
 */
export interface PromptChunk {
  index: number;
  totalChunks: number;
  content: string;
  estimatedTokens: number;
}

// ============================================================================
// ERROR CLASSIFIER
// ============================================================================

/**
 * Classifies LLM errors to determine appropriate retry strategy.
 * Handles multiple API providers (OpenAI, OpenRouter, Anthropic, etc.)
 */
export class LlmErrorClassifier {
  private config: LlmRetryConfig;

  constructor(config: LlmRetryConfig) {
    this.config = config;
  }

  /**
   * Classify an error from an LLM API call.
   * 
   * @param error - The caught error
   * @param responseHeaders - Optional response headers for rate limit detection
   * @returns Classified error with retry recommendation
   */
  classify(error: unknown, responseHeaders?: Record<string, string>): ClassifiedLlmError {
    const err = error as { 
      status?: number; 
      code?: string; 
      message?: string; 
      error?: { code?: string; message?: string };
      response?: { status?: number; headers?: Record<string, string> };
    };

    const message = err.message || err.error?.message || String(error);
    const statusCode = err.status || err.response?.status;
    const errorCode = err.code || err.error?.code;

    // Check for token limit exceeded
    if (this.isTokenLimitError(message, statusCode, errorCode)) {
      const maxTokens = this.extractMaxTokens(message);
      return {
        type: LlmErrorType.TOKEN_LIMIT_EXCEEDED,
        isRecoverable: true,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "split_prompt",
        maxTokens,
      };
    }

    // Check for rate limiting
    if (this.isRateLimitError(message, statusCode, responseHeaders)) {
      const waitMs = this.extractRetryAfter(responseHeaders) || 5000;
      return {
        type: LlmErrorType.RATE_LIMITED,
        isRecoverable: true,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "wait_and_retry",
        waitMs,
      };
    }

    // Check for network errors
    if (this.isNetworkError(error)) {
      return {
        type: LlmErrorType.NETWORK_ERROR,
        isRecoverable: true,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "retry",
      };
    }

    // Check for truncated JSON response
    if (this.isTruncatedResponse(message)) {
      return {
        type: LlmErrorType.TRUNCATED_RESPONSE,
        isRecoverable: true,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "retry",
      };
    }

    // Check for auth errors (fatal)
    if (statusCode === 401 || statusCode === 403 || errorCode === "invalid_api_key") {
      return {
        type: LlmErrorType.AUTH_ERROR,
        isRecoverable: false,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "abort",
      };
    }

    // Check for model errors (fatal)
    if (statusCode === 404 || errorCode === "model_not_found") {
      return {
        type: LlmErrorType.MODEL_ERROR,
        isRecoverable: false,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "abort",
      };
    }

    // Check for invalid request (fatal)
    if (statusCode === 400 && !this.isTokenLimitError(message, statusCode, errorCode)) {
      return {
        type: LlmErrorType.INVALID_REQUEST,
        isRecoverable: false,
        originalError: error instanceof Error ? error : new Error(message),
        statusCode,
        message,
        suggestedAction: "abort",
      };
    }

    // Unknown error - treat as potentially recoverable
    return {
      type: LlmErrorType.UNKNOWN,
      isRecoverable: true,
      originalError: error instanceof Error ? error : new Error(message),
      statusCode,
      message,
      suggestedAction: "retry",
    };
  }

  private isTokenLimitError(message: string, statusCode?: number, errorCode?: string): boolean {
    if (statusCode === 413) return true;
    if (errorCode === "context_length_exceeded") return true;
    
    for (const pattern of this.config.tokenLimitPatterns) {
      if (pattern.test(message)) return true;
    }
    
    return false;
  }

  private isRateLimitError(message: string, statusCode?: number, headers?: Record<string, string>): boolean {
    if (statusCode === 429) return true;
    
    for (const pattern of this.config.rateLimitPatterns) {
      if (pattern.test(message)) return true;
    }
    
    if (headers) {
      for (const header of this.config.rateLimitHeaders) {
        if (headers[header.toLowerCase()] === "0") return true;
      }
    }
    
    return false;
  }

  private isNetworkError(error: unknown): boolean {
    const err = error as { code?: string; name?: string };
    const networkCodes = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT"];
    return networkCodes.includes(err.code || "") || err.name === "AbortError";
  }

  private isTruncatedResponse(message: string): boolean {
    const patterns = [
      /unexpected end of json/i,
      /json parse error/i,
      /incomplete.*response/i,
      /stream.*truncated/i,
      /finish_reason.*length/i,
    ];
    return patterns.some(p => p.test(message));
  }

  private extractMaxTokens(message: string): number | undefined {
    const match = message.match(/maximum.*?(\d+).*?tokens/i) || 
                  message.match(/limit.*?(\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private extractRetryAfter(headers?: Record<string, string>): number | undefined {
    if (!headers) return undefined;
    const retryAfter = headers["retry-after"] || headers["x-ratelimit-reset"];
    if (!retryAfter) return undefined;
    
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
    
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
    
    return undefined;
  }
}

// ============================================================================
// PROMPT SPLITTER
// ============================================================================

/**
 * Splits large prompts into smaller chunks for retry after token limit errors.
 */
export class PromptSplitter {
  private config: LlmRetryConfig;

  constructor(config: LlmRetryConfig) {
    this.config = config;
  }

  /**
   * Split a prompt into chunks that fit within token limits.
   * Uses sentence/paragraph boundaries when possible.
   * 
   * @param prompt - Original prompt text
   * @param maxTokensPerChunk - Target tokens per chunk
   * @param tokenizer - Optional token counting function
   * @returns Array of prompt chunks
   */
  split(
    prompt: string,
    maxTokensPerChunk: number,
    tokenizer?: (text: string) => number
  ): PromptChunk[] {
    const countTokens = tokenizer || ((text: string) => Math.ceil(text.length / 4));
    const totalTokens = countTokens(prompt);

    if (totalTokens <= maxTokensPerChunk) {
      return [{
        index: 0,
        totalChunks: 1,
        content: prompt,
        estimatedTokens: totalTokens,
      }];
    }

    const chunks: PromptChunk[] = [];
    let remaining = prompt;
    let chunkIndex = 0;

    while (remaining.length > 0) {
      const targetChars = Math.floor(maxTokensPerChunk * 4); // Rough estimate
      
      if (countTokens(remaining) <= maxTokensPerChunk) {
        chunks.push({
          index: chunkIndex,
          totalChunks: 0, // Will be updated
          content: remaining.trim(),
          estimatedTokens: countTokens(remaining),
        });
        break;
      }

      // Find natural break point
      let splitPoint = this.findNaturalBreakPoint(remaining, targetChars);
      let chunkContent = remaining.slice(0, splitPoint).trim();

      // Verify chunk fits
      while (countTokens(chunkContent) > maxTokensPerChunk && splitPoint > 0) {
        splitPoint = Math.floor(splitPoint * 0.9);
        chunkContent = remaining.slice(0, splitPoint).trim();
      }

      if (chunkContent.length === 0) {
        // Hard cut as last resort
        splitPoint = targetChars;
        chunkContent = remaining.slice(0, splitPoint);
      }

      chunks.push({
        index: chunkIndex++,
        totalChunks: 0,
        content: chunkContent,
        estimatedTokens: countTokens(chunkContent),
      });

      remaining = remaining.slice(splitPoint).trim();
    }

    // Update total chunks count
    for (const chunk of chunks) {
      chunk.totalChunks = chunks.length;
    }

    return chunks;
  }

  /**
   * Find a natural break point near the target position.
   */
  private findNaturalBreakPoint(text: string, targetPos: number): number {
    // Try paragraph breaks first
    const paraBreak = text.lastIndexOf("\n\n", targetPos);
    if (paraBreak > targetPos * 0.5) return paraBreak + 2;

    // Try sentence breaks
    const sentenceBreaks = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
    let bestSentence = -1;
    for (const delim of sentenceBreaks) {
      const pos = text.lastIndexOf(delim, targetPos);
      if (pos > bestSentence && pos > targetPos * 0.5) {
        bestSentence = pos + delim.length;
      }
    }
    if (bestSentence > 0) return bestSentence;

    // Try word breaks
    const wordBreak = text.lastIndexOf(" ", targetPos);
    if (wordBreak > targetPos * 0.3) return wordBreak;

    // Hard cut
    return targetPos;
  }

  /**
   * Merge chunked responses back into a single result.
   */
  mergeResponses(responses: string[], separator: string = "\n\n"): string {
    return responses.filter(r => r.trim().length > 0).join(separator);
  }
}

// ============================================================================
// RETRY EXECUTOR
// ============================================================================

/**
 * Executes LLM calls with automatic retry, splitting, and error handling.
 */
export class LlmRetryExecutor {
  private config: LlmRetryConfig;
  private classifier: LlmErrorClassifier;
  private splitter: PromptSplitter;

  constructor(config: LlmRetryConfig) {
    this.config = config;
    this.classifier = new LlmErrorClassifier(config);
    this.splitter = new PromptSplitter(config);
  }

  /**
   * Execute an LLM call with full retry logic.
   * 
   * @param callFn - Function that makes the actual LLM API call
   * @param prompt - The prompt to send (may be split on token errors)
   * @param options - Additional options
   * @returns Call result with retry metadata
   */
  async execute<T = string>(
    callFn: (prompt: string) => Promise<T>,
    prompt: string,
    options: {
      tokenizer?: (text: string) => number;
      maxTokensOverride?: number;
      mergeFn?: (results: T[]) => T;
    } = {}
  ): Promise<LlmCallResult<T>> {
    const startTime = Date.now();
    const retriedErrors: string[] = [];
    let attemptsMade = 0;
    let wasSplit = false;
    let chunksProcessed = 0;

    // Initial attempt
    try {
      const result = await callFn(prompt);
      return {
        success: true,
        data: result,
        attemptsMade: 1,
        totalLatencyMs: Date.now() - startTime,
        wasSplit: false,
        chunksProcessed: 1,
        retriedErrors: [],
      };
    } catch (error) {
      const classified = this.classifier.classify(error);
      
      if (!classified.isRecoverable) {
        return {
          success: false,
          error: classified,
          attemptsMade: 1,
          totalLatencyMs: Date.now() - startTime,
          wasSplit: false,
          chunksProcessed: 0,
          retriedErrors: [classified.message],
        };
      }

      retriedErrors.push(classified.message);
      attemptsMade = 1;

      // Handle token limit by splitting
      if (classified.suggestedAction === "split_prompt" && this.config.enablePromptSplitting) {
        return this.executeWithSplitting(callFn, prompt, classified, options, startTime, retriedErrors, attemptsMade);
      }

      // Standard retry loop
      return this.executeRetryLoop(callFn, prompt, classified, options, startTime, retriedErrors, attemptsMade);
    }
  }

  private async executeRetryLoop<T>(
    callFn: (prompt: string) => Promise<T>,
    prompt: string,
    initialError: ClassifiedLlmError,
    options: { tokenizer?: (text: string) => number },
    startTime: number,
    retriedErrors: string[],
    startAttempt: number
  ): Promise<LlmCallResult<T>> {
    let currentDelay = initialError.waitMs || this.config.baseDelayMs;
    let attemptsMade = startAttempt;

    while (attemptsMade < this.config.maxRetries) {
      // Wait before retry
      if (currentDelay > 0) {
        await this.notifyRetry(attemptsMade, this.config.maxRetries, `Waiting ${currentDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }

      attemptsMade++;
      await this.notifyRetry(attemptsMade, this.config.maxRetries, `Retry attempt ${attemptsMade}/${this.config.maxRetries}`);

      try {
        const result = await callFn(prompt);
        return {
          success: true,
          data: result,
          attemptsMade,
          totalLatencyMs: Date.now() - startTime,
          wasSplit: false,
          chunksProcessed: 1,
          retriedErrors,
        };
      } catch (error) {
        const classified = this.classifier.classify(error);
        retriedErrors.push(classified.message);

        if (!classified.isRecoverable) {
          return {
            success: false,
            error: classified,
            attemptsMade,
            totalLatencyMs: Date.now() - startTime,
            wasSplit: false,
            chunksProcessed: 0,
            retriedErrors,
          };
        }

        // Update delay for next iteration
        currentDelay = classified.waitMs || Math.min(
          currentDelay * 2,
          this.config.maxDelayMs
        );
      }
    }

    return {
      success: false,
      error: this.classifier.classify(new Error(`All ${this.config.maxRetries} retry attempts exhausted`)),
      attemptsMade,
      totalLatencyMs: Date.now() - startTime,
      wasSplit: false,
      chunksProcessed: 0,
      retriedErrors,
    };
  }

  private async executeWithSplitting<T>(
    callFn: (prompt: string) => Promise<T>,
    prompt: string,
    tokenError: ClassifiedLlmError,
    options: { tokenizer?: (text: string) => number; maxTokensOverride?: number; mergeFn?: (results: T[]) => T },
    startTime: number,
    retriedErrors: string[],
    startAttempt: number
  ): Promise<LlmCallResult<T>> {
    const maxTokens = options.maxTokensOverride || tokenError.maxTokens || 4000;
    const chunks = this.splitter.split(prompt, maxTokens, options.tokenizer);

    if (chunks.length <= 1) {
      // Splitting didn't help, fall back to standard retry
      return this.executeRetryLoop(callFn, prompt, tokenError, options, startTime, retriedErrors, startAttempt);
    }

    await this.notifyRetry(startAttempt, this.config.maxRetries, 
      `Prompt too large. Splitting into ${chunks.length} chunks.`);

    const results: T[] = [];
    let chunksProcessed = 0;

    for (const chunk of chunks) {
      try {
        const result = await callFn(chunk.content);
        results.push(result);
        chunksProcessed++;
      } catch (error) {
        const classified = this.classifier.classify(error);
        retriedErrors.push(`Chunk ${chunk.index}: ${classified.message}`);

        if (!classified.isRecoverable) {
          return {
            success: false,
            error: classified,
            attemptsMade: startAttempt,
            totalLatencyMs: Date.now() - startTime,
            wasSplit: true,
            chunksProcessed,
            retriedErrors,
          };
        }

        // Retry this specific chunk
        let chunkRetrySuccess = false;
        for (let retry = 0; retry < 2; retry++) {
          try {
            await new Promise(resolve => setTimeout(resolve, this.config.baseDelayMs));
            const result = await callFn(chunk.content);
            results.push(result);
            chunksProcessed++;
            chunkRetrySuccess = true;
            break;
          } catch {
            continue;
          }
        }

        if (!chunkRetrySuccess) {
          return {
            success: false,
            error: this.classifier.classify(new Error(`Failed to process chunk ${chunk.index} after retries`)),
            attemptsMade: startAttempt + 1,
            totalLatencyMs: Date.now() - startTime,
            wasSplit: true,
            chunksProcessed,
            retriedErrors,
          };
        }
      }
    }

    // Merge results
    const mergedResult = options.mergeFn 
      ? options.mergeFn(results)
      : (typeof results[0] === "string" 
          ? this.splitter.mergeResponses(results as unknown as string[]) as unknown as T
          : results[0]);

    return {
      success: true,
      data: mergedResult,
      attemptsMade: startAttempt + 1,
      totalLatencyMs: Date.now() - startTime,
      wasSplit: true,
      chunksProcessed,
      retriedErrors,
    };
  }

  private async notifyRetry(attempt: number, maxAttempts: number, message: string): Promise<void> {
    if (this.config.notifyOnRetry && this.config.onRetryNotification) {
      try {
        await this.config.onRetryNotification(message, attempt, maxAttempts);
      } catch {
        // Don't let notification failures break the retry loop
        console.warn("[LLM Retry] Failed to post retry notification");
      }
    }
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_LLM_RETRY_CONFIG: LlmRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  enablePromptSplitting: true,
  minChunkTokens: 500,
  chunkReductionFactor: 0.7,
  notifyOnRetry: true,
  tokenLimitPatterns: [
    /context.?length.?exceeded/i,
    /maximum.*?tokens/i,
    /too many tokens/i,
    /request too large/i,
    /max_tokens/i,
    /content.?filter/i,
  ],
  rateLimitPatterns: [
    /rate.?limit/i,
    /too many requests/i,
    /quota.?exceeded/i,
    /throttl/i,
  ],
  rateLimitHeaders: [
    "x-ratelimit-remaining-requests",
    "x-ratelimit-remaining-tokens",
  ],
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for LLM call sites.
 */
export function generateIntegrationPatch(): string {
  return \`/**
 * Integration: Add retry mechanism to LLM calls.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#236
 */

import { 
  LlmRetryExecutor, 
  DEFAULT_LLM_RETRY_CONFIG,
  LlmCallResult
} from "./llm-retry-mechanism";

// Configure with notification callback
const retryConfig = {
  ...DEFAULT_LLM_RETRY_CONFIG,
  onRetryNotification: async (message: string, attempt: number, max: number) => {
    // Post to GitHub issue/comment to inform users
    console.log(\`[LLM Retry] \${message} (\${attempt}/\${max})\`);
    // In production: await github.rest.issues.createComment({...})
  },
};

const executor = new LlmRetryExecutor(retryConfig);

/**
 * FIXED: Make LLM call with automatic retry and prompt splitting.
 * Replaces direct API calls that abort on any failure.
 */
export async function callLlmWithRetry(
  apiCallFn: (prompt: string) => Promise<string>,
  prompt: string,
  options?: {
    tokenizer?: (text: string) => number;
    maxTokens?: number;
  }
): Promise<LlmCallResult<string>> {
  return executor.execute(apiCallFn, prompt, options);
}

/**
 * FIXED: Evaluate content with retry support.
 * Handles token limits by splitting evaluation into chunks.
 */
export async function evaluateWithRetry(
  evaluateFn: (content: string) => Promise<{ score: number; analysis: string }>,
  content: string,
  tokenizer?: (text: string) => number
): Promise<LlmCallResult<{ score: number; analysis: string }>> {
  return executor.execute(
    evaluateFn,
    content,
    {
      tokenizer,
      mergeFn: (results) => ({
        score: results.reduce((sum, r) => sum + r.score, 0) / results.length,
        analysis: results.map(r => r.analysis).join("\\n\\n---\\n\\n"),
      }),
    }
  );
}
\`;
}

/**
 * Format retry status for GitHub comments.
 */
export function formatRetryStatus(result: LlmCallResult): string {
  if (result.success && result.attemptsMade === 1 && !result.wasSplit) {
    return ""; // No status needed for clean success
  }

  const lines: string[] = [
    \`### 🔄 LLM Processing Status\`,
    \`\`,
  ];

  if (result.success) {
    lines.push(\`✅ Completed successfully after \${result.attemptsMade} attempt(s)\`);
  } else {
    lines.push(\`❌ Failed after \${result.attemptsMade} attempt(s)\`);
    if (result.error) {
      lines.push(\`**Error:** \${result.error.message}\`);
    }
  }

  if (result.wasSplit) {
    lines.push(\`📦 Prompt was split into \${result.chunksProcessed} chunks due to size limits\`);
  }

  if (result.retriedErrors.length > 0) {
    lines.push(\`\`);
    lines.push(\`<details>\`);
    lines.push(\`<summary>Retry History (\${result.retriedErrors.length} events)</summary>\`);
    lines.push(\`\`);
    for (const err of result.retriedErrors.slice(-5)) {
      lines.push(\`- \${err.slice(0, 200)}\`);
    }
    if (result.retriedErrors.length > 5) {
      lines.push(\`- ... and \${result.retriedErrors.length - 5} more\`);
    }
    lines.push(\`\`);
    lines.push(\`</details>\`);
  }

  lines.push(\`\`);
  lines.push(\`*Total processing time: \${(result.totalLatencyMs / 1000).toFixed(1)}s*\`);

  return lines.join("\\n");
}
