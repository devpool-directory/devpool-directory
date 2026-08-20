/**
 * @file differential-reward-distribution.ts
 * @description Scaffolding and generator utilities for implementing differential
 * reward distribution when issues are reopened. Calculates and distributes only
 * the positive difference between previously granted rewards and new calculations.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#301
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Transaction history tracking interfaces with Supabase schema generators
 * - Differential calculation engine with audit trail
 * - Payment mode transition handling (direct <-> permit)
 * - Wallet insolvency fallback integration
 * - Distribution comparison logging utilities
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a single reward transaction in the distribution history.
 */
export interface RewardTransaction {
  /** Unique transaction identifier */
  id: string;
  /** Issue number this transaction belongs to */
  issueNumber: number;
  /** Repository owner/name */
  repo: string;
  /** Beneficiary wallet address or username */
  beneficiary: string;
  /** Reward amount in base units (wei, cents, etc.) */
  amount: bigint;
  /** Currency/token symbol */
  currency: string;
  /** Payment mode used for this transaction */
  paymentMode: PaymentMode;
  /** Transaction hash if on-chain, or internal reference */
  txHash?: string;
  /** Whether the payment was successfully delivered */
  paid: boolean;
  /** Timestamp of the transaction */
  timestamp: Date;
  /** Optional metadata about failure reasons */
  failureReason?: string;
}

/**
 * Supported payment modes for reward distribution.
 */
export enum PaymentMode {
  DIRECT = "direct",
  PERMIT = "permit",
  MIXED = "mixed",
}

/**
 * Represents the calculated reward state for a beneficiary.
 */
export interface BeneficiaryRewardState {
  /** Beneficiary identifier */
  beneficiary: string;
  /** Total calculated reward amount */
  totalAmount: bigint;
  /** Amount already distributed in previous rounds */
  previouslyDistributed: bigint;
  /** Positive difference to be paid now (0 if no additional reward) */
  differentialAmount: bigint;
  /** Payment mode for the differential */
  paymentMode: PaymentMode;
  /** Previous payment mode (for transition detection) */
  previousPaymentMode?: PaymentMode;
  /** Whether this beneficiary has any unpaid historical transactions */
  hasUnpaidHistory: boolean;
}

/**
 * Result of a differential distribution operation.
 */
export interface DifferentialDistributionResult {
  /** Issue number processed */
  issueNumber: number;
  /** Repository identifier */
  repo: string;
  /** Total beneficiaries evaluated */
  totalBeneficiaries: number;
  /** Beneficiaries with positive differentials */
  beneficiariesToPay: number;
  /** Beneficiaries skipped (no change or negative diff) */
  beneficiariesSkipped: number;
  /** Total differential amount to distribute */
  totalDifferentialAmount: bigint;
  /** Individual beneficiary results */
  beneficiaryResults: BeneficiaryDistributionResult[];
  /** Audit log entries generated */
  auditEntries: AuditLogEntry[];
  /** Whether distribution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Individual result for a single beneficiary in the distribution.
 */
export interface BeneficiaryDistributionResult {
  beneficiary: string;
  previousTotal: bigint;
  newTotal: bigint;
  differential: bigint;
  action: "pay" | "skip" | "retry_failed";
  paymentMode: PaymentMode;
  modeTransitioned: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Audit log entry for tracking distribution decisions.
 */
export interface AuditLogEntry {
  timestamp: Date;
  issueNumber: number;
  repo: string;
  beneficiary: string;
  eventType: "calculated" | "distributed" | "skipped" | "mode_transition" | "error";
  details: Record<string, unknown>;
}

/**
 * Configuration for the differential distribution engine.
 */
export interface DifferentialDistributionConfig {
  /** Supabase connection URL */
  supabaseUrl: string;
  /** Supabase service role key */
  supabaseKey: string;
  /** Default currency for rewards */
  defaultCurrency: string;
  /** Whether to enable dry-run mode (calculate but don't pay) */
  dryRun: boolean;
  /** Maximum retries for failed payments */
  maxRetries: number;
  /** Wallet insolvency threshold (below this, use permits) */
  insolvencyThreshold: bigint;
}

// ============================================================================
// SUPABASE SCHEMA GENERATOR
// ============================================================================

/**
 * Generates SQL migration scripts for extending the Supabase schema
 * to track complete distribution history required for differential calculations.
 * 
 * @returns SQL migration script as string
 */
export function generateSupabaseMigration(): string {
  return `-- Migration: Add differential reward distribution tracking
-- Generated at: ${new Date().toISOString()}
-- Issue: ubiquity-os-marketplace/text-conversation-rewards#301

-- Table for tracking all reward transactions per issue/beneficiary
CREATE TABLE IF NOT EXISTS reward_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER NOT NULL,
  repo TEXT NOT NULL,
  beneficiary TEXT NOT NULL,
  amount NUMERIC(78, 0) NOT NULL, -- Support for wei-scale values
  currency TEXT NOT NULL DEFAULT 'UBQ',
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('direct', 'permit', 'mixed')),
  tx_hash TEXT,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes for efficient differential lookups
  CONSTRAINT unique_issue_beneficiary_round UNIQUE (issue_number, repo, beneficiary, created_at)
);

CREATE INDEX idx_reward_tx_issue_repo ON reward_transactions(issue_number, repo);
CREATE INDEX idx_reward_tx_beneficiary ON reward_transactions(beneficiary);
CREATE INDEX idx_reward_tx_paid ON reward_transactions(paid);
CREATE INDEX idx_reward_tx_created ON reward_transactions(created_at DESC);

-- View for aggregated reward state per beneficiary per issue
CREATE OR REPLACE VIEW beneficiary_reward_summary AS
SELECT 
  issue_number,
  repo,
  beneficiary,
  SUM(CASE WHEN paid THEN amount ELSE 0 END) as total_paid,
  SUM(amount) as total_calculated,
  COUNT(*) FILTER (WHERE NOT paid) as unpaid_count,
  MAX(payment_mode) as last_payment_mode,
  MAX(created_at) as last_transaction_at
FROM reward_transactions
GROUP BY issue_number, repo, beneficiary;

-- Function to get differential state for an issue
CREATE OR REPLACE FUNCTION get_differential_state(
  p_issue_number INTEGER,
  p_repo TEXT
) RETURNS TABLE (
  beneficiary TEXT,
  total_paid NUMERIC,
  last_payment_mode TEXT,
  unpaid_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    brs.beneficiary,
    brs.total_paid,
    brs.last_payment_mode,
    brs.unpaid_count
  FROM beneficiary_reward_summary brs
  WHERE brs.issue_number = p_issue_number
    AND brs.repo = p_repo;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reward_tx_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reward_tx_updated_at
  BEFORE UPDATE ON reward_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_reward_tx_updated_at();

-- RLS policies (adjust based on your auth setup)
ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage reward transactions"
  ON reward_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own reward history"
  ON reward_transactions
  FOR SELECT
  USING (beneficiary = auth.jwt()->>'sub');
`;
}

// ============================================================================
// DIFFERENTIAL CALCULATOR
// ============================================================================

/**
 * Core engine for calculating differential rewards.
 * Compares new reward calculations against historical distributions.
 */
export class DifferentialRewardCalculator {
  private config: DifferentialDistributionConfig;
  private auditLog: AuditLogEntry[] = [];

  constructor(config: DifferentialDistributionConfig) {
    this.config = config;
  }

  /**
   * Calculate differential rewards for all beneficiaries of an issue.
   * 
   * @param issueNumber - The issue being processed
   * @param repo - Repository identifier (owner/name)
   * @param newRewards - Map of beneficiary -> new calculated reward amount
   * @param paymentMode - Current payment mode for this distribution round
   * @returns Array of beneficiary reward states with differentials
   */
  async calculateDifferentials(
    issueNumber: number,
    repo: string,
    newRewards: Map<string, bigint>,
    paymentMode: PaymentMode
  ): Promise<BeneficiaryRewardState[]> {
    this.auditLog = [];
    const states: BeneficiaryRewardState[] = [];

    // Fetch historical distribution data
    const history = await this.fetchDistributionHistory(issueNumber, repo);

    // Process each beneficiary in the new calculation
    for (const [beneficiary, newAmount] of newRewards) {
      const historicalData = history.get(beneficiary);
      const previouslyDistributed = historicalData?.totalPaid ?? 0n;
      const previousPaymentMode = historicalData?.lastPaymentMode;
      const hasUnpaidHistory = (historicalData?.unpaidCount ?? 0) > 0;

      // Calculate positive difference only
      const differential = newAmount > previouslyDistributed 
        ? newAmount - previouslyDistributed 
        : 0n;

      const state: BeneficiaryRewardState = {
        beneficiary,
        totalAmount: newAmount,
        previouslyDistributed,
        differentialAmount: differential,
        paymentMode,
        previousPaymentMode,
        hasUnpaidHistory,
      };

      states.push(state);

      // Log the calculation
      this.logAudit({
        timestamp: new Date(),
        issueNumber,
        repo,
        beneficiary,
        eventType: "calculated",
        details: {
          newAmount: newAmount.toString(),
          previouslyDistributed: previouslyDistributed.toString(),
          differential: differential.toString(),
          paymentMode,
          previousPaymentMode,
          hasUnpaidHistory,
        },
      });
    }

    // Check for beneficiaries in history but not in new calculation
    for (const [beneficiary, histData] of history) {
      if (!newRewards.has(beneficiary) && histData.unpaidCount > 0) {
        // Beneficiary had failed payments but is no longer eligible
        this.logAudit({
          timestamp: new Date(),
          issueNumber,
          repo,
          beneficiary,
          eventType: "skipped",
          details: {
            reason: "beneficiary_not_in_new_calculation",
            unpaidCount: histData.unpaidCount,
            totalPaid: histData.totalPaid.toString(),
          },
        });
      }
    }

    return states;
  }

  /**
   * Detect payment mode transitions and handle them appropriately.
   * When switching between direct and permit modes, special handling
   * may be required for accounting and user notification.
   * 
   * @param states - Beneficiary states to check for transitions
   * @returns Updated states with transition flags
   */
  detectModeTransitions(states: BeneficiaryRewardState[]): BeneficiaryRewardState[] {
    return states.map(state => {
      const transitioned = state.previousPaymentMode !== undefined &&
        state.previousPaymentMode !== state.paymentMode &&
        state.differentialAmount > 0n;

      if (transitioned) {
        this.logAudit({
          timestamp: new Date(),
          issueNumber: 0, // Will be set by caller
          repo: "",
          beneficiary: state.beneficiary,
          eventType: "mode_transition",
          details: {
            from: state.previousPaymentMode,
            to: state.paymentMode,
            differentialAmount: state.differentialAmount.toString(),
          },
        });
      }

      return state;
    });
  }

  /**
   * Filter states to only those requiring payment action.
   * Excludes zero differentials unless there are unpaid historical transactions.
   * 
   * @param states - All beneficiary states
   * @returns States that require payment processing
   */
  filterActionableStates(states: BeneficiaryRewardState[]): BeneficiaryRewardState[] {
    return states.filter(state => {
      // Pay if there's a positive differential
      if (state.differentialAmount > 0n) return true;
      
      // Retry if there are unpaid historical transactions
      if (state.hasUnpaidHistory) return true;
      
      return false;
    });
  }

  /**
   * Get the accumulated audit log.
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  private logAudit(entry: AuditLogEntry): void {
    this.auditLog.push(entry);
  }

  private async fetchDistributionHistory(
    issueNumber: number,
    repo: string
  ): Promise<Map<string, { totalPaid: bigint; lastPaymentMode?: PaymentMode; unpaidCount: number }>> {
    // In production, this would query Supabase using the generated schema
    // For scaffolding, we provide the query structure
    
    /*
    const { data, error } = await supabase
      .rpc('get_differential_state', {
        p_issue_number: issueNumber,
        p_repo: repo,
      });
    
    if (error) throw new Error(`Failed to fetch history: ${error.message}`);
    
    const history = new Map();
    for (const row of data) {
      history.set(row.beneficiary, {
        totalPaid: BigInt(row.total_paid),
        lastPaymentMode: row.last_payment_mode as PaymentMode,
        unpaidCount: row.unpaid_count,
      });
    }
    return history;
    */

    // Placeholder for scaffolding - actual implementation connects to Supabase
    console.warn("fetchDistributionHistory requires Supabase client initialization");
    return new Map();
  }
}

// ============================================================================
// DISTRIBUTION EXECUTOR
// ============================================================================

/**
 * Executes the differential distribution, coordinating between
 * the calculator, payment modules, and audit logging.
 */
export class DifferentialDistributionExecutor {
  private calculator: DifferentialRewardCalculator;
  private config: DifferentialDistributionConfig;

  constructor(config: DifferentialDistributionConfig) {
    this.config = config;
    this.calculator = new DifferentialRewardCalculator(config);
  }

  /**
   * Execute a complete differential distribution cycle.
   * 
   * @param params - Distribution parameters
   * @returns Distribution result with full audit trail
   */
  async execute(params: {
    issueNumber: number;
    repo: string;
    newRewards: Map<string, bigint>;
    paymentMode: PaymentMode;
    walletBalance?: bigint;
  }): Promise<DifferentialDistributionResult> {
    const { issueNumber, repo, newRewards, paymentMode, walletBalance } = params;

    try {
      // Step 1: Calculate differentials
      let states = await this.calculator.calculateDifferentials(
        issueNumber,
        repo,
        newRewards,
        paymentMode
      );

      // Step 2: Detect and handle mode transitions
      states = this.calculator.detectModeTransitions(states);

      // Step 3: Filter to actionable states
      const actionableStates = this.calculator.filterActionableStates(states);

      // Step 4: Check wallet solvency if balance provided
      const effectivePaymentMode = this.checkSolvency(
        actionableStates,
        paymentMode,
        walletBalance
      );

      // Step 5: Execute payments (or dry run)
      const beneficiaryResults: BeneficiaryDistributionResult[] = [];
      let totalDifferential = 0n;
      let paidCount = 0;
      let skippedCount = 0;

      for (const state of actionableStates) {
        const result = await this.processBeneficiary(
          state,
          effectivePaymentMode,
          issueNumber,
          repo
        );

        beneficiaryResults.push(result);

        if (result.action === "pay" || result.action === "retry_failed") {
          totalDifferential += result.differential;
          paidCount++;
        } else {
          skippedCount++;
        }
      }

      return {
        issueNumber,
        repo,
        totalBeneficiaries: states.length,
        beneficiariesToPay: paidCount,
        beneficiariesSkipped: skippedCount,
        totalDifferentialAmount: totalDifferential,
        beneficiaryResults,
        auditEntries: this.calculator.getAuditLog(),
        success: true,
      };

    } catch (error) {
      return {
        issueNumber,
        repo,
        totalBeneficiaries: 0,
        beneficiariesToPay: 0,
        beneficiariesSkipped: 0,
        totalDifferentialAmount: 0n,
        beneficiaryResults: [],
        auditEntries: this.calculator.getAuditLog(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check wallet solvency and potentially switch to permit mode.
   * Integrates with the wallet insolvency fallback mechanism.
   * 
   * @param states - Actionable beneficiary states
   * @param requestedMode - Originally requested payment mode
   * @param walletBalance - Current wallet balance (if known)
   * @returns Effective payment mode to use
   */
  private checkSolvency(
    states: BeneficiaryRewardState[],
    requestedMode: PaymentMode,
    walletBalance?: bigint
  ): PaymentMode {
    if (walletBalance === undefined) return requestedMode;

    const totalRequired = states.reduce((sum, s) => sum + s.differentialAmount, 0n);

    if (requestedMode === PaymentMode.DIRECT && totalRequired > walletBalance) {
      // Insufficient funds for direct payments - fall back to permits
      console.warn(
        `Wallet insolvency detected. Required: ${totalRequired}, Available: ${walletBalance}. ` +
        `Switching to permit mode.`
      );
      return PaymentMode.PERMIT;
    }

    return requestedMode;
  }

  /**
   * Process a single beneficiary's differential payment.
   * 
   * @param state - Beneficiary reward state
   * @param paymentMode - Effective payment mode
   * @param issueNumber - Issue number
   * @param repo - Repository identifier
   * @returns Individual distribution result
   */
  private async processBeneficiary(
    state: BeneficiaryRewardState,
    paymentMode: PaymentMode,
    issueNumber: number,
    repo: string
  ): Promise<BeneficiaryDistributionResult> {
    const modeTransitioned = state.previousPaymentMode !== undefined &&
      state.previousPaymentMode !== paymentMode;

    // Handle retry case for unpaid historical transactions
    if (state.differentialAmount === 0n && state.hasUnpaidHistory) {
      // This is a retry of failed payments, not a new differential
      if (this.config.dryRun) {
        return {
          beneficiary: state.beneficiary,
          previousTotal: state.previouslyDistributed,
          newTotal: state.totalAmount,
          differential: 0n,
          action: "skip",
          paymentMode,
          modeTransitioned,
        };
      }

      // In production, would retry the failed transactions here
      return {
        beneficiary: state.beneficiary,
        previousTotal: state.previouslyDistributed,
        newTotal: state.totalAmount,
        differential: 0n,
        action: "retry_failed",
        paymentMode,
        modeTransitioned,
      };
    }

    // Skip if no differential
    if (state.differentialAmount === 0n) {
      return {
        beneficiary: state.beneficiary,
        previousTotal: state.previouslyDistributed,
        newTotal: state.totalAmount,
        differential: 0n,
        action: "skip",
        paymentMode,
        modeTransitioned,
      };
    }

    // Dry run - don't actually pay
    if (this.config.dryRun) {
      return {
        beneficiary: state.beneficiary,
        previousTotal: state.previouslyDistributed,
        newTotal: state.totalAmount,
        differential: state.differentialAmount,
        action: "skip",
        paymentMode,
        modeTransitioned,
      };
    }

    // In production, would call payment-module.ts here
    // const txHash = await paymentModule.distribute(
    //   state.beneficiary,
    //   state.differentialAmount,
    //   paymentMode
    // );

    return {
      beneficiary: state.beneficiary,
      previousTotal: state.previouslyDistributed,
      newTotal: state.totalAmount,
      differential: state.differentialAmount,
      action: "pay",
      paymentMode,
      modeTransitioned,
      // txHash,
    };
  }
}

// ============================================================================
// GITHUB COMMENT FORMATTER
// ============================================================================

/**
 * Generates formatted GitHub comments showing differential distribution details.
 * Provides clear audit trail visible to issue participants.
 * 
 * @param result - Distribution result to format
 * @returns Markdown-formatted comment body
 */
export function formatDistributionComment(result: DifferentialDistributionResult): string {
  if (!result.success) {
    return `### ⚠️ Differential Distribution Failed\n\n**Error:** ${result.error}\n\nPlease check the logs for details.`;
  }

  const lines: string[] = [
    `### 💰 Differential Reward Distribution`,
    ``,
    `**Issue:** #${result.issueNumber}`,
    `**Beneficiaries Evaluated:** ${result.totalBeneficiaries}`,
    `**Payments Processed:** ${result.beneficiariesToPay}`,
    `**Skipped (No Change):** ${result.beneficiariesSkipped}`,
    `**Total Distributed:** ${formatAmount(result.totalDifferentialAmount)} UBQ`,
    ``,
  ];

  if (result.beneficiaryResults.length > 0) {
    lines.push(`| Beneficiary | Previous | New | Differential | Action |`);
    lines.push(`|-------------|----------|-----|--------------|--------|`);

    for (const br of result.beneficiaryResults) {
      const actionEmoji = br.action === "pay" ? "✅" : br.action === "retry_failed" ? "🔄" : "⏭️";
      lines.push(
        `| ${br.beneficiary} | ${formatAmount(br.previousTotal)} | ${formatAmount(br.newTotal)} | ${formatAmount(br.differential)} | ${actionEmoji} ${br.action} |`
      );
    }
  }

  // Add mode transition warnings
  const transitions = result.beneficiaryResults.filter(r => r.modeTransitioned);
  if (transitions.length > 0) {
    lines.push(``);
    lines.push(`#### ⚡ Payment Mode Transitions`);
    for (const t of transitions) {
      lines.push(`- **${t.beneficiary}**: Switched to \`${t.paymentMode}\` mode`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generated by Differential Reward Distribution Engine*`);

  return lines.join("\n");
}

/**
 * Format bigint amounts for display.
 */
function formatAmount(amount: bigint): string {
  // Convert from wei-scale to human-readable (18 decimals)
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return `${intPart}.${decPart.slice(0, 4)}`;
}

// ============================================================================
// PAYMENT MODULE INTEGRATION
// ============================================================================

/**
 * Generates the integration code for payment-module.ts to support
 * differential distribution. This patches the existing payment flow.
 * 
 * @returns TypeScript code to integrate into payment-module.ts
 */
export function generatePaymentModuleIntegration(): string {
  return `/**
 * Integration patch for payment-module.ts
 * Adds differential distribution support for reopened issues.
 * 
 * Insert this into the existing payment module after the main
 * distribute() function.
 */

import { 
  DifferentialDistributionExecutor,
  DifferentialDistributionConfig,
  PaymentMode,
  formatDistributionComment 
} from "./differential-reward-distribution";

/**
 * Extended distribution function that handles differential calculations
 * for reopened issues. Call this instead of distribute() when the issue
 * has been previously closed and rewarded.
 * 
 * @param context - Issue context with reopen detection
 * @param rewards - Newly calculated rewards
 * @param options - Distribution options including payment mode
 */
export async function distributeDifferential(
  context: { issueNumber: number; repo: string; isReopened: boolean },
  rewards: Map<string, bigint>,
  options: { paymentMode: PaymentMode; walletBalance?: bigint }
): Promise<void> {
  if (!context.isReopened) {
    // Not a reopened issue - use standard distribution
    // await distribute(context, rewards, options);
    return;
  }

  const config: DifferentialDistributionConfig = {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
    defaultCurrency: "UBQ",
    dryRun: process.env.DRY_RUN === "true",
    maxRetries: 3,
    insolvencyThreshold: BigInt(process.env.INSOLVENCY_THRESHOLD || "1000000000000000000"),
  };

  const executor = new DifferentialDistributionExecutor(config);
  const result = await executor.execute({
    issueNumber: context.issueNumber,
    repo: context.repo,
    newRewards: rewards,
    paymentMode: options.paymentMode,
    walletBalance: options.walletBalance,
  });

  // Post distribution comment to GitHub
  const comment = formatDistributionComment(result);
  // await github.rest.issues.createComment({
  //   owner: context.repo.split("/")[0],
  //   repo: context.repo.split("/")[1],
  //   issue_number: context.issueNumber,
  //   body: comment,
  // });

  if (!result.success) {
    throw new Error(\`Differential distribution failed: \${result.error}\`);
  }
}

/**
 * Detect if an issue is being reopened by checking its event history.
 * 
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param issueNumber - Issue number
 * @returns True if the issue was previously closed and is now reopened
 */
export async function isIssueReopened(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<boolean> {
  const { data: events } = await octokit.rest.issues.listEvents({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  // Check for close -> reopen pattern
  let wasClosed = false;
  for (const event of events) {
    if (event.event === "closed") wasClosed = true;
    if (event.event === "reopened" && wasClosed) return true;
  }

  return false;
}
`;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates that a distribution result is internally consistent.
 * Used for testing and pre-deployment verification.
 * 
 * @param result - Distribution result to validate
 * @returns Validation errors (empty array if valid)
 */
export function validateDistributionResult(result: DifferentialDistributionResult): string[] {
  const errors: string[] = [];

  // Check counts add up
  const expectedTotal = result.beneficiariesToPay + result.beneficiariesSkipped;
  if (expectedTotal !== result.totalBeneficiaries && result.success) {
    errors.push(
      \`Beneficiary count mismatch: \${result.beneficiariesToPay} + \${result.beneficiariesSkipped} != \${result.totalBeneficiaries}\`
    );
  }

  // Check total differential matches sum of individual differentials
  const sumDifferentials = result.beneficiaryResults.reduce(
    (sum, br) => sum + (br.action === "pay" ? br.differential : 0n),
    0n
  );
  if (sumDifferentials !== result.totalDifferentialAmount && result.success) {
    errors.push(
      \`Total differential mismatch: sum=\${sumDifferentials}, reported=\${result.totalDifferentialAmount}\`
    );
  }

  // Check no negative differentials
  for (const br of result.beneficiaryResults) {
    if (br.differential < 0n) {
      errors.push(\`Negative differential for \${br.beneficiary}: \${br.differential}\`);
    }
  }

  // Check audit log exists
  if (result.success && result.auditEntries.length === 0) {
    errors.push("Successful distribution should have audit entries");
  }

  return errors;
}

/**
 * Generates test fixtures for differential distribution scenarios.
 * Useful for unit testing the calculator and executor.
 * 
 * @param scenario - Test scenario name
 * @returns Test fixture data
 */
export function generateTestFixture(scenario: "basic" | "mode_transition" | "failed_retry" | "insolvency"): {
  newRewards: Map<string, bigint>;
  mockHistory: Map<string, { totalPaid: bigint; lastPaymentMode?: PaymentMode; unpaidCount: number }>;
  expectedDifferentials: Map<string, bigint>;
} {
  switch (scenario) {
    case "basic":
      return {
        newRewards: new Map([
          ["user1", 150n],
          ["user2", 50n],
          ["user3", 25n],
        ]),
        mockHistory: new Map([
          ["user1", { totalPaid: 100n, lastPaymentMode: PaymentMode.DIRECT, unpaidCount: 0 }],
          ["user2", { totalPaid: 50n, lastPaymentMode: PaymentMode.DIRECT, unpaidCount: 0 }],
        ]),
        expectedDifferentials: new Map([
          ["user1", 50n],
          ["user2", 0n],
          ["user3", 25n],
        ]),
      };

    case "mode_transition":
      return {
        newRewards: new Map([
          ["user1", 200n],
        ]),
        mockHistory: new Map([
          ["user1", { totalPaid: 100n, lastPaymentMode: PaymentMode.DIRECT, unpaidCount: 0 }],
        ]),
        expectedDifferentials: new Map([
          ["user1", 100n],
        ]),
      };

    case "failed_retry":
      return {
        newRewards: new Map([
          ["user1", 100n],
        ]),
        mockHistory: new Map([
          ["user1", { totalPaid: 100n, lastPaymentMode: PaymentMode.DIRECT, unpaidCount: 1 }],
        ]),
        expectedDifferentials: new Map([
          ["user1", 0n], // No new differential, but should retry
        ]),
      };

    case "insolvency":
      return {
        newRewards: new Map([
          ["user1", 1000n],
          ["user2", 1000n],
        ]),
        mockHistory: new Map(),
        expectedDifferentials: new Map([
          ["user1", 1000n],
          ["user2", 1000n],
        ]),
      };
  }
}
