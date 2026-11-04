/**
 * RPC Robustness & Fallback Provider for UbiquityOS & DevPool Directory
 *
 * Implements resilient multi-endpoint Ethereum JSON-RPC communication:
 * - Runtime URL format validation and graceful fallback for misconfigured environments
 * - Fast RPC health probes (`eth_chainId`) with timeout and typed diagnostics
 * - Seamless handoff across fallback endpoints upon failure, rate limit, or timeout
 * - Latency ranking, circuit breaker cooldown, and exponential retry backoff
 * - First-class support for `dev`, `prod`, and `local-node` (Anvil / Hardhat) environments
 *
 * References:
 * - DevPool Directory: https://github.com/devpool-directory/devpool-directory/issues/5839
 * - Upstream Issue: https://github.com/ubiquity/stake.ubq.fi/issues/9
 */

export interface RpcCallOptions {
  method: string;
  params?: unknown[];
  timeoutMs?: number;
  maxRetriesPerEndpoint?: number;
  backoffBaseMs?: number;
}

export interface RpcCallResult<TResult = unknown> {
  result: TResult;
  endpointUsed: string;
  latencyMs: number;
  attempts: number;
}

export interface RpcHealthStatus {
  isHealthy: boolean;
  endpoint: string;
  chainId?: number;
  latencyMs: number;
  error?: string;
  timestamp: number;
}

export interface RpcEndpointDiagnostic {
  endpoint: string;
  isHealthy: boolean;
  latencyMs: number;
  consecutiveFailures: number;
  totalCalls: number;
  totalFailures: number;
  isInCooldown: boolean;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export interface RpcFallbackProviderOptions {
  primaryUrl?: string;
  fallbackUrls?: string[];
  timeoutMs?: number;
  maxRetriesPerEndpoint?: number;
  backoffBaseMs?: number;
  cooldownMs?: number;
  mode?: "dev" | "local-node" | "prod" | string;
  expectedChainId?: number;
  fetchFn?: typeof fetch;
}

export const DEFAULT_MAINNET_FALLBACK_RPCS: readonly string[] = [
  "https://rpc.ubq.fi",
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
];

export const DEFAULT_LOCAL_NODE_URL = "http://localhost:8545";
export const DEFAULT_LOCAL_NODE_CHAIN_ID = 31337;

/**
 * Validates whether an input string is a well-formed HTTP/HTTPS URL for an RPC endpoint.
 */
export function validateRpcUrl(url: string | undefined | null): {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  if (!url || typeof url !== "string") {
    return {
      isValid: false,
      error: "RPC URL must be a non-empty string",
    };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: "RPC URL cannot be empty or whitespace",
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: `Unsupported RPC protocol "${parsed.protocol}". Expected http: or https:`,
      };
    }
    // Normalize URL: remove trailing slash unless it's just origin
    const normalizedUrl = parsed.pathname === "/" ? `${parsed.origin}` : parsed.href.replace(/\/$/, "");
    return {
      isValid: true,
      normalizedUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      error: `Invalid RPC URL format: ${message}`,
    };
  }
}

/**
 * Resolves the primary RPC URL with environment variable resolution and validation.
 * If the configured URL is invalid, logs a warning and returns the fallback URL.
 */
export function getRpcUrl(
  rawUrlOrOptions?: string | { rawUrl?: string; mode?: string; defaultUrl?: string },
  defaultUrlFallback = DEFAULT_MAINNET_FALLBACK_RPCS[0]
): string {
  let targetUrl: string | undefined;
  let targetMode = "dev";
  let fallbackUrl = defaultUrlFallback;

  if (typeof rawUrlOrOptions === "string") {
    targetUrl = rawUrlOrOptions;
  } else if (rawUrlOrOptions && typeof rawUrlOrOptions === "object") {
    targetUrl = rawUrlOrOptions.rawUrl;
    targetMode = rawUrlOrOptions.mode ?? "dev";
    if (rawUrlOrOptions.defaultUrl) {
      fallbackUrl = rawUrlOrOptions.defaultUrl;
    }
  }

  if (targetMode === "local-node") {
    return targetUrl ? targetUrl.trim() : DEFAULT_LOCAL_NODE_URL;
  }

  if (!targetUrl) {
    const envCandidate =
      (typeof process !== "undefined" && process.env?.VITE_RPC_URL) ||
      (typeof process !== "undefined" && process.env?.RPC_URL) ||
      "";
    if (envCandidate) {
      targetUrl = envCandidate;
    }
  }

  if (!targetUrl) {
    return fallbackUrl;
  }

  const validation = validateRpcUrl(targetUrl);
  if (!validation.isValid || !validation.normalizedUrl) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        `[RpcFallbackProvider] Configured RPC URL "${targetUrl}" is invalid (${validation.error}). Falling back to "${fallbackUrl}".`
      );
    }
    return fallbackUrl;
  }

  return validation.normalizedUrl;
}

/**
 * Performs a lightweight health check against a JSON-RPC endpoint by requesting `eth_chainId`.
 */
export async function rpcHealthCheck(
  endpoint: string,
  options?: {
    timeoutMs?: number;
    expectedChainId?: number;
    fetchFn?: typeof fetch;
  }
): Promise<RpcHealthStatus> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const fetchClient = options?.fetchFn ?? fetch;
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchClient(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: controller.signal,
    });

    const latencyMs = Math.max(1, Date.now() - startTime);

    if (!response.ok) {
      return {
        isHealthy: false,
        endpoint,
        latencyMs,
        error: `HTTP ${response.status} ${response.statusText}`,
        timestamp: Date.now(),
      };
    }

    const json = (await response.json()) as {
      result?: string | number;
      error?: { code?: number; message?: string };
    };

    if (json.error) {
      return {
        isHealthy: false,
        endpoint,
        latencyMs,
        error: `RPC Error (${json.error.code ?? "unknown"}): ${json.error.message ?? "Unknown error"}`,
        timestamp: Date.now(),
      };
    }

    if (json.result === undefined || json.result === null) {
      return {
        isHealthy: false,
        endpoint,
        latencyMs,
        error: "Missing result field in RPC response",
        timestamp: Date.now(),
      };
    }

    const chainId =
      typeof json.result === "string"
        ? parseInt(json.result, json.result.startsWith("0x") ? 16 : 10)
        : Number(json.result);

    if (Number.isNaN(chainId)) {
      return {
        isHealthy: false,
        endpoint,
        latencyMs,
        error: `Unable to parse chainId: "${String(json.result)}"`,
        timestamp: Date.now(),
      };
    }

    if (options?.expectedChainId !== undefined && chainId !== options.expectedChainId) {
      return {
        isHealthy: false,
        endpoint,
        chainId,
        latencyMs,
        error: `ChainId mismatch: expected ${options.expectedChainId}, got ${chainId}`,
        timestamp: Date.now(),
      };
    }

    return {
      isHealthy: true,
      endpoint,
      chainId,
      latencyMs,
      timestamp: Date.now(),
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startTime);
    const hasAborted = controller.signal.aborted;
    const errorMessage = hasAborted
      ? `RPC health check timed out after ${timeoutMs}ms`
      : err instanceof Error
      ? err.message
      : String(err);

    return {
      isHealthy: false,
      endpoint,
      latencyMs,
      error: errorMessage,
      timestamp: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Iterates through candidates and returns the first healthy RPC endpoint URL.
 */
export async function getHealthyRpcUrl(
  rpcUrls: string[],
  options?: {
    timeoutMs?: number;
    expectedChainId?: number;
    fetchFn?: typeof fetch;
  }
): Promise<string> {
  if (!rpcUrls || rpcUrls.length === 0) {
    throw new Error("No RPC endpoints provided for health check");
  }

  for (const url of rpcUrls) {
    const health = await rpcHealthCheck(url, options);
    if (health.isHealthy) {
      return url;
    }
  }

  throw new Error(`All candidate RPC endpoints failed health checks: [${rpcUrls.join(", ")}]`);
}

/**
 * Resolves the active RPC URL for a given runtime mode.
 */
export async function getResolvedRpcUrl(options?: {
  mode?: "dev" | "local-node" | "prod" | string;
  rawUrl?: string;
  probeHealth?: boolean;
  timeoutMs?: number;
  expectedChainId?: number;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const mode = options?.mode ?? "dev";
  const primary = getRpcUrl({ rawUrl: options?.rawUrl, mode });

  if (mode === "local-node") {
    if (options?.probeHealth) {
      const health = await rpcHealthCheck(primary, {
        timeoutMs: options.timeoutMs ?? 1500,
        expectedChainId: options.expectedChainId ?? DEFAULT_LOCAL_NODE_CHAIN_ID,
        fetchFn: options.fetchFn,
      });
      if (!health.isHealthy) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `[RpcFallbackProvider] Local node at ${primary} is unreachable: ${health.error}. Make sure Anvil or Hardhat is running.`
          );
        }
      }
    }
    return primary;
  }

  if (options?.probeHealth) {
    const candidateList = [primary, ...DEFAULT_MAINNET_FALLBACK_RPCS.filter((url) => url !== primary)];
    try {
      return await getHealthyRpcUrl(candidateList, {
        timeoutMs: options.timeoutMs,
        expectedChainId: options.expectedChainId,
        fetchFn: options.fetchFn,
      });
    } catch {
      return primary;
    }
  }

  return primary;
}

/**
 * Low-level JSON-RPC call executor with endpoint handoff and exponential retry backoff.
 */
export async function callRpcWithFallback<TResult = unknown>(
  rpcUrls: string[],
  options: RpcCallOptions,
  fetchFn: typeof fetch = fetch
): Promise<RpcCallResult<TResult>> {
  if (!rpcUrls || rpcUrls.length === 0) {
    throw new Error("No RPC endpoints configured");
  }

  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetriesPerEndpoint = options.maxRetriesPerEndpoint ?? 1;
  const backoffBaseMs = options.backoffBaseMs ?? 100;
  const errors: Array<{ endpoint: string; attempt: number; error: string }> = [];
  let totalAttempts = 0;

  for (const endpoint of rpcUrls) {
    for (let attempt = 0; attempt <= maxRetriesPerEndpoint; attempt++) {
      totalAttempts++;
      const startTime = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: totalAttempts,
            method: options.method,
            params: options.params ?? [],
          }),
          signal: controller.signal,
        });

        const latencyMs = Math.max(1, Date.now() - startTime);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as {
          result?: TResult;
          error?: { code?: number; message?: string };
        };

        if (data.error) {
          throw new Error(`RPC Error (${data.error.code ?? "unknown"}): ${data.error.message ?? "Unknown error"}`);
        }

        return {
          result: data.result as TResult,
          endpointUsed: endpoint,
          latencyMs,
          attempts: totalAttempts,
        };
      } catch (err) {
        const hasAborted = controller.signal.aborted;
        const errorMessage = hasAborted
          ? `Request timed out after ${timeoutMs}ms`
          : err instanceof Error
          ? err.message
          : String(err);

        errors.push({
          endpoint,
          attempt: attempt + 1,
          error: errorMessage,
        });

        // Apply exponential backoff before retrying the same endpoint
        if (attempt < maxRetriesPerEndpoint) {
          const delayMs = backoffBaseMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const failureSummary = errors.map((e) => `[${e.endpoint} attempt #${e.attempt}: ${e.error}]`).join(", ");
  throw new Error(`All RPC endpoints failed (${totalAttempts} total attempts across ${rpcUrls.length} endpoints): ${failureSummary}`);
}

/**
 * Stateful RPC Fallback Provider & Rotator
 */
export class RpcFallbackProvider {
  private _primaryUrl: string;
  private _fallbackUrls: string[];
  private _timeoutMs: number;
  private _maxRetriesPerEndpoint: number;
  private _backoffBaseMs: number;
  private _cooldownMs: number;
  private _mode: string;
  private _expectedChainId?: number;
  private _fetchFn: typeof fetch;
  private _diagnostics: Map<string, RpcEndpointDiagnostic>;

  constructor(options: RpcFallbackProviderOptions = {}) {
    this._mode = options.mode ?? "dev";
    this._timeoutMs = options.timeoutMs ?? 8000;
    this._maxRetriesPerEndpoint = options.maxRetriesPerEndpoint ?? 1;
    this._backoffBaseMs = options.backoffBaseMs ?? 100;
    this._cooldownMs = options.cooldownMs ?? 30000;
    this._expectedChainId = options.expectedChainId;
    this._fetchFn = options.fetchFn ?? fetch;

    this._primaryUrl = getRpcUrl({
      rawUrl: options.primaryUrl,
      mode: this._mode,
      defaultUrl: this._mode === "local-node" ? DEFAULT_LOCAL_NODE_URL : DEFAULT_MAINNET_FALLBACK_RPCS[0],
    });

    const rawFallbacks = options.fallbackUrls ?? (this._mode === "local-node" ? [] : DEFAULT_MAINNET_FALLBACK_RPCS);
    this._fallbackUrls = rawFallbacks
      .map((url) => {
        const check = validateRpcUrl(url);
        return check.isValid && check.normalizedUrl ? check.normalizedUrl : url;
      })
      .filter((url) => url !== this._primaryUrl);

    this._diagnostics = new Map();
    this._initializeDiagnostic(this._primaryUrl);
    for (const url of this._fallbackUrls) {
      this._initializeDiagnostic(url);
    }
  }

  private _initializeDiagnostic(endpoint: string): void {
    if (!this._diagnostics.has(endpoint)) {
      this._diagnostics.set(endpoint, {
        endpoint,
        isHealthy: true,
        latencyMs: 0,
        consecutiveFailures: 0,
        totalCalls: 0,
        totalFailures: 0,
        isInCooldown: false,
      });
    }
  }

  public getEndpoints(): string[] {
    return [this._primaryUrl, ...this._fallbackUrls];
  }

  public getPrimaryUrl(): string {
    return this._primaryUrl;
  }

  public getMode(): string {
    return this._mode;
  }

  public addFallback(url: string): boolean {
    const validation = validateRpcUrl(url);
    if (!validation.isValid || !validation.normalizedUrl) {
      return false;
    }
    const cleanUrl = validation.normalizedUrl;
    if (cleanUrl === this._primaryUrl || this._fallbackUrls.includes(cleanUrl)) {
      return false;
    }
    this._fallbackUrls.push(cleanUrl);
    this._initializeDiagnostic(cleanUrl);
    return true;
  }

  public removeFallback(url: string): boolean {
    const index = this._fallbackUrls.indexOf(url);
    if (index >= 0) {
      this._fallbackUrls.splice(index, 1);
      this._diagnostics.delete(url);
      return true;
    }
    return false;
  }

  public resetCooldowns(): void {
    for (const diag of this._diagnostics.values()) {
      diag.isInCooldown = false;
      diag.consecutiveFailures = 0;
    }
  }

  public getEndpointDiagnostics(): RpcEndpointDiagnostic[] {
    const now = Date.now();
    return Array.from(this._diagnostics.values()).map((diag) => {
      const isInCooldown =
        diag.consecutiveFailures > 0 &&
        diag.lastFailureTime !== undefined &&
        now - diag.lastFailureTime < this._cooldownMs;
      return {
        ...diag,
        isInCooldown,
      };
    });
  }

  public getCandidateEndpoints(): string[] {
    const now = Date.now();
    const all = [this._primaryUrl, ...this._fallbackUrls];
    const available: string[] = [];
    const cooledDown: string[] = [];

    for (const endpoint of all) {
      const diag = this._diagnostics.get(endpoint);
      if (!diag) {
        available.push(endpoint);
        continue;
      }
      const isCooling =
        diag.consecutiveFailures > 0 &&
        diag.lastFailureTime !== undefined &&
        now - diag.lastFailureTime < this._cooldownMs;

      if (isCooling) {
        cooledDown.push(endpoint);
      } else {
        available.push(endpoint);
      }
    }

    // Sort available by latency if known
    available.sort((a, b) => {
      const diagA = this._diagnostics.get(a)?.latencyMs ?? 999999;
      const diagB = this._diagnostics.get(b)?.latencyMs ?? 999999;
      return diagA - diagB;
    });

    // If all endpoints are cooling down, append them sorted by oldest failure
    if (available.length === 0) {
      cooledDown.sort((a, b) => {
        const timeA = this._diagnostics.get(a)?.lastFailureTime ?? 0;
        const timeB = this._diagnostics.get(b)?.lastFailureTime ?? 0;
        return timeA - timeB;
      });
      return cooledDown;
    }

    return [...available, ...cooledDown];
  }

  public async probeAllHealth(timeoutMs?: number): Promise<RpcHealthStatus[]> {
    const endpoints = this.getEndpoints();
    const results: RpcHealthStatus[] = [];

    for (const endpoint of endpoints) {
      const health = await rpcHealthCheck(endpoint, {
        timeoutMs: timeoutMs ?? this._timeoutMs,
        expectedChainId: this._expectedChainId,
        fetchFn: this._fetchFn,
      });

      const diag = this._diagnostics.get(endpoint);
      if (diag) {
        diag.isHealthy = health.isHealthy;
        diag.latencyMs = health.latencyMs;
        if (!health.isHealthy) {
          diag.consecutiveFailures++;
          diag.totalFailures++;
          diag.lastFailureTime = Date.now();
          diag.isInCooldown = true;
        } else {
          diag.consecutiveFailures = 0;
          diag.isInCooldown = false;
          diag.lastSuccessTime = Date.now();
        }
      }

      results.push(health);
    }

    return results;
  }

  public async rankEndpointsByLatency(): Promise<string[]> {
    const healths = await this.probeAllHealth();
    return healths
      .filter((h) => h.isHealthy)
      .sort((a, b) => a.latencyMs - b.latencyMs)
      .map((h) => h.endpoint);
  }

  public async getHealthyEndpoint(): Promise<string> {
    const candidates = this.getCandidateEndpoints();
    for (const endpoint of candidates) {
      const health = await rpcHealthCheck(endpoint, {
        timeoutMs: 2000,
        expectedChainId: this._expectedChainId,
        fetchFn: this._fetchFn,
      });
      if (health.isHealthy) {
        return endpoint;
      }
    }
    return this._primaryUrl;
  }

  public async send<TResult = unknown>(
    method: string,
    params?: unknown[],
    overrides?: Partial<RpcCallOptions>
  ): Promise<TResult> {
    const result = await this.callWithFallback<TResult>({
      method,
      params,
      timeoutMs: overrides?.timeoutMs ?? this._timeoutMs,
      maxRetriesPerEndpoint: overrides?.maxRetriesPerEndpoint ?? this._maxRetriesPerEndpoint,
      backoffBaseMs: overrides?.backoffBaseMs ?? this._backoffBaseMs,
    });
    return result.result;
  }

  public async callWithFallback<TResult = unknown>(options: RpcCallOptions): Promise<RpcCallResult<TResult>> {
    const candidates = this.getCandidateEndpoints();
    const timeoutMs = options.timeoutMs ?? this._timeoutMs;
    const maxRetries = options.maxRetriesPerEndpoint ?? this._maxRetriesPerEndpoint;
    const backoffBase = options.backoffBaseMs ?? this._backoffBaseMs;
    const errors: string[] = [];
    let attempts = 0;

    for (const endpoint of candidates) {
      const diag = this._diagnostics.get(endpoint);
      if (diag) {
        diag.totalCalls++;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attempts++;
        const startTime = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        try {
          const response = await this._fetchFn(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: attempts,
              method: options.method,
              params: options.params ?? [],
            }),
            signal: controller.signal,
          });

          const latencyMs = Math.max(1, Date.now() - startTime);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }

          const data = (await response.json()) as {
            result?: TResult;
            error?: { code?: number; message?: string };
          };

          if (data.error) {
            throw new Error(`RPC Error (${data.error.code ?? "unknown"}): ${data.error.message ?? "Unknown error"}`);
          }

          if (diag) {
            diag.isHealthy = true;
            diag.latencyMs = latencyMs;
            diag.consecutiveFailures = 0;
            diag.isInCooldown = false;
            diag.lastSuccessTime = Date.now();
          }

          return {
            result: data.result as TResult,
            endpointUsed: endpoint,
            latencyMs,
            attempts,
          };
        } catch (err) {
          const hasAborted = controller.signal.aborted;
          const msg = hasAborted ? `Timeout after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err);
          errors.push(`[${endpoint} #${attempt + 1}: ${msg}]`);

          if (attempt < maxRetries) {
            const delay = backoffBase * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } finally {
          clearTimeout(timer);
        }
      }

      // Endpoint exhausted its retries -> cool down
      if (diag) {
        diag.isHealthy = false;
        diag.consecutiveFailures++;
        diag.totalFailures++;
        diag.lastFailureTime = Date.now();
        diag.isInCooldown = true;
      }
    }

    throw new Error(`RpcFallbackProvider exhausted all candidate endpoints (${attempts} attempts): ${errors.join(", ")}`);
  }
}
