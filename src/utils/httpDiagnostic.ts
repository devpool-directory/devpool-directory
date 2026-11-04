/**
 * HTTP Diagnostic Identity & Snapshot Manager
 *
 * Provides consistent diagnostic fingerprinting, snapshot evaluation, and
 * shared 50-call ledger tracking for HTTP RPC diagnostics and /health monitoring.
 *
 * Ensures that both the refresh writer and the /health reader use identical
 * Boolean parsing for RPC_VALIDATE_CHAIN_ID, preventing missing diagnostics
 * or stale lastTested reporting when RPC_VALIDATE_CHAIN_ID="n".
 *
 * References:
 * - Issue #6215: Keep HTTP diagnostic Boolean parsing consistent for n
 * - Upstream Issue: https://github.com/ubiquity/permit2-rpc-manager/issues/31
 */

import { parseDiagnosticBooleanEnv } from "./booleanParser.js";

export interface DiagnosticFingerprint {
  colo: string;
  version: string;
  chainId: number;
  validateChainId: boolean;
  endpoint?: string;
}

export interface HttpDiagnosticRecord {
  fingerprint: DiagnosticFingerprint;
  fingerprintKey: string;
  lastTested: number;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  callCount: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

export interface DiagnosticIdentityOptions {
  colo: string;
  version: string;
  chainId: number;
  endpoint?: string;
}

export interface HealthSnapshotResult {
  record?: HttpDiagnosticRecord;
  isStale: boolean;
  rowsWritten: number;
  missingDiagnostics: boolean;
}

/**
 * Normalizes and formats a DiagnosticFingerprint into a canonical, deterministic key.
 */
export function formatDiagnosticFingerprint(fp: DiagnosticFingerprint): string {
  const parts = [
    `colo:${fp.colo.toLowerCase().trim()}`,
    `ver:${fp.version.trim()}`,
    `chain:${fp.chainId}`,
    `validate:${fp.validateChainId}`,
  ];
  if (fp.endpoint) {
    parts.push(`endpoint:${fp.endpoint.trim()}`);
  }
  return parts.join("|");
}

/**
 * Resolves diagnostic configuration from an environment or options object.
 * Evaluates `RPC_VALIDATE_CHAIN_ID` consistently (defaults to true).
 */
export function resolveDiagnosticEnv(env: Record<string, unknown> | NodeJS.ProcessEnv = {}): {
  validateChainId: boolean;
} {
  const rawValidate =
    (env as Record<string, unknown>)["RPC_VALIDATE_CHAIN_ID"] ??
    (env as Record<string, unknown>)["rpcValidateChainId"];
  return {
    validateChainId: parseDiagnosticBooleanEnv(rawValidate, true),
  };
}

/**
 * Creates a DiagnosticFingerprint for refresh execution (the writer path).
 */
export function createRefreshIdentity(
  env: Record<string, unknown> | NodeJS.ProcessEnv,
  options: DiagnosticIdentityOptions
): DiagnosticFingerprint {
  const { validateChainId } = resolveDiagnosticEnv(env);
  return {
    colo: options.colo,
    version: options.version,
    chainId: options.chainId,
    validateChainId,
    endpoint: options.endpoint,
  };
}

/**
 * Creates a DiagnosticFingerprint for /health snapshot inspection (the reader path).
 * Uses the exact same Boolean parsing logic as createRefreshIdentity.
 */
export function createHealthSnapshotIdentity(
  env: Record<string, unknown> | NodeJS.ProcessEnv,
  options: DiagnosticIdentityOptions
): DiagnosticFingerprint {
  const { validateChainId } = resolveDiagnosticEnv(env);
  return {
    colo: options.colo,
    version: options.version,
    chainId: options.chainId,
    validateChainId,
    endpoint: options.endpoint,
  };
}

/**
 * Shared Diagnostic Ledger for managing diagnostic records with a bounded 50-call ledger.
 */
export class HttpDiagnosticLedger {
  private readonly maxLedgerEntries: number;
  private readonly records = new Map<string, HttpDiagnosticRecord>();
  private readonly callHistory: HttpDiagnosticRecord[] = [];
  private totalRowsWritten = 0;

  constructor(maxLedgerEntries = 50) {
    this.maxLedgerEntries = maxLedgerEntries;
  }

  /**
   * Records or updates a diagnostic refresh entry.
   * Increments call counters and updates the shared ledger.
   */
  public recordRefresh(
    fingerprint: DiagnosticFingerprint,
    data: {
      status?: "healthy" | "degraded" | "down";
      latencyMs?: number;
      lastTested?: number;
      lastError?: string;
      metadata?: Record<string, unknown>;
    }
  ): HttpDiagnosticRecord {
    const key = formatDiagnosticFingerprint(fingerprint);
    const existing = this.records.get(key);
    const now = data.lastTested ?? Date.now();
    const isSuccess = data.status === "healthy" || (!data.status && !data.lastError);

    const record: HttpDiagnosticRecord = {
      fingerprint,
      fingerprintKey: key,
      lastTested: now,
      status: data.status ?? (isSuccess ? "healthy" : "down"),
      latencyMs: data.latencyMs ?? (existing?.latencyMs ?? 0),
      callCount: (existing?.callCount ?? 0) + 1,
      consecutiveSuccesses: isSuccess ? (existing?.consecutiveSuccesses ?? 0) + 1 : 0,
      consecutiveFailures: isSuccess ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
      lastError: data.lastError ?? (isSuccess ? undefined : existing?.lastError),
      metadata: { ...existing?.metadata, ...data.metadata },
    };

    this.records.set(key, record);
    this.totalRowsWritten += 1;

    // Track in 50-call ledger
    this.callHistory.push({ ...record });
    if (this.callHistory.length > this.maxLedgerEntries) {
      this.callHistory.shift();
    }

    return record;
  }

  /**
   * Retrieves the diagnostic health snapshot for /health endpoint.
   *
   * Crucial Acceptance Invariant:
   * When reading an existing diagnostic record, /health MUST NOT trigger a refresh
   * or write additional snapshot rows (rowsWritten: 0).
   */
  public getHealthSnapshot(
    fingerprint: DiagnosticFingerprint,
    options: { staleThresholdMs?: number } = {}
  ): HealthSnapshotResult {
    const key = formatDiagnosticFingerprint(fingerprint);
    const record = this.records.get(key);

    if (!record) {
      return {
        record: undefined,
        isStale: false,
        rowsWritten: 0,
        missingDiagnostics: true,
      };
    }

    const staleThreshold = options.staleThresholdMs ?? 60_000;
    const isStale = Date.now() - record.lastTested > staleThreshold;

    return {
      record,
      isStale,
      rowsWritten: 0,
      missingDiagnostics: false,
    };
  }

  /**
   * Returns recent calls recorded in the 50-call ledger.
   */
  public getLedgerHistory(): HttpDiagnosticRecord[] {
    return [...this.callHistory];
  }

  /**
   * Returns total rows written to the diagnostic store across all refreshes.
   */
  public getTotalRowsWritten(): number {
    return this.totalRowsWritten;
  }

  /**
   * Clears all diagnostic records and history.
   */
  public clear(): void {
    this.records.clear();
    this.callHistory.length = 0;
    this.totalRowsWritten = 0;
  }
}
