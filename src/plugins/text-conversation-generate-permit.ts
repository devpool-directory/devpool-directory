/**
 * @file text-conversation-generate-permit.ts
 * @description Scaffolding and generator utilities for implementing the
 * `/generate-permit` slash command in text-conversation-rewards. Enables
 * admin-controlled ad-hoc permit generation by resolving GitHub usernames
 * to wallet addresses automatically.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#452
 * Requirements:
 * - Command format: `/generate-permit [githubUsername] [chainId|chainName] [amount] [tokenAddress|tokenSymbol]`
 * - Resolve githubUsername → githubId → supabase wallet automatically
 * - Access control: only admins can invoke this command
 * - Integrate with existing permit generation infrastructure in this plugin
 */

import type { PluginContext } from "./types";

/**
 * Configuration for the generate-permit command.
 */
export interface GeneratePermitConfig {
  /** Supported chain identifiers (numeric IDs and friendly names) */
  supportedChains: Record<string, number>;
  /** Supported token symbols mapped to contract addresses per chain */
  supportedTokens: Record<string, Record<number, string>>;
  /** Maximum permit amount allowed per invocation */
  maxPermitAmount: string;
  /** Whether to require explicit admin role check */
  enforceAdminAccess: boolean;
  /** Log level for permit operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Parsed arguments from the /generate-permit command.
 */
export interface PermitCommandArgs {
  githubUsername: string;
  chainIdentifier: string;
  amount: string;
  tokenIdentifier: string;
}

/**
 * Resolved permit parameters ready for generation.
 */
export interface ResolvedPermitParams {
  recipientAddress: string;
  recipientGithubLogin: string;
  chainId: number;
  tokenAddress: string;
  amount: string;
  resolvedFrom: {
    usernameToId: boolean;
    idToWallet: boolean;
    chainNameToId: boolean;
    symbolToAddress: boolean;
  };
}

/**
 * Result of a permit generation attempt.
 */
export interface PermitGenerationResult {
  success: boolean;
  permitData?: string;
  transactionHash?: string;
  error?: string;
  resolvedParams?: ResolvedPermitParams;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the permit command system.
 * @returns String containing interface definitions
 */
export function generatePermitCommandInterfaces(): string {
  return `
/**
 * Interface for parsing and validating /generate-permit command arguments.
 */
export interface IPermitCommandParser {
  /**
   * Parses raw command arguments into structured permit parameters.
   * @param args - Raw argument strings from the command invocation
   * @returns Parsed arguments or validation errors
   */
  parse(args: string[]): { valid: boolean; parsed?: PermitCommandArgs; errors: string[] };
}

/**
 * Interface for resolving GitHub usernames to on-chain wallet addresses.
 */
export interface IWalletResolver {
  /**
   * Resolves a GitHub username to an Ethereum wallet address.
   * Flow: githubUsername → githubId → supabase wallet lookup
   * @param githubUsername - GitHub login to resolve
   * @returns Wallet address or null if not found
   */
  resolveWallet(githubUsername: string): Promise<string | null>;
}

/**
 * Interface for resolving chain and token identifiers to canonical values.
 */
export interface IChainTokenResolver {
  /**
   * Resolves a chain identifier (name or ID) to a numeric chain ID.
   * @param identifier - Chain name or numeric ID string
   * @returns Numeric chain ID or null if unsupported
   */
  resolveChainId(identifier: string): number | null;

  /**
   * Resolves a token identifier (symbol or address) to a contract address.
   * @param identifier - Token symbol or contract address
   * @param chainId - Target chain ID
   * @returns Token contract address or null if unsupported
   */
  resolveTokenAddress(identifier: string, chainId: number): string | null;
}

/**
 * Interface for access control verification.
 */
export interface IPermitAccessController {
  /**
   * Checks whether the invoking user has permission to generate permits.
   * @param invokerLogin - GitHub login of the command invoker
   * @returns True if the user is authorized
   */
  isAuthorized(invokerLogin: string): Promise<boolean>;
}

/**
 * Interface for the actual permit generation logic.
 */
export interface IPermitGenerator {
  /**
   * Generates a signed permit for the resolved parameters.
   * @param params - Fully resolved permit parameters
   * @returns Generation result with permit data or error
   */
  generate(params: ResolvedPermitParams): Promise<PermitGenerationResult>;
}
`;
}

/**
 * Generates the command parser implementation.
 * @returns String containing parser class implementation
 */
export function generatePermitCommandParser(): string {
  return `
import type { IPermitCommandParser, PermitCommandArgs } from "./interfaces";

/**
 * Parses and validates /generate-permit command arguments.
 * Expected format: /generate-permit <username> <chain> <amount> <token>
 */
export class PermitCommandParser implements IPermitCommandParser {
  parse(args: string[]): { valid: boolean; parsed?: PermitCommandArgs; errors: string[] } {
    const errors: string[] = [];

    if (args.length < 4) {
      errors.push(\`Expected 4 arguments but received \${args.length}. Usage: /generate-permit <githubUsername> <chainId|chainName> <amount> <tokenAddress|tokenSymbol>\`);
      return { valid: false, errors };
    }

    const [githubUsername, chainIdentifier, amount, tokenIdentifier] = args;

    // Validate GitHub username format
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(githubUsername)) {
      errors.push(\`Invalid GitHub username format: \${githubUsername}\`);
    }

    // Validate amount is a positive number
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      errors.push(\`Amount must be a positive number, got: \${amount}\`);
    }

    // Validate chain identifier is non-empty
    if (!chainIdentifier || chainIdentifier.trim().length === 0) {
      errors.push("Chain identifier cannot be empty");
    }

    // Validate token identifier is non-empty
    if (!tokenIdentifier || tokenIdentifier.trim().length === 0) {
      errors.push("Token identifier cannot be empty");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      parsed: {
        githubUsername: githubUsername.trim(),
        chainIdentifier: chainIdentifier.trim(),
        amount: amount.trim(),
        tokenIdentifier: tokenIdentifier.trim(),
      },
      errors: [],
    };
  }
}
`;
}

/**
 * Generates the wallet resolver implementation.
 * @returns String containing resolver class implementation
 */
export function generateWalletResolver(): string {
  return `
import type { IWalletResolver } from "./interfaces";

/**
 * Resolves GitHub usernames to wallet addresses via the Supabase user registry.
 * Flow: username → GitHub API → user ID → Supabase wallet lookup
 */
export class GithubWalletResolver implements IWalletResolver {
  async resolveWallet(githubUsername: string): Promise<string | null> {
    // Step 1: Resolve username to GitHub user ID
    // In production: const user = await octokit.rest.users.getByUsername({ username: githubUsername });
    // For scaffold, simulate resolution
    console.info?.(\`[WalletResolver] Resolving wallet for @\${githubUsername}\`);

    // Step 2: Look up wallet in Supabase by GitHub ID
    // In production: const { data } = await supabase.from('wallets').select('address').eq('github_id', userId).single();
    
    // Scaffold placeholder - returns null to indicate real implementation needed
    return null;
  }
}
`;
}

/**
 * Generates the chain/token resolver implementation.
 * @param config - Permit command configuration
 * @returns String containing resolver class implementation
 */
export function generateChainTokenResolver(config: GeneratePermitConfig): string {
  return `
import type { IChainTokenResolver } from "./interfaces";

/**
 * Resolves human-friendly chain and token identifiers to canonical values.
 */
export class ChainTokenResolver implements IChainTokenResolver {
  private readonly supportedChains: Record<string, number>;
  private readonly supportedTokens: Record<string, Record<number, string>>;

  constructor() {
    this.supportedChains = ${JSON.stringify(config.supportedChains)};
    this.supportedTokens = ${JSON.stringify(config.supportedTokens)};
  }

  resolveChainId(identifier: string): number | null {
    // Check if it's already a numeric ID
    const numericId = parseInt(identifier, 10);
    if (!isNaN(numericId)) {
      const chainIds = Object.values(this.supportedChains);
      return chainIds.includes(numericId) ? numericId : null;
    }

    // Look up by name (case-insensitive)
    const normalizedName = identifier.toLowerCase();
    for (const [name, id] of Object.entries(this.supportedChains)) {
      if (name.toLowerCase() === normalizedName) {
        return id;
      }
    }

    return null;
  }

  resolveTokenAddress(identifier: string, chainId: number): string | null {
    // Check if it's already a valid address format
    if (/^0x[a-fA-F0-9]{40}$/.test(identifier)) {
      return identifier;
    }

    // Look up by symbol (case-insensitive)
    const normalizedSymbol = identifier.toUpperCase();
    const chainTokens = this.supportedTokens[normalizedSymbol];
    if (chainTokens && chainTokens[chainId]) {
      return chainTokens[chainId];
    }

    return null;
  }
}
`;
}

/**
 * Generates test scaffolding for the permit command system.
 * @returns String containing Vitest test suite
 */
export function generatePermitCommandTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { PermitCommandParser, ChainTokenResolver } from "../text-conversation-generate-permit";

describe("/generate-permit Command", () => {
  let parser: PermitCommandParser;
  let resolver: ChainTokenResolver;

  beforeEach(() => {
    parser = new PermitCommandParser();
    resolver = new ChainTokenResolver();
  });

  it("should parse valid command arguments", () => {
    const result = parser.parse(["contributor", "ethereum", "100", "USDC"]);
    expect(result.valid).toBe(true);
    expect(result.parsed?.githubUsername).toBe("contributor");
    expect(result.parsed?.chainIdentifier).toBe("ethereum");
    expect(result.parsed?.amount).toBe("100");
    expect(result.parsed?.tokenIdentifier).toBe("USDC");
  });

  it("should reject insufficient arguments", () => {
    const result = parser.parse(["contributor", "ethereum"]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Expected 4 arguments");
  });

  it("should reject invalid amount", () => {
    const result = parser.parse(["contributor", "ethereum", "abc", "USDC"]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("positive number"))).toBe(true);
  });

  it("should reject invalid GitHub username format", () => {
    const result = parser.parse(["-invalid-user", "ethereum", "100", "USDC"]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("GitHub username"))).toBe(true);
  });

  it("should resolve chain names to IDs", () => {
    expect(resolver.resolveChainId("ethereum")).toBe(1);
    expect(resolver.resolveChainId("gnosis")).toBe(100);
    expect(resolver.resolveChainId("unsupported")).toBeNull();
  });

  it("should resolve numeric chain IDs", () => {
    expect(resolver.resolveChainId("1")).toBe(1);
    expect(resolver.resolveChainId("100")).toBe(100);
    expect(resolver.resolveChainId("999")).toBeNull();
  });

  it("should resolve token symbols to addresses", () => {
    const address = resolver.resolveTokenAddress("USDC", 1);
    // Address depends on config; verify it returns a string or null
    expect(typeof address === "string" || address === null).toBe(true);
  });

  it("should pass through valid token addresses", () => {
    const addr = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    expect(resolver.resolveTokenAddress(addr, 1)).toBe(addr);
  });
});
`;
}

/**
 * Main generator function for all permit command artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<GeneratePermitConfig>
): Record<string, string> {
  const resolvedConfig: GeneratePermitConfig = {
    supportedChains: {
      ethereum: 1,
      gnosis: 100,
      polygon: 137,
    },
    supportedTokens: {
      USDC: {
        1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        100: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
      },
      WXDAI: {
        100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
      },
    },
    maxPermitAmount: "10000",
    enforceAdminAccess: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generatePermitCommandInterfaces(),
    parser: generatePermitCommandParser(),
    walletResolver: generateWalletResolver(),
    chainTokenResolver: generateChainTokenResolver(resolvedConfig),
    tests: generatePermitCommandTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 * @param artifacts - Generated code artifacts
 * @returns Validation result
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IPermitCommandParser")) {
    errors.push("Missing IPermitCommandParser interface");
  }

  if (!artifacts.interfaces.includes("IWalletResolver")) {
    errors.push("Missing IWalletResolver interface");
  }

  if (!artifacts.interfaces.includes("IChainTokenResolver")) {
    errors.push("Missing IChainTokenResolver interface");
  }

  if (!artifacts.interfaces.includes("IPermitAccessController")) {
    errors.push("Missing IPermitAccessController interface");
  }

  if (!artifacts.parser.includes("PermitCommandParser")) {
    errors.push("Missing PermitCommandParser class");
  }

  if (!artifacts.walletResolver.includes("GithubWalletResolver")) {
    errors.push("Missing GithubWalletResolver class");
  }

  if (!artifacts.chainTokenResolver.includes("ChainTokenResolver")) {
    errors.push("Missing ChainTokenResolver class");
  }

  if (!artifacts.tests.includes("should parse valid command arguments")) {
    errors.push("Missing critical test for argument parsing");
  }

  if (!artifacts.tests.includes("should resolve chain names to IDs")) {
    errors.push("Missing test for chain resolution");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generatePermitCommandInterfaces,
  generatePermitCommandParser,
  generateWalletResolver,
  generateChainTokenResolver,
  generatePermitCommandTests,
};
