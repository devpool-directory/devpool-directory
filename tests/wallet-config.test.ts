import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  __resetRpcRuntimeForTests,
  getResolvedRpcBaseUrl,
  initializeRpcRuntime,
  setResolvedRpcUrl,
  RPC_URL,
} from "../src/utils/rpc-runtime";
import {
  anvil,
  createClient,
  createRpcTransport,
  createTransport,
  custom,
  dynamicRpcTransport,
  fallback,
  getChainRpcUrl,
  getRpcTransportUrls,
  http,
  mainnet,
  transports,
} from "../src/wallet/config";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  __resetRpcRuntimeForTests();
});

describe("getChainRpcUrl", () => {
  it("appends chain id for mainnet endpoints in non-local mode", () => {
    assert.equal(getChainRpcUrl("https://rpc.ubq.fi", 1, false), "https://rpc.ubq.fi/1");
  });

  it("preserves URL query strings and fragments while appending chain id", () => {
    assert.equal(
      getChainRpcUrl("https://rpc.example/v1?key=secret#anchor", 1, false),
      "https://rpc.example/v1/1?key=secret#anchor"
    );
  });

  it("does not append chain id when localNode is true", () => {
    assert.equal(getChainRpcUrl("http://localhost:8545", 31337, true), "http://localhost:8545");
  });
});

describe("getRpcTransportUrls", () => {
  it("returns primary URL and fallbacks with chain id appended", () => {
    const urls = getRpcTransportUrls(mainnet, {
      rpcUrl: "https://primary.example",
      fallbackUrls: ["https://fallback.example"],
      localNode: false,
    });
    assert.deepEqual(urls, [
      "https://primary.example/1",
      "https://fallback.example/1",
    ]);
  });

  it("deduplicates identical resolved URLs", () => {
    const urls = getRpcTransportUrls(mainnet, {
      rpcUrl: "https://primary.example",
      fallbackUrls: ["https://primary.example"],
      localNode: false,
    });
    assert.deepEqual(urls, ["https://primary.example/1"]);
  });

  it("returns only primary in local-node mode", () => {
    const urls = getRpcTransportUrls(anvil, {
      rpcUrl: "http://localhost:8545",
      fallbackUrls: ["http://fallback.local:8545"],
      localNode: true,
    });
    assert.deepEqual(urls, ["http://localhost:8545"]);
  });
});

describe("dynamicRpcTransport per-request resolution", () => {
  it("switches the selected endpoint after client creation and observes the next request on the new endpoint", async () => {
    let currentRpcUrl = "https://primary.example";
    const calls: string[] = [];

    const createTransportFactory = () => {
      const endpoint = currentRpcUrl;
      return [
        custom({
          async request({ method }) {
            calls.push(`${endpoint}:${method}`);
            return "0x1";
          },
        }),
      ];
    };

    // Client is created and memoized once
    const client = createClient({
      chain: mainnet,
      transport: dynamicRpcTransport(createTransportFactory),
    });

    // First request reaches the primary endpoint
    await client.request({ method: "eth_chainId" });
    assert.deepEqual(calls, ["https://primary.example:eth_chainId"]);

    // Endpoint is switched dynamically after client construction (e.g. background health check completes)
    currentRpcUrl = "https://fallback.example";

    // Second request through the SAME client reaches the NEW endpoint
    await client.request({ method: "eth_chainId" });
    assert.deepEqual(calls, [
      "https://primary.example:eth_chainId",
      "https://fallback.example:eth_chainId",
    ]);
  });

  it("falls back to secondary transport when primary rejects in multi-transport config", async () => {
    const calls: string[] = [];
    const primary = custom({
      async request() {
        calls.push("primary");
        throw new Error("Primary failed");
      },
    });
    const secondary = custom({
      async request() {
        calls.push("secondary");
        return "0x1";
      },
    });

    const client = createClient({
      chain: mainnet,
      transport: dynamicRpcTransport(() => [primary, secondary]),
    });

    const result = await client.request({ method: "eth_chainId" });
    assert.equal(result, "0x1");
    assert.deepEqual(calls, ["primary", "secondary"]);
  });

  it("provides a valid request function on both transport and config", async () => {
    const transport = dynamicRpcTransport(() => [
      custom({
        async request() {
          return "0x1";
        },
      }),
    ]);
    const instance = transport({ chain: mainnet });
    assert.equal(typeof instance.request, "function");
    assert.equal(typeof instance.config.request, "function");

    const client = createClient({
      chain: mainnet,
      transport,
    });
    assert.equal(typeof client.transport.request, "function");
    const res = await client.transport.request({ method: "eth_chainId" });
    assert.equal(res, "0x1");
  });

  it("integrates with rpc-runtime state updates via setResolvedRpcUrl and initializeRpcRuntime", async () => {
    const requestedUrls: string[] = [];

    const mockFetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        requestedUrls.push(url);
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
      }
      // health check probe
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;

    // Build client using module-level transports map
    const client = createClient({
      chain: mainnet,
      transport: dynamicRpcTransport(() =>
        getRpcTransportUrls(mainnet, { rpcUrl: getResolvedRpcBaseUrl() || RPC_URL }).map((url) =>
          http(url, { fetcher: mockFetcher })
        )
      ),
    });

    // Initial request routes to default RPC_URL
    await client.request({ method: "eth_blockNumber" });
    assert.equal(requestedUrls[0], `${RPC_URL}/1`);

    // Switch endpoint dynamically via runtime state
    setResolvedRpcUrl("https://dynamic-fallback.example");

    // Next request from the same client routes to dynamic fallback
    await client.request({ method: "eth_blockNumber" });
    assert.equal(requestedUrls[1], "https://dynamic-fallback.example/1");
  });
});
