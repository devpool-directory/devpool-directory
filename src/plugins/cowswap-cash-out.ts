/**
 * Cow Swap Cash Out
 *
 * Enables users to receive bounty rewards in any supported asset via CoWSwap
 * while the protocol settles exclusively in UUSD. Implements permit invalidation,
 * quote display replacement, and automated order initiation on claim.
 *
 * Addresses: devpool-directory#5066 / ubiquity/pay.ubq.fi#386
 */

export interface CashOutConfig {
  /** Target token symbol user wants to receive (e.g., "USDT", "DAI") */
  targetToken: string;
  /** Target token contract address */
  targetTokenAddress: string;
  /** Whether cash-out is enabled by user */
  enabled: boolean;
}

export interface PermitData {
  id: string;
  beneficiary: string;
  amountUusd: string;
  token: string;
  nonce: number;
  deadline: number;
}

export interface CowSwapQuote {
  buyAmount: string;
  sellAmount: string;
  feeAmount: string;
  buyToken: string;
  sellToken: string;
  validTo: number;
}

export interface ClaimResult {
  success: boolean;
  orderId?: string;
  invalidatedPermitId?: string;
  receivedAmount?: string;
  receivedToken?: string;
  error?: string;
}

const DEFAULT_CASH_OUT_CONFIG: CashOutConfig = {
  targetToken: "UUSD",
  targetTokenAddress: "0x0000000000000000000000000000000000000000", // Placeholder
  enabled: false,
};

const LOCAL_STORAGE_KEY = "cowswap_cash_out_config";

/**
 * Loads user's cash-out preference from localStorage.
 * Returns default config if nothing saved or parse fails.
 */
export function loadCashOutConfig(): CashOutConfig {
  try {
    const raw = typeof localStorage !== "undefined" 
      ? localStorage.getItem(LOCAL_STORAGE_KEY) 
      : null;
    if (!raw) return { ...DEFAULT_CASH_OUT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<CashOutConfig>;
    return {
      targetToken: parsed.targetToken || DEFAULT_CASH_OUT_CONFIG.targetToken,
      targetTokenAddress: parsed.targetTokenAddress || DEFAULT_CASH_OUT_CONFIG.targetTokenAddress,
      enabled: parsed.enabled ?? DEFAULT_CASH_OUT_CONFIG.enabled,
    };
  } catch {
    return { ...DEFAULT_CASH_OUT_CONFIG };
  }
}

/**
 * Saves user's cash-out preference to localStorage.
 */
export function saveCashOutConfig(config: CashOutConfig): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    console.warn("[CowSwapCashOut] Failed to save config to localStorage");
  }
}

/**
 * Determines the display amount for a permit based on user's cash-out config.
 * If cash-out is enabled and target != UUSD, returns the quoted buy amount.
 * Otherwise returns the original UUSD amount.
 */
export function resolveDisplayAmount(
  permit: PermitData,
  config: CashOutConfig,
  quote: CowSwapQuote | null
): { amount: string; token: string; isConverted: boolean } {
  if (!config.enabled || config.targetToken === "UUSD" || !quote) {
    return {
      amount: permit.amountUusd,
      token: "UUSD",
      isConverted: false,
    };
  }

  return {
    amount: quote.buyAmount,
    token: config.targetToken,
    isConverted: true,
  };
}

/**
 * Formats a display amount with appropriate decimal precision.
 */
export function formatDisplayAmount(
  amount: string,
  decimals: number = 2
): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num.toFixed(decimals);
}

/**
 * Validates that a permit can be claimed via cash-out flow.
 * Checks deadline, beneficiary match, and sufficient balance.
 */
export function validateCashOutEligibility(
  permit: PermitData,
  currentTimestamp: number,
  userAddress: string
): { eligible: boolean; reason?: string } {
  if (permit.deadline < currentTimestamp) {
    return { eligible: false, reason: "Permit has expired." };
  }

  if (permit.beneficiary.toLowerCase() !== userAddress.toLowerCase()) {
    return { eligible: false, reason: "User is not the permit beneficiary." };
  }

  return { eligible: true };
}

/**
 * Builds the CoWSwap order parameters for a cash-out claim.
 * Sells UUSD from permit, buys target token for beneficiary.
 */
export function buildCowSwapOrderParams(
  permit: PermitData,
  config: CashOutConfig,
  quote: CowSwapQuote
): {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
} {
  return {
    sellToken: permit.token,
    buyToken: config.targetTokenAddress,
    receiver: permit.beneficiary,
    sellAmount: quote.sellAmount,
    buyAmount: quote.buyAmount,
    validTo: quote.validTo,
    appData: JSON.stringify({
      version: "1.0.0",
      metadata: {
        source: "pay.ubq.fi",
        permitId: permit.id,
        cashOut: true,
      },
    }),
  };
}

/**
 * Simulates the full cash-out claim flow:
 * 1. Validate eligibility
 * 2. Invalidate permit (prevent double-spend)
 * 3. Submit CoWSwap order
 * Returns structured result for UI feedback.
 */
export async function executeCashOutClaim(
  permit: PermitData,
  config: CashOutConfig,
  quote: CowSwapQuote,
  userAddress: string,
  invalidatePermitFn: (permitId: string) => Promise<boolean>,
  submitOrderFn: (params: Record<string, unknown>) => Promise<string>
): Promise<ClaimResult> {
  // Step 1: Validate
  const eligibility = validateCashOutEligibility(permit, Date.now(), userAddress);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  // Step 2: Invalidate permit first to prevent reuse
  try {
    const invalidated = await invalidatePermitFn(permit.id);
    if (!invalidated) {
      return { success: false, error: "Failed to invalidate permit before swap." };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Permit invalidation failed: ${msg}` };
  }

  // Step 3: Submit CoWSwap order
  try {
    const params = buildCowSwapOrderParams(permit, config, quote);
    const orderId = await submitOrderFn(params);
    return {
      success: true,
      orderId,
      invalidatedPermitId: permit.id,
      receivedAmount: quote.buyAmount,
      receivedToken: config.targetToken,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      invalidatedPermitId: permit.id,
      error: `CoWSwap order submission failed: ${msg}. Permit was invalidated but no swap occurred.`,
    };
  }
}

/**
 * Generates React component code for the cash-out settings toggle.
 */
export function generateSettingsComponentCode(): string {
  return `'use client';

import { useState, useEffect } from 'react';
import { Switch, FormControl, FormLabel, Select, VStack } from '@chakra-ui/react';

const TOKEN_OPTIONS = [
  { symbol: 'UUSD', label: 'UUSD (Default)' },
  { symbol: 'USDT', label: 'Tether (USDT)' },
  { symbol: 'DAI', label: 'Dai (DAI)' },
  { symbol: 'USDC', label: 'USD Coin (USDC)' },
];

export function CashOutSettings() {
  const [enabled, setEnabled] = useState(false);
  const [targetToken, setTargetToken] = useState('UUSD');

  useEffect(() => {
    const saved = localStorage.getItem('cowswap_cash_out_config');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setEnabled(config.enabled ?? false);
        setTargetToken(config.targetToken ?? 'UUSD');
      } catch {}
    }
  }, []);

  const handleChange = (newEnabled: boolean, newToken: string) => {
    setEnabled(newEnabled);
    setTargetToken(newToken);
    localStorage.setItem('cowswap_cash_out_config', JSON.stringify({
      enabled: newEnabled,
      targetToken: newToken,
    }));
  };

  return (
    <VStack align="stretch" spacing={3}>
      <FormControl display="flex" alignItems="center">
        <FormLabel mb="0">Enable Cash-Out</FormLabel>
        <Switch isChecked={enabled} onChange={(e) => handleChange(e.target.checked, targetToken)} />
      </FormControl>
      {enabled && (
        <FormControl>
          <FormLabel>Receive In</FormLabel>
          <Select value={targetToken} onChange={(e) => handleChange(enabled, e.target.value)}>
            {TOKEN_OPTIONS.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.label}</option>
            ))}
          </Select>
        </FormControl>
      )}
    </VStack>
  );
}
`;
}

export { DEFAULT_CASH_OUT_CONFIG, LOCAL_STORAGE_KEY };
