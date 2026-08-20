/**
 * RPC Robustness & Fallback – Handoff
 *
 * Provides hardened RPC configuration with validation, fallback lists,
 * timeouts, and health checks for stake.ubq.fi integration.
 *
 * Addresses: devpool-directory#5969 / ubiquity/stake.ubq.fi#9
 */

export type RpcMode = "dev" | "local-node" | "prod";

export interface RpcHealthStatus {
  healthy: boolean;
  chainId: number | null;
  latencyMs: number;
  error?: string;
  endpoint: string;
}

export interface RpcConfig {
  mode: RpcMode;
  primaryUrl: string;
  fallbackUrls: string[];
  timeoutMs: number;
  chainId: number;
}

const DEFAULT_MAINNET_FALLBACKS = [
  "https://rpc.ubq.fi",
  "https://mainnet.infura.io/v3/public",
];

const LOCAL_NODE_URL = "http://localhost:8545";
const LOCAL_CHAIN_ID = 31337;

export function validateRpcUrl(url: string, mode: RpcMode): { valid: boolean; warning?: string } {
  if (mode === "local-node") {
    if (url !== LOCAL_NODE_URL) {
      return {
        valid: true,
        warning: `local-node mode expects ${LOCAL_NODE_URL} but got ${url}. Using provided URL.`,
      };
    }
    return { valid: true };
  }

  if (mode === "prod") {
    if (url.startsWith("http")) {
      return {
        valid: false,
        warning: `prod mode should use relative path '/rpc', not absolute URL '${url}'.`,
      };
    }
    return { valid: true };
  }

  // dev mode
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return {
      valid: false,
      warning: `Invalid VITE_RPC_URL format in dev mode: '${url}'. Expected a valid HTTP(S) URL.`,
    };
  }
}

export function resolveRpcConfig(
  mode: RpcMode,
  envRpcUrl?: string,
  customFallbacks?: string[],
  timeoutMs = 2000,
  chainId = 1
): RpcConfig {
  let primaryUrl: string;
  let fallbackUrls: string[] = [];

  switch (mode) {
    case "local-node":
      primaryUrl = LOCAL_NODE_URL;
      break;
    case "prod":
      primaryUrl = "/rpc";
      break;
    case "dev":
    default:
      primaryUrl = envRpcUrl || "";
      const validation = validateRpcUrl(primaryUrl, mode);
      if (!validation.valid || validation.warning) {
        console.warn(`[RPC Config] ${validation.warning || "Validation failed"}`);
        if (!validation.valid) {
          fallbackUrls = customFallbacks || DEFAULT_MAINNET_FALLBACKS;
          primaryUrl = fallbackUrls[0] || "";
          console.warn(`[RPC Config] Falling back to: ${primaryUrl}`);
        }
      }
      if (!primaryUrl) {
        fallbackUrls = customFallbacks || DEFAULT_MAINNET_FALLBACKS;
        primaryUrl = fallbackUrls[0] || "";
        console.warn(`[RPC Config] No VITE_RPC_URL set. Using fallback: ${primaryUrl}`);
      }
      break;
  }

  return {
    mode,
    primaryUrl,
    fallbackUrls: mode === "local-node" ? [] : (customFallbacks || DEFAULT_MAINNET_FALLBACKS),
    timeoutMs,
    chainId: mode === "local-node" ? LOCAL_CHAIN_ID : chainId,
  };
}

export async function rpcHealthCheck(
  endpoint: string,
  expectedChainId?: number,
  timeoutMs = 2000
): Promise<RpcHealthStatus> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        healthy: false,
        chainId: null,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
        endpoint,
      };
    }

    const data = await response.json();
    const chainIdHex = data.result as string | undefined;
    const chainId = chainIdHex ? parseInt(chainIdHex, 16) : null;

    if (expectedChainId !== undefined && chainId !== expectedChainId) {
      return {
        healthy: false,
        chainId,
        latencyMs,
        error: `Chain ID mismatch: expected ${expectedChainId}, got ${chainId}`,
        endpoint,
      };
    }

    return { healthy: true, chainId, latencyMs, endpoint };
  } catch (error) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      chainId: null,
      latencyMs,
      error: message.includes("aborted") ? "Request timed out" : message,
      endpoint,
    };
  }
}

export async function findHealthyRpc(
  config: RpcConfig
): Promise<{ endpoint: string; status: RpcHealthStatus }> {
  const endpoints = [config.primaryUrl, ...config.fallbackUrls];

  for (const endpoint of endpoints) {
    const status = await rpcHealthCheck(endpoint, config.chainId, config.timeoutMs);
    if (status.healthy) {
      return { endpoint, status };
    }
    console.warn(`[RPC Health] ${endpoint} unhealthy: ${status.error}`);
  }

  const lastEndpoint = endpoints[endpoints.length - 1] || config.primaryUrl;
  const lastStatus = await rpcHealthCheck(lastEndpoint, undefined, config.timeoutMs);
  return { endpoint: lastEndpoint, status: lastStatus };
}
