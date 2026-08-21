/**
 * CoWSwap Integration Improvements
 *
 * Implements inventory filtering, preloaded asset lists, and max button
 * functionality for the CoWSwap integration in uusd.ubq.fi.
 *
 * Addresses: devpool-directory#5954 / ubiquity/uusd.ubq.fi#47
 */

export interface AssetInventory {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
}

export interface SwapConfig {
  minDisplayValueUsd: number;
  preloadedAssets: string[];
  enableMaxButton: boolean;
}

const DEFAULT_SWAP_CONFIG: SwapConfig = {
  minDisplayValueUsd: 1.0,
  preloadedAssets: ["UUSD", "UBQ", "USDC", "DAI", "WETH"],
  enableMaxButton: true,
};

/**
 * Filters inventory to only display assets with value above the minimum threshold.
 * Per requirement: "Only display inventory >$1.00 per asset"
 */
export function filterInventoryByValue(
  inventory: AssetInventory[],
  minValueUsd: number = DEFAULT_SWAP_CONFIG.minDisplayValueUsd
): AssetInventory[] {
  return inventory.filter((asset) => asset.valueUsd > minValueUsd);
}

/**
 * Returns a preloaded list of high-priority assets for quick access.
 * Per requirement: "Preloaded list"
 * These are shown at the top of the swap interface regardless of balance.
 */
export function getPreloadedAssetList(
  inventory: AssetInventory[],
  preloadedSymbols: string[] = DEFAULT_SWAP_CONFIG.preloadedAssets
): AssetInventory[] {
  const preloadedSet = new Set(preloadedSymbols.map((s) => s.toUpperCase()));
  return inventory.filter((asset) => preloadedSet.has(asset.symbol.toUpperCase()));
}

/**
 * Calculates the max transferable amount accounting for gas reserves.
 * Per requirement: "Max button"
 * For native tokens, reserves a small amount for gas; for ERC20s, returns full balance.
 */
export function calculateMaxAmount(
  asset: AssetInventory,
  isNativeToken: boolean = false,
  gasReserveNative: string = "0.001"
): string {
  if (!isNativeToken) {
    return asset.balance;
  }

  const balance = parseFloat(asset.balance);
  const reserve = parseFloat(gasReserveNative);
  const max = Math.max(0, balance - reserve);

  // Return with same decimal precision as original balance
  const decimals = asset.balance.includes(".")
    ? asset.balance.split(".")[1].length
    : 0;

  return max.toFixed(decimals);
}

/**
 * Formats an asset for display in the swap UI with all required metadata.
 */
export function formatAssetForDisplay(
  asset: AssetInventory,
  config: SwapConfig = DEFAULT_SWAP_CONFIG
): {
  symbol: string;
  name: string;
  balance: string;
  valueUsd: string;
  showMaxButton: boolean;
  isPreloaded: boolean;
} {
  const preloadedSet = new Set(config.preloadedAssets.map((s) => s.toUpperCase()));

  return {
    symbol: asset.symbol,
    name: asset.name,
    balance: asset.balance,
    valueUsd: `$${asset.valueUsd.toFixed(2)}`,
    showMaxButton: config.enableMaxButton,
    isPreloaded: preloadedSet.has(asset.symbol.toUpperCase()),
  };
}

/**
 * Main entry point: processes raw inventory into a display-ready list
 * with filtering, preloading, and max button support.
 */
export function prepareSwapInventory(
  rawInventory: AssetInventory[],
  config: SwapConfig = DEFAULT_SWAP_CONFIG
): Array<{
  asset: AssetInventory;
  display: ReturnType<typeof formatAssetForDisplay>;
}> {
  // Filter by minimum value
  const filtered = filterInventoryByValue(rawInventory, config.minDisplayValueUsd);

  // Get preloaded assets (even if below threshold, they're always shown)
  const preloaded = getPreloadedAssetList(rawInventory, config.preloadedAssets);

  // Merge: preloaded first, then filtered (deduped)
  const seen = new Set<string>();
  const merged: AssetInventory[] = [];

  for (const asset of [...preloaded, ...filtered]) {
    const key = asset.symbol.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(asset);
    }
  }

  return merged.map((asset) => ({
    asset,
    display: formatAssetForDisplay(asset, config),
  }));
}

export { DEFAULT_SWAP_CONFIG };
