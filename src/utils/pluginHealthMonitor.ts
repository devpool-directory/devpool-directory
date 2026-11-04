/**
 * Plugin Health Monitor
 * Resolves devpool-directory/devpool-directory#5886 (upstream: ubiquity-os/.github#12)
 *
 * Implements:
 * 1. Workflow failure streak analysis (alerting if consecutive failures >= threshold, default: 10)
 * 2. Deduplicated alert comment generation tagging core maintainers (@0x4007 and @gentlementlegen)
 * 3. Live endpoint & manifest health probing with response latency measurement and timeout protection
 */

export const DEFAULT_FAILURE_THRESHOLD = 10;
export const DEFAULT_ALERT_MENTIONS = ["@0x4007", "@gentlementlegen"];

export interface WorkflowRun {
  id: number | string;
  repository: string;
  conclusion: "success" | "failure" | "cancelled" | "timed_out" | "neutral" | "skipped" | string | null;
  event?: string;
  actorLogin?: string;
  createdAt?: string;
  htmlUrl?: string;
}

export interface StreakAnalysis {
  repository: string;
  totalRuns: number;
  consecutiveFailures: number;
  threshold: number;
  exceedsThreshold: boolean;
  failureRunUrls: string[];
  lastSuccessfulRunId?: number | string | null;
}

export interface PluginHealthReport {
  pluginUrl: string;
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number;
  manifestName?: string;
  error?: string;
  manifest?: Record<string, unknown>;
}

/**
 * Filter workflow runs by trigger event and optionally allowed bot / app actors.
 */
export function filterManualWorkflowRuns(
  runs: WorkflowRun[],
  allowedActors?: string[]
): WorkflowRun[] {
  return runs.filter((run) => {
    const isManual = run.event === "workflow_dispatch" || !run.event;
    if (!allowedActors || allowedActors.length === 0) {
      return isManual;
    }
    const actor = (run.actorLogin || "").toLowerCase();
    return isManual && allowedActors.some((a) => a.toLowerCase() === actor);
  });
}

/**
 * Compute the consecutive failure streak from the most recent run downwards.
 * Runs should be ordered from newest to oldest.
 */
export function computeFailureStreak(
  runs: WorkflowRun[],
  threshold: number = DEFAULT_FAILURE_THRESHOLD
): StreakAnalysis {
  const repository = runs.length > 0 ? runs[0].repository : "unknown";
  let consecutiveFailures = 0;
  const failureRunUrls: string[] = [];
  let lastSuccessfulRunId: number | string | null = null;

  for (const run of runs) {
    const conclusion = (run.conclusion || "").toLowerCase();

    if (conclusion === "failure" || conclusion === "timed_out") {
      consecutiveFailures += 1;
      if (run.htmlUrl) {
        failureRunUrls.push(run.htmlUrl);
      }
    } else if (conclusion === "success") {
      lastSuccessfulRunId = run.id;
      break;
    } else {
      // Ignored or neutral conclusion does not break the failure streak,
      // but does not increment it
      continue;
    }
  }

  return {
    repository,
    totalRuns: runs.length,
    consecutiveFailures,
    threshold,
    exceedsThreshold: consecutiveFailures >= threshold,
    failureRunUrls,
    lastSuccessfulRunId,
  };
}

/**
 * Format markdown alert comment when consecutive failure threshold is exceeded.
 */
export function buildFailureStreakAlertComment(
  analysis: StreakAnalysis,
  mentions: string[] = DEFAULT_ALERT_MENTIONS
): string {
  const tags = mentions.join(" ");
  const lines: string[] = [
    `### ⚠️ Plugin Health Monitor Alert: High Failure Streak Detected`,
    ``,
    `Attention ${tags}: The plugin repository **\`${analysis.repository}\`** has recorded **${analysis.consecutiveFailures}** consecutive workflow failures (threshold: ${analysis.threshold}).`,
    ``,
    `#### Diagnostics`,
    `- **Repository**: \`${analysis.repository}\``,
    `- **Consecutive Failures**: ${analysis.consecutiveFailures} / ${analysis.threshold}`,
    `- **Total Evaluated Runs**: ${analysis.totalRuns}`,
    `- **Last Known Successful Run**: ${analysis.lastSuccessfulRunId ? `\`${analysis.lastSuccessfulRunId}\`` : "None in evaluated window"}`,
  ];

  if (analysis.failureRunUrls.length > 0) {
    lines.push(``, `#### Recent Failed Runs`);
    for (const url of analysis.failureRunUrls.slice(0, 5)) {
      lines.push(`- ${url}`);
    }
  }

  lines.push(
    ``,
    `Please inspect the failing workflows and verify the plugin service status.`
  );

  return lines.join("\n");
}

/**
 * Check if an alert comment for this repository already exists to prevent notification spam.
 */
export function isDuplicateAlertComment(
  newAlertBody: string,
  existingComments: string[]
): boolean {
  const normalizedNew = newAlertBody.trim();
  return existingComments.some((existing) => {
    const norm = existing.trim();
    if (norm === normalizedNew) {
      return true;
    }
    const hasHeader = norm.includes("Plugin Health Monitor Alert");
    const hasRepo = normalizedNew.split("\n")[2] && norm.includes(normalizedNew.split("\n")[2].slice(0, 40));
    return hasHeader && hasRepo;
  });
}

/**
 * Probes the HTTP endpoint of a plugin and verifies manifest.json availability.
 */
export async function probePluginHealth(
  pluginBaseUrl: string,
  timeoutMs: number = 8000,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<PluginHealthReport> {
  const start = Date.now();
  const cleanBase = pluginBaseUrl.replace(/\/$/, "");
  const manifestUrl = `${cleanBase}/manifest.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetchFn(manifestUrl, { signal: controller.signal });
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return {
        pluginUrl: cleanBase,
        healthy: false,
        statusCode: resp.status,
        latencyMs,
        error: `HTTP ${resp.status}`,
      };
    }

    const manifest = (await resp.json()) as Record<string, unknown>;
    const manifestName = typeof manifest.name === "string" ? manifest.name : undefined;

    return {
      pluginUrl: cleanBase,
      healthy: true,
      statusCode: resp.status,
      latencyMs,
      manifestName,
      manifest,
    };
  } catch (err: unknown) {
    return {
      pluginUrl: cleanBase,
      healthy: false,
      statusCode: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Overall health evaluation combining workflow failure streak and endpoint probe.
 */
export async function evaluatePluginHealth(params: {
  pluginUrl?: string;
  runs?: WorkflowRun[];
  threshold?: number;
  fetchFn?: typeof fetch;
}): Promise<{
  healthy: boolean;
  streak?: StreakAnalysis;
  endpoint?: PluginHealthReport;
}> {
  let healthy = true;
  let streak: StreakAnalysis | undefined;
  let endpoint: PluginHealthReport | undefined;

  if (params.runs && params.runs.length > 0) {
    streak = computeFailureStreak(params.runs, params.threshold);
    if (streak.exceedsThreshold) {
      healthy = false;
    }
  }

  if (params.pluginUrl) {
    endpoint = await probePluginHealth(params.pluginUrl, 8000, params.fetchFn);
    if (!endpoint.healthy) {
      healthy = false;
    }
  }

  return {
    healthy,
    streak,
    endpoint,
  };
}
