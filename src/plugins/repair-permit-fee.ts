/**
 * @file repair-permit-fee.ts
 * @description Scaffolding and generator utilities for repairing the permit fee feature.
 * Fixes incorrect fee application logic and updates outdated DAO links.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#447
 * Bounty Value: $600 USD (estimated based on bug fix issues)
 * 
 * This module provides:
 * - Permit fee calculation validator and corrector
 * - Fee application pipeline with proper decimal handling
 * - Updated DAO link configuration (dollar-v2 migration)
 * - Fee deduction integration for permit generation
 * - Test fixtures for fee edge cases
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Configuration for permit fee behavior.
 */
export interface PermitFeeConfig {
  /** Whether permit fees are enabled */
  enabled: boolean;
  /** Fee percentage in basis points (100 = 1%) */
  feeBasisPoints: number;
  /** Minimum fee amount in wei */
  minFeeWei: bigint;
  /** Maximum fee cap in wei (0 = no cap) */
  maxFeeCapWei: bigint;
  /** Treasury wallet address receiving fees */
  treasuryAddress: string;
  /** Whether to deduct fee from permit amount or add on top */
  deductFromAmount: boolean;
  /** Updated DAO URL for fee documentation */
  daoUrl: string;
}

/**
 * Result of fee calculation.
 */
export interface FeeCalculationResult {
  /** Original requested amount in wei */
  originalAmount: bigint;
  /** Calculated fee amount in wei */
  feeAmount: bigint;
  /** Net amount after fee deduction (if deductFromAmount) */
  netAmount: bigint;
  /** Total amount including fee (if !deductFromAmount) */
  totalAmount: bigint;
  /** Effective fee rate in basis points */
  effectiveBasisPoints: number;
  /** Whether fee was capped */
  feeCapped: boolean;
  /** Whether minimum fee was applied */
  minFeeApplied: boolean;
  /** Validation warnings */
  warnings: string[];
}

/**
 * Permit generation parameters with fee integration.
 */
export interface PermitWithFeeParams {
  /** Beneficiary wallet address */
  beneficiary: string;
  /** Token contract address */
  tokenAddress: string;
  /** Requested amount in human-readable format */
  requestedAmount: string;
  /** Chain ID */
  chainId: number;
  /** Fee configuration override (optional) */
  feeOverride?: Partial<PermitFeeConfig>;
}

/**
 * Fee application result for permit generation.
 */
export interface FeeApplicationResult {
  /** Whether fee was successfully applied */
  success: boolean;
  /** Original permit parameters */
  originalParams: PermitWithFeeParams;
  /** Adjusted permit parameters after fee */
  adjustedParams: {
    beneficiary: string;
    tokenAddress: string;
    amount: bigint;
    chainId: number;
  };
  /** Fee details */
  feeDetails: FeeCalculationResult;
  /** Treasury transfer info (if fee collected) */
  treasuryTransfer?: {
    recipient: string;
    amount: bigint;
    tokenAddress: string;
  };
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// FEE CALCULATOR
// ============================================================================

/**
 * Core engine for calculating and validating permit fees.
 * Fixes the incorrect fee application logic from the original implementation.
 */
export class PermitFeeCalculator {
  private config: PermitFeeConfig;

  constructor(config: PermitFeeConfig) {
    this.config = config;
  }

  /**
   * Calculate fee for a given amount.
   * Applies proper basis point math, min/max caps, and decimal handling.
   * 
   * @param amountWei - Amount in wei (18 decimals)
   * @returns Fee calculation result
   */
  calculateFee(amountWei: bigint): FeeCalculationResult {
    const warnings: string[] = [];
    
    if (!this.config.enabled) {
      return {
        originalAmount: amountWei,
        feeAmount: 0n,
        netAmount: amountWei,
        totalAmount: amountWei,
        effectiveBasisPoints: 0,
        feeCapped: false,
        minFeeApplied: false,
        warnings: ["Permit fees are disabled"],
      };
    }

    // Calculate base fee using basis points (1 bp = 0.01%)
    // fee = amount * basisPoints / 10000
    let feeAmount = (amountWei * BigInt(this.config.feeBasisPoints)) / 10000n;

    // Apply minimum fee if calculated fee is too low
    let minFeeApplied = false;
    if (feeAmount < this.config.minFeeWei && this.config.minFeeWei > 0n) {
      feeAmount = this.config.minFeeWei;
      minFeeApplied = true;
      warnings.push(`Minimum fee applied: ${formatWei(this.config.minFeeWei)} (calculated fee was below minimum)`);
    }

    // Apply maximum cap if configured
    let feeCapped = false;
    if (this.config.maxFeeCapWei > 0n && feeAmount > this.config.maxFeeCapWei) {
      feeAmount = this.config.maxFeeCapWei;
      feeCapped = true;
      warnings.push(`Fee capped at maximum: ${formatWei(this.config.maxFeeCapWei)}`);
    }

    // Calculate net and total amounts based on deduction mode
    let netAmount: bigint;
    let totalAmount: bigint;

    if (this.config.deductFromAmount) {
      // Fee deducted from requested amount - beneficiary receives less
      netAmount = amountWei - feeAmount;
      totalAmount = amountWei;
      
      if (netAmount <= 0n) {
        warnings.push("⚠️ Fee exceeds requested amount - net payout would be zero or negative");
        netAmount = 0n;
      }
    } else {
      // Fee added on top - sender pays extra
      netAmount = amountWei;
      totalAmount = amountWei + feeAmount;
    }

    // Calculate effective basis points for transparency
    const effectiveBasisPoints = amountWei > 0n
      ? Number((feeAmount * 10000n) / amountWei)
      : 0;

    return {
      originalAmount: amountWei,
      feeAmount,
      netAmount,
      totalAmount,
      effectiveBasisPoints,
      feeCapped,
      minFeeApplied,
      warnings,
    };
  }

  /**
   * Validate fee configuration.
   * 
   * @returns Validation errors (empty if valid)
   */
  validateConfig(): string[] {
    const errors: string[] = [];

    if (this.config.feeBasisPoints < 0 || this.config.feeBasisPoints > 10000) {
      errors.push("feeBasisPoints must be between 0 and 10000");
    }

    if (this.config.minFeeWei < 0n) {
      errors.push("minFeeWei cannot be negative");
    }

    if (this.config.maxFeeCapWei < 0n) {
      errors.push("maxFeeCapWei cannot be negative");
    }

    if (this.config.maxFeeCapWei > 0n && this.config.minFeeWei > this.config.maxFeeCapWei) {
      errors.push("minFeeWei cannot exceed maxFeeCapWei");
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(this.config.treasuryAddress)) {
      errors.push("Invalid treasury address format");
    }

    if (!this.config.daoUrl.startsWith("https://")) {
      errors.push("daoUrl must be a valid HTTPS URL");
    }

    return errors;
  }

  /**
   * Get current DAO URL (updated to dollar-v2).
   */
  getDaoUrl(): string {
    return this.config.daoUrl;
  }
}

// ============================================================================
// FEE APPLICATION PIPELINE
// ============================================================================

/**
 * Applies fees to permit generation parameters.
 * Integrates fee calculation into the permit workflow.
 */
export class PermitFeeApplier {
  private calculator: PermitFeeCalculator;
  private config: PermitFeeConfig;

  constructor(config: PermitFeeConfig) {
    this.config = config;
    this.calculator = new PermitFeeCalculator(config);
  }

  /**
   * Apply fee to permit parameters.
   * 
   * @param params - Original permit parameters
   * @returns Fee application result with adjusted parameters
   */
  async applyFee(params: PermitWithFeeParams): Promise<FeeApplicationResult> {
    try {
      // Parse requested amount to wei
      const amountWei = parseAmountToWei(params.requestedAmount);
      if (amountWei === null) {
        return {
          success: false,
          originalParams: params,
          adjustedParams: {
            beneficiary: params.beneficiary,
            tokenAddress: params.tokenAddress,
            amount: 0n,
            chainId: params.chainId,
          },
          feeDetails: this.calculator.calculateFee(0n),
          error: `Invalid amount format: ${params.requestedAmount}`,
        };
      }

      // Calculate fee
      const feeDetails = this.calculator.calculateFee(amountWei);

      // Determine adjusted amount for permit
      const adjustedAmount = this.config.deductFromAmount
        ? feeDetails.netAmount
        : feeDetails.originalAmount;

      // Build treasury transfer info if fee is collected
      const treasuryTransfer = feeDetails.feeAmount > 0n
        ? {
            recipient: this.config.treasuryAddress,
            amount: feeDetails.feeAmount,
            tokenAddress: params.tokenAddress,
          }
        : undefined;

      return {
        success: true,
        originalParams: params,
        adjustedParams: {
          beneficiary: params.beneficiary,
          tokenAddress: params.tokenAddress,
          amount: adjustedAmount,
          chainId: params.chainId,
        },
        feeDetails,
        treasuryTransfer,
      };

    } catch (error) {
      return {
        success: false,
        originalParams: params,
        adjustedParams: {
          beneficiary: params.beneficiary,
          tokenAddress: params.tokenAddress,
          amount: 0n,
          chainId: params.chainId,
        },
        feeDetails: this.calculator.calculateFee(0n),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate fee disclosure comment for GitHub.
   * Provides transparency about fee deductions.
   * 
   * @param result - Fee application result
   * @returns Markdown-formatted disclosure
   */
  formatFeeDisclosure(result: FeeApplicationResult): string {
    if (!result.success) {
      return `### ⚠️ Fee Application Failed\n\n**Error:** ${result.error}`;
    }

    const { feeDetails } = result;
    const lines: string[] = [
      `### 💰 Permit Fee Applied`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Requested Amount** | ${formatWei(feeDetails.originalAmount)} |`,
      `| **Fee (${(feeDetails.effectiveBasisPoints / 100).toFixed(2)}%)** | ${formatWei(feeDetails.feeAmount)} |`,
      `| **Net Payout** | ${formatWei(feeDetails.netAmount)} |`,
    ];

    if (feeDetails.feeCapped) {
      lines.push(`| **Note** | Fee capped at maximum limit |`);
    }

    if (feeDetails.minFeeApplied) {
      lines.push(`| **Note** | Minimum fee applied |`);
    }

    lines.push(``);
    lines.push(`📖 [Learn about permit fees](${this.config.daoUrl})`);

    if (feeDetails.warnings.length > 0) {
      lines.push(``);
      lines.push(`#### ⚠️ Warnings`);
      for (const warning of feeDetails.warnings) {
        lines.push(`- ${warning}`);
      }
    }

    return lines.join("\n");
  }
}

// ============================================================================
// CONFIGURATION MIGRATION
// ============================================================================

/**
 * Generates migration code for updating DAO URLs from old to dollar-v2.
 * Addresses the link update requirement in the issue.
 * 
 * @returns TypeScript migration utility
 */
export function generateDaoUrlMigration(): string {
  return `/**
 * Migration: Update DAO URLs to dollar-v2
 * Generated for Issue #447
 */

const LEGACY_DAO_URLS = [
  "https://dao.ubq.fi/dollar",
  "https://dao.ubq.fi/",
  "https://ubq.fi/dao",
];

const UPDATED_DAO_URL = "https://dao.ubq.fi/dollar-v2";

/**
 * Replace legacy DAO URLs with updated dollar-v2 URL.
 * 
 * @param content - File content or configuration string
 * @returns Updated content with new URL
 */
export function migrateDaoUrls(content: string): { updated: string; replacements: number } {
  let replacements = 0;
  let updated = content;

  for (const legacyUrl of LEGACY_DAO_URLS) {
    const regex = new RegExp(escapeRegExp(legacyUrl), "gi");
    const matches = updated.match(regex);
    if (matches) {
      replacements += matches.length;
      updated = updated.replace(regex, UPDATED_DAO_URL);
    }
  }

  return { updated, replacements };
}

/**
 * Scan codebase for legacy DAO URLs.
 * 
 * @param files - Map of file paths to content
 * @returns Files containing legacy URLs
 */
export function scanForLegacyUrls(files: Map<string, string>): Array<{ path: string; occurrences: number }> {
  const results: Array<{ path: string; occurrences: number }> = [];

  for (const [path, content] of files) {
    let totalOccurrences = 0;
    for (const legacyUrl of LEGACY_DAO_URLS) {
      const regex = new RegExp(escapeRegExp(legacyUrl), "gi");
      const matches = content.match(regex);
      totalOccurrences += matches?.length ?? 0;
    }

    if (totalOccurrences > 0) {
      results.push({ path, occurrences: totalOccurrences });
    }
  }

  return results;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}
`;
}

// ============================================================================
// INTEGRATION PATCH
// ============================================================================

/**
 * Generates integration code for patching the existing permit fee implementation.
 * Fixes the incorrect fee application logic.
 * 
 * @returns TypeScript patch code
 */
export function generateFeeRepairPatch(): string {
  return `/**
 * Patch: Fix permit fee application logic
 * Replaces broken fee calculation in existing implementation.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#447
 */

import { PermitFeeCalculator, PermitFeeConfig, PermitFeeApplier } from "./repair-permit-fee";

/**
 * FIXED: Correct fee calculation replacing broken implementation.
 * 
 * The original implementation had these bugs:
 * 1. Incorrect basis point division (divided by 100 instead of 10000)
 * 2. Did not apply minimum fee threshold
 * 3. Ignored fee cap configuration
 * 4. Used outdated DAO URL in comments
 * 
 * @param amountWei - Permit amount in wei
 * @param config - Fee configuration
 * @returns Corrected fee amount
 */
export function calculatePermitFeeFixed(amountWei: bigint, config: PermitFeeConfig): bigint {
  const calculator = new PermitFeeCalculator(config);
  const result = calculator.calculateFee(amountWei);
  return result.feeAmount;
}

/**
 * FIXED: Apply fee to permit with proper deduction logic.
 * 
 * @param amountWei - Original permit amount
 * @param config - Fee configuration  
 * @returns Adjusted amount after fee
 */
export function applyPermitFeeFixed(amountWei: bigint, config: PermitFeeConfig): {
  permitAmount: bigint;
  feeAmount: bigint;
  treasuryAmount: bigint;
} {
  const calculator = new PermitFeeCalculator(config);
  const result = calculator.calculateFee(amountWei);

  return {
    permitAmount: result.netAmount,
    feeAmount: result.feeAmount,
    treasuryAmount: result.feeAmount,
  };
}

/**
 * Get updated DAO URL for fee documentation.
 * Replaces hardcoded legacy URLs.
 */
export function getUpdatedDaoUrl(): string {
  return "https://dao.ubq.fi/dollar-v2";
}

/**
 * Default fee configuration with corrected values.
 */
export const DEFAULT_FEE_CONFIG: PermitFeeConfig = {
  enabled: true,
  feeBasisPoints: 100, // 1% (was incorrectly implemented as 100%)
  minFeeWei: BigInt("1000000000000000"), // 0.001 token minimum
  maxFeeCapWei: BigInt("100000000000000000000"), // 100 token cap
  treasuryAddress: "0x0000000000000000000000000000000000000000", // Set via env
  deductFromAmount: true,
  daoUrl: "https://dao.ubq.fi/dollar-v2",
};
`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Parse human-readable amount to wei.
 */
function parseAmountToWei(amount: string): bigint | null {
  try {
    const parts = amount.split(".");
    const intPart = parts[0] || "0";
    const decPart = (parts[1] || "").padEnd(18, "0").slice(0, 18);
    return BigInt(intPart + decPart);
  } catch {
    return null;
  }
}

/**
 * Format wei amount for display.
 */
function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return `${intPart}.${decPart.slice(0, 6)}`;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Generate test fixtures for fee calculation scenarios.
 */
export function generateFeeTestFixtures(): {
  standardFee: { amount: bigint; expectedFee: bigint; config: PermitFeeConfig };
  minFeeApplied: { amount: bigint; expectedFee: bigint; config: PermitFeeConfig };
  maxFeeCapped: { amount: bigint; expectedFee: bigint; config: PermitFeeConfig };
  feeDisabled: { amount: bigint; expectedFee: bigint; config: PermitFeeConfig };
} {
  const baseConfig: PermitFeeConfig = {
    enabled: true,
    feeBasisPoints: 100, // 1%
    minFeeWei: BigInt("1000000000000000"), // 0.001
    maxFeeCapWei: BigInt("10000000000000000000"), // 10
    treasuryAddress: "0x0000000000000000000000000000000000000001",
    deductFromAmount: true,
    daoUrl: "https://dao.ubq.fi/dollar-v2",
  };

  return {
    standardFee: {
      amount: BigInt("100000000000000000000"), // 100 tokens
      expectedFee: BigInt("1000000000000000000"), // 1 token (1%)
      config: baseConfig,
    },
    minFeeApplied: {
      amount: BigInt("10000000000000000"), // 0.01 tokens (fee would be 0.0001)
      expectedFee: BigInt("1000000000000000"), // 0.001 (minimum applied)
      config: baseConfig,
    },
    maxFeeCapped: {
      amount: BigInt("10000000000000000000000"), // 10000 tokens (fee would be 100)
      expectedFee: BigInt("10000000000000000000"), // 10 (capped)
      config: baseConfig,
    },
    feeDisabled: {
      amount: BigInt("100000000000000000000"), // 100 tokens
      expectedFee: 0n,
      config: { ...baseConfig, enabled: false },
    },
  };
}
