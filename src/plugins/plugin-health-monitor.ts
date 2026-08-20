/**
 * Plugin Health Monitor
 *
 * Implements a daily health check for all UbiquityOS plugins. Tracks consecutive
 * failures and triggers notifications when a plugin reaches the failure threshold.
 * Designed as a simple, non-configurable cron-compatible utility.
 *
 * Addresses: devpool-directory#5886 / ubiquity-os/.github#12
 */

export interface PluginHealthRecord {
  pluginId: string;
  repository: string;
  lastCheckedAt: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
}

export interface HealthCheckResult {
  pluginId: string;
  healthy: boolean;
  error?: string;
  latencyMs: number;
}

export interface NotificationPayload {
  type: "plugin_failure_threshold";
  pluginId: string;
  repository: string;
  consecutiveFailures: number;
  lastError?: string;
  checkedAt: number;
  mentions: string[];
}

const FAILURE_THRESHOLD = 10;
const DEFAULT_MENTIONS = ["@gentlementlegen"];

/**
 * Creates an empty health record for a new plugin.
 */
export function createHealthRecord(pluginId: string, repository: string): PluginHealthRecord {
  return {
    pluginId,
    repository,
    lastCheckedAt: 0,
    consecutiveFailures: 0,
  };
}

/**
 * Updates a health record with the result of a single health check.
 * Returns the updated record and whether the failure threshold was just crossed.
 */
export function updateHealthRecord(
  record: PluginHealthRecord,
  result: HealthCheckResult,
  timestamp: number = Date.now()
): { updated: PluginHealthRecord; thresholdCrossed: boolean } {
  const updated: PluginHealthRecord = {
    ...record,
    lastCheckedAt: timestamp,
  };

  if (result.healthy) {
    updated.consecutiveFailures = 0;
    updated.lastSuccessAt = timestamp;
    updated.lastError = undefined;
    return { updated, thresholdCrossed: false };
  }

  updated.consecutiveFailures = record.consecutiveFailures + 1;
  updated.lastFailureAt = timestamp;
  updated.lastError = result.error;

  // Threshold crossed only on the exact transition to FAILURE_THRESHOLD
  const thresholdCrossed = updated.consecutiveFailures === FAILURE_THRESHOLD;

  return { updated, thresholdCrossed };
}

/**
 * Checks whether a plugin has reached or exceeded the consecutive failure threshold.
 */
export function hasReachedFailureThreshold(record: PluginHealthRecord): boolean {
  return record.consecutiveFailures >= FAILURE_THRESHOLD;
}

/**
 * Builds a notification payload for a plugin that just crossed the failure threshold.
 */
export function buildFailureNotification(
  record: PluginHealthRecord,
  mentions: string[] = DEFAULT_MENTIONS
): NotificationPayload {
  return {
    type: "plugin_failure_threshold",
    pluginId: record.pluginId,
    repository: record.repository,
    consecutiveFailures: record.consecutiveFailures,
    lastError: record.lastError,
    checkedAt: record.lastCheckedAt,
    mentions,
  };
}

/**
 * Formats a notification payload as a GitHub comment body.
 */
export function formatNotificationComment(payload: NotificationPayload): string {
  const mentionLine = payload.mentions.join(" ");
  const dateStr = new Date(payload.checkedAt).toISOString();

  return [
    `## 🚨 Plugin Health Alert`,
    ``,
    `${mentionLine}`,
    ``,
    `**Plugin:** \`${payload.pluginId}\``,
    `**Repository:** ${payload.repository}`,
    `**Consecutive Failures:** ${payload.consecutiveFailures}`,
    `**Last Error:** ${payload.lastError || "Unknown"}`,
    `**Checked At:** ${dateStr}`,
    ``,
    `This plugin has reached ${FAILURE_THRESHOLD} consecutive failures and requires investigation.`,
  ].join("\n");
}

/**
 * Runs health checks against a list of plugins and returns records needing notification.
 * This is the main entry point for the cron job.
 *
 * @param plugins - List of plugin identifiers to check
 * @param checkFn - Async function that performs the actual health check for a plugin
 * @param existingRecords - Current persisted health records (keyed by pluginId)
 * @returns Updated records map and list of notifications to send
 */
export async function runHealthCheckCycle(
  plugins: Array<{ id: string; repository: string }>,
  checkFn: (pluginId: string) => Promise<HealthCheckResult>,
  existingRecords: Map<string, PluginHealthRecord>
): Promise<{
  records: Map<string, PluginHealthRecord>;
  notifications: NotificationPayload[];
}> {
  const records = new Map(existingRecords);
  const notifications: NotificationPayload[] = [];

  for (const plugin of plugins) {
    let record = records.get(plugin.id);
    if (!record) {
      record = createHealthRecord(plugin.id, plugin.repository);
    }

    let result: HealthCheckResult;
    const start = Date.now();
    try {
      result = await checkFn(plugin.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        pluginId: plugin.id,
        healthy: false,
        error: message,
        latencyMs: Date.now() - start,
      };
    }

    const { updated, thresholdCrossed } = updateHealthRecord(record, result);
    records.set(plugin.id, updated);

    if (thresholdCrossed) {
      notifications.push(buildFailureNotification(updated));
    }
  }

  return { records, notifications };
}

export { FAILURE_THRESHOLD, DEFAULT_MENTIONS };
