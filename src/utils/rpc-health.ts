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
    onCallerAbort = () => {
      controller.abort();
      const err = new Error("Health check was aborted by caller signal");
      err.name = "AbortError";
      reject(err);
    };
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  });

  const executionPromise = (async () => {
    const res = await fetcher(rpcUrl, {
      ...init,
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const payload = (await res.json()) as RpcResponsePayload;
    return { ok: true, status: res.status, payload };
  })();

  try {
    return await Promise.race([executionPromise, timeoutPromise, abortPromise]);
  } catch (err: unknown) {
    if (timedOut) {
      const timeoutErr = new Error(`Timed out after ${timeoutMs}ms`);
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    if (callerSignal?.aborted) {
      const abortErr = new Error("Health check was aborted by caller signal");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (onCallerAbort && callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

/**
 * Health-checks an RPC endpoint by requesting `eth_chainId`.
 * Validates format before making any HTTP requests.
 * Times out hanging responses quickly so the app does not stall.
 */
export async function rpcHealthCheck(
  rpcUrl: string,
  options: RpcHealthCheckOptions = {}
): Promise<RpcHealthCheckResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_HEALTH_TIMEOUT_MS;
  const callerSignal = options.signal;

  if (callerSignal?.aborted) {
    return {
      status: "aborted",
      rpcUrl,
      latencyMs: 0,
      error: "Health check was aborted before it started",
    };
  }

  const validation = validateRpcUrl(rpcUrl);
  if (!validation.valid) {
    return {
      status: "invalid-url",
      rpcUrl,
      latencyMs: 0,
      error: validation.reason,
    };
  }

  const fetcher = options.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetcher) {
    return {
      status: "unreachable",
      rpcUrl,
      latencyMs: 0,
      error: "No fetch implementation available in this environment",
    };
  }

  try {
    const { ok, status, payload } = await fetchAndDecodeWithDeadline(
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
      callerSignal
    );

    const latencyMs = Math.max(0, Date.now() - startedAt);

    if (!ok) {
      return {
        status: "unreachable",
        rpcUrl,
        latencyMs,
        error: `HTTP error ${status}`,
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs,
        error: "Malformed JSON-RPC response",
      };
    }

    if (payload.error) {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs,
        error: payload.error.message ?? "RPC Error returned by endpoint",
      };
    }

    const parsedChain = parseChainId(payload.result);
    if (!parsedChain) {
      return {
        status: "rpc-error",
        rpcUrl,
        latencyMs,
        error: `Unexpected eth_chainId payload result: ${JSON.stringify(payload.result)}`,
      };
    }

    if (options.expectedChainId !== undefined && parsedChain.chainId !== options.expectedChainId) {
      return {
        status: "mismatched-chain",
        rpcUrl,
        chainId: parsedChain.chainId,
        chainIdHex: parsedChain.chainIdHex,
        latencyMs,
        error: `Expected chain ID ${options.expectedChainId}, got ${parsedChain.chainId}`,
      };
    }

    return {
      status: "healthy",
      rpcUrl,
      chainId: parsedChain.chainId,
      chainIdHex: parsedChain.chainIdHex,
      latencyMs,
    };
  } catch (error: unknown) {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const errName = (error as { name?: string })?.name;
    const isTimeout =
      errName === "TimeoutError" ||
      (error instanceof Error && error.message.toLowerCase().includes("timed out"));
    const isAbort =
      callerSignal?.aborted ||
      errName === "AbortError" ||
      (error instanceof Error && error.message.toLowerCase().includes("abort"));

    if (isTimeout) {
      return {
        status: "timeout",
        rpcUrl,
        latencyMs,
        error: `Health check probe timed out after ${timeoutMs}ms`,
      };
    }

    if (isAbort) {
      return {
        status: "aborted",
        rpcUrl,
        latencyMs,
        error: "Health check was aborted",
      };
    }

    return {
      status: "unreachable",
      rpcUrl,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
