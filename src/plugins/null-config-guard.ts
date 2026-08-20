/**
 * Null Config Guard for Command Router
 *
 * Prevents "Cannot convert undefined or null to object" errors when
 * parsing plugin configurations in the command router. Ensures that
 * invalid or missing configs are handled gracefully without crashing
 * the entire plugin loading pipeline.
 *
 * Addresses: devpool-directory#5926 / ubiquity-os/ubiquity-os-kernel#287
 */

export interface PluginConfig {
  [key: string]: unknown;
}

export interface SafeConfigResult {
  valid: boolean;
  config: PluginConfig;
  warnings: string[];
}

/**
 * Safely extracts keys from a potentially null/undefined config object.
 * Returns an empty array instead of throwing TypeError.
 */
export function safeGetConfigKeys(config: unknown): string[] {
  if (config === null || config === undefined) {
    return [];
  }
  if (typeof config !== "object") {
    return [];
  }
  try {
    return Object.keys(config as Record<string, unknown>);
  } catch {
    return [];
  }
}

/**
 * Validates and normalizes a plugin configuration, returning a safe
 * result with warnings instead of throwing on invalid input.
 */
export function validatePluginConfig(
  rawConfig: unknown,
  pluginName: string = "unknown"
): SafeConfigResult {
  const warnings: string[] = [];

  if (rawConfig === null || rawConfig === undefined) {
    warnings.push(
      `Plugin '${pluginName}' has null/undefined config. Using empty defaults.`
    );
    return { valid: false, config: {}, warnings };
  }

  if (typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    warnings.push(
      `Plugin '${pluginName}' config is not a plain object (got ${Array.isArray(rawConfig) ? "array" : typeof rawConfig}). Using empty defaults.`
    );
    return { valid: false, config: {}, warnings };
  }

  // Verify it's serializable / accessible
  try {
    const keys = Object.keys(rawConfig as Record<string, unknown>);
    if (keys.length === 0) {
      warnings.push(`Plugin '${pluginName}' has an empty config object.`);
    }
    return { valid: true, config: rawConfig as PluginConfig, warnings };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    warnings.push(
      `Plugin '${pluginName}' config caused error during inspection: ${message}. Using empty defaults.`
    );
    return { valid: false, config: {}, warnings };
  }
}

/**
 * Wrapper for command router config parsing that never throws.
 * Logs warnings to console.warn and returns safe defaults.
 */
export function safeParseCommandConfig(
  rawConfig: unknown,
  pluginName: string = "unknown"
): PluginConfig {
  const result = validatePluginConfig(rawConfig, pluginName);

  for (const warning of result.warnings) {
    console.warn(`[ConfigGuard] ${warning}`);
  }

  return result.config;
}

/**
 * Batch processor: validates multiple plugin configs and separates
 * valid from invalid entries without breaking the pipeline.
 */
export function batchValidateConfigs(
  configs: Array<{ name: string; config: unknown }>
): {
  valid: Array<{ name: string; config: PluginConfig }>;
  invalid: Array<{ name: string; warnings: string[] }>;
} {
  const valid: Array<{ name: string; config: PluginConfig }> = [];
  const invalid: Array<{ name: string; warnings: string[] }> = [];

  for (const entry of configs) {
    const result = validatePluginConfig(entry.config, entry.name);

    for (const warning of result.warnings) {
      console.warn(`[ConfigGuard] ${warning}`);
    }

    if (result.valid) {
      valid.push({ name: entry.name, config: result.config });
    } else {
      invalid.push({ name: entry.name, warnings: result.warnings });
    }
  }

  return { valid, invalid };
}
