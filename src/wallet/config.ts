import {
  getChainRpcUrl,
  normalizeRpcBaseUrl,
} from "../utils/rpc-health";
import {
  getResolvedRpcBaseUrl,
  RPC_FALLBACK_URLS,
  RPC_URL,
} from "../utils/rpc-runtime";

export { getChainRpcUrl };

export const isLocalNode = false;

export type Chain = {
  id: number;
  name?: string;
  network?: string;
};

export const mainnet: Chain = { id: 1, name: "Ethereum" };
export const anvil: Chain = { id: 31337, name: "Anvil Local" };

export const supportedChains: readonly [Chain, ...Chain[]] = isLocalNode ? [mainnet, anvil] : [mainnet];

export type ChainId = (typeof supportedChains)[number]["id"];

export type TransportRequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type TransportConfig = {
  key?: string;
  name?: string;
  type?: string;
  request: (args: TransportRequestArgs) => Promise<unknown>;
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
};

export type TransportInstance = {
  config: TransportConfig;
  request: (args: TransportRequestArgs) => Promise<unknown>;
  value?: unknown;
};

export type TransportParams = {
  chain?: Chain;
  retryCount?: number;
  timeout?: number;
};

export type Transport = (params?: TransportParams) => TransportInstance;

export type TransportsMap = Record<ChainId, Transport>;

/** Bound every RPC transport so a stalled endpoint cannot hold a request open. */
export const RPC_TRANSPORT_TIMEOUT_MS = 2_000;

/**
 * Returns the base URLs that should back a chain transport: the primary alone in
 * local-node mode (Anvil does not serve chain paths), otherwise the primary followed
 * by the configured public fallbacks with duplicates removed.
 */
export function getRpcTransportUrls(
  chain: Chain,
  {
    fallbackUrls = RPC_FALLBACK_URLS,
    localNode = isLocalNode,
    rpcUrl = RPC_URL,
  }: {
    fallbackUrls?: readonly string[];
    localNode?: boolean;
    rpcUrl?: string;
  } = {}
): string[] {
  const rpcUrls = localNode ? [rpcUrl] : [rpcUrl, ...fallbackUrls];
  return [...new Set(rpcUrls.map((currentRpcUrl) => getChainRpcUrl(currentRpcUrl, chain.id, localNode)))];
}

/**
 * Creates a generic transport wrapper adhering to viem's TransportInstance structure.
 */
export function createTransport(config: TransportConfig): TransportInstance {
  return {
    config,
    request: config.request,
  };
}

/**
 * Creates an HTTP-based transport for a specific RPC URL.
 */
export function http(
  url: string,
  options: { batch?: boolean; timeout?: number; fetcher?: typeof fetch } = {}
): Transport {
  return (params?: TransportParams) => {
    const timeoutMs = options.timeout ?? RPC_TRANSPORT_TIMEOUT_MS;
    const fetcher = options.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);

    const request = async (args: TransportRequestArgs): Promise<unknown> => {
      if (!fetcher) {
        throw new Error("No fetcher implementation available in this environment");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: args.method,
            params: args.params ?? [],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { error?: { message?: string }; result?: unknown };
        if (data.error) {
          throw new Error(data.error.message ?? "RPC Error");
        }
        return data.result;
      } finally {
        clearTimeout(timer);
      }
    };

    return createTransport({
      key: `http:${url}`,
      name: `HTTP Transport (${url})`,
      type: "http",
      request,
      timeout: timeoutMs,
    });
  };
}

/**
 * Custom transport factory helper for tests and custom dispatchers.
 */
export function custom(options: { request: (args: TransportRequestArgs) => Promise<unknown> }): Transport {
  return () =>
    createTransport({
      key: "custom",
      name: "Custom Transport",
      type: "custom",
      request: options.request,
    });
}

/**
 * Fallback transport combining multiple candidate transports, trying them in sequence.
 */
export function fallback(
  transportsList: readonly Transport[],
  options: { rank?: boolean } = {}
): Transport {
  return (params?: TransportParams) => {
    const instances = transportsList.map((t) => t(params));

    const request = async (args: TransportRequestArgs): Promise<unknown> => {
      let lastError: unknown;
      for (const instance of instances) {
        try {
          return await instance.request(args);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError ?? new Error("No fallback transport available");
    };

    return createTransport({
      key: "fallback",
      name: "Fallback Transport",
      type: "fallback",
      request,
    });
  };
}

export function createRpcTransport(rpcUrl: string): Transport {
  return http(rpcUrl, {
    batch: !isLocalNode,
    timeout: RPC_TRANSPORT_TIMEOUT_MS,
  });
}

/**
 * Resolves the selected RPC endpoint dynamically on each request rather than only
 * once when the transport factory or client is constructed. Wagmi memoizes the client
 * per chain, so deferring resolution to the request handler ensures that background
 * health checks updating the resolved RPC base URL take immediate effect.
 *
 * @param createTransportFactory - Callback producing the array of transport factories for the chain.
 * @returns A viem-compatible Transport function with per-request dynamic resolution.
 */
export function dynamicRpcTransport(
  createTransportFactory: () => Transport[] | readonly Transport[]
): Transport {
  return (params?: TransportParams) => {
    return createTransport({
      key: "dynamicRpc",
      name: "Dynamic RPC",
      async request(args: TransportRequestArgs): Promise<unknown> {
        const transportsArr = createTransportFactory();
        const [primary, ...rest] = transportsArr;
        if (!primary) {
          throw new Error("No RPC transport URL is available");
        }
        const activeTransport =
          rest.length === 0 ? primary(params) : fallback([primary, ...rest], { rank: false })(params);
        return activeTransport.request(args);
      },
      retryCount: 3,
      retryDelay: 150,
      timeout: RPC_TRANSPORT_TIMEOUT_MS,
      type: "dynamicRpc",
    });
  };
}

/**
 * Lightweight client constructor adhering to viem's Client interface pattern.
 */
export function createClient(config: {
  chain?: Chain;
  transport: Transport;
}): {
  chain?: Chain;
  transport: TransportInstance;
  request: (args: TransportRequestArgs) => Promise<unknown>;
} {
  const transportInstance = config.transport({ chain: config.chain });
  return {
    chain: config.chain,
    transport: transportInstance,
    request: (args) => transportInstance.request(args),
  };
}

// Build transport map per supported chain
export const transports: TransportsMap = supportedChains.reduce<TransportsMap>((acc, chain) => {
  acc[chain.id as ChainId] = dynamicRpcTransport(() =>
    getRpcTransportUrls(chain, { rpcUrl: getResolvedRpcBaseUrl() || RPC_URL }).map((rpcUrl) =>
      createRpcTransport(rpcUrl)
    )
  );
  return acc;
}, {} as TransportsMap);
