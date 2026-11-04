import test from "node:test";
import assert from "node:assert/strict";
import {
  extractKeywords,
  calculateCosineSimilarity,
  routeProposal,
  routeProposalWithEmbeddings,
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
    description: "Ubiquity Work bounty dashboard and task management portal",
    topics: ["bounty", "devpool", "dashboard", "proposals"],
    keywords: ["proposals", "bounties", "work"],
    aliases: ["work.ubq.fi", "work"],
  },
  {
    owner: "ubiquity-os-marketplace",
    repo: "text-vector-embeddings",
    description: "Microservice generating vector embeddings and semantic similarity scores for UbiquityOS",
    topics: ["ai", "embeddings", "vector-search", "semantic"],
    keywords: ["embedding", "similarity", "cosine", "vector"],
    aliases: ["vector-embeddings", "embeddings"],
  },
  {
    owner: "ubiquity",
    repo: "ubiquibot",
    description: "Core automation bot for GitHub repository and issue management",
    topics: ["bot", "github-actions", "automation"],
    keywords: ["bot", "command", "slash-command"],
    aliases: ["ubiquibot", "ubiquityos"],
  },
];

test("extractKeywords extracts lowercase normalized keywords without stop words", () => {
  const text = "Please fix the cash out interface on pay.ubq.fi because it is not working!";
  const keywords = extractKeywords(text);
  assert.ok(keywords.includes("cash"));
  assert.ok(keywords.includes("interface"));
  assert.ok(keywords.includes("working"));
  assert.ok(keywords.includes("pay.ubq.fi") || keywords.includes("pay"));
  // Stop words must be filtered out
  assert.ok(!keywords.includes("the"));
  assert.ok(!keywords.includes("it"));
  assert.ok(!keywords.includes("is"));
  assert.ok(!keywords.includes("not"));
  assert.ok(!keywords.includes("please"));
  assert.ok(!keywords.includes("fix"));
});

test("calculateCosineSimilarity returns accurate similarity scores", () => {
  // Identical vectors -> 1.0
  const simIdentical = calculateCosineSimilarity([1, 2, 3], [1, 2, 3]);
  assert.equal(simIdentical, 1.0);

  // Orthogonal vectors -> 0.0
  const simOrthogonal = calculateCosineSimilarity([1, 0], [0, 1]);
  assert.equal(simOrthogonal, 0.0);

  // Different vectors
  const sim = calculateCosineSimilarity([1, 1, 0], [1, 0, 1]);
  assert.ok(sim > 0.49 && sim < 0.51);

  // Edge cases
  assert.equal(calculateCosineSimilarity([], []), 0);
  assert.equal(calculateCosineSimilarity([1, 2], [1]), 0);
  assert.equal(calculateCosineSimilarity([0, 0], [0, 0]), 0);
});

test("routeProposal routes Telegram-style prompt directly to pay.ubq.fi via alias", () => {
  const telegramMessage =
    "@ubiquityos we need to fix the cash out interface on pay.ubq.fi because its currently not vertically center aligned.";

  const results = routeProposal(telegramMessage, SAMPLE_TARGETS);
  assert.ok(results.length > 0);
  assert.equal(results[0].repository.repo, "pay.ubq.fi");
  assert.equal(results[0].confidence, "high");
  assert.equal(results[0].isExactAliasMatch, true);
  assert.equal(results[0].score, 1.0);
});

test("routeProposal ranks text-vector-embeddings highest for vector similarity queries", () => {
  const proposal = {
    title: "Need semantic search with cosine vector similarity",
    body: "Implement an embedding service that can compute similarity distances across issues",
  };

  const results = routeProposal(proposal, SAMPLE_TARGETS);
  assert.ok(results.length > 0);
  assert.equal(results[0].repository.repo, "text-vector-embeddings");
  assert.ok(results[0].matchedKeywords.some((kw) => ["similarity", "vector", "embedding"].includes(kw)));
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

test("routeProposal returns empty array when input is empty or has no matches", () => {
  assert.deepEqual(routeProposal("", SAMPLE_TARGETS), []);
  assert.deepEqual(routeProposal("   ", SAMPLE_TARGETS), []);
  assert.deepEqual(routeProposal({ title: "", body: "" }, SAMPLE_TARGETS), []);
  assert.deepEqual(routeProposal("something completely unrelated xyz12345", SAMPLE_TARGETS, { minScoreThreshold: 0.5 }), []);
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
  assert.equal(results[2].repository.repo, "text-vector-embeddings");
  assert.equal(results[2].score, 0);
});

test("ProposalRouter class allows dynamic target management and live UI suggestions", () => {
  const router = new ProposalRouter();
  router.setTargets(SAMPLE_TARGETS);
  assert.equal(router.getTargets().length, 4);

  // Live filter suggestions for UI typing "cash out"
  const suggestions = router.suggestTopRepositories("cash out payment");
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].repo, "pay.ubq.fi");

  // autoSelect when unambiguous
  const autoSelected = router.autoSelect("Crash on pay.ubq.fi during submit");
  assert.equal(autoSelected?.repo, "pay.ubq.fi");

  // Removal of a target
  const removed = router.removeTarget("ubiquity", "pay.ubq.fi");
  assert.equal(removed, true);
  assert.equal(router.getTargets().length, 3);

  // After removal, pay.ubq.fi should no longer be returned
  const suggestionsAfter = router.suggestTopRepositories("pay.ubq.fi");
  assert.ok(!suggestionsAfter.some((r) => r.repo === "pay.ubq.fi"));
});

test("ProposalRouter routeWithEmbedding evaluates registered embeddings", () => {
  const router = new ProposalRouter();
  router.addTarget(SAMPLE_TARGETS[0], [0.1, 0.9, 0.0]);
  router.addTarget(SAMPLE_TARGETS[1], [0.85, 0.15, 0.0]);
  router.addTarget(SAMPLE_TARGETS[2], [0.0, 0.0, 1.0]);

  const matches = router.routeWithEmbedding([0.88, 0.12, 0.0]);
  assert.ok(matches.length > 0);
  assert.equal(matches[0].repository.repo, "work.ubq.fi");
  assert.ok(matches[0].score > 0.95);
});

test("ProposalRouter autoSelect returns null when candidates are closely scored", () => {
  const router = new ProposalRouter();
  router.setTargets(SAMPLE_TARGETS);

  const selected = router.autoSelect("update dashboard ui component");
  assert.equal(selected, null);
});
