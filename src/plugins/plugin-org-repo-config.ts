/**
 * Set `organization/repository` names in the plugins' configs
 *
 * Normalizes plugin configuration entries to use the canonical
 * `organization/repository` format instead of raw URLs or worker endpoints.
 * This ensures the plugin installer UI and kernel always reference plugins
 * by their stable GitHub identifier.
 *
 * Addresses: devpool-directory#5921 / ubiquity-os/ubiquity-os-plugin-installer#39
 */

export interface PluginConfigEntry {
  plugin: string;
  [key: string]: unknown;
}

export interface NormalizationResult {
  original: string;
  normalized: string;
  changed: boolean;
  warning?: string;
}

// Known worker/URL patterns that map to org/repo identifiers
const WORKER_TO_REPO_MAP: Record<string, string> = {
  "ubiquity-os-comment-vector-embeddings-development.ubiquity.workers.dev":
    "ubiquity-os-marketplace/text-vector-embeddings",
  "ubiquity-os-comment-vector-embeddings.ubiquity.workers.dev":
    "ubiquity-os-marketplace/text-vector-embeddings",
  "ubiquity-os-conversation-rewards-development.ubiquity.workers.dev":
    "ubiquity-os-marketplace/text-conversation-rewards",
  "ubiquity-os-conversation-rewards.ubiquity.workers.dev":
    "ubiquity-os-marketplace/text-conversation-rewards",
  "ubiquity-os-daemon-disqualifier-development.ubiquity.workers.dev":
    "ubiquity-os-marketplace/daemon-disqualifier",
  "ubiquity-os-daemon-disqualifier.ubiquity.workers.dev":
    "ubiquity-os-marketplace/daemon-disqualifier",
  "ubiquity-os-plugin-installer-development.ubiquity.workers.dev":
    "ubiquity-os/ubiquity-os-plugin-installer",
  "ubiquity-os-plugin-installer.ubiquity.workers.dev":
    "ubiquity-os/ubiquity-os-plugin-installer",
};

/**
 * Extracts org/repo from a GitHub URL if present.
 * Returns null if not a recognizable GitHub URL.
 */
function extractOrgRepoFromUrl(url: string): string | null {
  // Match https://github.com/org/repo or github.com/org/repo
  const match = url.match(
    /(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/
  );
  return match ? match[1] : null;
}

/**
 * Normalizes a single plugin identifier to org/repo format.
 * Handles GitHub URLs, worker endpoints, and already-normalized values.
 */
export function normalizePluginIdentifier(
  pluginValue: string
): NormalizationResult {
  const trimmed = pluginValue.trim();

  // Already in org/repo format (no protocol, no dots suggesting domain)
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return { original: pluginValue, normalized: trimmed, changed: false };
  }

  // Check GitHub URL
  const ghExtracted = extractOrgRepoFromUrl(trimmed);
  if (ghExtracted) {
    return {
      original: pluginValue,
      normalized: ghExtracted,
      changed: trimmed !== ghExtracted,
    };
  }

  // Check known worker mappings
  // Strip protocol and path for matching
  const hostname = trimmed
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .toLowerCase();

  if (hostname in WORKER_TO_REPO_MAP) {
    const mapped = WORKER_TO_REPO_MAP[hostname];
    return {
      original: pluginValue,
      normalized: mapped,
      changed: true,
    };
  }

  // Unknown format — return as-is with warning
  return {
    original: pluginValue,
    normalized: trimmed,
    changed: false,
    warning: `Could not normalize '${pluginValue}' to org/repo format. Manual review recommended.`,
  };
}

/**
 * Processes an array of plugin config entries, normalizing all plugin identifiers.
 * Returns updated configs and a summary of changes.
 */
export function normalizePluginConfigs(
  configs: PluginConfigEntry[]
): {
  normalized: PluginConfigEntry[];
  changes: NormalizationResult[];
  warnings: string[];
} {
  const normalized: PluginConfigEntry[] = [];
  const changes: NormalizationResult[] = [];
  const warnings: string[] = [];

  for (const entry of configs) {
    if (!entry.plugin || typeof entry.plugin !== "string") {
      warnings.push(
        `Plugin entry missing or invalid 'plugin' field: ${JSON.stringify(entry)}`
      );
      normalized.push(entry);
      continue;
    }

    const result = normalizePluginIdentifier(entry.plugin);
    changes.push(result);

    if (result.warning) {
      warnings.push(result.warning);
    }

    normalized.push({
      ...entry,
      plugin: result.normalized,
    });
  }

  return { normalized, changes, warnings };
}

/**
 * Generates a YAML-compatible plugin list string from normalized configs.
 * Useful for writing back to .ubiquity-os.config.yml files.
 */
export function generateYamlPluginList(
  configs: PluginConfigEntry[]
): string {
  return configs
    .map((c) => `- plugin: ${c.plugin}`)
    .join("\n");
}
