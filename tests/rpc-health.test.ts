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

const hangingFetcher = (() =>
  new Promise<Response>(() => {
    // Hangs intentionally
  })) as typeof fetch;

describe("rpcHealthCheck", () => {
  it("returns a healthy result with the parsed chain id and latency", async () => {
    const fetcher = (async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x1",
      })) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", {
      expectedChainId: 1,
      fetcher,
    });

    assert.equal(result.status, "healthy");
    assert.equal(result.chainId, 1);
    assert.equal(result.chainIdHex, "0x1");
    assert.equal(typeof result.latencyMs, "number");
    assert.ok(result.latencyMs >= 0);
  });

  it("detects an expectedChainId mismatch", async () => {
    const fetcher = (async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x5",
      })) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", {
      expectedChainId: 1,
      fetcher,
    });

    assert.equal(result.status, "mismatched-chain");
    assert.equal(result.chainId, 5);
  });

  it("reports HTTP failures as unreachable", async () => {
    const fetcher = (async () => jsonResponse("gateway timeout", 504)) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", { fetcher });

    assert.equal(result.status, "unreachable");
    assert.match(result.error ?? "", /HTTP error 504/);
  });

  it("reports JSON-RPC error payloads", async () => {
    const fetcher = (async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "Invalid request" },
      })) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", { fetcher });

    assert.equal(result.status, "rpc-error");
    assert.equal(result.error, "Invalid request");
  });

  it("rejects invalid and protocol-relative URLs before fetching", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;

    const resultRelative = await rpcHealthCheck("//rpc.example/1", { fetcher });
    assert.equal(resultRelative.status, "invalid-url");
    assert.equal(called, false);

    const resultGarbage = await rpcHealthCheck("not-a-url", { fetcher });
    assert.equal(resultGarbage.status, "invalid-url");
    assert.equal(called, false);
  });

  it("times out hanging probes when connection hangs", async () => {
    const result = await rpcHealthCheck("https://rpc.example/1", {
      fetcher: hangingFetcher,
      timeoutMs: 20,
    });

    assert.equal(result.status, "timeout");
    assert.match(result.error ?? "", /timed out after 20ms/);
  });

  it("times out when response body decoding hangs past deadline (headers resolve immediately, body never finishes)", async () => {
    const hangingBodyFetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          new Promise<never>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", {
      fetcher: hangingBodyFetcher,
      timeoutMs: 30,
    });

    assert.equal(result.status, "timeout");
    assert.match(result.error ?? "", /timed out after 30ms/);
  });

  it("times out when Response readable stream hangs past deadline", async () => {
    const hangingStream = new ReadableStream({
      start() {
        // Never enqueue and never close
      },
      cancel() {
        // Stream cancelled on abort
      },
    });

    const hangingStreamFetcher = (async () => {
      return new Response(hangingStream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await rpcHealthCheck("https://rpc.example/1", {
      fetcher: hangingStreamFetcher,
      timeoutMs: 30,
    });

    assert.equal(result.status, "timeout");
    assert.match(result.error ?? "", /timed out after 30ms/);
  });

  it("honors an already-aborted caller signal without fetching", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x1" });
    }) as typeof fetch;

    const controller = new AbortController();
    controller.abort();

    const result = await rpcHealthCheck("https://rpc.example/1", {
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
