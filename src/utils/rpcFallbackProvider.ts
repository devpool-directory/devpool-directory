export interface RpcCallOptions {
  method: string;
  params?: unknown[];
  timeoutMs?: number;
}

export async function callRpcWithFallback<T = unknown>(
  rpcUrls: string[],
  options: RpcCallOptions
): Promise<{ result: T; endpointUsed: string }> {
  if (!rpcUrls.length) {
    throw new Error("No RPC endpoints configured");
  }
  const timeoutMs = options.timeoutMs ?? 8000;
  let lastError: unknown = null;

  for (const endpoint of rpcUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: options.method,
          params: options.params ?? [],
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { result?: T; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message ?? "RPC error");
      return { result: data.result as T, endpointUsed: endpoint };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All RPC endpoints failed");
}
