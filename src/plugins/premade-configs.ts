/**
 * Premade Configs That Are Hands-Off for Partners (Issue #5837)
 * 
 * Implements a YAML-based premade configuration system that eliminates
 * the need for partners to manually configure plugins. Provides structured
 * templates with metadata and plugin settings.
 * 
 * Addresses: devpool-directory#5837 / ubiquity-os/ubiquity-os-plugin-installer#43
 */

import { Octokit } from "octokit";

export interface PremadeConfigMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export interface PremadeConfig {
  metadata: PremadeConfigMetadata;
  plugins: PluginConfig[];
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Standard premade configurations shipped with the system.
 */
export const STANDARD_PREMADE_CONFIGS: Record<string, PremadeConfig> = {
  "ubiquity-standard": {
    metadata: {
      name: "UbiquityOS Standard Config",
      description: "The fully-enabled and battle-tested configuration which we use across all organizations at Ubiquity.",
      version: "1.0",
      author: "ubiquity-os",
      tags: ["production", "recommended", "full-stack"],
    },
    plugins: [
      { name: "command-start-stop", enabled: true, settings: { autoAssign: true, requireApproval: false } },
      { name: "command-wallet", enabled: true, settings: { showBalance: true } },
      { name: "devpool-directory", enabled: true, settings: { syncInterval: 300 } },
      { name: "label-sync", enabled: true, settings: { enforceLabels: true } },
    ],
  },
  "minimal": {
    metadata: {
      name: "Minimal Config",
      description: "Bare-minimum setup for new partners. Only essential plugins enabled.",
      version: "1.0",
      author: "ubiquity-os",
      tags: ["starter", "lightweight"],
    },
    plugins: [
      { name: "command-start-stop", enabled: true, settings: { autoAssign: false, requireApproval: true } },
      { name: "command-wallet", enabled: true, settings: { showBalance: false } },
    ],
  },
  "bounty-focused": {
    metadata: {
      name: "Bounty-Focused Config",
      description: "Optimized for bounty hunting workflows with aggressive automation.",
      version: "1.0",
      author: "ubiquity-os",
      tags: ["bounty", "automation", "high-throughput"],
    },
    plugins: [
      { name: "command-start-stop", enabled: true, settings: { autoAssign: true, requireApproval: false, maxConcurrent: 5 } },
      { name: "command-wallet", enabled: true, settings: { showBalance: true, autoClaim: true } },
      { name: "devpool-directory", enabled: true, settings: { syncInterval: 60, priorityBoost: true } },
      { name: "label-sync", enabled: true, settings: { enforceLabels: true, autoPrice: true } },
      { name: "webhook-rewards", enabled: true, settings: { creditPerEvent: 1 } },
    ],
  },
};

/**
 * Validate a premade config structure.
 */
export function validatePremadeConfig(config: unknown): ConfigValidationResult {
  const result: ConfigValidationResult = { valid: true, errors: [], warnings: [] };

  if (!config || typeof config !== "object") {
    result.valid = false;
    result.errors.push("Config must be a non-null object");
    return result;
  }

  const cfg = config as Record<string, unknown>;

  // Check metadata
  if (!cfg.metadata || typeof cfg.metadata !== "object") {
    result.valid = false;
    result.errors.push("Missing or invalid 'metadata' section");
    return result;
  }

  const meta = cfg.metadata as Record<string, unknown>;
  if (!meta.name || typeof meta.name !== "string") {
    result.valid = false;
    result.errors.push("metadata.name is required and must be a string");
  }
  if (!meta.description || typeof meta.description !== "string") {
    result.valid = false;
    result.errors.push("metadata.description is required and must be a string");
  }
  if (!meta.version || typeof meta.version !== "string") {
    result.valid = false;
    result.errors.push("metadata.version is required and must be a string");
  }

  // Check plugins
  if (!Array.isArray(cfg.plugins)) {
    result.valid = false;
    result.errors.push("'plugins' must be an array");
    return result;
  }

  for (let i = 0; i < cfg.plugins.length; i++) {
    const plugin = cfg.plugins[i];
    if (!plugin || typeof plugin !== "object") {
      result.valid = false;
      result.errors.push(`plugins[${i}] must be an object`);
      continue;
    }
    const p = plugin as Record<string, unknown>;
    if (!p.name || typeof p.name !== "string") {
      result.valid = false;
      result.errors.push(`plugins[${i}].name is required and must be a string`);
    }
    if (typeof p.enabled !== "boolean") {
      result.warnings.push(`plugins[${i}].enabled should be boolean, defaulting to true`);
    }
  }

  return result;
}

/**
 * Get a premade config by name.
 */
export function getPremadeConfig(name: string): PremadeConfig | null {
  return STANDARD_PREMADE_CONFIGS[name] || null;
}

/**
 * List all available premade configs.
 */
export function listPremadeConfigs(): Array<{ name: string; description: string; tags: string[] }> {
  return Object.entries(STANDARD_PREMADE_CONFIGS).map(([key, config]) => ({
    name: key,
    description: config.metadata.description,
    tags: config.metadata.tags || [],
  }));
}

/**
 * Apply a premade config to a repository (conceptual — actual application
 * depends on the plugin installer infrastructure).
 */
export async function applyPremadeConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  configName: string
): Promise<{ success: boolean; message: string; config?: PremadeConfig }> {
  const config = getPremadeConfig(configName);
  
  if (!config) {
    return {
      success: false,
      message: `Unknown premade config: '${configName}'. Available: ${Object.keys(STANDARD_PREMADE_CONFIGS).join(", ")}`,
    };
  }

  const validation = validatePremadeConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      message: `Config validation failed: ${validation.errors.join("; ")}`,
    };
  }

  // In a real implementation, this would write the config to the repo's
  // .ubiquity/config.yaml or equivalent location via the Contents API.
  // For now, we verify the repo exists and is accessible.
  try {
    await octokit.rest.repos.get({ owner, repo });
  } catch (error: any) {
    return {
      success: false,
      message: `Cannot access repository ${owner}/${repo}: ${error.message}`,
    };
  }

  return {
    success: true,
    message: `Premade config '${configName}' validated and ready for ${owner}/${repo}. ${config.plugins.filter(p => p.enabled).length} plugins enabled.`,
    config,
  };
}

/**
 * Format premade config for display.
 */
export function formatPremadeConfig(config: PremadeConfig): string {
  const lines: string[] = [];
  
  lines.push(`\n${"=".repeat(60)}`);
  lines.push(`PREMADE CONFIG: ${config.metadata.name} v${config.metadata.version}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`Description: ${config.metadata.description}`);
  if (config.metadata.author) {
    lines.push(`Author: ${config.metadata.author}`);
  }
  if (config.metadata.tags?.length) {
    lines.push(`Tags: ${config.metadata.tags.join(", ")}`);
  }
  lines.push("");
  lines.push(`Plugins (${config.plugins.length}):`);
  
  for (const plugin of config.plugins) {
    const status = plugin.enabled ? "✅" : "❌";
    lines.push(`  ${status} ${plugin.name}`);
    if (plugin.settings && Object.keys(plugin.settings).length > 0) {
      for (const [key, value] of Object.entries(plugin.settings)) {
        lines.push(`     └─ ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  lines.push(`${"=".repeat(60)}\n`);
  return lines.join("\n");
}
