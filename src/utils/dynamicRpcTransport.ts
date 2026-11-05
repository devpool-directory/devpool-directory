/**
 * Dynamic RPC Transport for viem & wagmi
 *
 * Viem's fallback transport expects an array of unevaluated transport factories (functions)
 * that it calls during client construction. Passing already-evaluated transport instances
 * (results of next(params)) causes viem to attempt invoking an object as a function, throwing:
 * `TypeError: fn is not a function`.
 *
 * This module ensures `fallback` receives unevaluated transport factories, properly handling
 * single endpoints, multi-endpoint fallback chains, and dynamic resolution.
 *
 * References:
 * - DevPool Directory: https://github.com/devpool-directory/devpool-directory/issues/6142
 * - Upstream Issue: https://github.com/ubiquity/stake.ubq.fi/issues/42
 */

export interface TransportRequestParams {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export type EIP1193RequestFn = (args: TransportRequestParams) => Promise<unknown>;

export interface TransportConfig<TType extends string = string> {
  name?: string;
  key?: string;
  type?: TType;
  request: EIP1193RequestFn;
  retryCount?: number;
  timeout?: number;
  [key: string]: unknown;
}

export interface TransportParams {
  chain?: { id: number; name?: string; [key: string]: unknown };
  pollingInterval?: number;
  retryCount?: number;
  timeout?: number;
  [key: string]: unknown;
}

export type Transport = (params?: TransportParams) => TransportConfig;

export interface FallbackTransportConfig extends TransportConfig<"fallback"> {
  transports: TransportConfig[];
}

export interface FallbackOptions {
  rank?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * Viem-compatible fallback transport.
 * Accepts an array of unevaluated transport factories.
 * When initialized with params, it invokes each transport factory with `params`
 * and returns a fallback transport config whose `request` tries endpoints sequentially.
 */
export function fallback(
  transports: Transport[],
  options: FallbackOptions = {}
): Transport {
  return (params?: TransportParams) => {
    // Validate that transports are callable functions (factories)
    // If an already-evaluated transport config object was passed, throw TypeError: fn is not a function
    const initializedTransports = transports.map((transportFactory, index) => {
      if (typeof transportFactory !== "function") {
        throw new TypeError(
          `Transport at index ${index} is not a function (${typeof transportFactory}). ` +
          `viem's fallback expects transport factories, not evaluated transport instances.`
        );
      }
      return transportFactory(params);
    });

    const request: EIP1193RequestFn = async (args) => {
      let lastError: unknown;
      for (let i = 0; i < initializedTransports.length; i++) {
        const t = initializedTransports[i];
        try {
          return await t.request(args);
        } catch (err) {
          lastError = err;
          // Continue to next fallback transport
        }
      }
      throw lastError ?? new Error("All fallback transports failed");
    };

    return {
      name: "Fallback",
      key: "fallback",
      type: "fallback",
      transports: initializedTransports,
      request,
      retryCount: options.retryCount ?? 1,
    };
  };
}

/**
 * Builds a dynamic RPC transport that supplies unevaluated transport factories
 * to viem's fallback instead of invoking them prematurely.
 *
 * viem's fallback expects transport factories and evaluates them during client creation;
 * passing already-evaluated instances triggers a TypeError: fn is not a function.
 *
 * @param createTransports - Callback producing the array of transport factories for the chain.
 * @returns A viem Transport function resolving dynamically.
 */
export function dynamicRpcTransport(
  createTransports: () => Transport[]
): Transport {
  const transport: Transport = (params) => {
    const transports = createTransports();
    if (!transports || transports.length === 0) {
      throw new Error("No RPC transport URL is available");
    }

    const [primary, ...rest] = transports;
    if (rest.length === 0) {
      if (typeof primary !== "function") {
        throw new TypeError(
          `Primary transport is not a function (${typeof primary}). Expected a transport factory.`
        );
      }
      return primary(params);
    }

    // Pass unevaluated transport factories directly to viem's fallback!
    return fallback([primary, ...rest], { rank: false })(params);
  };

  return transport;
}

export function custom({
  request,
  name = "custom",
  retryCount = 0,
}: {
  request: EIP1193RequestFn;
  name?: string;
  retryCount?: number;
}): Transport {
  return () => ({
    name,
    key: "custom",
    type: "custom",
    request,
    retryCount,
  });
}

export function http(
  url?: string,
  options: {
    batch?: boolean;
    fetchOptions?: RequestInit;
    name?: string;
    retryCount?: number;
    timeout?: number;
  } = {}
): Transport {
  const endpoint = url ?? "http://localhost:8545";
  return () => ({
    name: options.name ?? "HTTP JSON-RPC",
    key: "http",
    type: "http",
    url: endpoint,
    request: async ({ method, params }) => {
      const controller = new AbortController();
      const timer = options.timeout ? setTimeout(() => controller.abort(), options.timeout) : undefined;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: controller.signal,
          ...options.fetchOptions,
        });
        if (!res.ok) {
          throw new Error(`HTTP RPC error ${res.status}: ${res.statusText}`);
        }
        const json = (await res.json()) as { error?: { message?: string }; result?: unknown };
        if (json.error) {
          throw new Error(json.error.message ?? "RPC Error");
        }
        return json.result;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });
}

export interface Client<TTransport extends TransportConfig = TransportConfig> {
  chain?: { id: number; name?: string; [key: string]: unknown };
  transport: TTransport;
  request: EIP1193RequestFn;
}

export function createClient(parameters: {
  chain?: { id: number; name?: string; [key: string]: unknown };
  transport: Transport;
}): Client {
  const { chain, transport } = parameters;
  const transportConfig = transport({ chain });
  return {
    chain,
    transport: transportConfig,
    request: (args) => transportConfig.request(args),
  };
}

export const RPC_URL = "https://rpc.ubq.fi";
export const RPC_FALLBACK_URLS = ["https://rpc.ankr.com/eth", "https://eth.llamarpc.com"];
export const MAINNET_CHAIN_ID = 1;
export const ANVIL_CHAIN_ID = 31337;

export function getChainRpcUrl(baseUrl: string, chainId: number, localNode: boolean = false): string {
  if (localNode) return baseUrl;
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}/${chainId}`;
}

export function getRpcTransportUrls(
  chainId: number = MAINNET_CHAIN_ID,
  options: {
    fallbackUrls?: readonly string[];
    localNode?: boolean;
    rpcUrl?: string;
  } = {}
): string[] {
  const localNode = options.localNode ?? false;
  const primary = options.rpcUrl ?? RPC_URL;
  const fallbacks = options.fallbackUrls ?? RPC_FALLBACK_URLS;
  const urls = localNode ? [primary] : [primary, ...fallbacks];
  return [...new Set(urls.map((url) => getChainRpcUrl(url, chainId, localNode)))];
}
