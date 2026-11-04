/**
 * CoWSwap Integration Improvements
 *
 * Implements core logic and helpers for CoWSwap DEX integration:
 * 1. Inventory filtering: Filters out dust token balances (< $1.00 USD)
 *    to eliminate wallet noise and present only meaningful assets.
 * 2. Preloaded / Prioritized Token Selector: Dynamically preloads and orders
 *    available tokens based on user's active inventory rather than static lists,
 *    supporting search, deduping, and pinning common assets.
 * 3. Max Spendable Balance Calculator: Calculates exact spendable amounts
 *    accounting for native gas reserve buffers, token decimals, and percentage shortcuts.
 * 4. CoWSwap Order Preparation & Slippage Bounds: Prepares swap quotes,
 *    computes minimum receive thresholds given slippage tolerance, and validates orders.
 *
 * Reference: https://github.com/ubiquity/uusd.ubq.fi/issues/47 (Issue #5954)
 */

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId?: number;
  logoURI?: string;
}

export interface TokenHolding {
  token: Token;
  balanceRaw: string; // BigInt string
  balanceFormatted: number;
  usdPrice?: number;
  usdValue?: number;
}

export interface InventoryFilterOptions {
  /**
   * Minimum USD value to display. Assets with usdValue strictly below this threshold
   * will be filtered out as dust. Default: 1.00
   */
  minUsdValue?: number;
  /**
   * Whether to include tokens with 0 balance. Default: false
   */
  includeZeroBalance?: boolean;
  /**
   * Whitelist of token addresses that should always be displayed regardless of USD value.
   */
  whitelistAddresses?: string[];
  /**
   * Blacklist of token addresses that should always be hidden.
   */
  blacklistAddresses?: string[];
}

export interface MaxBalanceOptions {
  /**
   * Whether the token is the native gas asset (e.g. ETH, POL, SOL).
   * If true, gasReserveWei will be deducted from the total balance. Default: false
   */
  isNativeToken?: boolean;
  /**
   * Gas reserve buffer in wei to keep for transaction fees. Default: 5000000000000000n (0.005 ETH)
   */
  gasReserveWei?: bigint;
  /**
   * Percentage of balance to spend (e.g. 25, 50, 75, 100). Default: 100
   */
  percentage?: number;
  /**
   * Number of decimals for formatting string output. Default: token decimals or 18
   */
  decimals?: number;
}

export interface MaxSpendableResult {
  spendableRaw: bigint;
  spendableFormatted: string;
  reservedForGasRaw: bigint;
  percentageApplied: number;
}

export interface SwapQuoteOptions {
  sellToken: Token;
  buyToken: Token;
  sellAmount: bigint;
  expectedBuyAmount: bigint;
  /**
   * Slippage tolerance in basis points (1 bps = 0.01%, 50 = 0.5%, 100 = 1.0%)
   */
  slippageBps: number;
  /**
   * Validity duration for CoWSwap order in seconds. Default: 1200 (20 minutes)
   */
  validDurationSec?: number;
  userAddress: string;
  appDataHex?: string;
  feeAmount?: bigint;
  partiallyFillable?: boolean;
}

export interface PreparedCowSwapOrder {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
  feeAmount: string;
  kind: "sell";
  partiallyFillable: boolean;
  sellTokenBalance: "erc20";
  buyTokenBalance: "erc20";
}

export interface SwapValidationResult {
  valid: boolean;
  needsApproval: boolean;
  error?: string;
}

/**
 * Standard default gas reserve for native token swaps (0.005 ETH / 5e15 wei).
 */
export const DEFAULT_GAS_RESERVE_WEI = 5_000_000_000_000_000n;

/**
 * Default minimum USD threshold for inventory display ($1.00).
 */
export const DEFAULT_MIN_INVENTORY_USD = 1.00;

/**
 * Default slippage tolerance in basis points (50 bps = 0.5%).
 */
export const DEFAULT_SLIPPAGE_BPS = 50;

/**
 * Safely normalizes an Ethereum address to lowercase for comparisons.
 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Formats a raw bigint token amount into a human-readable decimal string.
 */
export function formatUnits(amount: bigint | string, decimals: number): string {
  const value = BigInt(amount);
  const negative = value < 0n;
  const absValue = negative ? -value : value;

  const divisor = 10n ** BigInt(decimals);
  const integerPart = absValue / divisor;
  const remainder = absValue % divisor;

  let fractionPart = remainder.toString().padStart(decimals, "0");
  fractionPart = fractionPart.replace(/0+$/, "");

  const result = fractionPart.length > 0
    ? `${integerPart.toString()}.${fractionPart}`
    : integerPart.toString();

  return negative ? `-${result}` : result;
}

/**
 * Parses a human-readable decimal string into a raw bigint token amount.
 */
export function parseUnits(amount: string | number, decimals: number): bigint {
  const str = String(amount).trim();
  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal amount string: "${amount}"`);
  }

  const negative = str.startsWith("-");
  const cleanStr = negative ? str.slice(1) : str;
  const [intPart, fracPart = ""] = cleanStr.split(".");

  const paddedFrac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const combined = BigInt(intPart) * (10n ** BigInt(decimals)) + BigInt(paddedFrac);

  return negative ? -combined : combined;
}

/**
 * 1. Filter inventory holdings to eliminate dust tokens and show only meaningful assets.
 *
 * Requirements:
 * - Only display inventory >= minUsdValue ($1.00 USD by default) per asset.
 * - Suppress zero-balance assets by default.
 * - Respect whitelist (always shown) and blacklist (always excluded).
 * - Sort results by USD value descending (highest value tokens first).
 */
export function filterInventoryHoldings(
  holdings: TokenHolding[],
  options: InventoryFilterOptions = {}
): TokenHolding[] {
  const minUsd = options.minUsdValue ?? DEFAULT_MIN_INVENTORY_USD;
  const includeZero = options.includeZeroBalance ?? false;

  const whitelist = new Set(
    (options.whitelistAddresses ?? []).map(normalizeAddress)
  );
  const blacklist = new Set(
    (options.blacklistAddresses ?? []).map(normalizeAddress)
  );

  const filtered = holdings.filter((holding) => {
    const addr = normalizeAddress(holding.token.address);

    // Blacklist always takes precedence
    if (blacklist.has(addr)) {
      return false;
    }

    // Whitelist bypasses dust filter
    if (whitelist.has(addr)) {
      return true;
    }

    // Zero balance filter
    const rawVal = BigInt(holding.balanceRaw || "0");
    if (!includeZero && rawVal <= 0n) {
      return false;
    }

    // USD value dust filter: >= minUsdValue
    const usdVal = holding.usdValue ?? (holding.balanceFormatted * (holding.usdPrice ?? 0));
    return usdVal >= minUsd;
  });

  // Sort descending by USD value
  return [...filtered].sort((a, b) => {
    const valA = a.usdValue ?? (a.balanceFormatted * (a.usdPrice ?? 0));
    const valB = b.usdValue ?? (b.balanceFormatted * (b.usdPrice ?? 0));
    return valB - valA;
  });
}

/**
 * 2. Populate a preloaded token selector list based on user's active inventory.
 *
 * Requirements:
 * - Pre-populate the dropdown using active inventory holdings rather than static noise.
 * - Merge optional standard base tokens (e.g. USDC, ETH, DAI) without duplicate addresses.
 * - Support optional search query filtering by symbol, name, or address.
 */
export function populatePreloadedTokenList(
  holdings: TokenHolding[],
  defaultTokens: Token[] = [],
  searchQuery?: string
): Token[] {
  const seenAddresses = new Set<string>();
  const result: Token[] = [];

  // Prioritize tokens user already holds in inventory (already filtered/sorted)
  for (const holding of holdings) {
    const addr = normalizeAddress(holding.token.address);
    if (!seenAddresses.has(addr)) {
      seenAddresses.add(addr);
      result.push(holding.token);
    }
  }

  // Append default tokens not already in inventory
  for (const token of defaultTokens) {
    const addr = normalizeAddress(token.address);
    if (!seenAddresses.has(addr)) {
      seenAddresses.add(addr);
      result.push(token);
    }
  }

  // Filter by search query if provided
  if (searchQuery && searchQuery.trim().length > 0) {
    const query = searchQuery.trim().toLowerCase();
    return result.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        normalizeAddress(token.address).includes(query)
    );
  }

  return result;
}

/**
 * 3. Calculate maximum spendable balance for quick-action "MAX" button.
 *
 * Requirements:
 * - Native token (ETH): deduct gas reserve buffer to prevent leaving user stranded without gas.
 * - ERC-20 token: spend entire balance or percentage shortcut (25%, 50%, 75%, 100%).
 * - Prevent underflows and return zero when reserve exceeds balance.
 */
export function calculateMaxSpendable(
  balance: bigint | string,
  options: MaxBalanceOptions = {}
): MaxSpendableResult {
  const rawBalance = BigInt(balance);
  const isNative = options.isNativeToken ?? false;
  const gasReserve = isNative ? (options.gasReserveWei ?? DEFAULT_GAS_RESERVE_WEI) : 0n;
  const percentage = options.percentage !== undefined ? Math.max(0, Math.min(100, options.percentage)) : 100;
  const decimals = options.decimals ?? 18;

  if (rawBalance <= 0n) {
    return {
      spendableRaw: 0n,
      spendableFormatted: "0",
      reservedForGasRaw: 0n,
      percentageApplied: percentage,
    };
  }

  let availableAfterGas: bigint;
  let reservedGas: bigint;

  if (isNative) {
    if (rawBalance <= gasReserve) {
      availableAfterGas = 0n;
      reservedGas = rawBalance;
    } else {
      availableAfterGas = rawBalance - gasReserve;
      reservedGas = gasReserve;
    }
  } else {
    availableAfterGas = rawBalance;
    reservedGas = 0n;
  }

  // Apply percentage (e.g. 100% = full, 50% = half)
  const spendableRaw = (availableAfterGas * BigInt(percentage)) / 100n;
  const spendableFormatted = formatUnits(spendableRaw, decimals);

  return {
    spendableRaw,
    spendableFormatted,
    reservedForGasRaw: reservedGas,
    percentageApplied: percentage,
  };
}

/**
 * 4. Calculate minimum receive amount given an expected buy amount and slippage tolerance.
 *
 * Formula: minAmount = expectedAmount * (10000 - slippageBps) / 10000
 */
export function calculateMinReceiveAmount(
  expectedAmount: bigint | string,
  slippageBps: number
): bigint {
  const expected = BigInt(expectedAmount);
  if (expected <= 0n) {
    return 0n;
  }
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Slippage basis points must be between 0 and 10000, got ${slippageBps}`);
  }

  const factor = 10000n - BigInt(slippageBps);
  return (expected * factor) / 10000n;
}

/**
 * Prepare a CoWSwap sell order object ready to be signed or submitted.
 */
export function prepareCowSwapOrder(options: SwapQuoteOptions): PreparedCowSwapOrder {
  const {
    sellToken,
    buyToken,
    sellAmount,
    expectedBuyAmount,
    slippageBps,
    validDurationSec = 1200,
    userAddress,
    appDataHex = "0x0000000000000000000000000000000000000000000000000000000000000000",
    feeAmount = 0n,
    partiallyFillable = false,
  } = options;

  if (sellAmount <= 0n) {
    throw new Error("sellAmount must be greater than 0");
  }

  const minBuyAmount = calculateMinReceiveAmount(expectedBuyAmount, slippageBps);
  const nowSec = Math.floor(Date.now() / 1000);
  const validTo = nowSec + validDurationSec;

  return {
    sellToken: normalizeAddress(sellToken.address),
    buyToken: normalizeAddress(buyToken.address),
    receiver: normalizeAddress(userAddress),
    sellAmount: sellAmount.toString(),
    buyAmount: minBuyAmount.toString(),
    validTo,
    appData: appDataHex,
    feeAmount: feeAmount.toString(),
    kind: "sell",
    partiallyFillable,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  };
}

/**
 * Validate swap prerequisites before presenting order to user.
 */
export function validateSwapPrerequisites(params: {
  sellBalance: bigint | string;
  sellAmount: bigint | string;
  allowance: bigint | string;
  isNative: boolean;
}): SwapValidationResult {
  const balance = BigInt(params.sellBalance);
  const amount = BigInt(params.sellAmount);
  const allowance = BigInt(params.allowance);

  if (amount <= 0n) {
    return { valid: false, needsApproval: false, error: "Swap amount must be greater than zero." };
  }

  if (balance < amount) {
    return { valid: false, needsApproval: false, error: "Insufficient balance for this swap." };
  }

  // Native token does not require ERC-20 approval
  if (params.isNative) {
    return { valid: true, needsApproval: false };
  }

  // ERC-20 requires approval if allowance is less than sell amount
  if (allowance < amount) {
    return { valid: true, needsApproval: true };
  }

  return { valid: true, needsApproval: false };
}

/**
 * Reusable helper service class providing consolidated CoWSwap integration methods.
 */
export class CoWSwapIntegrationHelper {
  private minUsdValue: number;
  private defaultSlippageBps: number;
  private gasReserveWei: bigint;

  constructor(config: {
    minUsdValue?: number;
    defaultSlippageBps?: number;
    gasReserveWei?: bigint;
  } = {}) {
    this.minUsdValue = config.minUsdValue ?? DEFAULT_MIN_INVENTORY_USD;
    this.defaultSlippageBps = config.defaultSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
    this.gasReserveWei = config.gasReserveWei ?? DEFAULT_GAS_RESERVE_WEI;
  }

  public filterInventory(
    holdings: TokenHolding[],
    extraOptions?: Partial<InventoryFilterOptions>
  ): TokenHolding[] {
    return filterInventoryHoldings(holdings, {
      minUsdValue: this.minUsdValue,
      ...extraOptions,
    });
  }

  public getPreloadedTokenList(
    holdings: TokenHolding[],
    defaultTokens: Token[] = [],
    searchQuery?: string
  ): Token[] {
    const cleanHoldings = this.filterInventory(holdings);
    return populatePreloadedTokenList(cleanHoldings, defaultTokens, searchQuery);
  }

  public getMaxSpendable(
    balance: bigint | string,
    isNative: boolean = false,
    percentage: number = 100,
    decimals: number = 18
  ): MaxSpendableResult {
    return calculateMaxSpendable(balance, {
      isNativeToken: isNative,
      gasReserveWei: this.gasReserveWei,
      percentage,
      decimals,
    });
  }

  public prepareOrder(
    options: Omit<SwapQuoteOptions, "slippageBps"> & { slippageBps?: number }
  ): PreparedCowSwapOrder {
    return prepareCowSwapOrder({
      ...options,
      slippageBps: options.slippageBps ?? this.defaultSlippageBps,
    });
  }

  public validateSwap(params: {
    sellBalance: bigint | string;
    sellAmount: bigint | string;
    allowance: bigint | string;
    isNative: boolean;
  }): SwapValidationResult {
    return validateSwapPrerequisites(params);
  }
}
