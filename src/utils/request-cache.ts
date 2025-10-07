import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Octokit } from "@octokit/rest";

type CacheEntry = {
  key: string;
  url: string;
  etag?: string;
  status: number;
  data: any;
  cachedAt: number; // epoch ms
  headers?: Record<string, string>;
};

export type OctokitCacheOptions = {
  persist?: boolean; // persist cache on disk across runs
  persistDir?: string; // directory for cache files
  ttlMs?: number; // in-memory TTL; disk cache always revalidates via ETag
  alwaysRevalidate?: boolean; // if true, send If-None-Match even when within TTL
};

const DEFAULTS: Required<OctokitCacheOptions> = {
  persist: true,
  persistDir: path.resolve(process.cwd(), ".cache/octokit"),
  ttlMs: 5 * 60 * 1000, // 5 minutes in-memory TTL
  alwaysRevalidate: true,
};

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as any)[k])).join(",")}}`;
}

function buildCacheKey(options: any) {
  const method = (options.method || "GET").toUpperCase();
  const url = options.url || "";
  const cloned: any = { ...options };
  delete cloned.headers;
  delete cloned.request;
  delete cloned.baseUrl;
  delete cloned.mediaType;
  const key = `${method} ${url} ${stableStringify(cloned)}`;
  return key;
}

function sha1(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cachePathForKey(dir: string, key: string) {
  return path.join(dir, `${sha1(key)}.json`);
}

function readCacheFile(dir: string, key: string): CacheEntry | undefined {
  try {
    const p = cachePathForKey(dir, key);
    if (!fs.existsSync(p)) return undefined;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as CacheEntry;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCacheFile(dir: string, entry: CacheEntry) {
  try {
    ensureDir(dir);
    const p = cachePathForKey(dir, entry.key);
    fs.writeFileSync(p, JSON.stringify(entry));
  } catch {
    // best-effort persistence only
  }
}

/**
 * Install a request hook to add ETag-based caching for GET requests.
 * - In-memory TTL avoids duplicate network calls within a run.
 * - Persistent disk cache stores ETags and bodies across runs; we revalidate
 *   with If-None-Match so 304 responses will reuse body without counting
 *   against rate limits.
 */
export function installOctokitCache(octokit: Octokit, opts?: OctokitCacheOptions) {
  const options = { ...DEFAULTS, ...(opts || {}) };
  const mem = new Map<string, CacheEntry>();

  function getFromCache(key: string): CacheEntry | undefined {
    const inMem = mem.get(key);
    if (inMem) return inMem;
    if (!options.persist) return undefined;
    return readCacheFile(options.persistDir, key);
  }

  function saveToCache(entry: CacheEntry) {
    mem.set(entry.key, entry);
    if (options.persist) writeCacheFile(options.persistDir, entry);
  }

  function shouldUseTtl(entry: CacheEntry) {
    if (!entry) return false;
    const age = Date.now() - entry.cachedAt;
    return age < options.ttlMs;
  }

  // Broad invalidation helper for repo-scoped data
  function invalidateRepo(owner?: string, repo?: string) {
    if (!owner || !repo) return;
    const needle = `/repos/${owner}/${repo}/`;
    for (const key of Array.from(mem.keys())) {
      if (key.includes(needle)) mem.delete(key);
    }
    // no disk invalidation: subsequent GET will refresh as needed
  }

  // Expose invalidation for external callers (optional usage)
  (octokit as any).__cacheInvalidateRepo = invalidateRepo;

  octokit.hook.wrap("request", async (request, optionsArg) => {
    const isGet = (optionsArg as any).method ? String((optionsArg as any).method).toUpperCase() === "GET" : true;
    const key = buildCacheKey(optionsArg);
    const cached = isGet ? getFromCache(key) : undefined;

    // Conditional headers
    const headers: Record<string, string> = { ...((optionsArg as any).headers || {}) };
    if (isGet && cached && cached.etag && (options.alwaysRevalidate || !shouldUseTtl(cached))) {
      headers["if-none-match"] = cached.etag;
    }

    const finalOptions = { ...(optionsArg as any), headers };

    // Short-circuit within TTL to avoid network entirely
    if (isGet && cached && shouldUseTtl(cached) && !options.alwaysRevalidate) {
      return {
        status: cached.status,
        url: cached.url,
        headers: cached.headers || {},
        data: cached.data,
      } as any;
    }

    const response = await request(finalOptions);

    // 304 Not Modified: return cached body, update headers timestamp
    if (isGet && response.status === 304 && cached) {
      const mergedHeaders = { ...(cached.headers || {}), ...(response.headers as any) };
      const res: any = {
        status: cached.status || 200,
        url: cached.url,
        headers: mergedHeaders,
        data: cached.data,
      };
      // refresh in-memory timestamp to extend TTL
      saveToCache({ ...cached, headers: mergedHeaders, cachedAt: Date.now() });
      return res;
    }

    // Save successful GET responses with ETag or without
    if (isGet && response.status >= 200 && response.status < 300) {
      const etag = (response.headers as any)?.etag as string | undefined;
      const entry: CacheEntry = {
        key,
        url: (response as any).url || (finalOptions as any).url || "",
        etag,
        status: response.status,
        data: response.data,
        cachedAt: Date.now(),
        headers: response.headers as any,
      };
      saveToCache(entry);
    }

    // Invalidate on mutating calls (best-effort)
    if (!isGet) {
      const owner = (optionsArg as any).owner as string | undefined;
      const repo = (optionsArg as any).repo as string | undefined;
      invalidateRepo(owner, repo);
    }

    return response;
  });

  return {
    invalidateRepo,
  };
}

