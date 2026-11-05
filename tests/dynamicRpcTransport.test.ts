import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dynamicRpcTransport,
  fallback,
  custom,
  createClient,
  getRpcTransportUrls,
  getChainRpcUrl,
  type Transport,
  MAINNET_CHAIN_ID,
  ANVIL_CHAIN_ID,
  RPC_URL,
  RPC_FALLBACK_URLS,
} from "../src/utils/dynamicRpcTransport";

test("dynamicRpcTransport passes unevaluated transport factories to viem fallback and exercises fallback when primary fails", async () => {
  const calls: string[] = [];
  const primaryTransport = custom({
    async request() {
      calls.push("primary");
      throw new Error("primary RPC failed (rate limit / 429)");
    },
  });
  const fallbackTransport = custom({
    async request() {
      calls.push("fallback");
      return "0x1";
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID, name: "Ethereum Mainnet" },
    transport: dynamicRpcTransport(() => [primaryTransport, fallbackTransport]),
  });

  const result = await client.request({ method: "eth_chainId" });
  assert.equal(result, "0x1");
  assert.deepEqual(calls, ["primary", "fallback"]);
});

test("passing already-evaluated transport instances directly to viem fallback throws TypeError: fn is not a function", () => {
  const primaryTransport = custom({
    async request() {
      return "0x1";
    },
  });

  // Evaluating transport factory prematurely results in a TransportConfig object, not a factory function
  const evaluatedInstance = primaryTransport() as unknown as Transport;

  assert.throws(
    () => {
      // viem's fallback expects Transport[] (factories), calling it with an evaluated instance throws TypeError
      const fallbackFactory = fallback([evaluatedInstance]);
      fallbackFactory();
    },
    {
      name: "TypeError",
      message: /is not a function/,
    }
  );
});

test("dynamicRpcTransport returns primary transport result directly when no fallback exists", async () => {
  const calls: string[] = [];
  const primaryTransport = custom({
    async request() {
      calls.push("primary");
      return "0x1";
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID, name: "Ethereum Mainnet" },
    transport: dynamicRpcTransport(() => [primaryTransport]),
  });

  const result = await client.request({ method: "eth_chainId" });
  assert.equal(result, "0x1");
  assert.deepEqual(calls, ["primary"]);
});

test("dynamicRpcTransport cascades through multiple fallback endpoints in order until one succeeds", async () => {
  const calls: string[] = [];
  const t1 = custom({
    async request() {
      calls.push("endpoint-1");
      throw new Error("endpoint 1 down");
    },
  });
  const t2 = custom({
    async request() {
      calls.push("endpoint-2");
      throw new Error("endpoint 2 timeout");
    },
  });
  const t3 = custom({
    async request() {
      calls.push("endpoint-3");
      return "0x539";
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID },
    transport: dynamicRpcTransport(() => [t1, t2, t3]),
  });

  const result = await client.request({ method: "eth_chainId" });
  assert.equal(result, "0x539");
  assert.deepEqual(calls, ["endpoint-1", "endpoint-2", "endpoint-3"]);
});

test("dynamicRpcTransport throws if all fallback endpoints fail", async () => {
  const t1 = custom({
    async request() {
      throw new Error("primary failed");
    },
  });
  const t2 = custom({
    async request() {
      throw new Error("fallback failed");
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID },
    transport: dynamicRpcTransport(() => [t1, t2]),
  });

  await assert.rejects(
    async () => {
      await client.request({ method: "eth_chainId" });
    },
    {
      message: "fallback failed",
    }
  );
});

test("dynamicRpcTransport throws error if transport list is empty", () => {
  assert.throws(
    () => {
      const transport = dynamicRpcTransport(() => []);
      transport();
    },
    {
      message: /No RPC transport URL is available/,
    }
  );
});

test("getChainRpcUrl appends chain id in standard mode and preserves local node URLs", () => {
  assert.equal(getChainRpcUrl("https://rpc.ubq.fi", 1, false), "https://rpc.ubq.fi/1");
  assert.equal(getChainRpcUrl("https://rpc.ubq.fi/", 1, false), "https://rpc.ubq.fi/1");
  assert.equal(getChainRpcUrl("http://localhost:8545", 31337, true), "http://localhost:8545");
});

test("getRpcTransportUrls normalizes, falls back, and deduplicates endpoint URLs", () => {
  const defaultUrls = getRpcTransportUrls(MAINNET_CHAIN_ID);
  assert.equal(defaultUrls[0], `${RPC_URL}/${MAINNET_CHAIN_ID}`);
  assert.equal(defaultUrls.length, 1 + RPC_FALLBACK_URLS.length);

  const localUrls = getRpcTransportUrls(ANVIL_CHAIN_ID, {
    rpcUrl: "http://127.0.0.1:8545",
    localNode: true,
  });
  assert.deepEqual(localUrls, ["http://127.0.0.1:8545"]);

  const dedupedUrls = getRpcTransportUrls(MAINNET_CHAIN_ID, {
    rpcUrl: "https://rpc.ubq.fi",
    fallbackUrls: ["https://rpc.ubq.fi", "https://eth.llamarpc.com"],
  });
  assert.deepEqual(dedupedUrls, ["https://rpc.ubq.fi/1", "https://eth.llamarpc.com/1"]);
});
