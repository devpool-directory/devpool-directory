export interface PluginHealthReport {
  pluginUrl: string;
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number;
  manifestName?: string;
  error?: string;
}

export async function probePluginHealth(
  pluginBaseUrl: string,
  timeoutMs: number = 8000
): Promise<PluginHealthReport> {
  const start = Date.now();
  const manifestUrl = `${pluginBaseUrl.replace(/\/$/, "")}/manifest.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(manifestUrl, { signal: controller.signal });
    const latencyMs = Date.now() - start;
    if (!resp.ok) {
      return {
        pluginUrl: pluginBaseUrl,
        healthy: false,
        statusCode: resp.status,
        latencyMs,
        error: `HTTP ${resp.status}`,
      };
    }
    const manifest = (await resp.json()) as { name?: string };
    return {
      pluginUrl: pluginBaseUrl,
      healthy: true,
      statusCode: resp.status,
      latencyMs,
      manifestName: manifest.name,
    };
  } catch (err) {
    return {
      pluginUrl: pluginBaseUrl,
      healthy: false,
      statusCode: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
