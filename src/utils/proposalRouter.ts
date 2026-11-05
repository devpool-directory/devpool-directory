/**
 * Proposal Router for UbiquityOS & DevPool Directory
 *
 * Intelligently routes new issue proposals to the most relevant repository
 * based on live input text, topics, repository descriptions, aliases,
 * and optional vector embeddings.
 *
 * Reference: Issue #6019 / Issue #5840 (upstream: ubiquity/.github#137 & #123)
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
    .map(function sanitizeWord(w) {
      return w.trim().replace(/^[-_.]+|[-_.]+$/g, "");
    })
    .filter(function isMeaningfulWord(w) {
      return w.length >= 2 && !STOP_WORDS.has(w);
    });
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
 * Infer a title from proposal text (first non-empty line truncated to 90 chars).
 */
export function inferTitle(proposal: string): string {
  if (!proposal) return "";
  const firstLine = proposal
    .split(/\r?\n/)
    .map(function trimLine(line) {
      return line.trim();
    })
    .find(Boolean);

  if (!firstLine) {
    return "";
  }

  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

/**
 * Generate GitHub issue URL for a given repository target, title, and body.
 */
export function createIssueUrl(repository: RepositoryTarget, title: string, body: string): string {
  const params = new URLSearchParams({
    title: title.trim(),
    body: body.trim(),
  });
  return `https://github.com/${repository.owner}/${repository.repo}/issues/new?${params.toString()}`;
}

/**
 * Score a single repository target against proposal tokens and text.
 */
function scoreTarget(
  target: RepositoryTarget,
  rawText: string,
  tokens: string[],
  weights: ProposalRouterWeights
): { score: number; matchedKeywords: string[]; isExactAliasMatch: boolean } {
  let rawScore = 0;
  const matchedKeywords = new Set<string>();
  let isExactAliasMatch = false;

  const repoLower = target.repo.toLowerCase();
  const ownerRepo = `${target.owner}/${target.repo}`.toLowerCase();

  // Check aliases (highest weight)
  if (target.aliases && target.aliases.length > 0) {
    for (const alias of target.aliases) {
      const aliasLower = alias.toLowerCase();
      if (rawText.includes(aliasLower)) {
        rawScore += weights.aliasWeight * 2;
        matchedKeywords.add(alias);
        isExactAliasMatch = true;
      }
    }
  }

  // Exact repository name match in text
  if (rawText.includes(repoLower) || rawText.includes(ownerRepo)) {
    rawScore += weights.repoNameWeight * 2;
    matchedKeywords.add(target.repo);
  }

  // Topic matching
  if (target.topics) {
    for (const topic of target.topics) {
      const topicLower = topic.toLowerCase();
      if (tokens.includes(topicLower) || rawText.includes(topicLower)) {
        rawScore += weights.topicWeight;
        matchedKeywords.add(topic);
      }
    }
  }

  // Configured keyword matching
  if (target.keywords) {
    for (const kw of target.keywords) {
      const kwLower = kw.toLowerCase();
      if (tokens.includes(kwLower) || rawText.includes(kwLower)) {
        rawScore += weights.keywordWeight;
        matchedKeywords.add(kw);
      }
    }
  }

  // Description keyword overlap
  if (target.description) {
    const descTokens = extractKeywords(target.description);
    for (const token of tokens) {
      if (descTokens.includes(token)) {
        rawScore += weights.descriptionWeight;
        matchedKeywords.add(token);
      }
    }
  }

  return {
    score: rawScore,
    matchedKeywords: Array.from(matchedKeywords),
    isExactAliasMatch,
  };
}

/**
 * Route a proposal to matching repositories using deterministic multi-signal scoring.
 */
export function routeProposal(
  input: ProposalInput | string,
  targets: RepositoryTarget[],
  options?: ProposalRouterOptions
): RouteMatch[] {
  const opts: ProposalRouterResolvedOptions = {
    minScoreThreshold: options?.minScoreThreshold ?? DEFAULT_OPTIONS.minScoreThreshold,
    topK: options?.topK ?? DEFAULT_OPTIONS.topK,
    highConfidenceThreshold: options?.highConfidenceThreshold ?? DEFAULT_OPTIONS.highConfidenceThreshold,
    mediumConfidenceThreshold: options?.mediumConfidenceThreshold ?? DEFAULT_OPTIONS.mediumConfidenceThreshold,
    weights: { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) },
  };

  const { rawText, tokens } = normalizeInput(input);
  if (!rawText.trim() || targets.length === 0) {
    return [];
  }

  const matches: RouteMatch[] = [];

  for (const target of targets) {
    const { score, matchedKeywords, isExactAliasMatch } = scoreTarget(
      target,
      rawText,
      tokens,
      opts.weights
    );

    const maxTheoreticalScore = Math.max(10, tokens.length * opts.weights.descriptionWeight + opts.weights.repoNameWeight * 2);
    const normalizedScore = isExactAliasMatch ? 1.0 : Math.min(1.0, score / maxTheoreticalScore);

    if (normalizedScore >= opts.minScoreThreshold) {
      let confidence: ConfidenceLevel = "low";
      if (normalizedScore >= opts.highConfidenceThreshold || isExactAliasMatch) {
        confidence = "high";
      } else if (normalizedScore >= opts.mediumConfidenceThreshold) {
        confidence = "medium";
      }

      let reason = `Matched keywords: ${matchedKeywords.join(", ")}`;
      if (isExactAliasMatch) {
        reason = `Direct alias/mention matched: ${matchedKeywords[0]}`;
      }

      matches.push({
        repository: target,
        score: Number(normalizedScore.toFixed(4)),
        confidence,
        matchedKeywords,
        reason,
        isExactAliasMatch,
      });
    }
  }

  matches.sort(function compareMatches(a, b) {
    return b.score - a.score || a.repository.repo.localeCompare(b.repository.repo);
  });

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

  matches.sort(function compareEmbedMatches(a, b) {
    return b.score - a.score;
  });
  return matches.slice(0, topK);
}

/**
 * Interactive Proposal Router Session supporting explicit selection lock and title editing.
 * Directly fulfills Issue #6019 acceptance criteria:
 * - Choosing the currently displayed repository records an explicit selection that later inference cannot override.
 * - Custom typed title survives repository catalog / proposal changes.
 */
export class ProposalRouterSession {
  private _router: ProposalRouter;
  private _explicitSelectionKey: string | null = null;
  private _manualTitle: string | null = null;
  private _proposalText = "";
  private _lastAutoTitle = "";
  private _currentMatches: RouteMatch[] = [];

  constructor(router: ProposalRouter, initialProposal = "", initialTitle = "") {
    this._router = router;
    this._proposalText = initialProposal;
    if (initialTitle.trim()) {
      this._manualTitle = initialTitle.trim();
    }
    this.updateProposal(initialProposal);
  }

  public getProposal(): string {
    return this._proposalText;
  }

  public getTitle(): string {
    if (this._manualTitle !== null) {
      return this._manualTitle;
    }
    return this._lastAutoTitle;
  }

  public isTitleManual(): boolean {
    return this._manualTitle !== null;
  }

  public setTitle(title: string): void {
    this._manualTitle = title;
  }

  public resetTitleToAuto(): void {
    this._manualTitle = null;
    this._lastAutoTitle = inferTitle(this._proposalText);
  }

  public getExplicitSelectionKey(): string | null {
    return this._explicitSelectionKey;
  }

  /**
   * Records explicit repository choice (e.g. from user selecting in UI dropdown or suggestion card).
   * Persists across subsequent proposal text edits even when re-picking the currently auto-selected option.
   */
  public recordExplicitSelection(repoKeyOrTarget: string | RepositoryTarget): void {
    if (typeof repoKeyOrTarget === "string") {
      this._explicitSelectionKey = repoKeyOrTarget.toLowerCase();
    } else {
      this._explicitSelectionKey = `${repoKeyOrTarget.owner}/${repoKeyOrTarget.repo}`.toLowerCase();
    }
  }

  public clearExplicitSelection(): void {
    this._explicitSelectionKey = null;
  }

  public clearExplicitRepository(): void {
    this.clearExplicitSelection();
  }

  public getSelectedRepository(): RepositoryTarget | null {
    const targets = this._router.getTargets();
    if (this._explicitSelectionKey) {
      const explicitMatch = targets.find(
        (t) => `${t.owner}/${t.repo}`.toLowerCase() === this._explicitSelectionKey
      );
      if (explicitMatch) return explicitMatch;
    }
    return this._currentMatches[0]?.repository ?? targets[0] ?? null;
  }

  public getSuggestions(): RouteMatch[] {
    return this._currentMatches;
  }

  /**
   * Updates proposal text and re-runs suggestion ranking while preserving explicit choice and manual title.
   */
  public updateProposal(proposal: string): void {
    this._proposalText = proposal;
    if (this._manualTitle === null) {
      this._lastAutoTitle = inferTitle(proposal);
    }
    this._currentMatches = this._router.route(proposal);
  }

  public getIssueUrl(): string | null {
    const selected = this.getSelectedRepository();
    const title = this.getTitle();
    const body = this._proposalText.trim();
    if (!selected || !title || !body) return null;
    return createIssueUrl(selected, title, body);
  }
}

/**
 * Stateful Proposal Router supporting live filtering and repository registry.
 */
export class ProposalRouter {
  private _targets: Map<string, RepositoryTarget> = new Map();
  private _embeddings: Map<string, number[]> = new Map();
  private _options: ProposalRouterResolvedOptions;

  constructor(initialTargets?: RepositoryTarget[], options?: ProposalRouterOptions) {
    this._options = {
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

  private _getKey(owner: string, repo: string): string {
    return `${owner}/${repo}`.toLowerCase();
  }

  public addTarget(target: RepositoryTarget, embedding?: number[]): void {
    const key = this._getKey(target.owner, target.repo);
    this._targets.set(key, target);
    if (embedding && embedding.length > 0) {
      this._embeddings.set(key, embedding);
    }
  }

  public setTargets(targets: RepositoryTarget[]): void {
    this._targets.clear();
    this._embeddings.clear();
    for (const t of targets) {
      this.addTarget(t);
    }
  }

  public removeTarget(owner: string, repo: string): boolean {
    const key = this._getKey(owner, repo);
    this._embeddings.delete(key);
    return this._targets.delete(key);
  }

  public getTargets(): RepositoryTarget[] {
    return Array.from(this._targets.values());
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
      ...this._options,
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
    const matches = this.route(input, { topK: limit ?? this._options.topK });
    return matches.map(function mapRepo(m) {
      return m.repository;
    });
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
    for (const [key, embedding] of this._embeddings.entries()) {
      const target = this._targets.get(key);
      if (target) {
        targetsWithEmbeddings.push({ target, embedding });
      }
    }
    return routeProposalWithEmbeddings(queryEmbedding, targetsWithEmbeddings, options);
  }

  /**
   * Create an interactive session tracking user edits, explicit repo choice, and manual titles.
   */
  public createSession(initialProposal = "", initialTitle = ""): ProposalRouterSession {
    return new ProposalRouterSession(this, initialProposal, initialTitle);
  }
}

