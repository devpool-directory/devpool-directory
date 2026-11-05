import {
  dynamicRpcTransport,
  fallback,
  http,
  custom,
  createClient,
  getRpcTransportUrls,
  getChainRpcUrl,
  type Transport,
  type TransportConfig,
  type TransportParams,
  RPC_URL,
  RPC_FALLBACK_URLS,
} from "../utils/dynamicRpcTransport";

export const MAINNET_CHAIN_ID = 1;
export const ANVIL_CHAIN_ID = 31337;

export {
  dynamicRpcTransport,
  fallback,
  http,
  custom,
  createClient,
  getRpcTransportUrls,
  getChainRpcUrl,
  type Transport,
  type TransportConfig,
  type TransportParams,
  RPC_URL,
  RPC_FALLBACK_URLS,
};

export const isLocalNode = false;

export const mainnet = { id: MAINNET_CHAIN_ID, name: "Ethereum Mainnet" } as const;
export const anvil = { id: ANVIL_CHAIN_ID, name: "Anvil Local" } as const;

export const supportedChains = [mainnet, anvil] as const;

export type SupportedChain = (typeof supportedChains)[number];
export type ChainId = SupportedChain["id"];
export type TransportsMap = Record<ChainId, Transport>;

export const RPC_TRANSPORT_TIMEOUT_MS = 2_000;

export function createRpcTransport(rpcUrl: string): Transport {
  return http(rpcUrl, {
    batch: !isLocalNode,
    timeout: RPC_TRANSPORT_TIMEOUT_MS,
  });
}

/**
 * Creates the wallet transport map configuring dynamic RPC transports with unevaluated
 * transport factories passed to fallback.
 */
export function createWalletConfig(getRpcUrl: () => string = () => RPC_URL) {
  const transports = supportedChains.reduce<TransportsMap>((acc, chain) => {
    acc[chain.id] = dynamicRpcTransport(() =>
      getRpcTransportUrls(chain.id, {
        rpcUrl: getRpcUrl(),
        localNode: chain.id === ANVIL_CHAIN_ID,
      }).map((url) => createRpcTransport(url))
    );
    return acc;
  }, {} as TransportsMap);

  return {
    chains: supportedChains,
    transports,
  };
}

export const wagmiConfig = createWalletConfig();
