import {
  DEFAULT_RPC_HEALTH_TIMEOUT_MS,
  getChainRpcUrl,
  rpcHealthCheck,
  type RpcHealthStatus,
} from "./rpc-health";

export type RpcRuntimeState = {
  resolvedRpcUrl: string;
  lastChainId?: number;
  lastStatus: RpcHealthStatus | "unknown";
  recentErrorCount: number;
  initialized: boolean;
};

export type InitializeRpcRuntimeOptions = {
  candidates?: readonly string[];
  expectedChainId?: number;
  fetcher?: typeof fetch;
  localNode?: boolean;
};

const MAINNET_CHAIN_ID = 1;
export const RPC_URL = "https://rpc.ubq.fi";
export const RPC_FALLBACK_URLS = ["https://rpc.ankr.com/eth", "https://eth.llamarpc.com"];
export const LOCAL_NODE_CHAIN_ID = 31337;

const listeners = new Set<() => void>();
let generation = 0;
let state: RpcRuntimeState = createInitialState();

function createInitialState(): RpcRuntimeState {
  return {
    resolvedRpcUrl: RPC_URL,
    lastStatus: "unknown",
    recentErrorCount: 0,
    initialized: false,
  };
}

const publish = (patch: Partial<RpcRuntimeState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
};

export const subscribeRpcRuntime = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getRpcRuntimeState = (): RpcRuntimeState => state;
export const getResolvedRpcBaseUrl = (): string => state.resolvedRpcUrl;

export const __resetRpcRuntimeForTests = () => {
  generation += 1;
  state = createInitialState();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
};

/**
 * Probes the candidate base URLs in order and keeps the first healthy one.
 * If a candidate fails (including when response body decoding hangs past the deadline),
 * it moves to the next candidate.
 */
export async function initializeRpcRuntime(options: InitializeRpcRuntimeOptions = {}): Promise<RpcRuntimeState> {
  const currentGeneration = ++generation;
  const localNode = options.localNode ?? false;
  const expectedChainId = options.expectedChainId ?? (localNode ? LOCAL_NODE_CHAIN_ID : MAINNET_CHAIN_ID);
  const candidates = [...new Set(options.candidates ?? [RPC_URL, ...RPC_FALLBACK_URLS])].filter((candidate) => candidate.length > 0);
  const primaryRpcUrl = candidates[0] ?? RPC_URL;

  publish({ ...createInitialState(), resolvedRpcUrl: primaryRpcUrl });

  for (const baseUrl of candidates) {
    const result = await rpcHealthCheck(getChainRpcUrl(baseUrl, expectedChainId, localNode), {
      expectedChainId,
      fetcher: options.fetcher,
      timeoutMs: DEFAULT_RPC_HEALTH_TIMEOUT_MS,
    });

    if (currentGeneration !== generation) {
      return getRpcRuntimeState();
    }

    if (result.status === "healthy") {
      publish({
        lastStatus: result.status,
        lastChainId: result.chainId,
        resolvedRpcUrl: baseUrl,
        initialized: true,
      });
      return getRpcRuntimeState();
    }

    publish({
      lastStatus: result.status,
      lastChainId: result.chainId,
      recentErrorCount: state.recentErrorCount + 1,
    });
  }

  publish({ initialized: true });
  return getRpcRuntimeState();
}
