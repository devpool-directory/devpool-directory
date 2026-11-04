import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFalsyEnvValue,
  isTruthyEnvValue,
  parseBooleanEnvValue,
  parseDiagnosticBooleanEnv,
} from "../src/utils/booleanParser.js";
import {
  createHealthSnapshotIdentity,
  createRefreshIdentity,
  formatDiagnosticFingerprint,
  HttpDiagnosticLedger,
  resolveDiagnosticEnv,
} from "../src/utils/httpDiagnostic.js";

describe("Boolean Environment Variable Parsing (#6215)", () => {
  it("correctly parses all standard true aliases with whitespace and case insensitivity", () => {
    const trueVariants = [
      "true", "TRUE", "True", "  true  ",
      "1", " 1 ",
      "yes", "YES", "Yes", "  yes  ",
      "y", "Y", "  y  ",
      "on", "ON", "On", "  on  ",
    ];

    for (const variant of trueVariants) {
      assert.equal(
        parseBooleanEnvValue(variant),
        true,
        `Expected "${variant}" to parse as true`
      );
      assert.equal(isTruthyEnvValue(variant), true);
      assert.equal(isFalsyEnvValue(variant), false);
    }
  });

  it("correctly parses all standard false aliases including 'n' (#6215 regression target)", () => {
    const falseVariants = [
      "n", "N", "  n  ", "  N  ", "\tn\n",
      "no", "NO", "No", "  no  ",
      "false", "FALSE", "False", "  false  ",
      "0", " 0 ",
      "off", "OFF", "Off", "  off  ",
    ];

    for (const variant of falseVariants) {
      assert.equal(
        parseBooleanEnvValue(variant),
        false,
        `Expected "${variant}" to parse as false`
      );
      assert.equal(parseDiagnosticBooleanEnv(variant), false);
      assert.equal(isFalsyEnvValue(variant), true);
      assert.equal(isTruthyEnvValue(variant), false);
    }
  });

  it("handles boolean and numeric primitives directly", () => {
    assert.equal(parseBooleanEnvValue(true), true);
    assert.equal(parseBooleanEnvValue(false), false);
    assert.equal(parseBooleanEnvValue(1), true);
    assert.equal(parseBooleanEnvValue(0), false);
    assert.equal(parseBooleanEnvValue(2), undefined);
  });

  it("falls back to default value on undefined, null, empty string, or invalid tokens", () => {
    assert.equal(parseBooleanEnvValue(undefined, true), true);
    assert.equal(parseBooleanEnvValue(null, false), false);
    assert.equal(parseBooleanEnvValue("", true), true);
    assert.equal(parseBooleanEnvValue("   ", false), false);
    assert.equal(parseBooleanEnvValue("invalid_token", true), true);
    assert.equal(parseBooleanEnvValue("invalid_token", false), false);

    // parseDiagnosticBooleanEnv defaults to true when unset or invalid
    assert.equal(parseDiagnosticBooleanEnv(undefined), true);
    assert.equal(parseDiagnosticBooleanEnv(null), true);
    assert.equal(parseDiagnosticBooleanEnv(""), true);
    assert.equal(parseDiagnosticBooleanEnv("unknown_flag"), true);
  });
});

describe("HTTP Diagnostic Identity & Snapshot Consistency (#6215)", () => {
  const baseOptions = {
    colo: "iad",
    version: "v1.2.3",
    chainId: 1,
    endpoint: "https://rpc.ubq.fi/1",
  };

  it("ensures refresh identity and health snapshot identity match when RPC_VALIDATE_CHAIN_ID=n", () => {
    const env = { RPC_VALIDATE_CHAIN_ID: "n" };

    const refreshFp = createRefreshIdentity(env, baseOptions);
    const healthFp = createHealthSnapshotIdentity(env, baseOptions);

    assert.equal(refreshFp.validateChainId, false, "Refresh must evaluate 'n' as false");
    assert.equal(healthFp.validateChainId, false, "Health snapshot must evaluate 'n' as false");

    const refreshKey = formatDiagnosticFingerprint(refreshFp);
    const healthKey = formatDiagnosticFingerprint(healthFp);

    assert.equal(refreshKey, healthKey, "Fingerprint keys must be identical for 'n'");
    assert.equal(
      refreshKey,
      "colo:iad|ver:v1.2.3|chain:1|validate:false|endpoint:https://rpc.ubq.fi/1"
    );
  });

  it("ensures identity matches for whitespace and uppercase variant '  N  '", () => {
    const env = { RPC_VALIDATE_CHAIN_ID: "  N  " };

    const refreshFp = createRefreshIdentity(env, baseOptions);
    const healthFp = createHealthSnapshotIdentity(env, baseOptions);

    assert.equal(refreshFp.validateChainId, false);
    assert.equal(healthFp.validateChainId, false);
    assert.equal(
      formatDiagnosticFingerprint(refreshFp),
      formatDiagnosticFingerprint(healthFp)
    );
  });

  it("ensures identity matches for unset configuration defaulting to true", () => {
    const env = {};

    const refreshFp = createRefreshIdentity(env, baseOptions);
    const healthFp = createHealthSnapshotIdentity(env, baseOptions);

    assert.equal(refreshFp.validateChainId, true, "Unset must default to true");
    assert.equal(healthFp.validateChainId, true, "Unset must default to true");
    assert.equal(
      formatDiagnosticFingerprint(refreshFp),
      formatDiagnosticFingerprint(healthFp)
    );
  });

  it("retains diagnostics and lastTested without /health refreshing or writing snapshot rows", () => {
    const ledger = new HttpDiagnosticLedger(50);
    const env = { RPC_VALIDATE_CHAIN_ID: "n" };

    // 1. Simulate RPC refresh execution with RPC_VALIDATE_CHAIN_ID=n
    const refreshIdentity = createRefreshIdentity(env, baseOptions);
    const testTimestamp = 1729249000000;
    ledger.recordRefresh(refreshIdentity, {
      status: "healthy",
      latencyMs: 42,
      lastTested: testTimestamp,
      metadata: { blockNumber: 19500000 },
    });

    assert.equal(ledger.getTotalRowsWritten(), 1, "Refresh writes exactly 1 diagnostic row");

    // 2. Simulate /health snapshot read with identical RPC_VALIDATE_CHAIN_ID=n
    const healthIdentity = createHealthSnapshotIdentity(env, baseOptions);
    const snapshot = ledger.getHealthSnapshot(healthIdentity);

    assert.equal(snapshot.missingDiagnostics, false, "Diagnostics must not be missing");
    assert.ok(snapshot.record, "Diagnostic record must be present");
    assert.equal(snapshot.record?.lastTested, testTimestamp, "lastTested must be preserved");
    assert.equal(snapshot.record?.latencyMs, 42);
    assert.equal(snapshot.record?.status, "healthy");
    assert.equal(snapshot.record?.fingerprint.validateChainId, false);

    // CRITICAL ACCEPTANCE INVARIANT:
    // /health snapshot inspection MUST NOT write any rows or refresh diagnostics
    assert.equal(snapshot.rowsWritten, 0, "Health snapshot read must write 0 rows");
    assert.equal(ledger.getTotalRowsWritten(), 1, "Total rows written remains 1");
  });

  it("demonstrates the bug resolution: buggy parser misses diagnostics whereas unified parser succeeds", () => {
    const ledger = new HttpDiagnosticLedger(50);
    const env = { RPC_VALIDATE_CHAIN_ID: "n" };

    // Refresh uses the runtime boolean evaluation (which accepted 'n' as false)
    const runtimeParsedValidate = parseDiagnosticBooleanEnv(env.RPC_VALIDATE_CHAIN_ID); // false
    assert.equal(runtimeParsedValidate, false);

    const refreshIdentity = {
      ...baseOptions,
      validateChainId: runtimeParsedValidate,
    };
    ledger.recordRefresh(refreshIdentity, {
      status: "healthy",
      latencyMs: 55,
      lastTested: 1729250000000,
    });

    // BUGGY WORKER BEHAVIOR (Prior to fix):
    // Worker omitted 'n' in !["false", "0", "no", "off"].includes(...) -> evaluated to true
    const buggyWorkerValidate = !["false", "0", "no", "off"].includes(
      String(env.RPC_VALIDATE_CHAIN_ID).trim().toLowerCase()
    ); // Evaluates to TRUE! (The bug)
    assert.equal(buggyWorkerValidate, true, "Demonstrates bug: 'n' was mistakenly evaluated as true");

    const buggyHealthIdentity = {
      ...baseOptions,
      validateChainId: buggyWorkerValidate,
    };
    const buggySnapshot = ledger.getHealthSnapshot(buggyHealthIdentity);
    assert.equal(
      buggySnapshot.missingDiagnostics,
      true,
      "Buggy parser caused missing diagnostics"
    );
    assert.equal(buggySnapshot.record, undefined, "Buggy parser could not find record");

    // FIXED WORKER BEHAVIOR (Unified parser):
    const fixedHealthIdentity = createHealthSnapshotIdentity(env, baseOptions);
    const fixedSnapshot = ledger.getHealthSnapshot(fixedHealthIdentity);
    assert.equal(fixedSnapshot.missingDiagnostics, false, "Unified parser resolves diagnostics");
    assert.equal(fixedSnapshot.record?.lastTested, 1729250000000);
  });

  it("maintains the shared 50-call bounded ledger FIFO invariant", () => {
    const ledger = new HttpDiagnosticLedger(50);
    const env = { RPC_VALIDATE_CHAIN_ID: "n" };
    const fp = createRefreshIdentity(env, baseOptions);

    // Record 60 sequential refreshes
    for (let i = 1; i <= 60; i++) {
      ledger.recordRefresh(fp, {
        status: "healthy",
        latencyMs: i,
        lastTested: 1000 + i,
        metadata: { callIndex: i },
      });
    }

    const history = ledger.getLedgerHistory();
    assert.equal(history.length, 50, "Ledger must be strictly bounded to 50 entries");
    assert.equal(
      history[0].metadata?.callIndex,
      11,
      "First entry in FIFO history should be callIndex 11"
    );
    assert.equal(
      history[49].metadata?.callIndex,
      60,
      "Last entry in FIFO history should be callIndex 60"
    );
    assert.equal(ledger.getTotalRowsWritten(), 60, "Total rows written is 60");
  });
});
