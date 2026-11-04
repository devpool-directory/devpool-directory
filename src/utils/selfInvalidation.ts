/**
 * Self Invalidations Utility for DevPool / pay.ubq.fi
 *
 * Implements client-side and off-chain permit self-invalidation logic,
 * allowing developers and users to discard and filter out bogus, test,
 * or unwanted claim permits from the UI without requiring on-chain transactions.
 *
 * References:
 * - Issue: devpool-directory#5911 (Self Invalidations)
 * - Upstream: ubiquity/pay.ubq.fi#455
 */

export type InvalidationReason =
  | "bogus"
  | "expired"
  | "claimed_elsewhere"
  | "user_deleted"
  | "duplicate"
  | "manual"
  | (string & {});

export interface PermitDetails {
  nonce: string | number | bigint;
  beneficiary?: string;
  token?: string;
  amount?: string | number | bigint;
  deadline?: number | bigint;
  signature?: string;
  chainId?: number;
  id?: string;
  issueUrl?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface InvalidationRecord {
  key: string;
  nonce: string;
  beneficiary?: string;
  token?: string;
  chainId?: number;
  invalidatedAt: string; // ISO 8601 string
  reason: InvalidationReason;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface InvalidationStats {
  totalInvalidated: number;
  byReason: Record<string, number>;
  byChainId: Record<number, number>;
  lastInvalidatedAt: string | null;
  totalActive?: number;
  totalFiltered?: number;
}

export interface IStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
  clear?(): void | Promise<void>;
}

/**
 * Standard in-memory storage adapter, suitable for Node.js, CLI, and test environments.
 */
export class InMemoryStorageAdapter implements IStorageAdapter {
  private _storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this._storage.has(key) ? this._storage.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this._storage.set(key, value);
  }

  removeItem(key: string): void {
    this._storage.delete(key);
  }

  clear(): void {
    this._storage.clear();
  }
}

/**
 * Normalizes EVM addresses to lowercase with 0x prefix if valid.
 */
export function normalizeAddress(address?: string): string | undefined {
  if (!address || typeof address !== "string") return undefined;
  const trimmed = address.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes nonces to string representation across bigint, number, and string.
 */
export function normalizeNonce(nonce: string | number | bigint): string {
  if (typeof nonce === "bigint") return nonce.toString();
  if (typeof nonce === "number") return Number.isFinite(nonce) ? Math.floor(nonce).toString() : String(nonce);
  return String(nonce).trim();
}

export interface BuildKeyOptions {
  nonce: string | number | bigint;
  chainId?: number;
  token?: string;
  beneficiary?: string;
}

/**
 * Constructs a unique, deterministic key for a permit.
 * Format: permit:{chainId}:{token}:{nonce} or permit:{nonce} if chain/token are omitted.
 */
export function buildPermitKey(input: PermitDetails | BuildKeyOptions | string | bigint | number): string {
  if (typeof input === "string" || typeof input === "bigint" || typeof input === "number") {
    return `permit:${normalizeNonce(input)}`;
  }

  const nonce = normalizeNonce(input.nonce);
  const chainId = input.chainId;
  const token = normalizeAddress(input.token);

  if (chainId != null && token) {
    return `permit:${chainId}:${token}:${nonce}`;
  }
  if (chainId != null) {
    return `permit:${chainId}:${nonce}`;
  }
  return `permit:${nonce}`;
}

export interface InvalidateOptions {
  reason?: InvalidationReason;
  chainId?: number;
  token?: string;
  beneficiary?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SelfInvalidationOptions {
  storageAdapter?: IStorageAdapter;
  storageKey?: string;
  maxEntries?: number;
  autoPersist?: boolean;
}

/**
 * SelfInvalidationManager handles client-side invalidation of permits.
 * Supports persistence, batching, event listeners, query statistics, and flexible filtering.
 */
export class SelfInvalidationManager {
  private _records: Map<string, InvalidationRecord> = new Map();
  private _storage: IStorageAdapter;
  private _storageKey: string;
  private _maxEntries: number;
  private _autoPersist: boolean;
  private _listeners: Set<(records: InvalidationRecord[]) => void> = new Set();
  private _initialized = false;

  constructor(options?: SelfInvalidationOptions) {
    this._storage = options?.storageAdapter ?? new InMemoryStorageAdapter();
    this._storageKey = options?.storageKey ?? "ubiquity:self_invalidations:v1";
    this._maxEntries = options?.maxEntries ?? 10_000;
    this._autoPersist = options?.autoPersist ?? true;
  }

  /**
   * Initializes state from the storage adapter. Safe to call multiple times.
   */
  async init(): Promise<this> {
    if (this._initialized) return this;
    try {
      const raw = await this._storage.getItem(this._storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._records.clear();
          for (const item of parsed) {
            if (item && typeof item === "object" && typeof item.key === "string" && typeof item.nonce === "string") {
              this._records.set(item.key, {
                key: item.key,
                nonce: item.nonce,
                beneficiary: normalizeAddress(item.beneficiary),
                token: normalizeAddress(item.token),
                chainId: typeof item.chainId === "number" ? item.chainId : undefined,
                invalidatedAt: typeof item.invalidatedAt === "string" ? item.invalidatedAt : new Date().toISOString(),
                reason: item.reason || "user_deleted",
                tags: Array.isArray(item.tags) ? item.tags : undefined,
                metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
              });
            }
          }
        }
      }
    } catch {
      // Graceful fallback on corrupt or empty storage
      this._records.clear();
    }
    this._initialized = true;
    return this;
  }

  /**
   * Synchronous load helper for sync storage adapters (e.g., InMemoryStorageAdapter or window.localStorage).
   */
  initSync(): this {
    if (this._initialized) return this;
    try {
      const raw = this._storage.getItem(this._storageKey);
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._records.clear();
          for (const item of parsed) {
            if (item && typeof item === "object" && typeof item.key === "string" && typeof item.nonce === "string") {
              this._records.set(item.key, {
                key: item.key,
                nonce: item.nonce,
                beneficiary: normalizeAddress(item.beneficiary),
                token: normalizeAddress(item.token),
                chainId: typeof item.chainId === "number" ? item.chainId : undefined,
                invalidatedAt: typeof item.invalidatedAt === "string" ? item.invalidatedAt : new Date().toISOString(),
                reason: item.reason || "user_deleted",
                tags: Array.isArray(item.tags) ? item.tags : undefined,
                metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
              });
            }
          }
        }
      }
    } catch {
      this._records.clear();
    }
    this._initialized = true;
    return this;
  }

  private _persist(): void {
    if (!this._autoPersist) return;
    try {
      const data = JSON.stringify(Array.from(this._records.values()));
      const res = this._storage.setItem(this._storageKey, data);
      if (res && typeof (res as Promise<void>).catch === "function") {
        (res as Promise<void>).catch(() => {});
      }
    } catch {
      // Storage full or quota exceeded - fail safely
    }
  }

  private _notify(): void {
    if (this._listeners.size === 0) return;
    const records = Array.from(this._records.values());
    for (const listener of this._listeners) {
      try {
        listener(records);
      } catch {
        // Suppress listener errors
      }
    }
  }

  private _enforceLimit(): void {
    if (this._records.size <= this._maxEntries) return;
    const sorted = Array.from(this._records.entries()).sort((a, b) => {
      return new Date(a[1].invalidatedAt).getTime() - new Date(b[1].invalidatedAt).getTime();
    });
    const excess = this._records.size - this._maxEntries;
    for (let i = 0; i < excess; i++) {
      this._records.delete(sorted[i][0]);
    }
  }

  /**
   * Invalidate a permit by marking it as deleted/bogus.
   */
  invalidate(
    item: PermitDetails | string | bigint | number,
    options?: InvalidateOptions
  ): InvalidationRecord {
    const key = buildPermitKey(item);
    let nonce: string;
    let chainId: number | undefined = options?.chainId;
    let token: string | undefined = options?.token;
    let beneficiary: string | undefined = options?.beneficiary;

    if (typeof item === "object" && item !== null) {
      nonce = normalizeNonce(item.nonce);
      if (item.chainId != null) chainId = item.chainId;
      if (item.token) token = item.token;
      if (item.beneficiary) beneficiary = item.beneficiary;
    } else {
      nonce = normalizeNonce(item);
    }

    const record: InvalidationRecord = {
      key,
      nonce,
      chainId,
      token: normalizeAddress(token),
      beneficiary: normalizeAddress(beneficiary),
      invalidatedAt: new Date().toISOString(),
      reason: options?.reason ?? "bogus",
      tags: options?.tags,
      metadata: options?.metadata,
    };

    this._records.set(key, record);

    // Also index under the basic nonce key if it has chainId/token, so lookup by plain nonce also resolves
    const fallbackKey = `permit:${nonce}`;
    if (key !== fallbackKey && !this._records.has(fallbackKey)) {
      this._records.set(fallbackKey, { ...record, key: fallbackKey });
    }

    this._enforceLimit();
    this._persist();
    this._notify();
    return record;
  }

  /**
   * Batch invalidate multiple permits at once.
   */
  batchInvalidate(
    items: Array<PermitDetails | string | bigint | number>,
    options?: InvalidateOptions
  ): InvalidationRecord[] {
    const results: InvalidationRecord[] = [];
    const prevAutoPersist = this._autoPersist;
    this._autoPersist = false;

    try {
      for (const item of items) {
        results.push(this.invalidate(item, options));
      }
    } finally {
      this._autoPersist = prevAutoPersist;
      this._persist();
      this._notify();
    }

    return results;
  }

  /**
   * Restores an invalidated permit (un-invalidates / undoes deletion).
   */
  restore(
    item: PermitDetails | string | bigint | number,
    options?: { chainId?: number; token?: string }
  ): boolean {
    const primaryKey = buildPermitKey(item);
    const nonce = typeof item === "object" && item !== null ? normalizeNonce(item.nonce) : normalizeNonce(item);
    const fallbackKey = `permit:${nonce}`;

    const hadPrimary = this._records.delete(primaryKey);
    const hadFallback = this._records.delete(fallbackKey);

    const removed = hadPrimary || hadFallback;
    if (removed) {
      this._persist();
      this._notify();
    }
    return removed;
  }

  /**
   * Batch restores multiple permits. Returns count of successfully restored records.
   */
  batchRestore(items: Array<PermitDetails | string | bigint | number>): number {
    let restoredCount = 0;
    const prevAutoPersist = this._autoPersist;
    this._autoPersist = false;

    try {
      for (const item of items) {
        if (this.restore(item)) {
          restoredCount++;
        }
      }
    } finally {
      this._autoPersist = prevAutoPersist;
      if (restoredCount > 0) {
        this._persist();
        this._notify();
      }
    }

    return restoredCount;
  }

  /**
   * Checks whether a given permit or nonce has been invalidated.
   */
  isInvalidated(
    item: PermitDetails | string | bigint | number,
    options?: { chainId?: number; token?: string }
  ): boolean {
    const primaryKey = buildPermitKey(item);
    if (this._records.has(primaryKey)) return true;

    const nonce = typeof item === "object" && item !== null ? normalizeNonce(item.nonce) : normalizeNonce(item);
    const fallbackKey = `permit:${nonce}`;
    if (this._records.has(fallbackKey)) return true;

    if (options?.chainId != null || options?.token) {
      const specificKey = buildPermitKey({ nonce, chainId: options.chainId, token: options.token });
      if (this._records.has(specificKey)) return true;
    }

    return false;
  }

  /**
   * Filters an array of permits, removing all invalidated entries.
   * If `invert` is true, returns only the invalidated permits.
   */
  filterPermits<T extends PermitDetails>(
    permits: T[],
    options?: { invert?: boolean; chainId?: number }
  ): T[] {
    const invert = options?.invert ?? false;
    return permits.filter((permit) => {
      const invalidated = this.isInvalidated(permit, { chainId: options?.chainId });
      return invert ? invalidated : !invalidated;
    });
  }

  /**
   * Gets the invalidation record for a permit or nonce if one exists.
   */
  getRecord(
    item: PermitDetails | string | bigint | number
  ): InvalidationRecord | undefined {
    const key = buildPermitKey(item);
    if (this._records.has(key)) return this._records.get(key);

    const nonce = typeof item === "object" && item !== null ? normalizeNonce(item.nonce) : normalizeNonce(item);
    return this._records.get(`permit:${nonce}`);
  }

  /**
   * Returns all invalidation records.
   */
  getAllRecords(): InvalidationRecord[] {
    return Array.from(this._records.values());
  }

  /**
   * Returns count of active invalidations.
   */
  get size(): number {
    return this._records.size;
  }

  /**
   * Calculates statistics on current invalidations.
   */
  getStats(currentPermits?: PermitDetails[]): InvalidationStats {
    const byReason: Record<string, number> = {};
    const byChainId: Record<number, number> = {};
    let lastInvalidatedAt: string | null = null;

    for (const record of this._records.values()) {
      byReason[record.reason] = (byReason[record.reason] || 0) + 1;
      if (record.chainId != null) {
        byChainId[record.chainId] = (byChainId[record.chainId] || 0) + 1;
      }
      if (!lastInvalidatedAt || new Date(record.invalidatedAt) > new Date(lastInvalidatedAt)) {
        lastInvalidatedAt = record.invalidatedAt;
      }
    }

    const stats: InvalidationStats = {
      totalInvalidated: this._records.size,
      byReason,
      byChainId,
      lastInvalidatedAt,
    };

    if (currentPermits) {
      const active = this.filterPermits(currentPermits);
      stats.totalActive = active.length;
      stats.totalFiltered = currentPermits.length - active.length;
    }

    return stats;
  }

  /**
   * Subscribes to changes in the invalidation registry.
   */
  subscribe(listener: (records: InvalidationRecord[]) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Clears all invalidations and purges storage.
   */
  async clear(): Promise<void> {
    this._records.clear();
    await this._storage.removeItem(this._storageKey);
    this._notify();
  }

  /**
   * Synchronous clear helper for in-memory or sync storage adapters.
   */
  clearSync(): void {
    this._records.clear();
    const res = this._storage.removeItem(this._storageKey);
    if (res && typeof (res as Promise<void>).catch === "function") {
      (res as Promise<void>).catch(() => {});
    }
    this._notify();
  }

  /**
   * Exports the entire invalidation state as a JSON string.
   */
  exportJson(): string {
    return JSON.stringify(Array.from(this._records.values()), null, 2);
  }

  /**
   * Imports invalidation records from a JSON string.
   */
  importJson(
    jsonStr: string,
    mode: "merge" | "replace" = "merge"
  ): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) throw new Error("Expected JSON array");

      if (mode === "replace") {
        this._records.clear();
      }

      for (const item of parsed) {
        if (item && typeof item === "object" && item.nonce != null) {
          this.invalidate(item, {
            reason: item.reason,
            chainId: item.chainId,
            token: item.token,
            beneficiary: item.beneficiary,
            tags: item.tags,
            metadata: item.metadata,
          });
          imported++;
        } else {
          skipped++;
        }
      }
    } catch {
      return { imported: 0, skipped: 1 };
    }

    return { imported, skipped };
  }
}

/**
 * Checks if a permit appears to be a bogus candidate (e.g., zero amount, expired, dummy addresses).
 */
export function isBogusPermitCandidate(permit: PermitDetails): boolean {
  if (!permit) return false;

  // Check zero or negative amount
  if (permit.amount != null) {
    const amtStr = String(permit.amount);
    if (amtStr === "0" || amtStr.startsWith("-")) return true;
  }

  // Check expired deadline
  if (permit.deadline != null) {
    const nowSec = Math.floor(Date.now() / 1000);
    const deadlineSec = typeof permit.deadline === "bigint" ? Number(permit.deadline) : permit.deadline;
    if (deadlineSec > 0 && deadlineSec < nowSec) {
      return true;
    }
  }

  // Check dummy/zero beneficiary or token address
  if (permit.beneficiary) {
    const ben = permit.beneficiary.toLowerCase();
    if (ben === "0x0000000000000000000000000000000000000000" || ben === "0xdead") return true;
  }

  return false;
}

/**
 * Convenience helper to filter out invalidated permits using a plain list or Set of nonces/keys.
 */
export function filterInvalidatedPermits<T extends PermitDetails>(
  permits: T[],
  invalidatedKeysOrNonces: Set<string> | string[]
): T[] {
  const set = invalidatedKeysOrNonces instanceof Set ? invalidatedKeysOrNonces : new Set(invalidatedKeysOrNonces);
  return permits.filter((p) => {
    const key = buildPermitKey(p);
    const nonce = normalizeNonce(p.nonce);
    return !set.has(key) && !set.has(nonce) && !set.has(`permit:${nonce}`);
  });
}

/**
 * Formats invalidation records into a structured Markdown summary table.
 */
export function formatInvalidationReport(records: InvalidationRecord[]): string {
  if (records.length === 0) {
    return "No permits currently invalidated.";
  }

  const lines = [
    "| Key / Nonce | Reason | Chain ID | Token | Invalidated At |",
    "|---|---|---|---|---|",
  ];

  for (const r of records) {
    const chain = r.chainId != null ? String(r.chainId) : "N/A";
    const token = r.token ? `\`${r.token.slice(0, 6)}...${r.token.slice(-4)}\`` : "N/A";
    const date = r.invalidatedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC");
    lines.push(`| \`${r.nonce}\` | ${r.reason} | ${chain} | ${token} | ${date} |`);
  }

  return lines.join("\n");
}

/**
 * Factory helper for creating a SelfInvalidationManager instance.
 */
export function createSelfInvalidationManager(options?: SelfInvalidationOptions): SelfInvalidationManager {
  return new SelfInvalidationManager(options);
}
