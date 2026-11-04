import test from "node:test";
import assert from "node:assert/strict";
import {
  type Token,
  type TokenHolding,
  filterInventoryHoldings,
  populatePreloadedTokenList,
  calculateMaxSpendable,
  calculateMinReceiveAmount,
  prepareCowSwapOrder,
  validateSwapPrerequisites,
  CoWSwapIntegrationHelper,
  DEFAULT_GAS_RESERVE_WEI,
  formatUnits,
  parseUnits,
  normalizeAddress,
} from "../src/utils/cowswapIntegration";

const TOKEN_ETH: Token = {
  address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  symbol: "ETH",
  name: "Ethereum",
  decimals: 18,
};

const TOKEN_USDC: Token = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
};

const TOKEN_DAI: Token = {
  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  symbol: "DAI",
  name: "Dai Stablecoin",
  decimals: 18,
};

const TOKEN_UUSD: Token = {
  address: "0x0F474A37C82C43f94Fa5A8E19d701e67B92A456C",
  symbol: "uUSD",
  name: "Ubiquity Dollar",
  decimals: 18,
};

const TOKEN_DUST: Token = {
  address: "0x1111111111111111111111111111111111111111",
  symbol: "DUST",
  name: "Dust Token",
  decimals: 18,
};

test("formatUnits & parseUnits handles arbitrary decimal precision accurately", () => {
  assert.equal(formatUnits(1000000n, 6), "1");
  assert.equal(formatUnits(1500000n, 6), "1.5");
  assert.equal(formatUnits(1000000000000000000n, 18), "1");
  assert.equal(formatUnits(1234500000000000000n, 18), "1.2345");

  assert.equal(parseUnits("1.5", 6), 1500000n);
  assert.equal(parseUnits("0.005", 18), 5000000000000000n);
  assert.throws(() => parseUnits("invalid-num", 18));
});

test("filterInventoryHoldings: filters dust tokens < $1.00 USD and suppresses zero balance", () => {
  const holdings: TokenHolding[] = [
    {
      token: TOKEN_USDC,
      balanceRaw: "50000000", // 50 USDC
      balanceFormatted: 50,
      usdPrice: 1.0,
      usdValue: 50.0,
    },
    {
      token: TOKEN_DUST,
      balanceRaw: "10000000000000000000", // 10 DUST ($0.05 total)
      balanceFormatted: 10,
      usdPrice: 0.005,
      usdValue: 0.05,
    },
    {
      token: TOKEN_DAI,
      balanceRaw: "990000000000000000", // 0.99 DAI ($0.99)
      balanceFormatted: 0.99,
      usdPrice: 1.0,
      usdValue: 0.99,
    },
    {
      token: TOKEN_UUSD,
      balanceRaw: "1000000000000000000", // 1.00 uUSD ($1.00 exact boundary)
      balanceFormatted: 1.0,
      usdPrice: 1.0,
      usdValue: 1.0,
    },
    {
      token: TOKEN_ETH,
      balanceRaw: "0",
      balanceFormatted: 0,
      usdPrice: 3000,
      usdValue: 0,
    },
  ];

  const filtered = filterInventoryHoldings(holdings);

  // Expect only USDC ($50.00) and uUSD ($1.00) to pass; DUST ($0.05) and DAI ($0.99) are filtered out
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].token.symbol, "USDC");
  assert.equal(filtered[1].token.symbol, "uUSD");
  assert.equal(filtered[0].usdValue, 50.0);
  assert.equal(filtered[1].usdValue, 1.0);
});

test("filterInventoryHoldings: respects whitelist, blacklist, and custom thresholds", () => {
  const holdings: TokenHolding[] = [
    {
      token: TOKEN_DUST,
      balanceRaw: "10000000000000000000",
      balanceFormatted: 10,
      usdValue: 0.20,
    },
    {
      token: TOKEN_USDC,
      balanceRaw: "500000000",
      balanceFormatted: 500,
      usdValue: 500.0,
    },
  ];

  // Whitelist DUST token even if below $1.00
  const whitelisted = filterInventoryHoldings(holdings, {
    whitelistAddresses: [TOKEN_DUST.address],
  });
  assert.equal(whitelisted.length, 2);
  assert.ok(whitelisted.some((h) => h.token.symbol === "DUST"));

  // Blacklist USDC even if high value
  const blacklisted = filterInventoryHoldings(holdings, {
    blacklistAddresses: [TOKEN_USDC.address],
    whitelistAddresses: [TOKEN_DUST.address],
  });
  assert.equal(blacklisted.length, 1);
  assert.equal(blacklisted[0].token.symbol, "DUST");

  // Custom threshold $100
  const highThreshold = filterInventoryHoldings(holdings, { minUsdValue: 100 });
  assert.equal(highThreshold.length, 1);
  assert.equal(highThreshold[0].token.symbol, "USDC");
});

test("populatePreloadedTokenList: prioritizes active inventory and merges default tokens", () => {
  const holdings: TokenHolding[] = [
    {
      token: TOKEN_UUSD,
      balanceRaw: "100000000000000000000",
      balanceFormatted: 100,
      usdValue: 100,
    },
  ];

  const defaultTokens = [TOKEN_ETH, TOKEN_USDC, TOKEN_UUSD]; // Note: TOKEN_UUSD is duplicated

  const preloaded = populatePreloadedTokenList(holdings, defaultTokens);

  // Result should have uUSD first (from inventory), then ETH, then USDC without duplicates
  assert.equal(preloaded.length, 3);
  assert.equal(preloaded[0].symbol, "uUSD");
  assert.equal(preloaded[1].symbol, "ETH");
  assert.equal(preloaded[2].symbol, "USDC");
});

test("populatePreloadedTokenList: filters list by search query (symbol, name, address)", () => {
  const tokens = [TOKEN_ETH, TOKEN_USDC, TOKEN_DAI, TOKEN_UUSD];
  const holdings: TokenHolding[] = tokens.map((t) => ({
    token: t,
    balanceRaw: "100",
    balanceFormatted: 1,
    usdValue: 10,
  }));

  const searchSymbol = populatePreloadedTokenList(holdings, [], "usd");
  // Should match USDC and uUSD
  assert.equal(searchSymbol.length, 2);
  assert.ok(searchSymbol.some((t) => t.symbol === "USDC"));
  assert.ok(searchSymbol.some((t) => t.symbol === "uUSD"));

  const searchAddress = populatePreloadedTokenList(holdings, [], "0x6B17");
  assert.equal(searchAddress.length, 1);
  assert.equal(searchAddress[0].symbol, "DAI");
});

test("calculateMaxSpendable: ERC-20 token allows 100% full balance and percentages", () => {
  const balanceRaw = 100_000_000n; // 100 USDC (6 decimals)

  // 100%
  const max100 = calculateMaxSpendable(balanceRaw, { isNativeToken: false, decimals: 6 });
  assert.equal(max100.spendableRaw, 100_000_000n);
  assert.equal(max100.spendableFormatted, "100");
  assert.equal(max100.reservedForGasRaw, 0n);

  // 50%
  const max50 = calculateMaxSpendable(balanceRaw, { isNativeToken: false, percentage: 50, decimals: 6 });
  assert.equal(max50.spendableRaw, 50_000_000n);
  assert.equal(max50.spendableFormatted, "50");

  // 25%
  const max25 = calculateMaxSpendable(balanceRaw, { isNativeToken: false, percentage: 25, decimals: 6 });
  assert.equal(max25.spendableRaw, 25_000_000n);
  assert.equal(max25.spendableFormatted, "25");
});

test("calculateMaxSpendable: native token (ETH) reserves gas buffer", () => {
  // 1 ETH balance = 1e18 wei
  const balanceEth = 1_000_000_000_000_000_000n;
  const gasReserve = DEFAULT_GAS_RESERVE_WEI; // 0.005 ETH (5e15 wei)

  const maxNative = calculateMaxSpendable(balanceEth, {
    isNativeToken: true,
    gasReserveWei: gasReserve,
    decimals: 18,
  });

  // Expected spendable: 1 ETH - 0.005 ETH = 0.995 ETH
  const expectedRaw = balanceEth - gasReserve;
  assert.equal(maxNative.spendableRaw, expectedRaw);
  assert.equal(maxNative.spendableFormatted, "0.995");
  assert.equal(maxNative.reservedForGasRaw, gasReserve);

  // When balance is less than gas reserve, spendable should be 0 without throwing underflow
  const lowBalance = 2_000_000_000_000_000n; // 0.002 ETH
  const lowMax = calculateMaxSpendable(lowBalance, { isNativeToken: true, decimals: 18 });
  assert.equal(lowMax.spendableRaw, 0n);
  assert.equal(lowMax.spendableFormatted, "0");
  assert.equal(lowMax.reservedForGasRaw, lowBalance);
});

test("calculateMinReceiveAmount: computes minimum amount received with slippage", () => {
  const expectedBuy = 100_000_000n; // 100 tokens

  // 50 bps = 0.5% slippage -> minimum received: 99.5 tokens
  const min50bps = calculateMinReceiveAmount(expectedBuy, 50);
  assert.equal(min50bps, 99_500_000n);

  // 100 bps = 1.0% slippage -> minimum received: 99.0 tokens
  const min100bps = calculateMinReceiveAmount(expectedBuy, 100);
  assert.equal(min100bps, 99_000_000n);

  // 0 bps = 0.0% slippage -> exact 100 tokens
  const min0bps = calculateMinReceiveAmount(expectedBuy, 0);
  assert.equal(min0bps, 100_000_000n);

  assert.throws(() => calculateMinReceiveAmount(expectedBuy, -1));
  assert.throws(() => calculateMinReceiveAmount(expectedBuy, 10001));
});

test("prepareCowSwapOrder: creates compliant order with slippage limits", () => {
  const order = prepareCowSwapOrder({
    sellToken: TOKEN_USDC,
    buyToken: TOKEN_UUSD,
    sellAmount: 100_000_000n, // 100 USDC
    expectedBuyAmount: 100_000_000_000_000_000_000n, // 100 uUSD
    slippageBps: 50, // 0.5%
    userAddress: "0x1234567890123456789012345678901234567890",
    validDurationSec: 600,
  });

  assert.equal(order.sellToken, normalizeAddress(TOKEN_USDC.address));
  assert.equal(order.buyToken, normalizeAddress(TOKEN_UUSD.address));
  assert.equal(order.receiver, "0x1234567890123456789012345678901234567890");
  assert.equal(order.sellAmount, "100000000");
  // 100 * (10000 - 50) / 10000 = 99.5 uUSD (99.5e18)
  assert.equal(order.buyAmount, "99500000000000000000");
  assert.equal(order.kind, "sell");
  assert.ok(order.validTo > Math.floor(Date.now() / 1000));
});

test("validateSwapPrerequisites: checks balance and token allowance correctly", () => {
  // Insufficient balance
  const res1 = validateSwapPrerequisites({
    sellBalance: 50n,
    sellAmount: 100n,
    allowance: 1000n,
    isNative: false,
  });
  assert.equal(res1.valid, false);
  assert.equal(res1.needsApproval, false);
  assert.ok(res1.error?.includes("Insufficient balance"));

  // Sufficient balance, but insufficient allowance on ERC-20
  const res2 = validateSwapPrerequisites({
    sellBalance: 100n,
    sellAmount: 100n,
    allowance: 20n,
    isNative: false,
  });
  assert.equal(res2.valid, true);
  assert.equal(res2.needsApproval, true);

  // Sufficient balance and allowance
  const res3 = validateSwapPrerequisites({
    sellBalance: 100n,
    sellAmount: 100n,
    allowance: 100n,
    isNative: false,
  });
  assert.equal(res3.valid, true);
  assert.equal(res3.needsApproval, false);

  // Native token does not require allowance
  const res4 = validateSwapPrerequisites({
    sellBalance: 100n,
    sellAmount: 100n,
    allowance: 0n,
    isNative: true,
  });
  assert.equal(res4.valid, true);
  assert.equal(res4.needsApproval, false);
});

test("CoWSwapIntegrationHelper: end-to-end service helper workflow", () => {
  const helper = new CoWSwapIntegrationHelper({
    minUsdValue: 1.0,
    defaultSlippageBps: 50,
  });

  const rawHoldings: TokenHolding[] = [
    {
      token: TOKEN_USDC,
      balanceRaw: "100000000",
      balanceFormatted: 100,
      usdValue: 100,
    },
    {
      token: TOKEN_DUST,
      balanceRaw: "10000",
      balanceFormatted: 0.01,
      usdValue: 0.01,
    },
  ];

  // 1. Filter inventory
  const cleanHoldings = helper.filterInventory(rawHoldings);
  assert.equal(cleanHoldings.length, 1);
  assert.equal(cleanHoldings[0].token.symbol, "USDC");

  // 2. Preloaded token list
  const preloaded = helper.getPreloadedTokenList(rawHoldings, [TOKEN_UUSD]);
  assert.equal(preloaded.length, 2);
  assert.equal(preloaded[0].symbol, "USDC");
  assert.equal(preloaded[1].symbol, "uUSD");

  // 3. Max spendable
  const max = helper.getMaxSpendable(cleanHoldings[0].balanceRaw, false, 100, 6);
  assert.equal(max.spendableFormatted, "100");

  // 4. Prepare Order
  const order = helper.prepareOrder({
    sellToken: TOKEN_USDC,
    buyToken: TOKEN_UUSD,
    sellAmount: max.spendableRaw,
    expectedBuyAmount: 100_000_000_000_000_000_000n,
    userAddress: "0x1111111111111111111111111111111111111111",
  });
  assert.equal(order.buyAmount, "99500000000000000000"); // 50 bps applied
});
