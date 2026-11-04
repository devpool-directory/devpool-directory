export type RpcHealthStatus =
  | "healthy"
  | "mismatched-chain"
  | "invalid-url"
  | "rpc-error"
  | "unreachable"
  | "timeout"
  | "aborted";

export type RpcHealthCheckResult = {
  status: RpcHealthStatus;
  rpcUrl: string;
  chainId?: number;
  chainIdHex?: string;
  latencyMs: number;
  error?: string;
};

export type RpcHealthCheckOptions = {
  expectedChainId?: number;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Short bounded probe timeout so startup is never blocked by a dead endpoint. */
export const DEFAULT_RPC_HEALTH_TIMEOUT_MS = 1_500;

export type RpcResponsePayload = {
  error?: { message?: string };
  result?: unknown;
};

export type RpcUrlValidation = {
  valid: boolean;
  reason?: string;
};

const stripTrailingSlashes = (value: string): string => (value === "/" ? value : value.replace(/\/+$/, ""));

const splitUrlSuffix = (value: string): [string, string] => {
  const indexes = [value.indexOf("?"), value.indexOf("#")].filter((index) => index >= 0);
  if (indexes.length === 0) return [value, ""];
  const suffixIndex = Math.min(...indexes);
  return [value.slice(0, suffixIndex), value.slice(suffixIndex)];
};

/**
 * Validates a configured RPC base URL and reports a typed reason when it is rejected.
 * Protocol-relative URLs ("//host") are rejected because they silently switch origins.
 */
export function validateRpcUrl(value: string): RpcUrlValidation {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, reason: "RPC URL is empty" };
  }

  if (trimmed.startsWith("//")) {
    return { valid: false, reason: "Protocol-relative RPC URLs are not supported" };
  }

  if (trimmed.startsWith("/")) {
    return { valid: true };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, reason: `RPC URL must use http or https, received "${parsed.protocol}"` };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "RPC URL must be an absolute http(s) URL or a relative path" };
  }
}

export const isValidRpcUrl = (value: string): boolean => validateRpcUrl(value).valid;

/** Removes trailing slashes from the base part while preserving any query string or hash. */
export const normalizeRpcBaseUrl = (value: string): string => {
  const [base, suffix] = splitUrlSuffix(value.trim());
  return `${stripTrailingSlashes(base)}${suffix}`;
};

/**
 * Builds a chain-aware RPC URL. The chain path is inserted before any query string
 * ("https://rpc.example/rpc?key=abc" -> "https://rpc.example/rpc/1?key=abc") and is skipped
 * entirely in local-node mode because local development nodes typically do not serve chain paths.
 */
export function getChainRpcUrl(rpcUrl: string, chainId: number, localNode = false): string {
  const [base, suffix] = splitUrlSuffix(normalizeRpcBaseUrl(rpcUrl));
  return localNode ? `${base}${suffix}` : `${base}/${chainId}${suffix}`;
}

const parseChainId = (value: unknown): { chainId: number; chainIdHex: string } | null => {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  const parsed = Number.parseInt(value.slice(2), 16);
  if (!Number.isFinite(parsed)) return null;
  return { chainId: parsed, chainIdHex: value };
};

/**
 * Executes a complete fetch and response decoding raced against a deadline.
 * Both HTTP header retrieval and full JSON body decoding are bounded by timeoutMs and callerSignal.
 */
export async function fetchAndDecodeWithDeadline(
  fetcher: typeof fetch,
  rpcUrl: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal?: AbortSignal
): Promise<{ ok: boolean; status: number; payload?: RpcResponsePayload }> {
  const controller = new AbortController();

  let timer: NodeJS.Timeout | ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let onCallerAbort: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      const err = new Error(`Timed out after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
  });

  const abortPromise = new Promise<never>((_, reject) => {
    if (callerSignal?.aborted) {
      controller.abort();
      const err = new Error("Health check was aborted before it started");
      err.name = "AbortError";
      reject(err);
      return;
    }
    if (callerSignal) {
      onCallerAbort = () => {
        controller.abort();
        const err = new Error("Health check aborted");
        err.name = "AbortError";
        reject(err);
      };
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  });

  const operationPromise = (async () => {
    const response = await fetcher(rpcUrl, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const payload = (await response.json()) as RpcResponsePayload;
    return { ok: true, status: response.status, payload };
  })();

  try {
    return await Promise.race([operationPromise, timeoutPromise, abortPromise]);
  } catch (error) {
    if (timedOut) {
      const err = new Error(`Timed out after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      throw err;
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (callerSignal && onCallerAbort) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

/**
 * Probes an RPC endpoint with a minimal `eth_chainId` JSON-RPC call and a short bounded timeout.
 * The complete fetch and body decoding operation is raced against the deadline.
 * The result is always typed; the probe never throws, so callers can safely count failures.
 */
export async function rpcHealthCheck(rpcUrl: string, options: RpcHealthCheckOptions = {}): Promise<RpcHealthCheckResult> {
  const { expectedChainId, fetcher = fetch, signal, timeoutMs = DEFAULT_RPC_HEALTH_TIMEOUT_MS } = options;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  if (!isValidRpcUrl(rpcUrl)) {
    return {
      status: "invalid-url",
      rpcUrl,
      latencyMs: elapsed(),
      error: "RPC URL must be an absolute http(s) URL or a relative path",
    };
  }

  if (signal?.aborted) {
    return {
      status: "aborted",
      rpcUrl,
      latencyMs: elapsed(),
      error: "Health check was aborted before it started",
    };
  }

  try {
    const result = await fetchAndDecodeWithDeadline(
      fetcher,
      rpcUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      },
      timeoutMs,
      signal
    );

    if (!result.ok) {
      return {
        status: "unreachable",
        rpcUrl,
        latencyMs: elapsed(),
        error: `HTTP ${result.status}`,
      };
    }

    const payload = result.payload;
    if (!payload) {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs: elapsed(),
        error: "Missing response payload",
      };
    }

    if (payload.error) {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs: elapsed(),
        error: payload.error.message ?? "RPC responded with an error",
      };
    }

    const parsed = parseChainId(payload.result);
    if (!parsed) {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs: elapsed(),
        error: "Invalid eth_chainId response",
      };
    }

    if (expectedChainId !== undefined && parsed.chainId !== expectedChainId) {
      return {
        status: "mismatched-chain",
        rpcUrl,
        chainId: parsed.chainId,
        chainIdHex: parsed.chainIdHex,
        latencyMs: elapsed(),
        error: `Expected chain ${expectedChainId}, got ${parsed.chainId}`,
      };
    }

    return {
      status: "healthy",
      rpcUrl,
      chainId: parsed.chainId,
      chainIdHex: parsed.chainIdHex,
      latencyMs: elapsed(),
    };
  } catch (error: any) {
    const isTimeout =
      error?.name === "TimeoutError" ||
      (typeof error?.message === "string" && error.message.includes("Timed out"));
    const isAborted =
      signal?.aborted ||
      error?.name === "AbortError" ||
      (typeof error?.message === "string" && error.message.includes("aborted"));

    const status: RpcHealthStatus = isTimeout ? "timeout" : isAborted ? "aborted" : "unreachable";
    return {
      status,
      rpcUrl,
      latencyMs: elapsed(),
      error: isTimeout
        ? `Timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
