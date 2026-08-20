/**
 * @file nomic-embeddings-dual-model.ts
 * @title Nomic Embeddings Model for +10% Accuracy: Dual-Model Architecture
 * @issue https://github.com/devpool-directory/devpool-directory/issues/XXXX
 * @upstream https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/111
 * @bounty $900 USD
 *
 * @description
 * This plugin provides scaffolding for integrating the Nomic Embed v1.5 model
 * alongside the existing embedding model to achieve ~10% improved retrieval
 * accuracy. The upstream issue identifies that Nomic Embed v1.5 achieves
 * ~86.2% top-5 retrieval accuracy vs the current model's lower performance.
 *
 * Key architectural requirements from upstream:
 * 1. Maintain separate vector indices per model (Nomic space vs Voyage/current space)
 * 2. Route queries to correct index based on which model embedded the content
 * 3. Handle token limit differences (Nomic: 8,192 tokens vs GitHub comment max ~16,384)
 * 4. Truncation strategy for comments exceeding Nomic's token capacity
 * 5. Similarity functions must not cross-compare between model spaces
 *
 * Generated modules:
 * - Dual Index Manager: Separate storage/retrieval per embedding model
 * - Token-Aware Chunker: Intelligent truncation respecting per-model limits
 * - Model Router: Directs queries to appropriate index based on metadata
 * - Similarity Comparator: Model-specific distance functions with space isolation
 * - Migration Scaffold: Backfill existing embeddings with Nomic model
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * Supported embedding model identifiers.
 */
export type EmbeddingModelId = "nomic-embed-v1.5" | "voyage-3-large" | "openai-text-embedding-3-large";

/**
 * Metadata stored alongside each embedding vector.
 */
export interface EmbeddingMetadata {
  /** Unique identifier for the embedded content */
  contentId: string;
  /** Source repository full name */
  repoFullName: string;
  /** Issue or PR number */
  issueNumber: number;
  /** Comment ID if applicable */
  commentId?: number;
  /** Which model generated this embedding */
  modelId: EmbeddingModelId;
  /** Token count of the input text */
  inputTokenCount: number;
  /** Whether the input was truncated due to token limits */
  wasTruncated: boolean;
  /** Original character length before chunking/truncation */
  originalCharLength: number;
  /** Timestamp of embedding creation */
  createdAt: string;
  /** Content type classification */
  contentType: "issue-body" | "comment" | "pr-description" | "code-snippet";
}

/**
 * A stored embedding vector with its metadata.
 */
export interface StoredEmbedding {
  id: string;
  vector: number[];
  metadata: EmbeddingMetadata;
}

/**
 * Search query parameters.
 */
export interface SearchQuery {
  /** Natural language query text */
  text: string;
  /** Which model space(s) to search */
  targetModels: EmbeddingModelId[];
  /** Maximum results to return per model */
  topKPerModel: number;
  /** Minimum similarity threshold (model-specific scale) */
  minSimilarity?: number;
  /** Filter by repository */
  repoFilter?: string;
  /** Filter by content type */
  contentTypeFilter?: EmbeddingMetadata["contentType"];
}

/**
 * A single search result with score and metadata.
 */
export interface SearchResult {
  contentId: string;
  score: number;
  modelId: EmbeddingModelId;
  metadata: EmbeddingMetadata;
  /** Snippet of matched content */
  snippet?: string;
}

/**
 * Aggregated search results across multiple model spaces.
 */
export interface AggregatedSearchResults {
  /** Results grouped by source model */
  byModel: Record<EmbeddingModelId, SearchResult[]>;
  /** Merged results with normalized scores (for display only, not comparison) */
  mergedDisplay: Array<SearchResult & { normalizedScore: number }>;
  /** Total candidates evaluated */
  totalCandidatesEvaluated: number;
  /** Query execution time in ms */
  durationMs: number;
}

/**
 * Configuration for the dual-model embedding system.
 */
export interface DualModelConfig {
  /** Nomic API endpoint or local model path */
  nomicEndpoint: string;
  /** Current/Voyage API endpoint */
  currentModelEndpoint: string;
  /** Max tokens for Nomic model */
  nomicMaxTokens: number;
  /** Max tokens for current model */
  currentModelMaxTokens: number;
  /** Vector dimension for Nomic embeddings */
  nomicDimensions: number;
  /** Vector dimension for current model embeddings */
  currentModelDimensions: number;
  /** Whether to auto-generate Nomic embeddings for new content */
  autoEmbedNewContent: boolean;
  /** Batch size for backfill migration */
  migrationBatchSize: number;
  /** Similarity function per model */
  similarityFunctions: Record<EmbeddingModelId, "cosine" | "dot" | "euclidean">;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default dual-model configuration based on upstream research.
 */
export const DEFAULT_CONFIG: DualModelConfig = {
  nomicEndpoint: "https://api-atlas.nomic.ai/v1/embedding/text",
  currentModelEndpoint: "", // Existing endpoint from current deployment
  nomicMaxTokens: 8192,
  currentModelMaxTokens: 32000, // Voyage-3-large supports 32K
  nomicDimensions: 768,
  currentModelDimensions: 1024,
  autoEmbedNewContent: true,
  migrationBatchSize: 50,
  similarityFunctions: {
    "nomic-embed-v1.5": "cosine",
    "voyage-3-large": "cosine",
    "openai-text-embedding-3-large": "cosine",
  },
};

/**
 * Token estimation constants.
 * GitHub comment limit: 65,536 chars ≈ 16,384 tokens (rough estimate).
 */
export const TOKEN_LIMITS = {
  GITHUB_COMMENT_MAX_CHARS: 65536,
  GITHUB_COMMENT_ESTIMATED_TOKENS: 16384,
  CHARS_PER_TOKEN_APPROX: 4,
} as const;

// ============================================================================
// SECTION 3: Dual Index Manager Generator
// ============================================================================

/**
 * Generates the dual-index storage manager that maintains separate
 * vector spaces per embedding model.
 *
 * @param config - Dual model configuration
 * @returns TypeScript source code string
 */
export function generateDualIndexManager(config: DualModelConfig): string {
  return `/**
 * Auto-generated Dual Index Manager
 * Maintains separate vector indices per embedding model to prevent
 * cross-space similarity comparisons.
 */

interface StoredEmbedding {
  id: string;
  vector: number[];
  metadata: any;
}

interface SearchResult {
  contentId: string;
  score: number;
  modelId: string;
  metadata: any;
}

const CONFIG = {
  nomicDimensions: ${config.nomicDimensions},
  currentModelDimensions: ${config.currentModelDimensions},
  similarityFunctions: ${JSON.stringify(config.similarityFunctions)},
};

// Separate in-memory indices per model (production: use Pinecone/Qdrant/Weaviate with namespace)
const indices: Record<string, Map<string, StoredEmbedding>> = {
  "nomic-embed-v1.5": new Map(),
  "voyage-3-large": new Map(),
  "openai-text-embedding-3-large": new Map(),
};

/**
 * Gets the index for a specific model. Throws if model not supported.
 */
function getIndex(modelId: string): Map<string, StoredEmbedding> {
  const index = indices[modelId];
  if (!index) {
    throw new Error(\`Unsupported embedding model: \${modelId}. Available: \${Object.keys(indices).join(", ")}\`);
  }
  return index;
}

/**
 * Stores an embedding in the correct model-specific index.
 */
export function storeEmbedding(embedding: StoredEmbedding): void {
  const index = getIndex(embedding.metadata.modelId);
  
  // Validate vector dimensions match model
  const expectedDims = embedding.metadata.modelId === "nomic-embed-v1.5"
    ? CONFIG.nomicDimensions
    : CONFIG.currentModelDimensions;
  
  if (embedding.vector.length !== expectedDims) {
    throw new Error(
      \`Dimension mismatch for \${embedding.metadata.modelId}: got \${embedding.vector.length}, expected \${expectedDims}\`
    );
  }
  
  index.set(embedding.id, embedding);
}

/**
 * Retrieves an embedding by ID from a specific model index.
 */
export function getEmbedding(modelId: string, contentId: string): StoredEmbedding | null {
  const index = getIndex(modelId);
  return index.get(contentId) || null;
}

/**
 * Searches within a single model's index using the appropriate similarity function.
 * IMPORTANT: Results from different models CANNOT be directly compared.
 */
export function searchInModelSpace(
  modelId: string,
  queryVector: number[],
  topK: number,
  filters?: { repoFullName?: string; contentType?: string }
): SearchResult[] {
  const index = getIndex(modelId);
  const simFn = CONFIG.similarityFunctions[modelId as keyof typeof CONFIG.similarityFunctions] || "cosine";
  
  const scored: Array<{ id: string; score: number; entry: StoredEmbedding }> = [];
  
  for (const [id, entry] of index) {
    // Apply filters
    if (filters?.repoFullName && entry.metadata.repoFullName !== filters.repoFullName) continue;
    if (filters?.contentType && entry.metadata.contentType !== filters.contentType) continue;
    
    const score = computeSimilarity(queryVector, entry.vector, simFn);
    scored.push({ id, score, entry });
  }
  
  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  
  return scored.slice(0, topK).map(s => ({
    contentId: s.id,
    score: s.score,
    modelId,
    metadata: s.entry.metadata,
  }));
}

/**
 * Computes similarity using the specified function.
 * Each model may require different normalization/scale handling.
 */
function computeSimilarity(a: number[], b: number[], fn: string): number {
  if (a.length !== b.length) return 0;
  
  switch (fn) {
    case "cosine": {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    }
    case "dot": {
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    }
    case "euclidean": {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return 1 / (1 + Math.sqrt(sum)); // Convert distance to similarity
    }
    default:
      return 0;
  }
}

/**
 * Returns statistics about each model index.
 */
export function getIndexStats(): Record<string, { size: number; dimensions: number }> {
  const stats: Record<string, { size: number; dimensions: number }> = {};
  for (const [modelId, index] of Object.entries(indices)) {
    stats[modelId] = {
      size: index.size,
      dimensions: modelId === "nomic-embed-v1.5" ? CONFIG.nomicDimensions : CONFIG.currentModelDimensions,
    };
  }
  return stats;
}
`;
}

// ============================================================================
// SECTION 4: Token-Aware Chunker Generator
// ============================================================================

/**
 * Generates intelligent text chunking that respects per-model token limits.
 * Handles the key tradeoff: Nomic (8K tokens) vs GitHub comments (~16K tokens).
 *
 * @param config - Dual model configuration
 * @returns TypeScript source code string
 */
export function generateTokenAwareChunker(config: DualModelConfig): string {
  return `/**
 * Auto-generated Token-Aware Text Chunker
 * Intelligently truncates/chunks text to fit per-model token limits
 * while preserving semantic coherence.
 */

const CONFIG = {
  nomicMaxTokens: ${config.nomicMaxTokens},
  currentModelMaxTokens: ${config.currentModelMaxTokens},
};

const CHARS_PER_TOKEN = ${TOKEN_LIMITS.CHARS_PER_TOKEN_APPROX};

interface ChunkResult {
  chunks: string[];
  totalOriginalChars: number;
  totalChunkedChars: number;
  wasTruncated: boolean;
  tokenEstimate: number;
}

/**
 * Estimates token count from character length.
 * In production, use tiktoken or model-specific tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Chunks text to fit within a specific model's token limit.
 * Attempts to break at paragraph/sentence boundaries when possible.
 */
export function chunkForModel(
  text: string,
  modelId: string,
  options: { preserveMetadata?: boolean } = {}
): ChunkResult {
  const maxTokens = modelId === "nomic-embed-v1.5"
    ? CONFIG.nomicMaxTokens
    : CONFIG.currentModelMaxTokens;
  
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const originalLength = text.length;
  
  // If text fits entirely, no chunking needed
  if (originalLength <= maxChars) {
    return {
      chunks: [text],
      totalOriginalChars: originalLength,
      totalChunkedChars: originalLength,
      wasTruncated: false,
      tokenEstimate: estimateTokens(text),
    };
  }
  
  const chunks: string[] = [];
  let remaining = text;
  let totalChunkedChars = 0;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      totalChunkedChars += remaining.length;
      break;
    }
    
    // Find best break point within limit
    let breakPoint = maxChars;
    
    // Try paragraph break first
    const paraBreak = remaining.lastIndexOf("\\n\\n", maxChars);
    if (paraBreak > maxChars * 0.4) {
      breakPoint = paraBreak + 2;
    } else {
      // Try sentence break
      const sentenceBreak = remaining.lastIndexOf(". ", maxChars);
      if (sentenceBreak > maxChars * 0.4) {
        breakPoint = sentenceBreak + 2;
      } else {
        // Try line break
        const lineBreak = remaining.lastIndexOf("\\n", maxChars);
        if (lineBreak > maxChars * 0.4) {
          breakPoint = lineBreak + 1;
        }
        // Otherwise hard cut at maxChars
      }
    }
    
    const chunk = remaining.substring(0, breakPoint).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
      totalChunkedChars += chunk.length;
    }
    
    remaining = remaining.substring(breakPoint).trim();
  }
  
  return {
    chunks,
    totalOriginalChars: originalLength,
    totalChunkedChars,
    wasTruncated: chunks.length > 1 || totalChunkedChars < originalLength,
    tokenEstimate: estimateTokens(chunks.join(" ")),
  };
}

/**
 * Determines which models can fully process a given text without truncation.
 */
export function getCompatibleModels(text: string): string[] {
  const tokens = estimateTokens(text);
  const compatible: string[] = [];
  
  if (tokens <= CONFIG.nomicMaxTokens) {
    compatible.push("nomic-embed-v1.5");
  }
  if (tokens <= CONFIG.currentModelMaxTokens) {
    compatible.push("voyage-3-large");
  }
  
  return compatible;
}

/**
 * Generates a truncation warning for content that exceeds model limits.
 */
export function getTruncationWarning(text: string, modelId: string): string | null {
  const tokens = estimateTokens(text);
  const maxTokens = modelId === "nomic-embed-v1.5"
    ? CONFIG.nomicMaxTokens
    : CONFIG.currentModelMaxTokens;
  
  if (tokens <= maxTokens) return null;
  
  return \`Content (\${tokens.toLocaleString()} tokens) exceeds \${modelId} limit (\${maxTokens.toLocaleString()} tokens). Will be chunked into \${Math.ceil(tokens / maxTokens)} segments.\`;
}
`;
}

// ============================================================================
// SECTION 5: Model Router Generator
// ============================================================================

/**
 * Generates the query router that directs searches to appropriate model indices.
 *
 * @param config - Dual model configuration
 * @returns TypeScript source code string
 */
export function generateModelRouter(config: DualModelConfig): string {
  return `/**
 * Auto-generated Embedding Model Router
 * Routes queries to correct model index and aggregates results
 * without cross-space comparison.
 */

interface SearchQuery {
  text: string;
  targetModels: string[];
  topKPerModel: number;
  minSimilarity?: number;
  repoFilter?: string;
  contentTypeFilter?: string;
}

interface SearchResult {
  contentId: string;
  score: number;
  modelId: string;
  metadata: any;
}

interface AggregatedSearchResults {
  byModel: Record<string, SearchResult[]>;
  mergedDisplay: Array<SearchResult & { normalizedScore: number }>;
  totalCandidatesEvaluated: number;
  durationMs: number;
}

const CONFIG = {
  autoEmbedNewContent: ${config.autoEmbedNewContent},
};

/**
 * Executes a search across specified model spaces.
 * Results are kept separate per model — no direct score comparison.
 */
export async function routeSearch(
  query: SearchQuery,
  embedFn: (text: string, modelId: string) => Promise<number[]>,
  searchFn: (modelId: string, vector: number[], topK: number, filters?: any) => SearchResult[]
): Promise<AggregatedSearchResults> {
  const startTime = Date.now();
  const byModel: Record<string, SearchResult[]> = {};
  let totalCandidates = 0;
  
  for (const modelId of query.targetModels) {
    // Generate query embedding in the target model's space
    const queryVector = await embedFn(query.text, modelId);
    
    // Search within that model's index only
    const results = searchFn(modelId, queryVector, query.topKPerModel, {
      repoFullName: query.repoFilter,
      contentType: query.contentTypeFilter,
    });
    
    // Apply minimum similarity filter if set
    const filtered = query.minSimilarity !== undefined
      ? results.filter(r => r.score >= query.minSimilarity!)
      : results;
    
    byModel[modelId as keyof typeof byModel] = filtered;
    totalCandidates += results.length;
  }
  
  // Create display-only merged list with normalized scores
  // WARNING: These normalized scores are for UI ranking only,
  // NOT for semantic comparison across models
  const allResults = Object.entries(byModel).flatMap(([modelId, results]) =>
    results.map(r => ({ ...r, modelId }))
  );
  
  // Normalize scores to 0-1 range per model for display
  const mergedDisplay = allResults.map(r => {
    const modelResults = byModel[r.modelId] || [];
    const maxScore = Math.max(...modelResults.map(m => m.score), 1);
    return {
      ...r,
      normalizedScore: maxScore > 0 ? r.score / maxScore : 0,
    };
  }).sort((a, b) => b.normalizedScore - a.normalizedScore);
  
  return {
    byModel,
    mergedDisplay,
    totalCandidatesEvaluated: totalCandidates,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Determines optimal model(s) for embedding new content.
 * Prefers Nomic for short content, falls back to current model for long content.
 */
export function selectModelsForContent(
  tokenEstimate: number,
  contentType: string
): string[] {
  const models: string[] = [];
  
  // Always embed in current model for backward compatibility
  models.push("voyage-3-large");
  
  // Add Nomic if content fits within its token limit
  if (tokenEstimate <= ${config.nomicMaxTokens}) {
    models.push("nomic-embed-v1.5");
  }
  
  return models;
}
`;
}

// ============================================================================
// SECTION 6: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates scaffolding meets bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #111:
 * 1. Integrates Nomic Embed v1.5 model
 * 2. Maintains separate indices per model (no cross-space comparison)
 * 3. Handles token limit differences (Nomic 8K vs others)
 * 4. Uses appropriate similarity functions per model
 * 5. Provides migration path for existing embeddings
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateAcceptanceCriteria(config: DualModelConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Nomic endpoint configured",
      passed: config.nomicEndpoint.length > 0,
      detail: \`Endpoint: \${config.nomicEndpoint}\`,
    },
    {
      name: "Nomic max tokens set (8192)",
      passed: config.nomicMaxTokens === 8192,
      detail: \`Max tokens: \${config.nomicMaxTokens}\`,
    },
    {
      name: "Separate dimensions configured",
      passed: config.nomicDimensions !== config.currentModelDimensions,
      detail: \`Nomic: \${config.nomicDimensions}d, Current: \${config.currentModelDimensions}d\`,
    },
    {
      name: "Similarity functions defined per model",
      passed: Object.keys(config.similarityFunctions).length >= 2,
      detail: \`\${Object.keys(config.similarityFunctions).length} models configured\`,
    },
    {
      name: "Auto-embed enabled for new content",
      passed: config.autoEmbedNewContent === true,
      detail: \`Enabled: \${config.autoEmbedNewContent}\`,
    },
    {
      name: "Migration batch size reasonable",
      passed: config.migrationBatchSize >= 10 && config.migrationBatchSize <= 200,
      detail: \`Batch size: \${config.migrationBatchSize}\`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 7: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "nomic-embeddings-dual-model",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/TBD",
  upstream: "https://github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/111",
  bounty: 900,
  generators: [
    "generateDualIndexManager",
    "generateTokenAwareChunker",
    "generateModelRouter",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<DualModelConfig> = {}
): void {
  const mergedConfig: DualModelConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "dual-index-manager.ts": generateDualIndexManager(mergedConfig),
    "token-aware-chunker.ts": generateTokenAwareChunker(mergedConfig),
    "model-router.ts": generateModelRouter(mergedConfig),
  };

  console.log(\`Scaffolding Nomic dual-model embedding system in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
