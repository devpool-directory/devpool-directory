/**
 * Enforces a single AbortController deadline across both fetch header arrival
 * AND full response body decoding (#6140).
 */
export async function fetchJsonWithBodyDeadline<T = unknown>(
  url: string,
  timeoutMs: number = 10_000,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Health-check deadline exceeded (${timeoutMs}ms)`)), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    const text = await response.text();
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}
