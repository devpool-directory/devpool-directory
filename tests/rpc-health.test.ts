import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_RPC_HEALTH_TIMEOUT_MS,
  rpcHealthCheck,
} from "../src/utils/rpc-health";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fetcherReturning = (body: unknown, status = 200): typeof fetch =>
  (async () => jsonResponse(body, status)) as typeof fetch;

const hangingFetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    });
  })) as typeof fetch;

describe("rpcHealthCheck", () => {
  it("returns a healthy result with the parsed chain id and latency", async () => {
    const result = await rpcHealthCheck("https://rpc.example", {
      expectedChainId: 1,
      fetcher: fetcherReturning({ jsonrpc: "2.0", id: 1, result: "0x1" }),
    });

    assert.equal(result.status, "healthy");
    assert.equal(result.chainId, 1);
    assert.equal(result.chainIdHex, "0x1");
    assert.ok(result.latencyMs >= 0);
  });

  it("detects an expectedChainId mismatch", async () => {
    const result = await rpcHealthCheck("https://rpc.example", {
      expectedChainId: 31337,
      fetcher: fetcherReturning({ jsonrpc: "2.0", id: 1, result: "0x1" }),
    });

    assert.equal(result.status, "mismatched-chain");
    assert.equal(result.chainId, 1);
    assert.ok(result.error?.includes("Expected chain 31337"));
  });

  it("reports HTTP failures as unreachable", async () => {
    const result = await rpcHealthCheck("https://rpc.example", {
      fetcher: fetcherReturning("nope", 502),
    });

    assert.equal(result.status, "unreachable");
    assert.equal(result.error, "HTTP 502");
  });

  it("reports JSON-RPC error payloads", async () => {
    const result = await rpcHealthCheck("https://rpc.example", {
      fetcher: fetcherReturning({
        jsonrpc: "2.0",
        id: 1,
        error: { message: "upstream failed" },
      }),
    });

    assert.equal(result.status, "rpc-error");
    assert.equal(result.error, "upstream failed");
  });

  it("rejects invalid and protocol-relative URLs before fetching", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;

    const invalid = await rpcHealthCheck("//rpc.example", { fetcher });

    assert.equal(invalid.status, "invalid-url");
    assert.equal(calls, 0);
  });

  it("times out hanging probes when connection hangs", async () => {
    const result = await rpcHealthCheck("https://rpc.example", {
      timeoutMs: 20,
      fetcher: hangingFetcher,
    });

    assert.equal(result.status, "timeout");
    assert.ok(result.error?.includes("Timed out"));
  });

  it("times out when response body decoding hangs past deadline (headers resolve immediately, body never finishes)", async () => {
    const hangingBodyFetcher = (async () => ({
      ok: true,
      status: 200,
      json: () => new Promise<never>(() => {}), // never resolves
    })) as unknown as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example", {
      timeoutMs: 30,
      fetcher: hangingBodyFetcher,
    });

    assert.equal(result.status, "timeout");
    assert.ok(result.error?.includes("Timed out after 30ms"));
  });

  it("times out when Response readable stream hangs past deadline", async () => {
    const streamFetcher = (async () => {
      const stream = new ReadableStream({
        start() {
          // never enqueues data or closes
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example", {
      timeoutMs: 30,
      fetcher: streamFetcher,
    });

    assert.equal(result.status, "timeout");
    assert.ok(result.error?.includes("Timed out after 30ms"));
  });

  it("honors an already-aborted caller signal without fetching", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    const result = await rpcHealthCheck("https://rpc.example", {
      fetcher,
      signal: controller.signal,
    });

    assert.equal(result.status, "aborted");
    assert.equal(calls, 0);
  });

  it("aborts an in-flight probe when the caller signal aborts", async () => {
    const controller = new AbortController();
    const pending = rpcHealthCheck("https://rpc.example", {
      fetcher: hangingFetcher,
      signal: controller.signal,
      timeoutMs: 5_000,
    });

    controller.abort();
    const result = await pending;

    assert.equal(result.status, "aborted");
  });

  it("exposes a short bounded default timeout", () => {
    assert.ok(DEFAULT_RPC_HEALTH_TIMEOUT_MS <= 2_000);
  });
});
