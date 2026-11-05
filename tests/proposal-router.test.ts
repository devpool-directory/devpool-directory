import test from "node:test";
import assert from "node:assert/strict";
import {
  extractKeywords,
  calculateCosineSimilarity,
  routeProposal,
  routeProposalWithEmbeddings,
  inferTitle,
  createIssueUrl,
  ProposalRouter,
  type RepositoryTarget,
} from "../src/utils/proposalRouter";

const SAMPLE_TARGETS: RepositoryTarget[] = [
  {
    owner: "ubiquity",
    repo: "pay.ubq.fi",
    description: "Ubiquity Pay web application for crypto payouts, permits, and cash out flows",
    topics: ["payments", "crypto", "erc20", "dai", "ui"],
    keywords: ["cash out", "permit", "payment", "faucet"],
    aliases: ["pay.ubq.fi", "pay", "ubiquity-pay"],
  },
  {
    owner: "ubiquity",
    repo: "work.ubq.fi",
    description: "DevPool work discovery, issue browsing, task views, XP surfaces, and contributor dashboards.",
    topics: ["bounty", "devpool", "dashboard", "proposals"],
    keywords: ["proposals", "bounties", "work"],
    aliases: ["work.ubq.fi", "work"],
  },
  {
    owner: "ubiquity-os",
    repo: "ubiquity-os-kernel",
    description: "Core UbiquityOS runtime, plugin orchestration, command routing, and event handling.",
    topics: ["kernel", "plugin", "runtime", "command", "webhook"],
    keywords: ["kernel", "webhook", "orchestration"],
    aliases: ["kernel", "ubiquity-os-kernel"],
  },
  {
    owner: "ubiquity-os-marketplace",
    repo: "text-vector-embeddings",
    description: "Microservice generating vector embeddings and semantic similarity scores for UbiquityOS",
    topics: ["ai", "embeddings", "vector-search", "semantic"],
    keywords: ["embedding", "similarity", "cosine", "vector"],
    aliases: ["vector-embeddings", "embeddings"],
  },
];

test("extractKeywords extracts lowercase normalized keywords without stop words", () => {
  const text = "Please fix the cash out interface on pay.ubq.fi because it is not working!";
  const keywords = extractKeywords(text);
  assert.ok(keywords.includes("cash"));
  assert.ok(keywords.includes("interface"));
  assert.ok(keywords.includes("working"));
  assert.ok(keywords.includes("pay.ubq.fi") || keywords.includes("pay"));
  assert.ok(!keywords.includes("the"));
  assert.ok(!keywords.includes("it"));
  assert.ok(!keywords.includes("is"));
  assert.ok(!keywords.includes("not"));
  assert.ok(!keywords.includes("please"));
  assert.ok(!keywords.includes("fix"));
});

test("calculateCosineSimilarity returns accurate similarity scores", () => {
  const simIdentical = calculateCosineSimilarity([1, 2, 3], [1, 2, 3]);
  assert.equal(simIdentical, 1.0);

  const simOrthogonal = calculateCosineSimilarity([1, 0], [0, 1]);
  assert.equal(simOrthogonal, 0.0);

  const sim = calculateCosineSimilarity([1, 1, 0], [1, 0, 1]);
  assert.ok(sim > 0.49 && sim < 0.51);

  assert.equal(calculateCosineSimilarity([], []), 0);
  assert.equal(calculateCosineSimilarity([1, 2], [1]), 0);
  assert.equal(calculateCosineSimilarity([0, 0], [0, 0]), 0);
});

test("inferTitle extracts clean first line and limits length", () => {
  assert.equal(inferTitle("Fix cash out interface\nMore details"), "Fix cash out interface");
  assert.equal(inferTitle(""), "");
  const longTitle = "a".repeat(100);
  assert.equal(inferTitle(longTitle).length, 90);
  assert.ok(inferTitle(longTitle).endsWith("..."));
});

test("createIssueUrl builds correct GitHub new issue link with parameters", () => {
  const target: RepositoryTarget = { owner: "ubiquity", repo: "pay.ubq.fi" };
  const url = createIssueUrl(target, "Fix payout flow", "Steps to reproduce");
  assert.equal(url, "https://github.com/ubiquity/pay.ubq.fi/issues/new?title=Fix+payout+flow&body=Steps+to+reproduce");
});

test("routeProposal routes query directly to pay.ubq.fi via alias", () => {
  const message = "We need to fix the cash out interface on pay.ubq.fi because it's broken.";
  const results = routeProposal(message, SAMPLE_TARGETS);
  assert.ok(results.length > 0);
  assert.equal(results[0].repository.repo, "pay.ubq.fi");
  assert.equal(results[0].confidence, "high");
  assert.equal(results[0].isExactAliasMatch, true);
  assert.equal(results[0].score, 1.0);
});

test("routeProposal handles structured ProposalInput with tags", () => {
  const proposal = {
    title: "Proposal submission flow",
    body: "Enable users to create proposals directly from the portal",
    tags: ["bounty", "devpool"],
  };

  const results = routeProposal(proposal, SAMPLE_TARGETS);
  assert.ok(results.length > 0);
  assert.equal(results[0].repository.repo, "work.ubq.fi");
  assert.ok(results[0].score > 0);
});

test("routeProposalWithEmbeddings correctly ranks by cosine similarity", () => {
  const queryEmbedding = [0.9, 0.1, 0.0];
  const targetEmbeddings = [
    { target: SAMPLE_TARGETS[0], embedding: [0.1, 0.9, 0.0] },
    { target: SAMPLE_TARGETS[1], embedding: [0.85, 0.15, 0.0] },
    { target: SAMPLE_TARGETS[2], embedding: [0.0, 0.0, 1.0] },
  ];

  const results = routeProposalWithEmbeddings(queryEmbedding, targetEmbeddings, { minScore: 0 });
  assert.equal(results.length, 3);
  assert.equal(results[0].repository.repo, "work.ubq.fi");
  assert.ok(results[0].score > 0.95);
  assert.equal(results[2].repository.repo, "ubiquity-os-kernel");
  assert.equal(results[2].score, 0);
});

test("ProposalRouter stateful registry and autoSelect work properly", () => {
  const router = new ProposalRouter(SAMPLE_TARGETS);
  assert.equal(router.getTargets().length, 4);

  const top = router.suggestTopRepositories("cash out payment");
  assert.ok(top.length > 0);
  assert.equal(top[0].repo, "pay.ubq.fi");

  const autoSelected = router.autoSelect("Crash on pay.ubq.fi during submit");
  assert.equal(autoSelected?.repo, "pay.ubq.fi");

  router.removeTarget("ubiquity", "pay.ubq.fi");
  assert.equal(router.getTargets().length, 3);
});

// Regression 1 (#6019 / ubiquity/.github#137): Preserve explicit repository choice even when re-picking auto-selected value
test("ProposalRouterSession preserves explicit repository choice across proposal edits (Issue #6019 Regression 1)", () => {
  const router = new ProposalRouter(SAMPLE_TARGETS);
  const session = router.createSession("Fix cash out interface on pay.ubq.fi");

  // Initial auto-selection routes to pay.ubq.fi
  assert.equal(session.getSelectedRepository()?.repo, "pay.ubq.fi");
  assert.equal(session.getExplicitSelectionKey(), null);

  // User explicitly re-picks the already auto-selected repository
  session.recordExplicitSelection("ubiquity/pay.ubq.fi");
  assert.equal(session.getExplicitSelectionKey(), "ubiquity/pay.ubq.fi");

  // User later changes the proposal text toward kernel / webhook topics
  session.updateProposal("Route a new webhook command to the correct plugin in the kernel.");

  // Automatic matches would now prefer ubiquity-os-kernel
  assert.equal(session.getSuggestions()[0].repository.repo, "ubiquity-os-kernel");

  // But the explicitly chosen repository remains pay.ubq.fi
  assert.equal(session.getSelectedRepository()?.repo, "pay.ubq.fi");

  // Clearing explicit choice restores dynamic selection
  session.clearExplicitRepository();
  assert.equal(session.getSelectedRepository()?.repo, "ubiquity-os-kernel");
});

// Regression 2 (#6019 / ubiquity/.github#137): Preserve custom title typed while catalog or proposals update
test("ProposalRouterSession preserves custom title edits (Issue #6019 Regression 2)", () => {
  const router = new ProposalRouter(SAMPLE_TARGETS);

  // Initial title inferred from proposal
  const session = router.createSession("First line of proposal\nDetails");
  assert.equal(session.getTitle(), "First line of proposal");
  assert.equal(session.isTitleManual(), false);

  // User types a custom title
  session.setTitle("Custom User Specified Title");
  assert.equal(session.isTitleManual(), true);
  assert.equal(session.getTitle(), "Custom User Specified Title");

  // User edits proposal body
  session.updateProposal("Completely different proposal description\nMore notes");

  // Title must remain the custom user title, not the new inferred first line
  assert.equal(session.getTitle(), "Custom User Specified Title");

  // Issue URL uses the preserved custom title
  const issueUrl = session.getIssueUrl();
  assert.ok(issueUrl?.includes("title=Custom+User+Specified+Title"));
});

