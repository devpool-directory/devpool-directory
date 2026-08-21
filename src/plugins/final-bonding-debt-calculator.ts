/**
 * Final Pre-Seed/Seed Investor Debt UBQ Calculator
 *
 * Provides utilities to calculate remaining debt payouts for bond holders
 * after bond expiry. Implements the algorithm specified in ubiquity-dollar#937:
 * 1. Simulate bonding debt at current block number
 * 2. Subtract already disbursed amounts
 * 3. Output remaining UBQ values for BondingDebtV2/Final contract deployment
 *
 * Addresses: devpool-directory#5847 / ubiquity/ubiquity-dollar#937
 */

export interface BondHolder {
  address: string;
  originalStake: string;
  disbursedAmount: string;
  remainingAmount?: string;
}

export interface SimulationResult {
  blockNumber: number;
  inflationRate: string;
  totalDebt: string;
  holders: BondHolder[];
  timestamp: number;
}

export interface DebtCalculationConfig {
  networkRpcUrl: string;
  forkBlockNumber?: number;
  bondingContractAddress: string;
  ubqTokenAddress: string;
}

/**
 * Calculates remaining debt for each bond holder by subtracting
 * already disbursed amounts from simulated total debt.
 */
export function calculateRemainingDebt(
  simulation: SimulationResult,
  disbursementRecords: Map<string, string>
): BondHolder[] {
  return simulation.holders.map((holder) => {
    const disbursed = disbursementRecords.get(holder.address.toLowerCase()) || "0";
    const originalBig = BigInt(holder.originalStake);
    const disbursedBig = BigInt(disbursed);

    // Remaining cannot be negative
    const remaining = originalBig > disbursedBig ? originalBig - disbursedBig : 0n;

    return {
      ...holder,
      disbursedAmount: disbursed,
      remainingAmount: remaining.toString(),
    };
  });
}

/**
 * Validates that all remaining amounts are non-negative and sum correctly.
 */
export function validateDebtCalculation(holders: BondHolder[]): {
  valid: boolean;
  errors: string[];
  totalRemaining: string;
} {
  const errors: string[] = [];
  let totalRemaining = 0n;

  for (const holder of holders) {
    if (!holder.remainingAmount) {
      errors.push(`Missing remaining amount for ${holder.address}`);
      continue;
    }

    const remaining = BigInt(holder.remainingAmount);
    if (remaining < 0n) {
      errors.push(
        `Negative remaining debt for ${holder.address}: ${holder.remainingAmount}`
      );
    }

    totalRemaining += remaining;
  }

  return {
    valid: errors.length === 0,
    errors,
    totalRemaining: totalRemaining.toString(),
  };
}

/**
 * Generates a summary report for the final bonding debt batch.
 */
export function generateDebtReport(
  simulation: SimulationResult,
  calculatedHolders: BondHolder[],
  validation: { valid: boolean; errors: string[]; totalRemaining: string }
): string {
  const lines = [
    "## Final Bonding Debt Calculation Report",
    "",
    `**Block Number:** ${simulation.blockNumber}`,
    `**Inflation Rate:** ${simulation.inflationRate}`,
    `**Simulation Timestamp:** ${new Date(simulation.timestamp).toISOString()}`,
    "",
    "| Holder | Original Stake | Disbursed | Remaining |",
    "|--------|---------------|-----------|-----------|",
  ];

  for (const h of calculatedHolders) {
    lines.push(
      `| ${h.address.substring(0, 10)}... | ${h.originalStake} | ${h.disbursedAmount} | ${h.remainingAmount || "N/A"} |`
    );
  }

  lines.push(
    "",
    `**Total Remaining UBQ:** ${validation.totalRemaining}`,
    `**Validation Status:** ${validation.valid ? "✅ PASSED" : "❌ FAILED"}`
  );

  if (!validation.valid) {
    lines.push("", "**Errors:**");
    for (const err of validation.errors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join("\n");
}

/**
 * Prepares deployment parameters for BondingDebtV2/Final contract.
 * Returns arrays suitable for constructor or initialize call.
 */
export function prepareDeploymentParams(
  holders: BondHolder[]
): {
  addresses: string[];
  amounts: string[];
  totalAmount: string;
} {
  const filtered = holders.filter(
    (h) => h.remainingAmount && BigInt(h.remainingAmount) > 0n
  );

  let total = 0n;
  for (const h of filtered) {
    total += BigInt(h.remainingAmount!);
  }

  return {
    addresses: filtered.map((h) => h.address),
    amounts: filtered.map((h) => h.remainingAmount!),
    totalAmount: total.toString(),
  };
}
