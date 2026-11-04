import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPermitKey,
  createSelfInvalidationManager,
  filterInvalidatedPermits,
  formatInvalidationReport,
  InMemoryStorageAdapter,
  isBogusPermitCandidate,
  normalizeAddress,
  normalizeNonce,
  SelfInvalidationManager,
  type PermitDetails,
} from "../src/utils/selfInvalidation";

test("normalizeAddress: converts valid addresses to lower case and trims", () => {
  assert.equal(normalizeAddress("0xAbC123"), "0xabc123");
  assert.equal(normalizeAddress("  0x1234567890abcdef1234567890abcdef12345678  "), "0x1234567890abcdef1234567890abcdef12345678");
  assert.equal(normalizeAddress(""), undefined);
  assert.equal(normalizeAddress(undefined), undefined);
});

test("normalizeNonce: handles string, number, and bigint safely", () => {
  assert.equal(normalizeNonce("123"), "123");
  assert.equal(normalizeNonce(456), "456");
  assert.equal(normalizeNonce(789n), "789");
  assert.equal(normalizeNonce("  999  "), "999");
});

test("buildPermitKey: formats keys according to provided attributes", () => {
  assert.equal(buildPermitKey("101"), "permit:101");
  assert.equal(buildPermitKey(102n), "permit:102");
  assert.equal(buildPermitKey({ nonce: "103" }), "permit:103");
  assert.equal(buildPermitKey({ nonce: 104, chainId: 1 }), "permit:1:104");
  assert.equal(
    buildPermitKey({ nonce: 105, chainId: 100, token: "0xDef" }),
    "permit:100:0xdef:105"
  );
});

test("InMemoryStorageAdapter: basic CRUD functionality", async () => {
  const storage = new InMemoryStorageAdapter();
  assert.equal(storage.getItem("testKey"), null);

  storage.setItem("testKey", "testVal");
  assert.equal(storage.getItem("testKey"), "testVal");

  storage.removeItem("testKey");
  assert.equal(storage.getItem("testKey"), null);

  storage.setItem("k1", "v1");
  storage.setItem("k2", "v2");
  storage.clear();
  assert.equal(storage.getItem("k1"), null);
  assert.equal(storage.getItem("k2"), null);
});

test("SelfInvalidationManager: invalidates and checks single permits", () => {
  const manager = createSelfInvalidationManager();
  assert.equal(manager.size, 0);
  assert.equal(manager.isInvalidated("1001"), false);

  const record = manager.invalidate("1001", { reason: "bogus" });
  assert.equal(record.nonce, "1001");
  assert.equal(record.reason, "bogus");
  assert.equal(manager.isInvalidated("1001"), true);
  assert.equal(manager.isInvalidated(1001n), true);
  assert.equal(manager.size, 1);

  const recordWithDetails = manager.invalidate({
    nonce: 2002n,
    chainId: 100,
    token: "0x1111111111111111111111111111111111111111",
    amount: "1000",
  });
  assert.equal(recordWithDetails.nonce, "2002");
  assert.equal(recordWithDetails.chainId, 100);
  assert.equal(manager.isInvalidated(2002n), true);
  assert.equal(manager.isInvalidated({ nonce: "2002", chainId: 100 }), true);
});

test("SelfInvalidationManager: restores permits correctly", () => {
  const manager = createSelfInvalidationManager();
  manager.invalidate("555");
  assert.equal(manager.isInvalidated("555"), true);

  const restored = manager.restore("555");
  assert.equal(restored, true);
  assert.equal(manager.isInvalidated("555"), false);

  const notFound = manager.restore("99999");
  assert.equal(notFound, false);
});

test("SelfInvalidationManager: batch invalidation and restoration", () => {
  const manager = createSelfInvalidationManager();
  const records = manager.batchInvalidate(["1", "2", "3"], { reason: "user_deleted" });
  assert.equal(records.length, 3);
  assert.equal(manager.isInvalidated("1"), true);
  assert.equal(manager.isInvalidated("2"), true);
  assert.equal(manager.isInvalidated("3"), true);

  const countRestored = manager.batchRestore(["1", "3", "999"]);
  assert.equal(countRestored, 2);
  assert.equal(manager.isInvalidated("1"), false);
  assert.equal(manager.isInvalidated("2"), true);
  assert.equal(manager.isInvalidated("3"), false);
});

test("SelfInvalidationManager: filters permit lists cleanly", () => {
  const manager = createSelfInvalidationManager();
  const permits: PermitDetails[] = [
    { nonce: "10", amount: "50" },
    { nonce: "20", amount: "100" },
    { nonce: "30", amount: "150" },
  ];

  manager.invalidate("20", { reason: "bogus" });

  const active = manager.filterPermits(permits);
  assert.equal(active.length, 2);
  assert.deepEqual(active.map((p) => p.nonce), ["10", "30"]);

  const invalidatedOnly = manager.filterPermits(permits, { invert: true });
  assert.equal(invalidatedOnly.length, 1);
  assert.equal(invalidatedOnly[0].nonce, "20");
});

test("SelfInvalidationManager: calculates stats accurately", () => {
  const manager = createSelfInvalidationManager();
  manager.invalidate("1", { reason: "bogus", chainId: 1 });
  manager.invalidate("2", { reason: "bogus", chainId: 100 });
  manager.invalidate("3", { reason: "expired", chainId: 1 });

  const permits: PermitDetails[] = [
    { nonce: "1" },
    { nonce: "2" },
    { nonce: "3" },
    { nonce: "4" },
    { nonce: "5" },
  ];

  const stats = manager.getStats(permits);
  assert.equal(stats.totalInvalidated, 3);
  assert.equal(stats.byReason["bogus"], 2);
  assert.equal(stats.byReason["expired"], 1);
  assert.equal(stats.byChainId[1], 2);
  assert.equal(stats.byChainId[100], 1);
  assert.equal(stats.totalActive, 2);
  assert.equal(stats.totalFiltered, 3);
  assert.ok(stats.lastInvalidatedAt !== null);
});

test("SelfInvalidationManager: notifies subscribers on change", () => {
  const manager = createSelfInvalidationManager();
  let callCount = 0;
  const unsubscribe = manager.subscribe((records) => {
    callCount++;
    assert.ok(Array.isArray(records));
  });

  manager.invalidate("101");
  manager.restore("101");
  assert.equal(callCount, 2);

  unsubscribe();
  manager.invalidate("102");
  assert.equal(callCount, 2); // should not increment after unsubscribe
});

test("SelfInvalidationManager: respects maxEntries and purges oldest", () => {
  const manager = createSelfInvalidationManager({ maxEntries: 2 });
  manager.invalidate("first");
  manager.invalidate("second");
  assert.equal(manager.isInvalidated("first"), true);
  assert.equal(manager.isInvalidated("second"), true);

  manager.invalidate("third");
  assert.equal(manager.isInvalidated("third"), true);
  assert.equal(manager.size, 2);
});

test("SelfInvalidationManager: persistence and sync init from storage", () => {
  const storage = new InMemoryStorageAdapter();
  const manager1 = new SelfInvalidationManager({ storageAdapter: storage, storageKey: "permits:test" });
  manager1.invalidate("abc-123", { reason: "bogus" });

  const manager2 = new SelfInvalidationManager({ storageAdapter: storage, storageKey: "permits:test" });
  manager2.initSync();
  assert.equal(manager2.isInvalidated("abc-123"), true);
});

test("SelfInvalidationManager: export and import JSON", () => {
  const manager1 = createSelfInvalidationManager();
  manager1.invalidate("p1", { reason: "duplicate" });
  manager1.invalidate("p2", { reason: "expired" });

  const jsonStr = manager1.exportJson();
  assert.ok(jsonStr.includes("p1"));
  assert.ok(jsonStr.includes("p2"));

  const manager2 = createSelfInvalidationManager();
  const { imported, skipped } = manager2.importJson(jsonStr);
  assert.equal(imported, 2);
  assert.equal(skipped, 0);
  assert.equal(manager2.isInvalidated("p1"), true);
  assert.equal(manager2.isInvalidated("p2"), true);

  // Corrupt JSON import handled gracefully
  const badImport = manager2.importJson("INVALID JSON NOT ARRAY");
  assert.equal(badImport.imported, 0);
  assert.equal(badImport.skipped, 1);
});

test("isBogusPermitCandidate: detects zero amounts, expired, and dead addresses", () => {
  assert.equal(isBogusPermitCandidate({ nonce: 1, amount: "0" }), true);
  assert.equal(isBogusPermitCandidate({ nonce: 2, amount: "-50" }), true);
  assert.equal(
    isBogusPermitCandidate({ nonce: 3, beneficiary: "0x0000000000000000000000000000000000000000" }),
    true
  );
  assert.equal(
    isBogusPermitCandidate({ nonce: 4, beneficiary: "0xdead" }),
    true
  );
  assert.equal(
    isBogusPermitCandidate({ nonce: 5, deadline: 1000 }), // expired timestamp in the past
    true
  );
  assert.equal(
    isBogusPermitCandidate({
      nonce: 6,
      amount: "1000000000000000000",
      deadline: Math.floor(Date.now() / 1000) + 86400,
      beneficiary: "0x1234567890123456789012345678901234567890",
    }),
    false
  );
});

test("filterInvalidatedPermits: standalone helper filters properly", () => {
  const permits = [
    { nonce: "A" },
    { nonce: "B" },
    { nonce: "C" },
  ];
  const filtered = filterInvalidatedPermits(permits, new Set(["B"]));
  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map((p) => p.nonce), ["A", "C"]);
});

test("formatInvalidationReport: formats records into markdown table", () => {
  const emptyReport = formatInvalidationReport([]);
  assert.equal(emptyReport, "No permits currently invalidated.");

  const records = [
    {
      key: "permit:1",
      nonce: "1",
      reason: "bogus" as const,
      chainId: 100,
      token: "0x6b175474e89094c44da98b954eedeac495271d0f",
      invalidatedAt: "2026-11-05T07:00:00.000Z",
    },
  ];
  const report = formatInvalidationReport(records);
  assert.ok(report.includes("| Key / Nonce |"));
  assert.ok(report.includes("`1`"));
  assert.ok(report.includes("bogus"));
  assert.ok(report.includes("100"));
});
