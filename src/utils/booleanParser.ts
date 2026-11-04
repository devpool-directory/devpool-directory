/**
 * Unified Boolean Environment Variable & Configuration Parser
 *
 * Ensures consistent Boolean evaluation across runtime and worker diagnostics,
 * resolving discrepancies where single-letter false aliases such as "n"
 * were previously handled differently between subsystems.
 *
 * References:
 * - Issue #6215: Keep HTTP diagnostic Boolean parsing consistent for n
 * - Upstream Issue: https://github.com/ubiquity/permit2-rpc-manager/issues/31
 */

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off"]);

/**
 * Parses an unknown or environment variable value into a canonical boolean or undefined.
 * Trims surrounding whitespace and performs case-insensitive matching.
 *
 * Supported True Aliases: "true", "1", "yes", "y", "on"
 * Supported False Aliases: "false", "0", "no", "n", "off"
 *
 * @param raw The raw value to parse (string, boolean, number, undefined, null, etc.)
 * @param defaultValue Fallback value if raw is undefined, null, empty, or unparseable
 * @returns boolean or defaultValue
 */
export function parseBooleanEnvValue(raw: unknown, defaultValue?: boolean): boolean | undefined {
  if (raw === undefined || raw === null) {
    return defaultValue;
  }

  if (typeof raw === "boolean") {
    return raw;
  }

  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return defaultValue;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") {
    return defaultValue;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
}

/**
 * Specialized parser for HTTP diagnostic settings (e.g. `RPC_VALIDATE_CHAIN_ID`).
 * Consistent across refresh routines, Worker runtime, and `/health` snapshot queries.
 *
 * Unset or unrecognized values default to `true` to maintain existing invariant.
 * Supports all true/false aliases including "n", "N", "  n  ", "off", "0", "no", etc.
 *
 * @param raw The raw configuration or environment variable value
 * @param defaultValue Default boolean when unset or unparseable (defaults to true)
 * @returns Evaluated boolean
 */
export function parseDiagnosticBooleanEnv(raw: unknown, defaultValue = true): boolean {
  return parseBooleanEnvValue(raw, defaultValue) ?? defaultValue;
}

/**
 * Returns true if the raw value explicitly evaluates to true.
 */
export function isTruthyEnvValue(raw: unknown): boolean {
  return parseBooleanEnvValue(raw, false) === true;
}

/**
 * Returns true if the raw value explicitly evaluates to false.
 */
export function isFalsyEnvValue(raw: unknown): boolean {
  return parseBooleanEnvValue(raw, false) === false;
}
