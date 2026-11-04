import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRpcUrl,
  getRpcUrl,
  rpcHealthCheck,
  getHealthyRpcUrl,
  getResolvedRpcUrl,
  callRpcWithFallback,
  RpcFallbackProvider,
  DEFAULT_MAINNET_FALLBACK_RPCS,
  DEFAULT_LOCAL_NODE_URL,
} from "../src/utils/rpcFallbackProvider";

test("validateRpcUrl validates well-formed http and https URLs", () => {
  const valid1 = validateRpcUrl("https://rpc.ubq.fi");
  assert.equal(valid1.isValid, true);
  assert.equal(valid1.normalizedUrl, "https://rpc.ubq.fi");

  const valid2 = validateRpcUrl("http://localhost:8545/");
  assert.equal(valid2.isValid, true);
  assert.equal(valid2.normalizedUrl, "http://localhost:8545");

  const valid3 = validateRpcUrl("https://eth-mainnet.alchemyapi.io/v2/KEY_123");
  assert.equal(valid3.isValid, true);
  assert.equal(valid3.normalizedUrl, "https://eth-mainnet.alchemyapi.io/v2/KEY_123");
});

test("validateRpcUrl rejects malformed, empty, and non-http protocols", () => {
  assert.equal(validateRpcUrl("").isValid, false);
  assert.equal(validateRpcUrl("   ").isValid, false);
  assert.equal(validateRpcUrl(undefined).isValid, false);
  assert.equal(validateRpcUrl("not-a-url").isValid, false);

  const wsCheck = validateRpcUrl("ws://localhost:8545");
  assert.equal(wsCheck.isValid, false);
  assert.match(wsCheck.error ?? "", /Unsupported RPC protocol "ws:"/);

  const ftpCheck = validateRpcUrl("ftp://rpc.example.com");
  assert.equal(ftpCheck.isValid, false);
});

test("getRpcUrl handles local-node, env fallback, and invalid URL recovery", () => {
  // local-node mode
  const localUrl = getRpcUrl({ mode: "local-node" });
  assert.equal(localUrl, DEFAULT_LOCAL_NODE_URL);

  // default fallback when none provided
  const fallbackUrl = getRpcUrl({ rawUrl: "" });
  assert.equal(fallbackUrl, DEFAULT_MAINNET_FALLBACK_RPCS[0]);

  // valid URL provided
  const custom = getRpcUrl("https://my-custom-rpc.example.com");
  assert.equal(custom, "https://my-custom-rpc.example.com");

  // invalid URL provided falls back with warning
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    const recovered = getRpcUrl({ rawUrl: "broken::url", defaultUrl: "https://safe-rpc.example.com" });
    assert.equal(recovered, "https://safe-rpc.example.com");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Configured RPC URL "broken::url" is invalid/);
  } finally {
    console.warn = originalWarn;
  }
});

test("rpcHealthCheck detects healthy endpoints and parses chain IDs", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: "0x1",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const status = await rpcHealthCheck("https://rpc.ubq.fi", {
    fetchFn: mockFetch,
    expectedChainId: 1,
  });

  assert.equal(status.isHealthy, true);
  assert.equal(status.chainId, 1);
  assert.equal(status.endpoint, "https://rpc.ubq.fi");
  assert.ok(status.latencyMs >= 0);
  assert.equal(status.error, undefined);
});

test("rpcHealthCheck reports chainId mismatch", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: "0x7a69", // 31337
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const status = await rpcHealthCheck("http://localhost:8545", {
    fetchFn: mockFetch,
    expectedChainId: 1,
  });

  assert.equal(status.isHealthy, false);
  assert.equal(status.chainId, 31337);
  assert.match(status.error ?? "", /ChainId mismatch: expected 1, got 31337/);
});

test("rpcHealthCheck handles HTTP 500, RPC errors, and timeouts gracefully", async () => {
  // HTTP 500
  const serverErrorFetch: typeof fetch = async () => {
    return new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
  };
  const status500 = await rpcHealthCheck("https://failing-rpc.com", { fetchFn: serverErrorFetch });
  assert.equal(status500.isHealthy, false);
  assert.match(status500.error ?? "", /HTTP 500/);

  // RPC error response
  const rpcErrorFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "Execution reverted" },
      }),
      { status: 200 }
    );
  };
  const statusRpcErr = await rpcHealthCheck("https://reverting-rpc.com", { fetchFn: rpcErrorFetch });
  assert.equal(statusRpcErr.isHealthy, false);
  assert.match(statusRpcErr.error ?? "", /RPC Error \(-32000\): Execution reverted/);

  // Network throw
  const networkThrowFetch: typeof fetch = async () => {
    throw new Error("Connection reset by peer");
  };
  const statusThrow = await rpcHealthCheck("https://down-rpc.com", { fetchFn: networkThrowFetch });
  assert.equal(statusThrow.isHealthy, false);
  assert.match(statusThrow.error ?? "", /Connection reset by peer/);
});

test("getHealthyRpcUrl returns the first passing endpoint and skips failing ones", async () => {
  const endpoints = ["https://down-1.com", "https://down-2.com", "https://healthy-3.com"];
  const mockFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes("healthy-3")) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });
    }
    return new Response("Not Available", { status: 503, statusText: "Service Unavailable" });
  };

  const healthy = await getHealthyRpcUrl(endpoints, { fetchFn: mockFetch });
  assert.equal(healthy, "https://healthy-3.com");
});

test("getHealthyRpcUrl throws if all candidates fail", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response("Error", { status: 500 });
  };

  await assert.rejects(
    async () => {
      await getHealthyRpcUrl(["https://down-1.com", "https://down-2.com"], { fetchFn: mockFetch });
    },
    /All candidate RPC endpoints failed health checks/
  );
});

test("getResolvedRpcUrl respects local-node mode and probes health safely", async () => {
  const localUrl = await getResolvedRpcUrl({ mode: "local-node", probeHealth: false });
  assert.equal(localUrl, DEFAULT_LOCAL_NODE_URL);

  const devUrl = await getResolvedRpcUrl({
    mode: "dev",
    rawUrl: "https://custom.rpc.io",
    probeHealth: false,
  });
  assert.equal(devUrl, "https://custom.rpc.io");
});

test("callRpcWithFallback completes call on primary or hands off to fallback", async () => {
  let callCountPrimary = 0;
  let callCountFallback = 0;

  const mockFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes("primary")) {
      callCountPrimary++;
      return new Response("Rate limit exceeded", { status: 429, statusText: "Too Many Requests" });
    }
    if (urlStr.includes("fallback")) {
      callCountFallback++;
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { blockNumber: "0x12345" },
        }),
        { status: 200 }
      );
    }
    throw new Error("Unknown host");
  };

  const result = await callRpcWithFallback<{ blockNumber: string }>(
    ["https://primary.rpc.io", "https://fallback.rpc.io"],
    {
      method: "eth_getBlockByNumber",
      params: ["latest", false],
      maxRetriesPerEndpoint: 1,
      backoffBaseMs: 10,
    },
    mockFetch
  );

  assert.equal(result.endpointUsed, "https://fallback.rpc.io");
  assert.deepEqual(result.result, { blockNumber: "0x12345" });
  assert.ok(callCountPrimary >= 1);
  assert.equal(callCountFallback, 1);
});

test("callRpcWithFallback throws when all endpoints fail", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response("Gateway Timeout", { status: 504, statusText: "Gateway Timeout" });
  };

  await assert.rejects(
    async () => {
      await callRpcWithFallback(
        ["https://rpc-1.test", "https://rpc-2.test"],
        { method: "eth_chainId", maxRetriesPerEndpoint: 0 },
        mockFetch
      );
    },
    /All RPC endpoints failed/
  );
});

test("RpcFallbackProvider manages fallback lists, circuit breaker cooldown, and diagnostics", async () => {
  const failingPrimary = "https://failing-primary.test";
  const healthyFallback = "https://healthy-backup.test";

  let failingAttempts = 0;
  let backupAttempts = 0;

  const mockFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes("failing-primary")) {
      failingAttempts++;
      return new Response("Node syncing", { status: 503, statusText: "Service Unavailable" });
    }
    if (urlStr.includes("healthy-backup")) {
      backupAttempts++;
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x1",
        }),
        { status: 200 }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  const provider = new RpcFallbackProvider({
    primaryUrl: failingPrimary,
    fallbackUrls: [healthyFallback],
    maxRetriesPerEndpoint: 0,
    cooldownMs: 50000,
    fetchFn: mockFetch,
  });

  assert.deepEqual(provider.getEndpoints(), [failingPrimary, healthyFallback]);

  // First call should try failingPrimary, fail, then hand off to healthyBackup
  const call1 = await provider.callWithFallback<string>({ method: "eth_chainId" });
  assert.equal(call1.result, "0x1");
  assert.equal(call1.endpointUsed, healthyFallback);
  assert.equal(failingAttempts, 1);
  assert.equal(backupAttempts, 1);

  // Check diagnostics: failingPrimary should now be in cooldown!
  const diagnostics = provider.getEndpointDiagnostics();
  const primaryDiag = diagnostics.find((d) => d.endpoint === failingPrimary);
  const backupDiag = diagnostics.find((d) => d.endpoint === healthyFallback);

  assert.ok(primaryDiag);
  assert.equal(primaryDiag.isInCooldown, true);
  assert.equal(primaryDiag.consecutiveFailures, 1);

  assert.ok(backupDiag);
  assert.equal(backupDiag.isInCooldown, false);
  assert.equal(backupDiag.consecutiveFailures, 0);

  // Second call: failingPrimary is cooled down, so provider directly routes to healthyBackup!
  const call2 = await provider.callWithFallback<string>({ method: "eth_chainId" });
  assert.equal(call2.result, "0x1");
  assert.equal(call2.endpointUsed, healthyFallback);
  // failingAttempts should NOT have increased because it was skipped via circuit breaker cooldown
  assert.equal(failingAttempts, 1);
  assert.equal(backupAttempts, 2);

  // send() method helper
  const sendRes = await provider.send<string>("eth_chainId");
  assert.equal(sendRes, "0x1");

  // Dynamic add/remove fallback
  assert.equal(provider.addFallback("https://third-rpc.test"), true);
  assert.ok(provider.getEndpoints().includes("https://third-rpc.test"));
  assert.equal(provider.removeFallback("https://third-rpc.test"), true);
  assert.ok(!provider.getEndpoints().includes("https://third-rpc.test"));
});

test("RpcFallbackProvider rankEndpointsByLatency probes and orders endpoints by latency", async () => {
  const fastUrl = "https://fast.rpc.test";
  const slowUrl = "https://slow.rpc.test";

  const mockFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes("slow")) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });
  };

  const provider = new RpcFallbackProvider({
    primaryUrl: slowUrl,
    fallbackUrls: [fastUrl],
    fetchFn: mockFetch,
  });

  const ranked = await provider.rankEndpointsByLatency();
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0], fastUrl);
  assert.equal(ranked[1], slowUrl);
});
