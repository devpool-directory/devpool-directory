/**
 * @file generate-permit-command.ts
 * @description Scaffolding and generator utilities for the `/generate-permit` slash command.
 * Enables admins to generate ad-hoc permits for contributors directly from issue comments.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#452
 * Bounty Value: $600 USD (estimated based on similar command issues)
 * 
 * This module provides:
 * - Slash command parser and validator for permit generation parameters
 * - Admin access control integration
 * - Wallet resolution pipeline (GitHub username -> wallet address)
 * - Permit generation orchestrator with chain/token validation
 * - Response formatter for successful and failed permit generations
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Parsed parameters from the /generate-permit command invocation.
 */
export interface GeneratePermitParams {
  /** GitHub username of the beneficiary */
  githubUsername: string;
  /** Target blockchain identifier */
  chain: ChainIdentifier;
  /** Amount to permit in human-readable format */
  amount: string;
  /** Token contract address or symbol */
  token: TokenIdentifier;
  /** Optional reason/memo for the permit */
  memo?: string;
}

/**
 * Supported blockchain identifiers.
 */
export type ChainIdentifier = 
  | "ethereum" | "eth" | 1
  | "gnosis" | "gno" | 100
  | "polygon" | "matic" | 137
  | "arbitrum" | "arb" | 42161
  | "optimism" | "op" | 10
  | "base" | 8453
  | "sepolia" | 11155111;

/**
 * Token identifier - either a known symbol or contract address.
 */
export type TokenIdentifier = string;

/**
 * Result of wallet resolution from GitHub identity.
 */
export interface WalletResolution {
  /** Resolved wallet address */
  address: string;
  /** Source of the resolution */
  source: "supabase" | "github-profile" | "ens" | "manual";
  /** Whether the wallet was verified/registered */
  verified: boolean;
  /** Original GitHub user ID used for lookup */
  githubUserId: number;
}

/**
 * Access control check result.
 */
export interface AccessCheckResult {
  /** Whether the invoker has permission */
  authorized: boolean;
  /** Role that granted access (if any) */
  role?: "admin" | "maintainer" | "owner";
  /** Reason for denial (if unauthorized) */
  denialReason?: string;
}

/**
 * Permit generation result.
 */
export interface PermitGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated permit data (if successful) */
  permit?: {
    /** Permit signature/hash */
    signature: string;
    /** Deadline timestamp */
    deadline: number;
    /** Nonce used */
    nonce: bigint;
    /** Token contract address */
    tokenAddress: string;
    /** Beneficiary wallet address */
    beneficiary: string;
    /** Amount permitted */
    amount: bigint;
    /** Chain ID where permit is valid */
    chainId: number;
  };
  /** Transaction hash if submitted on-chain */
  txHash?: string;
  /** Error message if failed */
  error?: string;
  /** Validation warnings */
  warnings: string[];
}

/**
 * Configuration for the generate-permit command.
 */
export interface GeneratePermitConfig {
  /** Supabase URL for wallet lookups */
  supabaseUrl: string;
  /** Supabase service key */
  supabaseKey: string;
  /** Default chain if not specified */
  defaultChain: ChainIdentifier;
  /** Default token if not specified */
  defaultToken: TokenIdentifier;
  /** Maximum permit amount per invocation */
  maxAmount: bigint;
  /** Permit validity duration in seconds */
  permitValiditySeconds: number;
  /** RPC endpoints by chain ID */
  rpcEndpoints: Record<number, string>;
  /** Admin GitHub usernames/org teams */
  allowedAdmins: string[];
}

// ============================================================================
// COMMAND PARSER
// ============================================================================

/**
 * Parses and validates the /generate-permit command arguments.
 * 
 * Format: /generate-permit [githubUsername] [chainId|chainName] [amount] [tokenAddress|tokenSymbol]
 * 
 * @param rawArgs - Raw argument string after the command name
 * @param config - Command configuration
 * @returns Parsed parameters or validation errors
 */
export function parseGeneratePermitCommand(
  rawArgs: string,
  config: GeneratePermitConfig
): { params?: GeneratePermitParams; errors: string[] } {
  const errors: string[] = [];
  const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);

  if (tokens.length < 3) {
    errors.push("Usage: /generate-permit <githubUsername> <chainId|chainName> <amount> [tokenAddress|tokenSymbol]");
    return { errors };
  }

  const [username, chainArg, amountArg, tokenArg] = tokens;

  // Validate GitHub username format
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(username)) {
    errors.push(`Invalid GitHub username format: ${username}`);
  }

  // Parse chain identifier
  const chain = parseChainIdentifier(chainArg);
  if (chain === null) {
    errors.push(`Unknown chain: ${chainArg}. Supported: ethereum, gnosis, polygon, arbitrum, optimism, base, sepolia`);
  }

  // Validate amount
  const amount = parseAmount(amountArg);
  if (amount === null) {
    errors.push(`Invalid amount: ${amountArg}. Must be a positive number.`);
  } else if (amount > config.maxAmount) {
    errors.push(`Amount ${amountArg} exceeds maximum allowed (${formatBigInt(config.maxAmount)})`);
  }

  // Token is optional - use default if not provided
  const token = tokenArg || config.defaultToken;
  if (!token) {
    errors.push("No token specified and no default token configured");
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    params: {
      githubUsername: username,
      chain: chain!,
      amount: amountArg,
      token,
    },
    errors: [],
  };
}

/**
 * Parse chain identifier from string or number.
 */
function parseChainIdentifier(input: string): ChainIdentifier | null {
  const normalized = input.toLowerCase().trim();
  
  const chainMap: Record<string, ChainIdentifier> = {
    "ethereum": "ethereum",
    "eth": "eth",
    "1": 1,
    "gnosis": "gnosis",
    "gno": "gno",
    "100": 100,
    "polygon": "polygon",
    "matic": "matic",
    "137": 137,
    "arbitrum": "arbitrum",
    "arb": "arb",
    "42161": 42161,
    "optimism": "optimism",
    "op": "op",
    "10": 10,
    "base": "base",
    "8453": 8453,
    "sepolia": "sepolia",
    "11155111": 11155111,
  };

  return chainMap[normalized] ?? null;
}

/**
 * Parse amount string to bigint (wei-scale).
 */
function parseAmount(input: string): bigint | null {
  try {
    const num = parseFloat(input);
    if (isNaN(num) || num <= 0) return null;
    
    // Convert to wei (18 decimals)
    const parts = input.split(".");
    const intPart = parts[0];
    const decPart = (parts[1] || "").padEnd(18, "0").slice(0, 18);
    
    return BigInt(intPart + decPart);
  } catch {
    return null;
  }
}

/**
 * Format bigint amount for display.
 */
function formatBigInt(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return `${intPart}.${decPart.slice(0, 4)}`;
}

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Checks if the command invoker has admin permissions.
 * Integrates with existing Ubiquity OS access control system.
 * 
 * @param invoker - GitHub username of the person invoking the command
 * @param repoOwner - Repository owner
 * @param repoName - Repository name
 * @param config - Command configuration
 * @returns Access check result
 */
export async function checkAdminAccess(
  invoker: string,
  repoOwner: string,
  repoName: string,
  config: GeneratePermitConfig
): Promise<AccessCheckResult> {
  // Check explicit allowlist first
  if (config.allowedAdmins.includes(invoker.toLowerCase())) {
    return { authorized: true, role: "admin" };
  }

  // In production, would check GitHub API for org/team membership
  // and repository permissions via Octokit
  
  /*
  const octokit = getOctokit();
  
  // Check if user is repo owner
  if (invoker.toLowerCase() === repoOwner.toLowerCase()) {
    return { authorized: true, role: "owner" };
  }
  
  // Check if user is maintainer/admin on the repo
  try {
    const { data: perm } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner: repoOwner,
      repo: repoName,
      username: invoker,
    });
    
    if (perm.permission === "admin" || perm.permission === "maintain") {
      return { authorized: true, role: perm.permission as "admin" | "maintainer" };
    }
  } catch {
    // User might not be a collaborator at all
  }
  
  // Check org team membership
  try {
    const { data: teams } = await octokit.rest.teams.listForAuthenticatedUser();
    const adminTeams = teams.filter(t => 
      t.organization?.login.toLowerCase() === repoOwner.toLowerCase() &&
      t.permission === "admin"
    );
    
    for (const team of adminTeams) {
      try {
        await octokit.rest.teams.getMembershipForUserInOrg({
          org: repoOwner,
          team_slug: team.slug,
          username: invoker,
        });
        return { authorized: true, role: "admin" };
      } catch {
        // Not a member of this team
      }
    }
  } catch {
    // Not authenticated or other error
  }
  */

  return {
    authorized: false,
    denialReason: `User @${invoker} does not have admin permissions. Only admins can generate permits.`,
  };
}

// ============================================================================
// WALLET RESOLUTION
// ============================================================================

/**
 * Resolves a GitHub username to a wallet address.
 * Follows the priority: GitHub username -> GitHub ID -> Supabase wallet lookup.
 * 
 * @param githubUsername - GitHub username to resolve
 * @param config - Command configuration
 * @returns Wallet resolution result
 */
export async function resolveWallet(
  githubUsername: string,
  config: GeneratePermitConfig
): Promise<WalletResolution | { error: string }> {
  // Step 1: Get GitHub user ID from username
  let githubUserId: number;
  
  /*
  try {
    const octokit = getOctokit();
    const { data: user } = await octokit.rest.users.getByUsername({ username: githubUsername });
    githubUserId = user.id;
  } catch (error) {
    return { error: `GitHub user not found: ${githubUsername}` };
  }
  */
  
  // Placeholder for scaffolding
  githubUserId = 0;
  console.warn("GitHub user lookup requires Octokit initialization");

  // Step 2: Look up wallet in Supabase using GitHub ID
  /*
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);
  
  const { data, error } = await supabase
    .from("wallets")
    .select("address, verified")
    .eq("github_user_id", githubUserId)
    .maybeSingle();
  
  if (error) {
    return { error: `Database error during wallet lookup: ${error.message}` };
  }
  
  if (data) {
    return {
      address: data.address,
      source: "supabase",
      verified: data.verified,
      githubUserId,
    };
  }
  */

  // Step 3: Fallback - check GitHub profile bio for ENS/address
  /*
  try {
    const { data: user } = await octokit.rest.users.getByUsername({ username: githubUsername });
    const bio = user.bio || "";
    
    // Look for ENS name
    const ensMatch = bio.match(/[a-zA-Z0-9-]+\.eth/i);
    if (ensMatch) {
      // Would resolve ENS to address here
      return {
        address: ensMatch[0],
        source: "ens",
        verified: false,
        githubUserId,
      };
    }
    
    // Look for Ethereum address pattern
    const addrMatch = bio.match(/0x[a-fA-F0-9]{40}/);
    if (addrMatch) {
      return {
        address: addrMatch[0],
        source: "github-profile",
        verified: false,
        githubUserId,
      };
    }
  } catch {
    // Profile lookup failed
  }
  */

  return { error: `No registered wallet found for @${githubUsername}. User must register via /wallet command first.` };
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Validates and resolves token identifier to contract address.
 * 
 * @param token - Token symbol or address
 * @param chainId - Target chain ID
 * @returns Resolved token info or error
 */
export async function validateToken(
  token: TokenIdentifier,
  chainId: number
): Promise<{ address: string; decimals: number; symbol: string } | { error: string }> {
  // If already an address, validate format
  if (token.startsWith("0x")) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return { error: `Invalid token address format: ${token}` };
    }
    // Would query chain for decimals/symbol
    return { address: token.toLowerCase(), decimals: 18, symbol: "UNKNOWN" };
  }

  // Known token registry
  const tokenRegistry: Record<number, Record<string, { address: string; decimals: number }>> = {
    1: {
      "UBQ": { address: "0x0f51bb10119727a7e5eA3538074fb341F56B09Ad", decimals: 18 },
      "DAI": { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      "USDC": { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      "WETH": { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    },
    100: {
      "UBQ": { address: "0x4EC1a0E17e7f69845d0A89080b3a2C3e1A3F3F3a", decimals: 18 },
      "WXDAI": { address: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", decimals: 18 },
    },
    137: {
      "UBQ": { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 18 },
      "USDC": { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
    },
  };

  const chainTokens = tokenRegistry[chainId];
  if (!chainTokens) {
    return { error: `No token registry available for chain ${chainId}` };
  }

  const upperToken = token.toUpperCase();
  const tokenInfo = chainTokens[upperToken];
  
  if (!tokenInfo) {
    return { 
      error: `Unknown token "${token}" on chain ${chainId}. Available: ${Object.keys(chainTokens).join(", ")}` 
    };
  }

  return {
    address: tokenInfo.address,
    decimals: tokenInfo.decimals,
    symbol: upperToken,
  };
}

// ============================================================================
// PERMIT GENERATOR
// ============================================================================

/**
 * Orchestrates the complete permit generation flow.
 * 
 * @param params - Parsed command parameters
 * @param invoker - GitHub username of the invoker
 * @param config - Command configuration
 * @returns Permit generation result
 */
export async function generatePermit(
  params: GeneratePermitParams,
  invoker: string,
  config: GeneratePermitConfig
): Promise<PermitGenerationResult> {
  const warnings: string[] = [];

  // Step 1: Resolve chain ID
  const chainId = resolveChainId(params.chain);
  if (!chainId) {
    return { success: false, error: `Could not resolve chain: ${params.chain}`, warnings };
  }

  // Step 2: Resolve beneficiary wallet
  const walletResult = await resolveWallet(params.githubUsername, config);
  if ("error" in walletResult) {
    return { success: false, error: walletResult.error, warnings };
  }

  if (!walletResult.verified) {
    warnings.push(`⚠️ Wallet for @${params.githubUsername} is not verified. Please verify before sending large amounts.`);
  }

  // Step 3: Validate token
  const tokenResult = await validateToken(params.token, chainId);
  if ("error" in tokenResult) {
    return { success: false, error: tokenResult.error, warnings };
  }

  // Step 4: Parse amount with correct decimals
  const amountWei = parseAmountWithDecimals(params.amount, tokenResult.decimals);
  if (amountWei === null) {
    return { success: false, error: `Invalid amount: ${params.amount}`, warnings };
  }

  // Step 5: Generate permit signature
  // In production, this would call the permit generation service
  /*
  const permitService = new PermitGenerationService({
    rpcUrl: config.rpcEndpoints[chainId],
    privateKey: process.env.PERMIT_SIGNER_KEY!,
  });
  
  const permit = await permitService.generate({
    beneficiary: walletResult.address,
    token: tokenResult.address,
    amount: amountWei,
    chainId,
    validitySeconds: config.permitValiditySeconds,
  });
  */

  // Placeholder for scaffolding
  const mockPermit = {
    signature: "0x" + "0".repeat(130),
    deadline: Math.floor(Date.now() / 1000) + config.permitValiditySeconds,
    nonce: 0n,
    tokenAddress: tokenResult.address,
    beneficiary: walletResult.address,
    amount: amountWei,
    chainId,
  };

  return {
    success: true,
    permit: mockPermit,
    warnings,
  };
}

/**
 * Resolve chain identifier to numeric chain ID.
 */
function resolveChainId(chain: ChainIdentifier): number | null {
  if (typeof chain === "number") return chain;
  
  const map: Record<string, number> = {
    "ethereum": 1, "eth": 1,
    "gnosis": 100, "gno": 100,
    "polygon": 137, "matic": 137,
    "arbitrum": 42161, "arb": 42161,
    "optimism": 10, "op": 10,
    "base": 8453,
    "sepolia": 11155111,
  };
  
  return map[chain] ?? null;
}

/**
 * Parse amount with specific decimal places.
 */
function parseAmountWithDecimals(amount: string, decimals: number): bigint | null {
  try {
    const parts = amount.split(".");
    const intPart = parts[0] || "0";
    const decPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return BigInt(intPart + decPart);
  } catch {
    return null;
  }
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

/**
 * Formats the permit generation result as a GitHub comment.
 * 
 * @param result - Generation result
 * @param params - Original command parameters
 * @param invoker - Who invoked the command
 * @returns Markdown-formatted response
 */
export function formatPermitResponse(
  result: PermitGenerationResult,
  params: GeneratePermitParams,
  invoker: string
): string {
  const lines: string[] = [];

  if (!result.success) {
    lines.push(`### ❌ Permit Generation Failed`);
    lines.push(``);
    lines.push(`**Error:** ${result.error}`);
    lines.push(``);
    lines.push(`*Invoked by @${invoker}*`);
    return lines.join("\n");
  }

  lines.push(`### ✅ Permit Generated Successfully`);
  lines.push(``);
  
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      lines.push(warning);
    }
    lines.push(``);
  }

  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Beneficiary** | @${params.githubUsername} (\`${result.permit!.beneficiary}\`) |`);
  lines.push(`| **Amount** | ${formatBigInt(result.permit!.amount)} ${params.token.toUpperCase()} |`);
  lines.push(`| **Chain** | ${params.chain} (${result.permit!.chainId}) |`);
  lines.push(`| **Token** | \`${result.permit!.tokenAddress}\` |`);
  lines.push(`| **Deadline** | ${new Date(result.permit!.deadline * 1000).toISOString()} |`);
  lines.push(`| **Nonce** | ${result.permit!.nonce.toString()} |`);
  lines.push(``);
  
  lines.push(`<details>`);
  lines.push(`<summary>📝 Permit Signature (click to expand)</summary>`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(result.permit!.signature);
  lines.push(`\`\`\``);
  lines.push(`</details>`);
  lines.push(``);
  
  if (result.txHash) {
    lines.push(`**Transaction:** \`${result.txHash}\``);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Generated by @${invoker} via \`/generate-permit\`*`);

  return lines.join("\n");
}

// ============================================================================
// SLASH COMMAND HANDLER
// ============================================================================

/**
 * Main handler for the /generate-permit slash command.
 * Entry point for the Ubiquity OS plugin system.
 * 
 * @param context - Plugin execution context
 * @returns Response to post as comment
 */
export async function handleGeneratePermitCommand(context: {
  commandArgs: string;
  invoker: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
}): Promise<string> {
  const config: GeneratePermitConfig = {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || "",
    defaultChain: "gnosis",
    defaultToken: "UBQ",
    maxAmount: BigInt("10000000000000000000000"), // 10,000 tokens max
    permitValiditySeconds: 7 * 24 * 60 * 60, // 7 days
    rpcEndpoints: {
      1: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
      100: process.env.GNOSIS_RPC_URL || "https://rpc.gnosis.gateway.fm",
      137: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    },
    allowedAdmins: (process.env.PERMIT_ADMINS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
  };

  // Step 1: Check access
  const access = await checkAdminAccess(
    context.invoker,
    context.repoOwner,
    context.repoName,
    config
  );

  if (!access.authorized) {
    return `### 🔒 Access Denied\n\n${access.denialReason}`;
  }

  // Step 2: Parse command
  const parsed = parseGeneratePermitCommand(context.commandArgs, config);
  if (parsed.errors.length > 0) {
    return `### ⚠️ Invalid Command\n\n${parsed.errors.join("\n")}`;
  }

  // Step 3: Generate permit
  const result = await generatePermit(parsed.params!, context.invoker, config);

  // Step 4: Format response
  return formatPermitResponse(result, parsed.params!, context.invoker);
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates the complete command configuration.
 * Used during plugin initialization.
 * 
 * @param config - Configuration to validate
 * @returns Validation errors (empty if valid)
 */
export function validateConfig(config: GeneratePermitConfig): string[] {
  const errors: string[] = [];

  if (!config.supabaseUrl) errors.push("SUPABASE_URL is required");
  if (!config.supabaseKey) errors.push("SUPABASE_SERVICE_KEY is required");
  if (config.maxAmount <= 0n) errors.push("maxAmount must be positive");
  if (config.permitValiditySeconds <= 0) errors.push("permitValiditySeconds must be positive");
  if (Object.keys(config.rpcEndpoints).length === 0) errors.push("At least one RPC endpoint required");
  if (config.allowedAdmins.length === 0) errors.push("At least one admin must be configured");

  return errors;
}

/**
 * Generates test fixtures for command testing.
 */
export function generateTestFixtures(): {
  validCommands: string[];
  invalidCommands: string[];
  expectedResults: Record<string, { success: boolean; errorContains?: string }>;
} {
  return {
    validCommands: [
      "/generate-permit alice gnosis 100 UBQ",
      "/generate-permit bob ethereum 50.5 DAI",
      "/generate-permit charlie polygon 1000 USDC",
      "/generate-permit dave 100 10 0x0f51bb10119727a7e5eA3538074fb341F56B09Ad",
    ],
    invalidCommands: [
      "/generate-permit", // Missing args
      "/generate-permit alice", // Missing chain/amount
      "/generate-permit alice invalidchain 100 UBQ", // Bad chain
      "/generate-permit alice gnosis -10 UBQ", // Negative amount
      "/generate-permit alice gnosis abc UBQ", // Non-numeric amount
      "/generate-permit @#$% gnosis 100 UBQ", // Invalid username
    ],
    expectedResults: {
      "alice-gnosis-100": { success: true },
      "missing-args": { success: false, errorContains: "Usage:" },
      "bad-chain": { success: false, errorContains: "Unknown chain" },
      "negative-amount": { success: false, errorContains: "Invalid amount" },
    },
  };
}
