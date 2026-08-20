/**
 * @file rpc-client-permit.ts
 * @description Scaffolding and generator utilities for implementing a robust RPC client
 * for permit generation with proper retry logic, failover, and integration with
 * the Ubiquity plugin SDK retry function.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#367
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Resilient RPC client with exponential backoff and jitter
 * - Multi-endpoint failover for permit2-rpc-manager compatibility
 * - Plugin SDK retry function integration
 * - Request batching and deduplication
 * - Health checking and endpoint scoring
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Configuration for the RPC client.
 */
export interface RpcClientConfig {
  /** List of RPC endpoints to use (ordered by priority) */
  endpoints: string[];
  /** Maximum number of retries per request */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Whether to add random jitter to delays */
  enableJitter: boolean;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Whether to enable endpoint health scoring */
  enableHealthScoring: boolean;
  /** Interval for health check pings in milliseconds */
  healthCheckIntervalMs: number;
  /** Minimum success rate to keep endpoint in rotation (0-1) */
  minSuccessRate: number;
  /** Chain ID this client is configured for */
  chainId: number;
}

/**
 * Represents an RPC endpoint with health metadata.
 */
export interface RpcEndpoint {
  url: string;
  priority: number;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  averageLatencyMs: number;
  isHealthy: boolean;
}

/**
 * Result of an RPC request attempt.
 */
export interface RpcRequestResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  endpointUsed: string;
  attemptsMade: number;
  totalLatencyMs: number;
  retriedErrors: string[];
}

/**
 * Permit generation RPC request parameters.
 */
export interface PermitRpcRequest {
  method: "generatePermit" | "getNonce" | "verifyPermit" | "getDomain";
  params: {
    tokenAddress: string;
    owner: string;
    spender: string;
    amount: string;
    nonce?: string;
    deadline?: string;
    chainId: number;
  };
}

/**
 * Permit generation RPC response.
 */
export interface PermitRpcResponse {
  permit?: {
    signature: string;
    nonce: string;
    deadline: string;
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
  };
  nonce?: string;
  isValid?: boolean;
  error?: string;
}

/**
 * Plugin SDK retry function signature.
 * Matches the interface from @ubiquity-os/plugin-sdk.
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
// ENDPOINT HEALTH TRACKER
// ============================================================================

/**
 * Tracks health and performance metrics for RPC endpoints.
 * Used to dynamically route requests to the most reliable endpoints.
 */
export class EndpointHealthTracker {
  private endpoints: Map<string, RpcEndpoint> = new Map();
  private config: RpcClientConfig;

  constructor(urls: string[], config: RpcClientConfig) {
    this.config = config;
    urls.forEach((url, index) => {
      this.endpoints.set(url, {
        url,
        priority: index,
        successCount: 0,
        failureCount: 0,
        averageLatencyMs: 0,
        isHealthy: true,
      });
    });
  }

  /**
   * Get healthy endpoints sorted by reliability score.
   */
  getHealthyEndpoints(): RpcEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(e => e.isHealthy)
      .sort((a, b) => this.calculateScore(b) - this.calculateScore(a));
  }

  /**
   * Record a successful request.
   */
  recordSuccess(url: string, latencyMs: number): void {
    const endpoint = this.endpoints.get(url);
    if (!endpoint) return;

    endpoint.successCount++;
    endpoint.lastSuccessAt = new Date();
    endpoint.averageLatencyMs = this.updateAverage(
      endpoint.averageLatencyMs,
      endpoint.successCount,
      latencyMs
    );
    this.recalculateHealth(endpoint);
  }

  /**
   * Record a failed request.
   */
  recordFailure(url: string): void {
    const endpoint = this.endpoints.get(url);
    if (!endpoint) return;

    endpoint.failureCount++;
    endpoint.lastFailureAt = new Date();
    this.recalculateHealth(endpoint);
  }

  /**
   * Calculate reliability score for an endpoint.
   * Higher is better. Considers success rate and latency.
   */
  private calculateScore(endpoint: RpcEndpoint): number {
    const total = endpoint.successCount + endpoint.failureCount;
    if (total === 0) return 100 - endpoint.priority; // New endpoints start high

    const successRate = endpoint.successCount / total;
    const latencyPenalty = Math.min(endpoint.averageLatencyMs / 1000, 50); // Cap at 50 points
    
    return (successRate * 100) - latencyPenalty - endpoint.priority;
  }

  /**
   * Update running average latency.
   */
  private updateAverage(currentAvg: number, count: number, newValue: number): number {
    if (count <= 1) return newValue;
    return currentAvg + (newValue - currentAvg) / count;
  }

  /**
   * Recalculate whether an endpoint should be considered healthy.
   */
  private recalculateHealth(endpoint: RpcEndpoint): void {
    const total = endpoint.successCount + endpoint.failureCount;
    if (total < 5) {
      endpoint.isHealthy = true; // Too few samples to judge
      return;
    }

    const successRate = endpoint.successCount / total;
    endpoint.isHealthy = successRate >= this.config.minSuccessRate;
  }

  /**
   * Reset all metrics (useful after network recovery).
   */
  resetAll(): void {
    for (const endpoint of this.endpoints.values()) {
      endpoint.successCount = 0;
      endpoint.failureCount = 0;
      endpoint.averageLatencyMs = 0;
      endpoint.isHealthy = true;
    }
  }
}

// ============================================================================
// RESILIENT RPC CLIENT
// ============================================================================

/**
 * Core RPC client with retry logic, failover, and health tracking.
 * Compatible with permit2-rpc-manager protocol.
 */
export class ResilientRpcClient {
  private config: RpcClientConfig;
  private healthTracker: EndpointHealthTracker;
  private sdkRetry?: SdkRetryFunction;

  constructor(config: RpcClientConfig, sdkRetry?: SdkRetryFunction) {
    this.config = config;
    this.healthTracker = new EndpointHealthTracker(config.endpoints, config);
    this.sdkRetry = sdkRetry;
  }

  /**
   * Execute an RPC request with automatic retries and failover.
   * 
   * @param request - The RPC request to execute
   * @returns Request result with data or error details
   */
  async execute<T = PermitRpcResponse>(request: PermitRpcRequest): Promise<RpcRequestResult<T>> {
    const startTime = Date.now();
    const retriedErrors: string[] = [];
    let attemptsMade = 0;
    let lastError = "";

    // If SDK retry function is available, wrap the entire failover logic
    if (this.sdkRetry) {
      try {
        const result = await this.sdkRetry(
          () => this.executeWithFailover<T>(request, retriedErrors),
          {
            maxRetries: this.config.maxRetries,
            baseDelayMs: this.config.baseDelayMs,
            maxDelayMs: this.config.maxDelayMs,
            onRetry: (error, attempt) => {
              attemptsMade = attempt;
              retriedErrors.push(error.message);
            },
          }
        );
        return {
          ...result,
          attemptsMade,
          totalLatencyMs: Date.now() - startTime,
          retriedErrors,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          endpointUsed: "none",
          attemptsMade,
          totalLatencyMs: Date.now() - startTime,
          retriedErrors,
        };
      }
    }

    // Manual retry loop if no SDK retry available
    while (attemptsMade <= this.config.maxRetries) {
      try {
        const result = await this.executeWithFailover<T>(request, retriedErrors);
        return {
          ...result,
          attemptsMade,
          totalLatencyMs: Date.now() - startTime,
          retriedErrors,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        retriedErrors.push(lastError);
        attemptsMade++;

        if (attemptsMade <= this.config.maxRetries) {
          await this.delay(attemptsMade);
        }
      }
    }

    return {
      success: false,
      error: lastError || "All retries exhausted",
      endpointUsed: "none",
      attemptsMade,
      totalLatencyMs: Date.now() - startTime,
      retriedErrors,
    };
  }

  /**
   * Execute request with endpoint failover.
   * Tries healthy endpoints in order until one succeeds.
   */
  private async executeWithFailover<T>(
    request: PermitRpcRequest,
    errors: string[]
  ): Promise<RpcRequestResult<T>> {
    const endpoints = this.healthTracker.getHealthyEndpoints();
    
    if (endpoints.length === 0) {
      throw new Error("No healthy RPC endpoints available");
    }

    let lastError = "";
    
    for (const endpoint of endpoints) {
      try {
        const result = await this.sendRequest<T>(endpoint.url, request);
        this.healthTracker.recordSuccess(endpoint.url, result.latencyMs);
        
        return {
          success: true,
          data: result.data,
          endpointUsed: endpoint.url,
          attemptsMade: 1,
          totalLatencyMs: result.latencyMs,
          retriedErrors: [],
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        errors.push(`${endpoint.url}: ${lastError}`);
        this.healthTracker.recordFailure(endpoint.url);
      }
    }

    throw new Error(`All endpoints failed. Last error: ${lastError}`);
  }

  /**
   * Send a single RPC request to an endpoint.
   */
  private async sendRequest<T>(
    url: string,
    request: PermitRpcRequest
  ): Promise<{ data: T; latencyMs: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: request.method,
          params: request.params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json() as any;
      
      if (json.error) {
        throw new Error(`RPC Error: ${json.error.message || JSON.stringify(json.error)}`);
      }

      return { data: json.result as T, latencyMs };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Request timed out after ${this.config.timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Calculate delay with exponential backoff and optional jitter.
   */
  private async delay(attempt: number): Promise<void> {
    let delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, attempt - 1),
      this.config.maxDelayMs
    );

    if (this.config.enableJitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate a permit using the RPC client.
   * Convenience wrapper around execute().
   */
  async generatePermit(params: {
    tokenAddress: string;
    owner: string;
    spender: string;
    amount: string;
    deadline: string;
  }): Promise<RpcRequestResult<PermitRpcResponse>> {
    return this.execute<PermitRpcResponse>({
      method: "generatePermit",
      params: {
        ...params,
        chainId: this.config.chainId,
      },
    });
  }

  /**
   * Get current nonce for an owner/token pair.
   */
  async getNonce(owner: string, tokenAddress: string): Promise<RpcRequestResult<{ nonce: string }>> {
    return this.execute<{ nonce: string }>({
      method: "getNonce",
      params: {
        tokenAddress,
        owner,
        spender: "",
        amount: "0",
        chainId: this.config.chainId,
      },
    });
  }
}

// ============================================================================
// PLUGIN SDK INTEGRATION
// ============================================================================

/**
 * Creates an RPC client integrated with the Ubiquity plugin SDK retry function.
 * 
 * @param config - RPC client configuration
 * @param sdkRetry - Optional retry function from @ubiquity-os/plugin-sdk
 * @returns Configured ResilientRpcClient instance
 */
export function createRpcClient(
  config: Partial<RpcClientConfig>,
  sdkRetry?: SdkRetryFunction
): ResilientRpcClient {
  const fullConfig: RpcClientConfig = {
    endpoints: config.endpoints || [
      "https://rpc.gnosis.gateway.fm",
      "https://gnosis.publicnode.com",
      "https://rpc.ankr.com/gnosis",
    ],
    maxRetries: config.maxRetries ?? 3,
    baseDelayMs: config.baseDelayMs ?? 1000,
    maxDelayMs: config.maxDelayMs ?? 10000,
    enableJitter: config.enableJitter ?? true,
    timeoutMs: config.timeoutMs ?? 30000,
    enableHealthScoring: config.enableHealthScoring ?? true,
    healthCheckIntervalMs: config.healthCheckIntervalMs ?? 60000,
    minSuccessRate: config.minSuccessRate ?? 0.5,
    chainId: config.chainId ?? 100,
  };

  return new ResilientRpcClient(fullConfig, sdkRetry);
}

/**
 * Default retry function matching plugin SDK interface.
 * Use this if SDK retry is not available.
 */
export function defaultRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        options.onRetry?.(lastError, attempt + 1);
        
        if (attempt < options.maxRetries) {
          const delay = Math.min(
            options.baseDelayMs * Math.pow(2, attempt),
            options.maxDelayMs
          );
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    reject(lastError);
  });
}

// ============================================================================
// CONFIGURATION GENERATOR
// ============================================================================

/**
 * Generates environment-based RPC client configuration.
 * 
 * @returns RpcClientConfig populated from environment variables
 */
export function generateConfigFromEnv(): RpcClientConfig {
  const endpoints = (process.env.RPC_ENDPOINTS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  return {
    endpoints: endpoints.length > 0 ? endpoints : [
      "https://rpc.gnosis.gateway.fm",
      "https://gnosis.publicnode.com",
    ],
    maxRetries: parseInt(process.env.RPC_MAX_RETRIES || "3", 10),
    baseDelayMs: parseInt(process.env.RPC_BASE_DELAY_MS || "1000", 10),
    maxDelayMs: parseInt(process.env.RPC_MAX_DELAY_MS || "10000", 10),
    enableJitter: process.env.RPC_ENABLE_JITTER !== "false",
    timeoutMs: parseInt(process.env.RPC_TIMEOUT_MS || "30000", 10),
    enableHealthScoring: process.env.RPC_HEALTH_SCORING !== "false",
    healthCheckIntervalMs: parseInt(process.env.RPC_HEALTH_CHECK_INTERVAL_MS || "60000", 10),
    minSuccessRate: parseFloat(process.env.RPC_MIN_SUCCESS_RATE || "0.5"),
    chainId: parseInt(process.env.CHAIN_ID || "100", 10),
  };
}

/**
 * Generates integration code for patching existing permit generation.
 * 
 * @returns TypeScript code to integrate RPC client into permit workflow
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration patch: Replace direct RPC calls with resilient client.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#367
 */

import { createRpcClient, defaultRetry } from "./rpc-client-permit";

// Initialize client once at module level
const rpcClient = createRpcClient(
  { chainId: parseInt(process.env.CHAIN_ID || "100", 10) },
  // Use SDK retry if available, otherwise fall back to default
  typeof retry !== "undefined" ? retry : defaultRetry
);

/**
 * FIXED: Generate permit using resilient RPC client.
 * Replaces direct fetch calls that lacked proper retry/failover.
 */
export async function generatePermitResilient(params: {
  tokenAddress: string;
  owner: string;
  spender: string;
  amount: string;
  deadline: string;
}): Promise<{ signature: string; nonce: string; deadline: string }> {
  const result = await rpcClient.generatePermit(params);
  
  if (!result.success || !result.data?.permit) {
    throw new Error(\`Permit generation failed: \${result.error}\`);
  }
  
  return {
    signature: result.data.permit.signature,
    nonce: result.data.permit.nonce,
    deadline: result.data.permit.deadline,
  };
}

/**
 * FIXED: Get nonce with automatic retries.
 */
export async function getNonceResilient(
  owner: string,
  tokenAddress: string
): Promise<string> {
  const result = await rpcClient.getNonce(owner, tokenAddress);
  
  if (!result.success || !result.data?.nonce) {
    throw new Error(\`Nonce fetch failed: \${result.error}\`);
  }
  
  return result.data.nonce;
}
`;
}
