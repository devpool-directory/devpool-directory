/**
 * CI: fix failing `Diamond Storage Check`
 *
 * Provides utilities to fix the "artifact name is not valid" error in the
 * Diamond Storage Check CI workflow. Handles artifact name sanitization for
 * diamond upgradeability pattern and merge guidance from upstream foundry-storage-check.
 *
 * Addresses: devpool-directory#5842 / ubiquity/ubiquity-dollar#992
 */

export interface ArtifactNameIssue {
  originalName: string;
  sanitized: string;
  isValid: boolean;
  reason?: string;
}

export interface MergeCandidate {
  sourceRepo: string;
  targetRepo: string;
  commitsToMerge: string[];
  hasBreakingChanges: boolean;
}

/**
 * GitHub Actions artifact names must match: ^[a-zA-Z0-9._-]+$
 * The error "feat-985.packages_contracts_src_dollar_libraries_LibStaking.sol-LibStaking.json"
 * contains characters that may be rejected depending on the action version.
 * This function sanitizes artifact names to be CI-safe.
 */
export function sanitizeArtifactName(name: string): ArtifactNameIssue {
  // Replace problematic characters with underscores
  const sanitized = name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_|_$/g, ""); // trim leading/trailing underscores

  const isValid = /^[a-zA-Z0-9._-]+$/.test(sanitized) && sanitized.length <= 255;

  return {
    originalName: name,
    sanitized,
    isValid,
    reason: name !== sanitized
      ? `Original name contained invalid characters. Sanitized to: ${sanitized}`
      : undefined,
  };
}

/**
 * Generates a storage layout artifact name from contract path and name.
 * Ensures the output is always CI-safe.
 */
export function generateStorageArtifactName(
  contractPath: string,
  contractName: string,
  branchPrefix?: string
): string {
  // Convert path separators to underscores
  const pathPart = contractPath
    .replace(/^packages\/contracts\//, "")
    .replace(/\//g, "_")
    .replace(/\.sol$/, "");

  let raw = `${pathPart}-${contractName}.json`;
  if (branchPrefix) {
    raw = `${branchPrefix}.${raw}`;
  }

  return sanitizeArtifactName(raw).sanitized;
}

/**
 * Parses the CI error message to extract the problematic artifact name.
 */
export function parseArtifactError(errorMessage: string): {
  artifactName: string | null;
  errorType: "invalid_name" | "not_found" | "other";
} {
  const nameMatch = errorMessage.match(
    /artifact name ([^\s]+) is not valid/i
  );
  if (nameMatch) {
    return { artifactName: nameMatch[1], errorType: "invalid_name" };
  }

  const notFoundMatch = errorMessage.match(
    /No artifact named ([^\s]+)/i
  );
  if (notFoundMatch) {
    return { artifactName: notFoundMatch[1], errorType: "not_found" };
  }

  return { artifactName: null, errorType: "other" };
}

/**
 * Generates the fixed upload-artifact step for the diamond storage check workflow.
 * Uses sanitized artifact names to prevent CI failures.
 */
export function generateFixedUploadStep(): string {
  return `      - name: Upload storage layout
        uses: actions/upload-artifact@v4
        with:
          # Sanitize artifact name: replace invalid chars with underscores
          name: \${{ env.ARTIFACT_NAME_SANITIZED }}
          path: storage-layouts/
          retention-days: 30
          if-no-files-found: warn

      - name: Sanitize artifact name
        run: |
          RAW_NAME="\${{ env.BRANCH_NAME }}.\${{ env.CONTRACT_PATH_SANITIZED }}-\${{ env.CONTRACT_NAME }}.json"
          SANITIZED=$(echo "$RAW_NAME" | sed 's/[^a-zA-Z0-9._-]/_/g' | sed 's/_\\+/_/g' | sed 's/^_\\|_$//g')
          echo "ARTIFACT_NAME_SANITIZED=$SANITIZED" >> $GITHUB_ENV
          echo "Sanitized artifact name: $SANITIZED"`;
}

/**
 * Checks whether upstream foundry-storage-check has fixes we should merge.
 * Compares commit dates and relevant file changes.
 */
export function evaluateUpstreamMerge(
  upstreamCommits: Array<{ sha: string; date: string; message: string }>,
  lastSyncDate: string
): MergeCandidate {
  const cutoff = new Date(lastSyncDate);
  const newCommits = upstreamCommits.filter(
    (c) => new Date(c.date) > cutoff
  );

  // Check for breaking changes in commit messages
  const hasBreakingChanges = newCommits.some(
    (c) =>
      c.message.toLowerCase().includes("breaking") ||
      c.message.toLowerCase().includes("major")
  );

  return {
    sourceRepo: "Rubilmax/foundry-storage-check",
    targetRepo: "ubiquity/foundry-storage-check",
    commitsToMerge: newCommits.map((c) => c.sha),
    hasBreakingChanges,
  };
}

/**
 * Generates a PR description for merging upstream foundry-storage-check changes.
 */
export function generateMergePrDescription(candidate: MergeCandidate): string {
  const lines = [
    "## Merge upstream foundry-storage-check",
    "",
    `**Source:** ${candidate.sourceRepo}`,
    `**Target:** ${candidate.targetRepo}`,
    `**Commits:** ${candidate.commitsToMerge.length}`,
    `**Breaking Changes:** ${candidate.hasBreakingChanges ? "⚠️ Yes" : "✅ No"}`,
    "",
    "### Motivation",
    "Fixes CI failure: `The artifact name ... is not valid` in Diamond Storage Check workflow.",
    "",
    "### Commits to merge",
  ];

  for (const sha of candidate.commitsToMerge.slice(0, 10)) {
    lines.push(`- \`${sha.substring(0, 7)}\``);
  }

  if (candidate.commitsToMerge.length > 10) {
    lines.push(`- ... and ${candidate.commitsToMerge.length - 10} more`);
  }

  if (candidate.hasBreakingChanges) {
    lines.push(
      "",
      "### ⚠️ Breaking Changes Detected",
      "Review required before merging. Test against existing diamond storage layouts."
    );
  }

  return lines.join("\n");
}

/**
 * Validates that a storage layout JSON file is well-formed for diamond checks.
 */
export function validateStorageLayout(layout: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!layout.storage || !Array.isArray(layout.storage)) {
    errors.push("Missing or invalid 'storage' array");
  }

  if (!layout.types || typeof layout.types !== "object") {
    errors.push("Missing or invalid 'types' object");
  }

  // Check for diamond-specific fields
  if (layout.diamondStorage === undefined) {
    errors.push(
      "Warning: 'diamondStorage' field not present. May not be a diamond facet."
    );
  }

  return { valid: errors.filter((e) => !e.startsWith("Warning")).length === 0, errors };
}

/**
 * Generates the complete CI workflow patch for diamond-storage-check.yml.
 */
export function generateWorkflowPatch(): string {
  return `--- a/.github/workflows/diamond-storage-check.yml
+++ b/.github/workflows/diamond-storage-check.yml
@@ -45,7 +45,12 @@ jobs:
       - name: Upload storage layout
         uses: actions/upload-artifact@v4
         with:
-          name: \${{ github.head_ref }}.\${{ matrix.contract }}.json
+          # Fix: sanitize artifact name to avoid "is not valid" errors
+          # GitHub Actions artifact names must match ^[a-zA-Z0-9._-]+$
+          name: \${{ env.ARTIFACT_NAME }}
           path: storage-layouts/
           retention-days: 30
 
+      - name: Set sanitized artifact name
+        run: |
+          RAW="\${{ github.head_ref }}.\${{ matrix.contract }}.json"
+          SANITIZED=$(echo "$RAW" | sed 's/[^a-zA-Z0-9._-]/_/g')
+          echo "ARTIFACT_NAME=$SANITIZED" >> $GITHUB_ENV
`;
}

/**
 * Generates a diagnostic report for the CI fix.
 */
export function generateDiagnosticReport(
  errorAnalysis: ReturnType<typeof parseArtifactError>,
  sanitization: ArtifactNameIssue
): string {
  const lines = [
    "## Diamond Storage Check CI Fix — Diagnostic Report",
    "",
    "### Error Analysis",
    `- **Error Type:** ${errorAnalysis.errorType}`,
    `- **Artifact Name:** ${errorAnalysis.artifactName || "N/A"}`,
    "",
    "### Sanitization Result",
    `- **Original:** ${sanitization.originalName}`,
    `- **Sanitized:** ${sanitization.sanitized}`,
    `- **Valid:** ${sanitization.isValid ? "✅" : "❌"}`,
  ];

  if (sanitization.reason) {
    lines.push(`- **Note:** ${sanitization.reason}`);
  }

  lines.push(
    "",
    "### Recommended Fix",
    "1. Apply workflow patch to sanitize artifact names before upload",
    "2. Merge upstream foundry-storage-check for native fix",
    "3. Re-run CI to verify resolution"
  );

  return lines.join("\n");
}
