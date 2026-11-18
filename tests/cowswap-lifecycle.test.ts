import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Octokit } from "@octokit/rest";
import { CowOrder, CowMap, extractAmountFromLabel, buildCowMap } from "../src/cowswap/client";
import { plan } from "../src/cowswap/plan";
import { main as runShard } from "../src/cli/sync-shard";

function source(repo = "first", number = 1): { node_id: string; title: string; url: string } {
  return { node_id: `cow-${repo}`, title: "CoW Swap Order", url: `https://github.com/partner/${repo}/issues/${number}`, };
}

function cowOrder(id: string, overrides: Partial<CowOrder> = {}): CowOrder {
  return {
    id,
    tokenIn: "ETH",
    tokenOut: "USDC",
    amountIn: "1",
    amountOut: "3000",
    price: "3000",
    status: "open",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-18T00:00:00Z",
    ...overrides,
  };
}

function restIssue(issue: { node_id: string; labels?: string[] } = {}): any {
  return { ...issue, labels: issue.labels || [], html_url: issue.url };
}

async function fixture(run: (f: any) => Promise<void>) {
  const cwd = process.cwd();
  const originalArgv = [...process.argv];
  const names = ["DIRECTORY_OWNER", "DIRECTORY_REPO", "WRITE_TARGET_REPO", "DATA_BRANCH", "USE_GRAPHQL", "MIRRORS_IN_AGGREGATE",
    "FULL_RESYNC", "FORCE_FULL_RESYNC", "DRY_RUN", "COW_ON_CREATE", "DELETE_COW_ON_COMPLETE"];
  const previous = names.map((name) => process.env[name]);
  Object.assign(process.env, { DIRECTORY_OWNER: "devpool-directory", DIRECTORY_REPO: "devpool-directory",
    WRITE_TARGET_REPO: "devpool-directory/devpool-directory", DATA_BRANCH: "__STORAGE__", USE_GRAPHQL: "false",
    MIRRORS_IN_AGGREGATE: "true", FULL_RESYNC: "false", FORCE_FULL_RESYNC: "false", DRY_RUN: "false",
    COW_ON_CREATE: "true", DELETE_COW_ON_COMPLETE: "true" });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "directory-cowswap-lifecycle-"));
  const sources = [source()];
  const saved: Record<string, any> = { "owners-avatars.json": [], "issues-map.json": {}, "mirror-state.json": {},
    "index.json": {}, "cow-map.json": {}, "lifetime-map.json": {},
    "sync-metadata.json": { perRepo: { "partner/first": { lastSyncISO: "2026-10-01T00:00:00Z" } } } };
  const events: string[] = [];
  const posts: string[] = [];
  const deletes: string[] = [];
  const apiCalls: string[] = [];
  const liveOrders: any[] = [];
  const mirrors = () => sources.map((issue, i) => ({ number: i + 10, body: issue.url, title: issue.title, state: "open",
    labels: issue.labels, html_url: `https://github.com/${"devpool-directory"}/${"devpool-directory"}/issues/${i + 10}`,
    user: { login: "devpool-directory-superintendent[bot]" } }));
  let failedRead: "issues" | "prs" | undefined;
  let failSource = false;
  let failReceipt = false;
  let failPost = false;
  let failDelete = false;
  let postError: unknown;
  let timelineRows: any[] | undefined;
  let timelineDone = true;
  let timelineErrors: any[] = [];
  let timelineFailure = false;
  let currentAccount = "account-1";
  let scanned = 0;
  let pendingTree: Array<{ path: string; content: string }> = [];
  const issueRoute = () => {};
  const prRoute = () => {};
  const read = {
    issues: { listForRepo: issueRoute, get: async ({ repo }: any) => ({ data: restIssue(sources.find((issue) => issue.repo === repo)!) }) },
    repos: { get: async () => ({ data: { private: false } }) },
    pulls: { list: prRoute }, users: { getByUsername: async () => ({ data: { avatar_url: "https://example.test/avatar" } }) },
    paginate: async (route: unknown, args: any) => {
      if (args.owner === "devpool-directory") return mirrors();
      const kind = route === issueRoute ? "issues" : "prs";
      if (args.repo === "second" && kind === failedRead) throw new Error(`failed ${kind} fetch`);
      return kind === "issues" ? sources.filter((issue) => issue.repo === args.repo).map(restIssue) : [];
    }
  } as unknown as Octokit;
  const issueWrites = {
    update: async (args: unknown) => ({ data: args }),
    listForRepo: async () => ({ data: mirrors() })
  };
  const write = {
    issues: issueWrites, rest: { issues: issueWrites },
    repos: { getContent: async ({ path: name }: any) => {
      if (!(name in saved)) throw Object.assign(new Error("missing artifact"), { status: 404 });
      return { data: { encoding: "base64", content: Buffer.from(JSON.stringify(saved[name])).toString("base64") } };
    } },
    git: {
      getRef: async () => ({ data: { object: { sha: "head" } } }),
      getCommit: async () => ({ data: { tree: { sha: "tree" } } }),
      createTree: async ({ tree }: any) => { pendingTree = tree; return { data: { sha: "tree" } }; },
      createCommit: async () => ({ data: { sha: "commit" } }),
      updateRef: async () => {
        const sourceCommit = pendingTree.some((entry) => entry.path === "cow-map.json");
        if (sourceCommit ? failSource : failReceipt && posts.length) throw new Error(sourceCommit ? "source publication failed" : "receipt publication failed");
        for (const change of pendingTree) saved[change.path] = change.path.endsWith(".json") ? JSON.parse(change.content) : change.content;
        events.push(sourceCommit ? "source commit" : Object.values(saved["cow-pending.json"]).some((entry: any) => entry.createAttempt) ? "attempt commit" : "receipt commit");
      }
    }
  } as unknown as Octokit;
  const cow = { v4: uuidv4, getQuote: async (opts: any) => { apiCalls.push("getQuote"); return { data: { id: uuidv4(), ...opts }; }}, };
  const setDelta = (orders: CowOrder[]) => {
    const dir = path.join(scratch, "shards", "shard-0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "shard-0-orders.json"), JSON.stringify(orders.map(o => ({
      id: o.id, tokenIn: o.tokenIn, tokenOut: o.tokenOut, amountIn: o.amountIn, amountOut: o.amountOut,
      price: o.price, status: o.status, created_at: o.created_at, updated_at: o.updated_at
    }))));
    fs.writeFileSync(path.join(dir, "shard-0-sync-meta.json"), JSON.stringify({ "partner/first": { lastSyncISO: "2026-10-01T00:00:00Z" } }));
  };
  fs.writeFileSync(path.join(scratch, "plan.json"), JSON.stringify({ matrix: { include: [
    { shard_id: 0, repos: ["partner/first"] }, { shard_id: 1, repos: ["partner/second"] }
  ] } }));
  fs.writeFileSync(path.join(scratch, "cow-map.json"), JSON.stringify({}));
  process.chdir(scratch);
  try {
    await run({ sources, saved, events, posts, deletes, apiCalls, liveOrders, setDelta, invoke: () => runShard({ write, read }),
      failSource: (value: boolean) => { failSource = value; }, failReceipt: (value: boolean) => { failReceipt = value; },
      failPost: (value: boolean) => { failPost = value; }, failedRead: (value?: "issues" | "prs") => { failedRead = value; },
      failDelete: (value: boolean) => { failDelete = value; },
      postError: (value: unknown) => { postError = value; }, account: (value: string) => { currentAccount = value; },
      scanned: () => scanned,
      shard: async (id: number) => {
        process.argv = [...originalArgv, "--shard", String(id)];
        await runShard({ write, read });
        const dir = path.join(scratch, "shards", `shard-${id}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const name of fs.readdirSync("out").filter((name) => name.startsWith(`shard-${id}-`))) fs.copyFileSync(path.join("out", name), path.join(dir, name));
      } });
  } finally {
    process.argv = originalArgv;
    process.chdir(cwd);
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

test("cow map basic label extraction", () => {
  const label = "CoWSwap: 1 ETH -> 3000 USDC";
  const amount = extractAmountFromLabel(label);
  assert.strictEqual(amount, "1 ETH -> 3000 USDC");
});

test("cow map basic label extraction no match", () => {
  const label = "Some other label";
  const amount = extractAmountFromLabel(label);
  assert.strictEqual(amount, null);
});

test("cow map build from orders", () => {
  const orders = [cowOrder("order-1"), cowOrder("order-2")];
  const map = buildCowMap(orders);
  assert.strictEqual(map["order-1"], "order-1");
  assert.strictEqual(map["order-2"], "order-2");
});

test("cow plan creates and keeps", () => {
  const desiredMap = new Map([
    ["source-first", { node_id: "source-first", text: "1 ETH -> 3000 USDC for this task\nhttps://github.com/partner/first/issues/1", issue_url: "https://github.com/partner/first/issues/1", title: "Current task" }],
  ]);
  const currentOrders = [cowOrder("order-1"), cowOrder("order-2")];
  const cowMap = buildCowMap(currentOrders);
  const result = plan({ desiredMap, currentOrders, cowMap });
  assert.ok(result.kept || result.keep.length > 0, "should keep mapped orders");
  assert.ok(result.creates["source-first"] === "order-1" || Object.keys(result.creates).length > 0, "should create when order missing");
});

test("cow plan deletes managed but not desired", () => {
  const desiredMap = new Map([]);
  const currentOrders = [cowOrder("order-1")];
  const cowMap = { "node-1": "order-1" };
  const result = plan({ desiredMap, currentOrders, cowMap });
  assert.ok(result.deletes.length > 0, "should delete managed but not desired orders");
});