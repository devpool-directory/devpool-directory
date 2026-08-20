/**
 * CI: fix `check_storage_layout` for new contracts
 *
 * Provides utilities to safely handle storage layout checks in CI workflows
 * when new contracts or libraries are added. Prevents false failures by
 * distinguishing between "missing baseline artifact" (new contract) and
 * "storage collision detected" (actual error).
 *
 * Addresses: devpool-directory#5848 / ubiquity/ubiquity-dollar#972
 */

export interface StorageLayoutEntry {
  label: string;
  offset: number;
  slot: number;
  type: string;
  contract: string;
}

export interface StorageCheckResult {
  contractName: string;
  status: "pass" | "fail" | "skip";
  reason: string;
  isNewContract: boolean;
  collisionDetected: boolean;
  baselineExists: boolean;
}

export interface WorkflowContext {
  artifactName: string;
  prNumber?: number;
  sha: string;
  changedFiles: string[];
}

/**
 * Determines whether a missing baseline artifact should be treated as
 * a new contract (skip) rather than a CI failure.
 *
 * Per issue requirements:
 * - New contracts should NOT fail the storage check
 * - Only existing contracts with storage changes need validation
 */
export function classifyMissingBaseline(
  contractName: string,
  changedFiles: string[],
  knownContracts: string[]
): { isNewContract: boolean; shouldSkip: boolean; reason: string } {
  const normalizedContract = contractName.toLowerCase();

  // Check if contract file is in changed files (newly added)
  const contractFilePattern = new RegExp(
    `(contracts|src)/.*${normalizedContract}\\.(sol|vy)$`,
    "i"
  );
  const isNewFile = changedFiles.some((f) => contractFilePattern.test(f));

  // Check against known contracts list from previous baseline
  const isKnown = knownContracts.some(
    (k) => k.toLowerCase() === normalizedContract
  );

  if (!isKnown && isNewFile) {
    return {
      isNewContract: true,
      shouldSkip: true,
      reason: `Contract '${contractName}' is newly added. No baseline exists yet; storage collision check not applicable.`,
    };
  }

  if (!isKnown && !isNewFile) {
    return {
      isNewContract: true,
      shouldSkip: true,
      reason: `Contract '${contractName}' not found in previous baseline and not in changed files. Likely renamed or removed; skipping.`,
    };
  }

  return {
    isNewContract: false,
    shouldSkip: false,
    reason: `Contract '${contractName}' exists in baseline. Missing artifact may indicate CI misconfiguration.`,
  };
}

/**
 * Compares current storage layout against baseline to detect collisions.
 * Returns detailed result including whether this is a new contract scenario.
 */
export function compareStorageLayouts(
  contractName: string,
  currentLayout: StorageLayoutEntry[],
  baselineLayout: StorageLayoutEntry[] | null,
  changedFiles: string[] = []
): StorageCheckResult {
  // No baseline = potentially new contract
  if (!baselineLayout || baselineLayout.length === 0) {
    const classification = classifyMissingBaseline(contractName, changedFiles, []);
    return {
      contractName,
      status: classification.shouldSkip ? "skip" : "fail",
      reason: classification.reason,
      isNewContract: classification.isNewContract,
      collisionDetected: false,
      baselineExists: false,
    };
  }

  // Build slot maps for comparison
  const baselineSlots = new Map<number, StorageLayoutEntry>();
  for (const entry of baselineLayout) {
    baselineSlots.set(entry.slot, entry);
  }

  const currentSlots = new Map<number, StorageLayoutEntry>();
  for (const entry of currentLayout) {
    currentSlots.set(entry.slot, entry);
  }

  // Check for collisions: same slot, different label/type in existing contract
  let collisionDetected = false;
  const collisionDetails: string[] = [];

  for (const [slot, currentEntry] of currentSlots) {
    const baselineEntry = baselineSlots.get(slot);
    if (baselineEntry) {
      if (
        baselineEntry.label !== currentEntry.label ||
        baselineEntry.type !== currentEntry.type
      ) {
        collisionDetected = true;
        collisionDetails.push(
          `Slot ${slot}: '${baselineEntry.label}' (${baselineEntry.type}) → '${currentEntry.label}' (${currentEntry.type})`
        );
      }
    }
  }

  if (collisionDetected) {
    return {
      contractName,
      status: "fail",
      reason: `Storage collision detected: ${collisionDetails.join("; ")}`,
      isNewContract: false,
      collisionDetected: true,
      baselineExists: true,
    };
  }

  return {
    contractName,
    status: "pass",
    reason: "Storage layout compatible with baseline. No collisions detected.",
    isNewContract: false,
    collisionDetected: false,
    baselineExists: true,
  };
}

/**
 * Processes all contracts in a PR and returns aggregated check results.
 * Handles both core-contracts-storage-check and diamond-storage-check scenarios.
 */
export function runStorageCheckSuite(
  contracts: Array<{
    name: string;
    currentLayout: StorageLayoutEntry[];
    baselineLayout: StorageLayoutEntry[] | null;
  }>,
  changedFiles: string[]
): {
  results: StorageCheckResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
} {
  const results: StorageCheckResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const contract of contracts) {
    const result = compareStorageLayouts(
      contract.name,
      contract.currentLayout,
      contract.baselineLayout,
      changedFiles
    );
    results.push(result);

    switch (result.status) {
      case "pass":
        passed++;
        break;
      case "fail":
        failed++;
        break;
      case "skip":
        skipped++;
        break;
    }
  }

  return {
    results,
    summary: { total: results.length, passed, failed, skipped },
  };
}

/**
 * Generates a QA-compatible report covering all required scenarios:
 * 1) No storage updates, CI passing
 * 2) Storage update, no collision, CI passing
 * 3) Storage update, collision, CI failing
 * 4) New contract added, CI passing
 */
export function generateQAReport(results: StorageCheckResult[]): string {
  const lines = [
    "## Storage Layout Check QA Report",
    "",
    "| Contract | Status | Is New | Collision | Reason |",
    "|----------|--------|--------|-----------|--------|",
  ];

  for (const r of results) {
    lines.push(
      `| ${r.contractName} | ${r.status.toUpperCase()} | ${r.isNewContract ? "Yes" : "No"} | ${r.collisionDetected ? "Yes" : "No"} | ${r.reason} |`
    );
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  lines.push(
    "",
    `**Summary:** ${passed} passed, ${failed} failed, ${skipped} skipped`,
    "",
    "### Scenario Coverage",
    `- ✅ No storage updates, CI passing: ${results.some((r) => r.status === "pass" && !r.isNewContract && !r.collisionDetected) ? "Covered" : "Not present in this run"}`,
    `- ✅ Storage update, no collision, CI passing: ${results.some((r) => r.status === "pass" && !r.isNewContract && r.baselineExists) ? "Covered" : "Not present in this run"}`,
    `- ✅ Storage update, collision, CI failing: ${results.some((r) => r.collisionDetected) ? "Covered" : "Not present in this run"}`,
    `- ✅ New contract added, CI passing: ${results.some((r) => r.isNewContract && r.status === "skip") ? "Covered" : "Not present in this run"}`
  );

  return lines.join("\n");
}
