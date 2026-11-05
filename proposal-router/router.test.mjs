import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initProposalRouter } from "./main.js";
import { createIssueUrl, inferTitle, rankRepositories } from "./router.js";

const repositories = JSON.parse(await readFile(new URL("./repositories.json", import.meta.url), "utf8"));

const [paymentCandidate] = rankRepositories(repositories, "Fix the cash out interface on pay.ubq.fi because the claim screen is not centered.");
assert.equal(paymentCandidate.repository.name, "pay.ubq.fi");

const [kernelCandidate] = rankRepositories(repositories, "Route a new webhook command to the correct plugin in the kernel.");
assert.equal(kernelCandidate.repository.name, "ubiquity-os-kernel");

assert.equal(inferTitle("Fix proposal routing\nMore detail"), "Fix proposal routing");

const issueUrl = createIssueUrl(repositories[0], "Fix payout", "Body");
assert.equal(issueUrl, "https://github.com/ubiquity/pay.ubq.fi/issues/new?title=Fix+payout&body=Body");

function createMockElement(tagName) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    tagName,
    value: "",
    textContent: "",
    className: "",
    href: "#",
    disabled: false,
    children: [],
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(type) {
      for (const handler of listeners.get(type) ?? []) {
        handler({ target: this });
      }
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
      if (tagName === "select") {
        if (!nodes.some((n) => n.value === this.value)) {
          this.value = nodes[0]?.value ?? "";
        }
      }
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    setAttribute(name, val) {
      attributes.set(name, val);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
}

function createMockDom() {
  const elements = {
    "#proposal": createMockElement("textarea"),
    "#title": createMockElement("input"),
    "#repository": createMockElement("select"),
    "#suggestions": createMockElement("ol"),
    "#issue-link": createMockElement("a"),
    "#copy-link": createMockElement("button"),
  };
  return {
    elements,
    document: {
      querySelector(selector) {
        return elements[selector] ?? null;
      },
      createElement(tagName) {
        return createMockElement(tagName);
      },
    },
  };
}

// Regression 1 (#137 / #6019): Re-picking the already auto-selected repository locks explicit selection across proposal edits.
{
  const { elements, document } = createMockDom();
  elements["#proposal"].value = "Fix the cash out interface on pay.ubq.fi";
  await initProposalRouter({
    document,
    fetch: async () => ({ ok: true, json: async () => repositories }),
  });

  assert.equal(elements["#repository"].value, "ubiquity/pay.ubq.fi");
  // User opens the dropdown and re-picks the already displayed repository (fires click/input even if value is unchanged)
  elements["#repository"].dispatchEvent("click");

  // User then changes proposal text toward kernel/webhook topics
  elements["#proposal"].value = "Route a new webhook command to the correct plugin in the kernel.";
  elements["#proposal"].dispatchEvent("input");

  assert.equal(elements["#repository"].value, "ubiquity/pay.ubq.fi");
  assert.ok(elements["#issue-link"].href.startsWith("https://github.com/ubiquity/pay.ubq.fi/issues/new?"));
}

// Regression 2 (#137 / #6019): A custom title typed while the catalog request is still in flight is preserved.
{
  const { elements, document } = createMockDom();
  let resolveFetch;
  const slowFetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });

  const initPromise = initProposalRouter({ document, fetch: slowFetch });

  // User types proposal and custom title before catalog request finishes
  elements["#proposal"].value = "First line that would normally become auto title\nMore details";
  elements["#proposal"].dispatchEvent("input");
  elements["#title"].value = "Custom user title typed during slow fetch";
  elements["#title"].dispatchEvent("input");

  resolveFetch({ ok: true, json: async () => repositories });
  await initPromise;

  assert.equal(elements["#title"].value, "Custom user title typed during slow fetch");
}

// Regression 3 (#138): Catalog fetch failure notice stays visible across proposal edits.
{
  const { elements, document } = createMockDom();
  await initProposalRouter({
    document,
    fetch: async () => ({ ok: false, status: 503 }),
  });

  assert.equal(elements["#repository"].disabled, true);
  assert.equal(elements["#suggestions"].children.length, 1);
  assert.match(elements["#suggestions"].children[0].textContent, /Unable to load repository catalog/);

  // User edits proposal after catalog failure
  elements["#proposal"].value = "Fix the cash out interface on pay.ubq.fi";
  elements["#proposal"].dispatchEvent("input");

  assert.equal(elements["#repository"].disabled, true);
  assert.equal(elements["#issue-link"].getAttribute("aria-disabled"), "true");
  assert.equal(elements["#suggestions"].children.length, 1);
  assert.match(elements["#suggestions"].children[0].textContent, /Unable to load repository catalog/);
}

console.log("proposal-router tests passed");

