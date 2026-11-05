import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dynamicRpcTransport,
  fallback,
  custom,
  createClient,
  createWalletConfig,
  getRpcTransportUrls,
  getChainRpcUrl,
  wagmiConfig,
  MAINNET_CHAIN_ID,
  ANVIL_CHAIN_ID,
  RPC_URL,
} from "../src/wallet/config";

test("dynamicRpcTransport in wallet config: passes unevaluated transport factories to viem fallback and exercises the fallback entry when primary fails", async () => {
  const calls: string[] = [];
  const primaryTransport = custom({
    async request() {
      calls.push("primary");
      throw new Error("primary RPC failed");
    },
  });
  const fallbackTransport = custom({
    async request() {
      calls.push("fallback");
      return "0x1";
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID },
    transport: dynamicRpcTransport(() => [primaryTransport, fallbackTransport]),
  });

  const result = await client.request({ method: "eth_chainId" });
  assert.equal(result, "0x1");
  assert.deepEqual(calls, ["primary", "fallback"]);
});

test("dynamicRpcTransport in wallet config: returns primary transport result directly when no fallback exists", async () => {
  const calls: string[] = [];
  const primaryTransport = custom({
    async request() {
      calls.push("primary");
      return "0x1";
    },
  });

  const client = createClient({
    chain: { id: MAINNET_CHAIN_ID },
    transport: dynamicRpcTransport(() => [primaryTransport]),
  });

  const result = await client.request({ method: "eth_chainId" });
  assert.equal(result, "0x1");
  assert.deepEqual(calls, ["primary"]);
});

test("wagmiConfig creates dynamic transport configurations for all supported chains without pre-evaluating factories", () => {
  const customConfig = createWalletConfig(() => "https://custom-rpc.ubq.fi");
  assert.ok(customConfig.chains.length >= 2);
  assert.ok(typeof customConfig.transports[MAINNET_CHAIN_ID] === "function");
  assert.ok(typeof customConfig.transports[ANVIL_CHAIN_ID] === "function");

  // Instantiating mainnet transport returns fallback transport config
  const mainnetTransportInstance = customConfig.transports[MAINNET_CHAIN_ID]({
    chain: { id: MAINNET_CHAIN_ID },
  });
  assert.equal(mainnetTransportInstance.type, "fallback");
  assert.ok(Array.isArray((mainnetTransportInstance as any).transports));
  assert.ok((mainnetTransportInstance as any).transports.length > 1);

  // Instantiating anvil transport in local mode returns fallback with local node
  const anvilTransportInstance = customConfig.transports[ANVIL_CHAIN_ID]({
    chain: { id: ANVIL_CHAIN_ID },
  });
  assert.ok(anvilTransportInstance.type === "http" || anvilTransportInstance.type === "fallback");
});
