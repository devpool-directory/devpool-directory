/**
 * Proposal Router for UbiquityOS & DevPool Directory
 *
 * Intelligently routes new issue proposals to the most relevant repository
 * based on live input text, topics, repository descriptions, aliases,
 * and optional vector embeddings.
 *
 * Reference: https://github.com/ubiquity/.github/issues/123 (Issue #5840)
 */

export interface RepositoryTarget {
  owner: string;
  repo: string;
  description?: string;
  topics?: string[];
  keywords?: string[];
  aliases?: string[];
  defaultBranch?: string;
}

export interface ProposalInput {
  title?: string;
  body?: string;
  text?: string;
  tags?: string[];
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface RouteMatch {
  repository: RepositoryTarget;
  score: number; // Normalized score between 0.0 and 1.0
  confidence: ConfidenceLevel;
  matchedKeywords: string[];
  reason: string;
  isExactAliasMatch?: boolean;
}

export interface ProposalRouterWeights {
  aliasWeight: number;
  repoNameWeight: number;
  topicWeight: number;
  descriptionWeight: number;
  keywordWeight: number;
}

export interface ProposalRouterOptions {
  minScoreThreshold?: number;
  topK?: number;
  highConfidenceThreshold?: number;
  mediumConfidenceThreshold?: number;
  weights?: Partial<ProposalRouterWeights>;
}

export interface ProposalRouterResolvedOptions {
  minScoreThreshold: number;
  topK: number;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  weights: ProposalRouterWeights;
}

const DEFAULT_WEIGHTS: ProposalRouterWeights = {
  aliasWeight: 3.5,
  repoNameWeight: 2.5,
  topicWeight: 2.0,
  descriptionWeight: 1.2,
  keywordWeight: 1.0,
};

const DEFAULT_OPTIONS: ProposalRouterResolvedOptions = {
  minScoreThreshold: 0.05,
  topK: 5,
  highConfidenceThreshold: 0.6,
  mediumConfidenceThreshold: 0.25,
  weights: DEFAULT_WEIGHTS,
};

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for",
  "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself",
  "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
  "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "s", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
  "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
  // Common action noise words in issue reporting
  "issue", "please", "fix", "create", "need", "bug", "make", "want", "help",
]);

/**
 * Tokenize a string into lowercase words, stripping punctuation and stop words.
 */
export function extractKeywords(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9_.-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return Array.from(new Set(tokens));
}

/**
 * Calculate cosine similarity between two numeric vectors.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Normalizes proposal input into combined searchable text.
 */
function normalizeInput(input: ProposalInput | string): {
  rawText: string;
  tokens: string[];
} {
  let combined = "";
  if (typeof input === "string") {
    combined = input;
  } else {
    const parts = [
      input.title ?? "",
      input.body ?? "",
      input.text ?? "",
      ...(input.tags ?? []),
    ];
    combined = parts.filter(Boolean).join(" ");
  }
  const rawText = combined.toLowerCase();
  const tokens = extractKeywords(combined);
  return { rawText, tokens };
}

/**
 * Score a single repository target against proposal tokens and text.
 */
function scoreTarget(
  target: RepositoryTarget,
  rawInput: string,
  inputTokens: string[],
  weights: ProposalRouterWeights
): { score: number; matchedKeywords: string[]; isExactAliasMatch: boolean; reason: string } {
  let score = 0;
  const matchedKeywords: string[] = [];
  let isExactAliasMatch = false;
  const reasons: string[] = [];

  const repoFullName = `${target.owner}/${target.repo}`.toLowerCase();
  const repoName = target.repo.toLowerCase();
  const allAliases = [
    repoFullName,
    repoName,
    ...(target.aliases ?? []).map((a) => a.toLowerCase()),
  ];

  // 1. Direct Alias / Repository mention check
  for (const alias of allAliases) {
    if (alias.length >= 3 && rawInput.includes(alias)) {
      score += weights.aliasWeight * 2.0;
      isExactAliasMatch = true;
      matchedKeywords.push(alias);
      reasons.push(`Direct mention/alias match: "${alias}"`);
      break;
    }
  }

  // 2. Repo name token decomposition (e.g., "pay.ubq.fi" -> ["pay", "ubq", "fi"])
  const repoTokens = extractKeywords(target.repo.replace(/[._-]/g, " "));
  for (const tok of repoTokens) {
    if (inputTokens.includes(tok)) {
      score += weights.repoNameWeight;
      matchedKeywords.push(tok);
      reasons.push(`Repository name match: "${tok}"`);
    }
  }

  // 3. Topics match
  const topics = (target.topics ?? []).map((t) => t.toLowerCase());
  for (const topic of topics) {
    const topicTokens = extractKeywords(topic.replace(/[._-]/g, " "));
    for (const tt of topicTokens) {
      if (inputTokens.includes(tt)) {
        score += weights.topicWeight;
        matchedKeywords.push(tt);
        reasons.push(`Topic match: "${tt}"`);
      }
    }
  }

  // 4. Configured keywords match
  const keywords = (target.keywords ?? []).map((k) => k.toLowerCase());
  for (const kw of keywords) {
    const kwTokens = extractKeywords(kw);
    for (const kt of kwTokens) {
      if (inputTokens.includes(kt)) {
        score += weights.keywordWeight;
        matchedKeywords.push(kt);
        reasons.push(`Keyword match: "${kt}"`);
      }
    }
  }

  // 5. Description tokens match
  if (target.description) {
    const descTokens = extractKeywords(target.description);
    let descHits = 0;
    for (const dt of descTokens) {
      if (inputTokens.includes(dt)) {
        descHits++;
        matchedKeywords.push(dt);
      }
    }
    if (descHits > 0) {
      score += Math.min(descHits, 5) * (weights.descriptionWeight * 0.4);
      reasons.push(`${descHits} description keyword(s) matched`);
    }
  }

  const uniqueMatches = Array.from(new Set(matchedKeywords));
  const normalizedScore = isExactAliasMatch
    ? 1.0
    : Math.min(1.0, score / 10.0);

  const reason = reasons.length > 0 ? reasons.join("; ") : "No significant keyword overlap";

  return {
    score: Number(normalizedScore.toFixed(4)),
    matchedKeywords: uniqueMatches,
    isExactAliasMatch,
    reason,
  };
}

/**
 * Route a proposal to matching repositories.
 */
export function routeProposal(
  input: ProposalInput | string,
  targets: RepositoryTarget[],
  options?: ProposalRouterOptions
): RouteMatch[] {
  if (!targets.length) return [];

  const opts: ProposalRouterResolvedOptions = {
    minScoreThreshold: options?.minScoreThreshold ?? DEFAULT_OPTIONS.minScoreThreshold,
    topK: options?.topK ?? DEFAULT_OPTIONS.topK,
    highConfidenceThreshold: options?.highConfidenceThreshold ?? DEFAULT_OPTIONS.highConfidenceThreshold,
    mediumConfidenceThreshold: options?.mediumConfidenceThreshold ?? DEFAULT_OPTIONS.mediumConfidenceThreshold,
    weights: { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) },
  };

  const { rawText, tokens } = normalizeInput(input);
  if (!rawText && tokens.length === 0) {
    return [];
  }

  const matches: RouteMatch[] = [];

  for (const target of targets) {
    const { score, matchedKeywords, isExactAliasMatch, reason } = scoreTarget(
      target,
      rawText,
      tokens,
      opts.weights
    );

    if (score >= opts.minScoreThreshold) {
      let confidence: ConfidenceLevel = "low";
      if (isExactAliasMatch || score >= opts.highConfidenceThreshold) {
        confidence = "high";
      } else if (score >= opts.mediumConfidenceThreshold) {
        confidence = "medium";
      }

      matches.push({
        repository: target,
        score,
        confidence,
        matchedKeywords,
        reason,
        isExactAliasMatch,
      });
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, opts.topK);
}

/**
 * Route a proposal using precomputed vector embeddings.
 */
export function routeProposalWithEmbeddings(
  proposalEmbedding: number[],
  targets: Array<{ target: RepositoryTarget; embedding: number[] }>,
  options?: { topK?: number; minScore?: number }
): RouteMatch[] {
  const topK = options?.topK ?? DEFAULT_OPTIONS.topK;
  const minScore = options?.minScore ?? DEFAULT_OPTIONS.minScoreThreshold;

  const matches: RouteMatch[] = [];

  for (const item of targets) {
    const similarity = calculateCosineSimilarity(proposalEmbedding, item.embedding);
    if (similarity >= minScore) {
      let confidence: ConfidenceLevel = "low";
      if (similarity >= 0.75) {
        confidence = "high";
      } else if (similarity >= 0.45) {
        confidence = "medium";
      }

      matches.push({
        repository: item.target,
        score: Number(similarity.toFixed(4)),
        confidence,
        matchedKeywords: [],
        reason: `Vector cosine similarity: ${(similarity * 100).toFixed(1)}%`,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, topK);
}

/**
 * Stateful Proposal Router supporting live filtering and repository registry.
 */
export class ProposalRouter {
  private targets: Map<string, RepositoryTarget> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private options: ProposalRouterResolvedOptions;

  constructor(initialTargets?: RepositoryTarget[], options?: ProposalRouterOptions) {
    this.options = {
      minScoreThreshold: options?.minScoreThreshold ?? DEFAULT_OPTIONS.minScoreThreshold,
      topK: options?.topK ?? DEFAULT_OPTIONS.topK,
      highConfidenceThreshold: options?.highConfidenceThreshold ?? DEFAULT_OPTIONS.highConfidenceThreshold,
      mediumConfidenceThreshold: options?.mediumConfidenceThreshold ?? DEFAULT_OPTIONS.mediumConfidenceThreshold,
      weights: { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) },
    };

    if (initialTargets) {
      this.setTargets(initialTargets);
    }
  }

  private getKey(owner: string, repo: string): string {
    return `${owner}/${repo}`.toLowerCase();
  }

  public addTarget(target: RepositoryTarget, embedding?: number[]): void {
    const key = this.getKey(target.owner, target.repo);
    this.targets.set(key, target);
    if (embedding && embedding.length > 0) {
      this.embeddings.set(key, embedding);
    }
  }

  public setTargets(targets: RepositoryTarget[]): void {
    this.targets.clear();
    this.embeddings.clear();
    for (const t of targets) {
      this.addTarget(t);
    }
  }

  public removeTarget(owner: string, repo: string): boolean {
    const key = this.getKey(owner, repo);
    this.embeddings.delete(key);
    return this.targets.delete(key);
  }

  public getTargets(): RepositoryTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Routes the proposal across all registered targets.
   */
  public route(
    input: ProposalInput | string,
    optionsOverride?: Partial<ProposalRouterOptions>
  ): RouteMatch[] {
    const activeTargets = this.getTargets();
    return routeProposal(input, activeTargets, {
      ...this.options,
      ...optionsOverride,
    });
  }

  /**
   * Live filter helper: returns top matching repository targets for UI dropdowns.
   */
  public suggestTopRepositories(
    input: ProposalInput | string,
    limit?: number
  ): RepositoryTarget[] {
    const matches = this.route(input, { topK: limit ?? this.options.topK });
    return matches.map((m) => m.repository);
  }

  /**
   * If there is an unambiguous high-confidence winner, returns it directly.
   */
  public autoSelect(input: ProposalInput | string): RepositoryTarget | null {
    const matches = this.route(input, { topK: 2 });
    if (matches.length === 0) return null;
    const top = matches[0];
    if (top.confidence === "high") {
      if (matches.length === 1 || top.score >= (matches[1]?.score ?? 0) * 1.5) {
        return top.repository;
      }
    }
    return null;
  }

  /**
   * Route using vector embeddings if an embedding is provided for the query.
   */
  public routeWithEmbedding(
    queryEmbedding: number[],
    options?: { topK?: number; minScore?: number }
  ): RouteMatch[] {
    const targetsWithEmbeddings: Array<{ target: RepositoryTarget; embedding: number[] }> = [];
    for (const [key, embedding] of this.embeddings.entries()) {
      const target = this.targets.get(key);
      if (target) {
        targetsWithEmbeddings.push({ target, embedding });
      }
    }
    return routeProposalWithEmbeddings(queryEmbedding, targetsWithEmbeddings, options);
  }
}
