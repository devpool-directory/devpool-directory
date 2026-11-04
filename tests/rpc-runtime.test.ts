import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  __resetRpcRuntimeForTests,
  getResolvedRpcBaseUrl,
  getRpcRuntimeState,
  initializeRpcRuntime,
} from "../src/utils/rpc-runtime";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  __resetRpcRuntimeForTests();
});

describe("initializeRpcRuntime", () => {
  it("keeps the primary candidate when the health probe passes", async () => {
    const probed: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      probed.push(String(input));
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;

    await initializeRpcRuntime({
      candidates: ["https://primary.example"],
      expectedChainId: 1,
      localNode: false,
      fetcher,
    });

    const state = getRpcRuntimeState();
    assert.deepEqual(probed, ["https://primary.example/1"]);
    assert.equal(state.resolvedRpcUrl, "https://primary.example");
    assert.equal(state.lastStatus, "healthy");
    assert.equal(state.lastChainId, 1);
    assert.equal(state.recentErrorCount, 0);
    assert.equal(state.initialized, true);
  });

  it("selects the first healthy fallback after primary failures", async () => {
    const probed: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      probed.push(url);
      if (url.startsWith("https://primary.example")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, error: { message: "primary down" } });
      }
      if (url.startsWith("https://fallback.example")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
      }
      return jsonResponse("unreachable", 500);
    }) as typeof fetch;

    await initializeRpcRuntime({
      candidates: ["https://primary.example", "https://fallback.example"],
      expectedChainId: 1,
      localNode: false,
      fetcher,
    });

    const state = getRpcRuntimeState();
    assert.equal(state.resolvedRpcUrl, "https://fallback.example");
    assert.equal(state.lastStatus, "healthy");
    assert.equal(state.lastChainId, 1);
    assert.equal(state.recentErrorCount, 1);
    assert.equal(state.initialized, true);
  });

  it("times out hanging body decoding on primary candidate and falls back to next candidate", async () => {
    const probed: string[] = [];

    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      probed.push(url);

      if (url.startsWith("https://hanging-primary.example")) {
        // Headers resolve immediately, but body decoding hangs
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise<never>((_, reject) => {
              init?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
            }),
        } as unknown as Response;
      }

      if (url.startsWith("https://healthy-secondary.example")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
      }

      return jsonResponse("unreachable", 500);
    }) as typeof fetch;

    await initializeRpcRuntime({
      candidates: ["https://hanging-primary.example", "https://healthy-secondary.example"],
      expectedChainId: 1,
      localNode: false,
      fetcher,
    });

    const state = getRpcRuntimeState();
    assert.equal(state.resolvedRpcUrl, "https://healthy-secondary.example");
    assert.equal(state.lastStatus, "healthy");
    assert.equal(state.lastChainId, 1);
    assert.equal(state.recentErrorCount, 1);
    assert.equal(state.initialized, true);
  });
});
