/**
 * Add UUSD and UBQ Tokens to Popular Services
 *
 * Provides token metadata, listing request payloads, and tracking utilities
 * for adding UUSD and UBQ to DEXes, wallets, bridges, and price aggregators.
 * Implements the comprehensive listing spec from ubiquity-dollar#984.
 *
 * Addresses: devpool-directory#5850 / ubiquity/ubiquity-dollar/issues/984
 */

export interface TokenMetadata {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  logoUrl: string;
  coingeckoId?: string;
  coinmarketcapId?: string;
}

export interface ListingRequest {
  service: string;
  category: "dex" | "wallet" | "bridge" | "price-aggregator";
  status: "pending" | "submitted" | "approved" | "rejected" | "paid";
  submittedAt?: number;
  resolvedAt?: number;
  issueUrl?: string;
  prUrl?: string;
  feeUsd?: number;
  notes?: string;
}

export interface ListingTracker {
  tokens: Record<string, TokenMetadata>;
  requests: ListingRequest[];
  lastUpdated: number;
}

const UUSD_MAINNET: TokenMetadata = {
  symbol: "UUSD",
  name: "Ubiquity Dollar",
  address: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103",
  decimals: 18,
  chainId: 1,
  logoUrl: "https://raw.githubusercontent.com/ubiquity/ubiquity-dollar/main/packages/assets/uusd-logo.png",
};

const UBQ_MAINNET: TokenMetadata = {
  symbol: "UBQ",
  name: "Ubiquity Governance Token",
  address: "0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0",
  decimals: 18,
  chainId: 1,
  logoUrl: "https://raw.githubusercontent.com/ubiquity/ubiquity-dollar/main/packages/assets/ubq-logo.png",
};

const DEFAULT_TRACKER: ListingTracker = {
  tokens: {
    UUSD: UUSD_MAINNET,
    UBQ: UBQ_MAINNET,
  },
  requests: [
    // DEXes
    { service: "CoW Swap", category: "dex", status: "submitted", issueUrl: "https://github.com/cowprotocol/token-lists/issues/797", notes: "UUSD request" },
    { service: "CoW Swap", category: "dex", status: "submitted", issueUrl: "https://github.com/cowprotocol/token-lists/issues/798", notes: "UBQ request" },
    { service: "Uniswap", category: "dex", status: "approved", notes: "Mainnet pools added: UUSD/DAI, UBQ/DAI" },
    { service: "Curve", category: "dex", status: "approved", notes: "Done" },
    { service: "Balancer", category: "dex", status: "approved", notes: "Gnosis pools added: UUSD/WXDAI, UBQ/WXDAI" },
    { service: "SushiSwap", category: "dex", status: "approved", notes: "Gnosis pools added: UUSD/XDAI, UBQ/XDAI" },
    { service: "Bancor", category: "dex", status: "pending", notes: "Mainnet only" },
    { service: "PancakeSwap", category: "dex", status: "pending", notes: "Mainnet only" },
    { service: "1inch", category: "dex", status: "submitted", notes: "Contacted support" },
    // Wallets
    { service: "MetaMask", category: "wallet", status: "submitted", prUrl: "https://github.com/MetaMask/contract-metadata/pull/1413", notes: "UUSD request" },
    { service: "MetaMask", category: "wallet", status: "submitted", prUrl: "https://github.com/MetaMask/contract-metadata/pull/1414", notes: "UBQ request" },
    { service: "Coinbase Wallet", category: "wallet", status: "pending", notes: "Requires CoinGecko or CMC listing first" },
    { service: "TrustWallet", category: "wallet", status: "pending", feeUsd: 580, notes: "$580 listing fee per token via trustwallet/assets repo" },
    // Bridges
    { service: "Gnosis Bridge", category: "bridge", status: "submitted", notes: "Contacted support" },
    { service: "deBridge", category: "bridge", status: "submitted", notes: "Contacted support" },
    { service: "Jumper Exchange", category: "bridge", status: "submitted", notes: "Contacted support" },
    { service: "ShapeShift", category: "bridge", status: "pending", notes: "Token list from CoinGecko" },
    { service: "Bungee", category: "bridge", status: "pending", notes: "Token list from CoinGecko" },
    { service: "Li.Fi", category: "bridge", status: "approved", notes: "Done" },
    // Price Aggregators
    { service: "CoinGecko", category: "price-aggregator", status: "rejected", notes: "Rejected; retry after Feb 6" },
    { service: "CoinMarketCap", category: "price-aggregator", status: "pending", feeUsd: 5000, notes: "$5K invoice received; takes on-chain data from Uniswap" },
    { service: "DexScreener", category: "price-aggregator", status: "pending", notes: "Token list from CoinGecko" },
  ],
  lastUpdated: Date.now(),
};

/**
 * Generates a CoW Swap token list entry in the required JSON format.
 */
export function generateCowSwapTokenEntry(token: TokenMetadata): Record<string, unknown> {
  return {
    chainId: token.chainId,
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    logoURI: token.logoUrl,
    tags: ["stablecoin", "ubiquity"],
  };
}

/**
 * Generates MetaMask contract-metadata entry format.
 */
export function generateMetaMaskEntry(token: TokenMetadata): Record<string, unknown> {
  return {
    [token.address]: {
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      erc20: true,
      logo: token.logoUrl,
    },
  };
}

/**
 * Generates TrustWallet assets repository file structure.
 * Requires specific folder layout: blockchains/ethereum/assets/{address}/info.json
 */
export function generateTrustWalletInfoJson(token: TokenMetadata): string {
  return JSON.stringify({
    id: token.address,
    name: token.name,
    symbol: token.symbol,
    type: "ERC20",
    decimals: token.decimals,
    description: `${token.name} (${token.symbol}) - Ubiquity Protocol`,
    website: "https://ubq.fi",
    explorer: `https://etherscan.io/token/${token.address}`,
    research: "",
  }, null, 2);
}

/**
 * Generates Uniswap default token list entry.
 */
export function generateUniswapTokenEntry(token: TokenMetadata): Record<string, unknown> {
  return {
    chainId: token.chainId,
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    logoURI: token.logoUrl,
    tags: [],
  };
}

/**
 * Calculates total listing fees across all services.
 */
export function calculateTotalFees(tracker: ListingTracker = DEFAULT_TRACKER): {
  totalUsd: number;
  paidUsd: number;
  pendingUsd: number;
  breakdown: Array<{ service: string; fee: number; status: string }>;
} {
  let totalUsd = 0;
  let paidUsd = 0;
  let pendingUsd = 0;
  const breakdown: Array<{ service: string; fee: number; status: string }> = [];

  for (const req of tracker.requests) {
    if (req.feeUsd && req.feeUsd > 0) {
      totalUsd += req.feeUsd;
      if (req.status === "paid") {
        paidUsd += req.feeUsd;
      } else {
        pendingUsd += req.feeUsd;
      }
      breakdown.push({ service: req.service, fee: req.feeUsd, status: req.status });
    }
  }

  return { totalUsd, paidUsd, pendingUsd, breakdown };
}

/**
 * Generates a status report showing listing progress across all services.
 */
export function generateListingReport(tracker: ListingTracker = DEFAULT_TRACKER): string {
  const byCategory = tracker.requests.reduce(
    (acc, req) => {
      if (!acc[req.category]) acc[req.category] = [];
      acc[req.category].push(req);
      return acc;
    },
    {} as Record<string, ListingRequest[]>
  );

  const lines = [
    "## UUSD & UBQ Token Listing Status",
    "",
    `**Last Updated:** ${new Date(tracker.lastUpdated).toISOString()}`,
    "",
  ];

  for (const [category, requests] of Object.entries(byCategory)) {
    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}s`);
    lines.push("| Service | Status | Link/Fee | Notes |");
    lines.push("|---------|--------|----------|-------|");

    for (const req of requests) {
      const link = req.issueUrl || req.prUrl || "-";
      const fee = req.feeUsd ? `$${req.feeUsd}` : "-";
      const linkOrFee = link !== "-" ? `[Link](${link})` : fee;
      lines.push(`| ${req.service} | ${req.status} | ${linkOrFee} | ${req.notes || ""} |`);
    }
    lines.push("");
  }

  const fees = calculateTotalFees(tracker);
  lines.push("### Fee Summary");
  lines.push(`- **Total Fees:** $${fees.totalUsd.toLocaleString()}`);
  lines.push(`- **Paid:** $${fees.paidUsd.toLocaleString()}`);
  lines.push(`- **Pending:** $${fees.pendingUsd.toLocaleString()}`);

  const approved = tracker.requests.filter((r) => r.status === "approved").length;
  const total = tracker.requests.length;
  lines.push("", `**Overall Progress:** ${approved}/${total} listings approved (${Math.round((approved / total) * 100)}%)`);

  return lines.join("\n");
}

/**
 * Determines next actionable items based on current listing status.
 */
export function getNextActions(tracker: ListingTracker = DEFAULT_TRACKER): Array<{
  priority: "high" | "medium" | "low";
  action: string;
  service: string;
}> {
  const actions: Array<{ priority: "high" | "medium" | "low"; action: string; service: string }> = [];

  // High priority: rejected items that can be retried
  for (const req of tracker.requests) {
    if (req.status === "rejected") {
      actions.push({
        priority: "high",
        action: `Retry listing submission (previously rejected)`,
        service: req.service,
      });
    }
  }

  // Medium priority: pending submissions needing follow-up
  for (const req of tracker.requests) {
    if (req.status === "submitted" && req.submittedAt) {
      const daysSinceSubmission = (Date.now() - req.submittedAt) / (24 * 60 * 60 * 1000);
      if (daysSinceSubmission > 14) {
        actions.push({
          priority: "medium",
          action: `Follow up on submission (${Math.floor(daysSinceSubmission)} days ago)`,
          service: req.service,
        });
      }
    }
  }

  // Low priority: new submissions needed
  for (const req of tracker.requests) {
    if (req.status === "pending" && !req.feeUsd) {
      actions.push({
        priority: "low",
        action: `Submit listing request`,
        service: req.service,
      });
    }
  }

  return actions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

/**
 * Validates that token metadata meets common listing requirements.
 */
export function validateTokenMetadata(token: TokenMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!token.address || !/^0x[a-fA-F0-9]{40}$/.test(token.address)) {
    errors.push(`Invalid Ethereum address: ${token.address}`);
  }
  if (!token.logoUrl || !token.logoUrl.startsWith("https://")) {
    errors.push(`Logo URL must be HTTPS: ${token.logoUrl}`);
  }
  if (token.decimals !== 18) {
    errors.push(`Expected 18 decimals, got ${token.decimals}`);
  }
  if (!token.name || token.name.length < 3) {
    errors.push(`Token name too short: ${token.name}`);
  }
  if (!token.symbol || token.symbol.length < 2 || token.symbol.length > 10) {
    errors.push(`Token symbol must be 2-10 chars: ${token.symbol}`);
  }

  return { valid: errors.length === 0, errors };
}

export { DEFAULT_TRACKER, UUSD_MAINNET, UBQ_MAINNET };
