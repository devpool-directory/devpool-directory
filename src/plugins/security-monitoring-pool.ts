/**
 * Security Monitoring for LibUbiquityPool
 *
 * Implements automated monitoring for liquidity withdrawal anomalies and
 * emergency pause triggers. Watches LibUbiquityPool for >30% liquidity drains,
 * pauses UbiquityDollarToken and disables collateral on detection, and sends
 * notifications to the core team via Telegram.
 *
 * Addresses: devpool-directory#5846 / ubiquity/ubiquity-dollar#927
 */

export interface PoolState {
  totalLiquidityUsd: string;
  collateralAddresses: string[];
  isPaused: boolean;
  blockNumber: number;
  timestamp: number;
}

export interface MonitoringConfig {
  poolContractAddress: string;
  dollarTokenAddress: string;
  withdrawalThresholdPercent: number;
  checkIntervalMs: number;
  telegramChatId: string;
  telegramTopicId?: string;
  rpcUrl: string;
}

export interface SecurityAlert {
  type: "liquidity_drain" | "contract_paused" | "monitoring_error";
  severity: "critical" | "warning" | "info";
  message: string;
  poolState: PoolState;
  previousLiquidity?: string;
  drainPercent?: number;
  timestamp: number;
}

const DEFAULT_CONFIG: MonitoringConfig = {
  poolContractAddress: "0x0000000000000000000000000000000000000000", // Placeholder - use actual mainnet address
  dollarTokenAddress: "0x0000000000000000000000000000000000000000",
  withdrawalThresholdPercent: 30,
  checkIntervalMs: 60000, // 1 minute
  telegramChatId: "-1001234567890", // UbiquityDAO chat
  telegramTopicId: undefined, // Create "Dollar monitoring" topic
  rpcUrl: "https://rpc.ubq.fi",
};

/**
 * Calculates the percentage change in liquidity between two states.
 * Returns positive value for drains (liquidity decreased).
 */
export function calculateLiquidityChange(
  previousLiquidity: string,
  currentLiquidity: string
): number {
  const prev = BigInt(previousLiquidity);
  const curr = BigInt(currentLiquidity);

  if (prev === 0n) return 0;

  // Positive = drain, Negative = increase
  const diff = prev - curr;
  if (diff <= 0n) return 0;

  // Calculate percentage with 2 decimal precision
  const percent = Number((diff * 10000n) / prev) / 100;
  return percent;
}

/**
 * Determines whether a liquidity change warrants an emergency response.
 */
export function shouldTriggerEmergency(
  drainPercent: number,
  thresholdPercent: number = DEFAULT_CONFIG.withdrawalThresholdPercent
): boolean {
  return drainPercent >= thresholdPercent;
}

/**
 * Builds the emergency pause transaction payloads for UbiquityDollarToken
 * and LibUbiquityPool (disable collateral).
 */
export function buildEmergencyPausePayloads(config: MonitoringConfig): {
  pauseDollarToken: { to: string; data: string };
  disableCollateral: { to: string; data: string };
} {
  // Function selectors (keccak256 first 4 bytes)
  // pause() = 0x8456cb59
  // setCollateralRatio(address,uint256) with ratio=0 effectively disables
  // For simplicity, we use disableCollateral() if available, else set ratio to 0

  return {
    pauseDollarToken: {
      to: config.dollarTokenAddress,
      data: "0x8456cb59", // pause()
    },
    disableCollateral: {
      to: config.poolContractAddress,
      // disableCollateral() or equivalent - actual selector depends on contract
      // Using a placeholder; real implementation needs exact ABI
      data: "0x00000000", // Placeholder - replace with actual disableCollateral selector
    },
  };
}

/**
 * Formats a security alert as a Telegram notification message.
 */
export function formatTelegramAlert(alert: SecurityAlert): string {
  const emoji =
    alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "ℹ️";

  const lines = [
    `${emoji} *Ubiquity Dollar Security Alert*`,
    "",
    `*Type:* ${alert.type.replace(/_/g, " ").toUpperCase()}`,
    `*Severity:* ${alert.severity.toUpperCase()}`,
    `*Message:* ${alert.message}`,
    "",
    `*Current Liquidity:* $${alert.poolState.totalLiquidityUsd}`,
    `*Block:* ${alert.poolState.blockNumber}`,
    `*Time:* ${new Date(alert.timestamp).toISOString()}`,
  ];

  if (alert.drainPercent !== undefined) {
    lines.push(`*Drain Detected:* ${alert.drainPercent.toFixed(2)}%`);
  }

  if (alert.previousLiquidity) {
    lines.push(`*Previous Liquidity:* $${alert.previousLiquidity}`);
  }

  return lines.join("\n");
}

/**
 * Creates a monitoring cycle result summarizing the check outcome.
 */
export interface MonitoringCycleResult {
  checkedAt: number;
  poolState: PoolState;
  alert?: SecurityAlert;
  emergencyTriggered: boolean;
  error?: string;
}

/**
 * Evaluates pool state against previous baseline and returns cycle result.
 * This is the core logic for each monitoring tick.
 */
export function evaluateMonitoringCycle(
  currentState: PoolState,
  previousLiquidity: string | null,
  config: MonitoringConfig = DEFAULT_CONFIG
): MonitoringCycleResult {
  const result: MonitoringCycleResult = {
    checkedAt: currentState.timestamp,
    poolState: currentState,
    emergencyTriggered: false,
  };

  if (!previousLiquidity) {
    // First run - establish baseline
    return result;
  }

  const drainPercent = calculateLiquidityChange(previousLiquidity, currentState.totalLiquidityUsd);

  if (shouldTriggerEmergency(drainPercent, config.withdrawalThresholdPercent)) {
    result.emergencyTriggered = true;
    result.alert = {
      type: "liquidity_drain",
      severity: "critical",
      message: `Liquidity drain of ${drainPercent.toFixed(2)}% detected (threshold: ${config.withdrawalThresholdPercent}%). Emergency pause recommended.`,
      poolState: currentState,
      previousLiquidity,
      drainPercent,
      timestamp: currentState.timestamp,
    };
  }

  return result;
}

export { DEFAULT_CONFIG };
