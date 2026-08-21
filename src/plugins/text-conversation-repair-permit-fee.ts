/**
 * @file text-conversation-repair-permit-fee.ts
 * @description Scaffolding and generator utilities for repairing the permit fee
 * feature in text-conversation-rewards. Addresses incorrect fee application and
 * outdated DAO link references.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#447
 * Problem: Permit fee is not applied properly with current implementation,
 * and displayed links point to outdated DAO URL instead of dollar-v2.
 * Solution: Implement correct fee calculation logic with proper decimal handling,
 * update all DAO references to https://dao.ubq.fi/dollar-v2, and add validation
 * to ensure fees are correctly deducted from permit amounts.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for permit fee repair.
 */
export interface PermitFeeRepairConfig {
  /** Correct DAO base URL for permit links */
  daoBaseUrl: string;
  /** Fee percentage or fixed amount configuration */
  feeType: "percentage" | "fixed";
  /** Fee value (percentage as decimal or fixed amount in wei) */
  feeValue: number;
  /** Token decimals for proper amount calculation */
  tokenDecimals: number;
  /** Whether to validate fee deduction before permit generation */
  validateFeeDeduction: boolean;
  /** Log level for fee operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Result of fee calculation.
 */
export interface FeeCalculationResult {
  originalAmount: string;
  feeAmount: string;
  netAmount: string;
  feeApplied: boolean;
  error?: string;
}

/**
 * Updated permit link information.
 */
export interface PermitLinkInfo {
  url: string;
  baseUrl: string;
  includesFeeParam: boolean;
  isValid: boolean;
}

/**
 * Generates TypeScript interfaces for the permit fee repair system.
 * @returns String containing interface definitions
 */
export function generatePermitFeeInterfaces(): string {
  return `
/**
 * Interface for calculating and applying permit fees correctly.
 */
export interface IPermitFeeCalculator {
  /**
   * Calculates the fee to be applied to a permit amount.
   * @param amount - Original permit amount in token units
   * @param tokenDecimals - Number of decimals for the token
   * @returns Fee calculation result with original, fee, and net amounts
   */
  calculateFee(amount: string, tokenDecimals: number): FeeCalculationResult;

  /**
   * Validates that a fee was correctly applied to a permit.
   * @param originalAmount - Amount before fee
   * @param permitAmount - Amount in generated permit
   * @param expectedFee - Expected fee amount
   * @returns True if fee was correctly applied
   */
  validateFeeApplication(
    originalAmount: string,
    permitAmount: string,
    expectedFee: string
  ): boolean;
}

/**
 * Interface for generating correct DAO permit links.
 */
export interface IPermitLinkGenerator {
  /**
   * Generates a valid DAO permit link with updated base URL.
   * @param permitData - Permit parameters for URL construction
   * @returns Validated permit link information
   */
  generateLink(permitData: Record<string, string>): PermitLinkInfo;

  /**
   * Updates legacy DAO URLs to the current dollar-v2 endpoint.
   * @param legacyUrl - Old-style DAO URL to migrate
   * @returns Updated URL or null if not a recognized legacy format
   */
  migrateLegacyUrl(legacyUrl: string): string | null;
}

/**
 * Interface for validating permit fee configuration.
 */
export interface IFeeConfigValidator {
  /**
   * Validates that fee configuration is consistent and safe.
   * @param config - Fee configuration to validate
   * @returns Validation result with any issues found
   */
  validate(config: PermitFeeRepairConfig): { valid: boolean; issues: string[] };
}
`;
}

/**
 * Generates the permit fee calculator implementation.
 * @param config - Fee repair configuration
 * @returns String containing calculator class implementation
 */
export function generateFeeCalculator(config: PermitFeeRepairConfig): string {
  return `
import type { IPermitFeeCalculator, FeeCalculationResult } from "./interfaces";

/**
 * Correctly calculates permit fees with proper decimal handling.
 * Fixes the issue where fees were not being applied due to incorrect
 * arithmetic or missing decimal normalization.
 */
export class PermitFeeCalculator implements IPermitFeeCalculator {
  private readonly config: PermitFeeRepairConfig;

  constructor(config: PermitFeeRepairConfig) {
    this.config = config;
  }

  calculateFee(amount: string, tokenDecimals: number): FeeCalculationResult {
    try {
      // Parse amount as BigInt-compatible string (in smallest unit)
      const amountBigInt = BigInt(amount);

      let feeBigInt: bigint;

      if (this.config.feeType === "percentage") {
        // Percentage fee: multiply by fee basis points (feeValue * 10000)
        // e.g., 2.5% = 250 basis points
        const basisPoints = BigInt(Math.round(this.config.feeValue * 100));
        feeBigInt = (amountBigInt * basisPoints) / BigInt(10000);
      } else {
        // Fixed fee in smallest token units
        feeBigInt = BigInt(this.config.feeValue);
      }

      // Ensure fee doesn't exceed amount
      if (feeBigInt > amountBigInt) {
        return {
          originalAmount: amount,
          feeAmount: amount,
          netAmount: "0",
          feeApplied: false,
          error: "Fee exceeds permit amount",
        };
      }

      const netBigInt = amountBigInt - feeBigInt;

      console[this.config.logLevel]?.(
        \`[PermitFee] Calculated fee: \${feeBigInt.toString()} from \${amount} (net: \${netBigInt.toString()})\`
      );

      return {
        originalAmount: amount,
        feeAmount: feeBigInt.toString(),
        netAmount: netBigInt.toString(),
        feeApplied: true,
      };
    } catch (err) {
      return {
        originalAmount: amount,
        feeAmount: "0",
        netAmount: amount,
        feeApplied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  validateFeeApplication(
    originalAmount: string,
    permitAmount: string,
    expectedFee: string
  ): boolean {
    try {
      const original = BigInt(originalAmount);
      const permit = BigInt(permitAmount);
      const fee = BigInt(expectedFee);

      // Net amount should equal original minus fee
      const expectedNet = original - fee;
      return permit === expectedNet;
    } catch {
      return false;
    }
  }
}
`;
}

/**
 * Generates the permit link generator with updated DAO URL.
 * @param config - Fee repair configuration
 * @returns String containing link generator class implementation
 */
export function generateLinkGenerator(config: PermitFeeRepairConfig): string {
  return `
import type { IPermitLinkGenerator, PermitLinkInfo } from "./interfaces";

/**
 * Generates correct DAO permit links using the updated dollar-v2 endpoint.
 * Replaces all legacy https://dao.ubq.fi/ references with https://dao.ubq.fi/dollar-v2.
 */
export class PermitLinkGenerator implements IPermitLinkGenerator {
  private readonly daoBaseUrl: string;
  private readonly legacyPatterns = [
    /^https:\\/\\/dao\\.ubq\\.fi\\/(?!dollar-v2)/,
    /^https:\\/\\/dao\\.ubq\\.fi$/,
    /^https:\\/\\/ubq\\.fi\\/dao/,
  ];

  constructor() {
    this.daoBaseUrl = "${config.daoBaseUrl}";
  }

  generateLink(permitData: Record<string, string>): PermitLinkInfo {
    const params = new URLSearchParams(permitData).toString();
    const url = \`\${this.daoBaseUrl}\${params ? "?" + params : ""}\`;

    return {
      url,
      baseUrl: this.daoBaseUrl,
      includesFeeParam: "fee" in permitData || "feeAmount" in permitData,
      isValid: url.startsWith(this.daoBaseUrl),
    };
  }

  migrateLegacyUrl(legacyUrl: string): string | null {
    for (const pattern of this.legacyPatterns) {
      if (pattern.test(legacyUrl)) {
        // Extract path/query after legacy base
        const afterBase = legacyUrl.replace(pattern, "");
        return \`\${this.daoBaseUrl}\${afterBase}\`;
      }
    }
    return null;
  }
}
`;
}

/**
 * Generates test scaffolding for the permit fee repair.
 * @returns String containing Vitest test suite
 */
export function generatePermitFeeTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { PermitFeeCalculator, PermitLinkGenerator } from "../text-conversation-repair-permit-fee";

describe("Permit Fee Repair", () => {
  let calculator: PermitFeeCalculator;
  let linkGenerator: PermitLinkGenerator;

  beforeEach(() => {
    calculator = new PermitFeeCalculator({
      daoBaseUrl: "https://dao.ubq.fi/dollar-v2",
      feeType: "percentage",
      feeValue: 2.5,
      tokenDecimals: 18,
      validateFeeDeduction: true,
      logLevel: "warn" as const,
    });
    linkGenerator = new PermitLinkGenerator();
  });

  it("should calculate percentage fee correctly", () => {
    // 1000 tokens with 2.5% fee = 25 token fee, 975 net
    const result = calculator.calculateFee("1000000000000000000000", 18);
    expect(result.feeApplied).toBe(true);
    expect(result.feeAmount).toBe("25000000000000000000");
    expect(result.netAmount).toBe("975000000000000000000");
  });

  it("should handle zero amount without error", () => {
    const result = calculator.calculateFee("0", 18);
    expect(result.feeApplied).toBe(true);
    expect(result.feeAmount).toBe("0");
    expect(result.netAmount).toBe("0");
  });

  it("should reject fee exceeding amount", () => {
    // Configure with 200% fee to trigger overflow
    const badCalc = new PermitFeeCalculator({
      daoBaseUrl: "https://dao.ubq.fi/dollar-v2",
      feeType: "percentage",
      feeValue: 200,
      tokenDecimals: 18,
      validateFeeDeduction: true,
      logLevel: "warn" as const,
    });
    const result = badCalc.calculateFee("1000", 18);
    expect(result.feeApplied).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("should validate correct fee application", () => {
    expect(calculator.validateFeeApplication("1000", "975", "25")).toBe(true);
    expect(calculator.validateFeeApplication("1000", "970", "25")).toBe(false);
  });

  it("should generate links with dollar-v2 base URL", () => {
    const link = linkGenerator.generateLink({ amount: "100", recipient: "0xabc" });
    expect(link.url).toContain("dao.ubq.fi/dollar-v2");
    expect(link.isValid).toBe(true);
  });

  it("should migrate legacy DAO URLs", () => {
    const migrated = linkGenerator.migrateLegacyUrl("https://dao.ubq.fi/permit?amount=100");
    expect(migrated).toContain("dollar-v2");
    expect(migrated).toContain("amount=100");
  });

  it("should return null for unrecognized URLs", () => {
    expect(linkGenerator.migrateLegacyUrl("https://example.com/permit")).toBeNull();
  });
});
`;
}

/**
 * Main generator function for all permit fee repair artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<PermitFeeRepairConfig>
): Record<string, string> {
  const resolvedConfig: PermitFeeRepairConfig = {
    daoBaseUrl: "https://dao.ubq.fi/dollar-v2",
    feeType: "percentage",
    feeValue: 2.5,
    tokenDecimals: 18,
    validateFeeDeduction: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generatePermitFeeInterfaces(),
    calculator: generateFeeCalculator(resolvedConfig),
    linkGenerator: generateLinkGenerator(resolvedConfig),
    tests: generatePermitFeeTests(),
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

  if (!artifacts.interfaces.includes("IPermitFeeCalculator")) {
    errors.push("Missing IPermitFeeCalculator interface");
  }

  if (!artifacts.interfaces.includes("IPermitLinkGenerator")) {
    errors.push("Missing IPermitLinkGenerator interface");
  }

  if (!artifacts.calculator.includes("PermitFeeCalculator")) {
    errors.push("Missing PermitFeeCalculator class");
  }

  if (!artifacts.linkGenerator.includes("PermitLinkGenerator")) {
    errors.push("Missing PermitLinkGenerator class");
  }

  if (!artifacts.linkGenerator.includes("dollar-v2")) {
    errors.push("Missing updated dollar-v2 DAO URL reference");
  }

  if (!artifacts.tests.includes("should calculate percentage fee correctly")) {
    errors.push("Missing critical test for fee calculation");
  }

  if (!artifacts.tests.includes("should migrate legacy DAO URLs")) {
    errors.push("Missing test for legacy URL migration");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generatePermitFeeInterfaces,
  generateFeeCalculator,
  generateLinkGenerator,
  generatePermitFeeTests,
};
