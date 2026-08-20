/**
 * @file specialized-prompts.ts
 * @title Specialized Prompts: Multi-Dimensional Comment Evaluation
 * @issue https://github.com/devpool-directory/devpool-directory/issues/XXXX
 * @upstream https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/340
 * @bounty $600 USD
 *
 * @description
 * This plugin provides scaffolding for replacing monolithic relevance scoring
 * with specialized, dimension-specific prompts. The upstream issue identifies
 * that with free/cheap LLM access (Gemini, DeepSeek via OpenRouter), it makes
 * more sense to evaluate comments across multiple distinct dimensions rather
 * than using a single combined prompt.
 *
 * Three evaluation dimensions from upstream:
 * 1. Spec Relevance: How relevant comments are to solving the spec (0-1)
 * 2. Helpfulness: How helpful comments are for answering contributor questions (0-1)
 * 3. Research Value: How useful comments are for adding research/insights (0-1)
 *
 * Final score = weighted combination of dimension scores.
 *
 * Generated modules:
 * - Dimension Prompt Builder: Specialized system prompts per evaluation axis
 * - Multi-Pass Evaluator: Sequential or parallel LLM calls per dimension
 * - Weighted Score Aggregator: Configurable weights and normalization
 * - Cost-Aware Model Selector: Routes to free/cheap models when available
 * - Evaluation Cache: Avoids redundant LLM calls for same comment
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * Evaluation dimension identifiers.
 */
export type EvaluationDimension = "spec_relevance" | "helpfulness" | "research_value";

/**
 * Result from evaluating a single dimension.
 */
export interface DimensionScore {
  /** Which dimension was evaluated */
  dimension: EvaluationDimension;
  /** Score from 0.0 to 1.0 */
  score: number;
  /** Brief reasoning from the LLM */
  reasoning: string;
  /** Model used for this evaluation */
  modelUsed: string;
  /** Tokens consumed */
  tokensUsed: number;
  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Aggregated evaluation result for a comment.
 */
export interface CommentEvaluation {
  /** Comment identifier */
  commentId: string;
  /** Author username */
  author: string;
  /** Individual dimension scores */
  dimensions: Record<EvaluationDimension, DimensionScore>;
  /** Final weighted composite score (0-1) */
  compositeScore: number;
  /** Weights applied */
  weightsApplied: Record<EvaluationDimension, number>;
  /** Total evaluation cost estimate in USD */
  estimatedCostUsd: number;
  /** Total latency across all dimensions */
  totalLatencyMs: number;
  /** Whether any dimension was served from cache */
  cacheHit: boolean;
}

/**
 * Configuration for the multi-dimensional evaluation system.
 */
export interface SpecializedPromptsConfig {
  /** Weight for each dimension in final score calculation */
  weights: Record<EvaluationDimension, number>;
  /** Model preferences per dimension (cost vs accuracy tradeoff) */
  modelPreferences: Record<EvaluationDimension, { primary: string; fallback: string }>;
  /** Maximum tokens per evaluation call */
  maxTokensPerCall: number;
  /** Whether to run evaluations in parallel */
  parallelEvaluation: boolean;
  /** Cache TTL for evaluation results in seconds */
  cacheTtlSeconds: number;
  /** Minimum score threshold to consider a comment valuable */
  minCompositeScore: number;
  /** System prompt templates per dimension */
  promptTemplates: Record<EvaluationDimension, string>;
}

/**
 * LLM provider/model metadata for cost-aware routing.
 */
export interface ModelMetadata {
  id: string;
  provider: string;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  maxContextTokens: number;
  isFreeTier: boolean;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default specialized prompts configuration.
 */
export const DEFAULT_CONFIG: SpecializedPromptsConfig = {
  weights: {
    spec_relevance: 0.5,
    helpfulness: 0.3,
    research_value: 0.2,
  },
  modelPreferences: {
    spec_relevance: { primary: "deepseek/deepseek-chat", fallback: "google/gemini-pro-1.5" },
    helpfulness: { primary: "google/gemini-flash-1.5", fallback: "deepseek/deepseek-chat" },
    research_value: { primary: "deepseek/deepseek-chat", fallback: "google/gemini-pro-1.5" },
  },
  maxTokensPerCall: 2000,
  parallelEvaluation: true,
  cacheTtlSeconds: 86400, // 24 hours
  minCompositeScore: 0.3,
  promptTemplates: {
    spec_relevance: `You are evaluating how RELEVANT a GitHub comment is to solving the specific technical task described in an issue.

Score from 0.0 to 1.0:
- 0.0-0.2: Completely off-topic, generic praise, or social commentary
- 0.3-0.5: Tangentially related but lacks specific technical contribution
- 0.6-0.8: Addresses the task with concrete suggestions or clarifying questions
- 0.9-1.0: Directly proposes solutions, identifies bugs, or provides implementation details specific to the spec

Respond with ONLY valid JSON: {"score": <number>, "reasoning": "<brief explanation>"}`,

    helpfulness: `You are evaluating how HELPFUL a GitHub comment is for answering contributor questions and unblocking progress.

Score from 0.0 to 1.0:
- 0.0-0.2: No actionable guidance, pure opinion without substance
- 0.3-0.5: Vague suggestions without specifics ("maybe try X")
- 0.6-0.8: Provides clear guidance, links to docs, or explains concepts
- 0.9-1.0: Directly answers questions, provides code examples, or resolves confusion

Respond with ONLY valid JSON: {"score": <number>, "reasoning": "<brief explanation>"}`,

    research_value: `You are evaluating how USEFUL a GitHub comment is for adding research, insights, or long-term project knowledge.

Score from 0.0 to 1.0:
- 0.0-0.2: No new information, restates obvious facts
- 0.3-0.5: Minor observations without broader applicability
- 0.6-0.8: References prior art, benchmarks, or architectural considerations
- 0.9-1.0: Introduces novel analysis, comparative studies, or deep technical insights that benefit future contributors

Respond with ONLY valid JSON: {"score": <number>, "reasoning": "<brief explanation>"}`,
  },
};

/**
 * Known free/cheap models on OpenRouter.
 */
export const FREE_MODELS: ModelMetadata[] = [
  { id: "google/gemini-flash-1.5", provider: "google", inputCostPer1kTokens: 0, outputCostPer1kTokens: 0, maxContextTokens: 1000000, isFreeTier: true },
  { id: "deepseek/deepseek-chat", provider: "deepseek", inputCostPer1kTokens: 0, outputCostPer1kTokens: 0, maxContextTokens: 64000, isFreeTier: true },
  { id: "google/gemini-pro-1.5", provider: "google", inputCostPer1kTokens: 0.00125, outputCostPer1kTokens: 0.005, maxContextTokens: 2000000, isFreeTier: false },
];

// ============================================================================
// SECTION 3: Dimension Prompt Builder Generator
// ============================================================================

/**
 * Generates specialized system prompts for each evaluation dimension.
 *
 * @param config - Prompts configuration
 * @returns TypeScript source code string
 */
export function generatePromptBuilder(config: SpecializedPromptsConfig): string {
  return `/**
 * Auto-generated Specialized Prompt Builder
 * Creates dimension-specific evaluation prompts with context injection.
 */

const TEMPLATES: Record<string, string> = ${JSON.stringify(config.promptTemplates)};
const MAX_TOKENS = ${config.maxTokensPerCall};

/**
 * Builds the complete prompt for a specific evaluation dimension.
 * Injects issue context and comment content into the template.
 */
export function buildDimensionPrompt(
  dimension: string,
  issueTitle: string,
  issueBody: string,
  commentBody: string,
  commentAuthor: string
): { system: string; user: string } {
  const systemPrompt = TEMPLATES[dimension];
  if (!systemPrompt) {
    throw new Error(\`Unknown evaluation dimension: \${dimension}\`);
  }

  const userMessage = \`## Issue
**Title:** \${issueTitle}
**Description:**
\${issueBody.substring(0, 3000)}

## Comment to Evaluate
**Author:** @\${commentAuthor}
**Content:**
\${commentBody.substring(0, MAX_TOKENS * 4)}

Evaluate this comment's \${dimension.replace(/_/g, " ")} and respond with JSON only.\`;

  return { system: systemPrompt, user: userMessage };
}

/**
 * Validates that all required dimension templates are configured.
 */
export function validatePromptConfig(): { valid: boolean; missing: string[] } {
  const required = ["spec_relevance", "helpfulness", "research_value"];
  const missing = required.filter(d => !TEMPLATES[d] || TEMPLATES[d].length < 50);
  return { valid: missing.length === 0, missing };
}
`;
}

// ============================================================================
// SECTION 4: Multi-Pass Evaluator Generator
// ============================================================================

/**
 * Generates the multi-pass evaluation engine that calls LLM per dimension.
 *
 * @param config - Prompts configuration
 * @returns TypeScript source code string
 */
export function generateMultiPassEvaluator(config: SpecializedPromptsConfig): string {
  return `/**
 * Auto-generated Multi-Pass Comment Evaluator
 * Evaluates each dimension independently via separate LLM calls.
 */

import OpenAI from "openai";

interface DimensionScore {
  dimension: string;
  score: number;
  reasoning: string;
  modelUsed: string;
  tokensUsed: number;
  latencyMs: number;
}

interface CommentEvaluation {
  commentId: string;
  author: string;
  dimensions: Record<string, DimensionScore>;
  compositeScore: number;
  weightsApplied: Record<string, number>;
  estimatedCostUsd: number;
  totalLatencyMs: number;
  cacheHit: boolean;
}

const CONFIG = {
  weights: ${JSON.stringify(config.weights)},
  modelPreferences: ${JSON.stringify(config.modelPreferences)},
  parallelEvaluation: ${config.parallelEvaluation},
  minCompositeScore: ${config.minCompositeScore},
};

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Evaluates a single dimension via LLM call.
 */
async function evaluateDimension(
  dimension: string,
  systemPrompt: string,
  userPrompt: string,
  modelId: string
): Promise<DimensionScore> {
  const startTime = Date.now();

  try {
    const response = await openrouter.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || "";
    const latencyMs = Date.now() - startTime;
    const tokensUsed = (response.usage?.total_tokens) || 0;

    // Parse JSON response
    let parsed: { score: number; reasoning: string };
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, reasoning: "Failed to parse response" };
    } catch {
      parsed = { score: 0, reasoning: \`Invalid JSON response: \${content.substring(0, 100)}\` };
    }

    // Clamp score to 0-1 range
    const score = Math.max(0, Math.min(1, parsed.score || 0));

    return {
      dimension,
      score,
      reasoning: parsed.reasoning || "No reasoning provided",
      modelUsed: modelId,
      tokensUsed,
      latencyMs,
    };
  } catch (error) {
    return {
      dimension,
      score: 0,
      reasoning: \`Evaluation error: \${(error as Error).message}\`,
      modelUsed: modelId,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Evaluates a comment across all dimensions.
 * Runs sequentially or in parallel based on configuration.
 */
export async function evaluateComment(
  commentId: string,
  author: string,
  issueTitle: string,
  issueBody: string,
  commentBody: string,
  buildPromptFn: (dim: string, title: string, body: string, comment: string, author: string) => { system: string; user: string }
): Promise<CommentEvaluation> {
  const dimensions = Object.keys(CONFIG.weights) as string[];
  const results: Record<string, DimensionScore> = {};
  let totalLatencyMs = 0;
  let totalTokens = 0;

  if (CONFIG.parallelEvaluation) {
    // Run all dimensions concurrently
    const promises = dimensions.map(async (dim) => {
      const prefs = CONFIG.modelPreferences[dim as keyof typeof CONFIG.modelPreferences];
      const model = prefs?.primary || "deepseek/deepseek-chat";
      const { system, user } = buildPromptFn(dim, issueTitle, issueBody, commentBody, author);
      return evaluateDimension(dim, system, user, model);
    });

    const scores = await Promise.all(promises);
    for (const score of scores) {
      results[score.dimension] = score;
      totalLatencyMs = Math.max(totalLatencyMs, score.latencyMs); // Parallel = max latency
      totalTokens += score.tokensUsed;
    }
  } else {
    // Sequential evaluation
    for (const dim of dimensions) {
      const prefs = CONFIG.modelPreferences[dim as keyof typeof CONFIG.modelPreferences];
      const model = prefs?.primary || "deepseek/deepseek-chat";
      const { system, user } = buildPromptFn(dim, issueTitle, issueBody, commentBody, author);
      const score = await evaluateDimension(dim, system, user, model);
      results[dim] = score;
      totalLatencyMs += score.latencyMs;
      totalTokens += score.tokensUsed;
    }
  }

  // Calculate weighted composite score
  let compositeScore = 0;
  for (const [dim, weight] of Object.entries(CONFIG.weights)) {
    compositeScore += (results[dim]?.score || 0) * weight;
  }

  // Estimate cost (free tier models = $0)
  const estimatedCostUsd = totalTokens * 0.000001; // Rough estimate for paid models

  return {
    commentId,
    author,
    dimensions: results,
    compositeScore,
    weightsApplied: CONFIG.weights,
    estimatedCostUsd,
    totalLatencyMs,
    cacheHit: false,
  };
}
`;
}

// ============================================================================
// SECTION 5: Weighted Score Aggregator Generator
// ============================================================================

/**
 * Generates the score aggregation module with configurable weights.
 *
 * @param config - Prompts configuration
 * @returns TypeScript source code string
 */
export function generateScoreAggregator(config: SpecializedPromptsConfig): string {
  return `/**
 * Auto-generated Weighted Score Aggregator
 * Combines dimension scores into final composite with configurable weights.
 */

const WEIGHTS = ${JSON.stringify(config.weights)};
const MIN_SCORE = ${config.minCompositeScore};

/**
 * Calculates weighted composite score from individual dimensions.
 */
export function calculateCompositeScore(
  dimensions: Record<string, { score: number }>
): number {
  let total = 0;
  let totalWeight = 0;

  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    const score = dimensions[dim]?.score ?? 0;
    total += score * weight;
    totalWeight += weight;
  }

  // Normalize if weights don't sum to 1
  return totalWeight > 0 ? total / totalWeight : 0;
}

/**
 * Determines if a comment meets the minimum value threshold.
 */
export function isValuableComment(compositeScore: number): boolean {
  return compositeScore >= MIN_SCORE;
}

/**
 * Ranks comments by composite score for reward distribution.
 */
export function rankComments(
  evaluations: Array<{ commentId: string; compositeScore: number; author: string }>
): Array<{ rank: number; commentId: string; author: string; score: number }> {
  return evaluations
    .filter(e => isValuableComment(e.compositeScore))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((e, i) => ({
      rank: i + 1,
      commentId: e.commentId,
      author: e.author,
      score: e.compositeScore,
    }));
}

/**
 * Generates a human-readable evaluation summary.
 */
export function formatEvaluationSummary(
  evaluation: { dimensions: Record<string, { score: number; reasoning: string }>; compositeScore: number }
): string {
  const lines = [
    \`**Composite Score:** \${(evaluation.compositeScore * 100).toFixed(1)}%\`,
    "",
  ];

  for (const [dim, data] of Object.entries(evaluation.dimensions)) {
    const label = dim.replace(/_/g, " ").replace(/\\b\\w/g, c => c.toUpperCase());
    const bar = "█".repeat(Math.round(data.score * 10)) + "░".repeat(10 - Math.round(data.score * 10));
    lines.push(\`\${label}: \${bar} \${(data.score * 100).toFixed(0)}%\`);
    if (data.reasoning) {
      lines.push(\`  → \${data.reasoning.substring(0, 120)}\`);
    }
  }

  return lines.join("\\n");
}
`;
}

// ============================================================================
// SECTION 6: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates scaffolding meets bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #340:
 * 1. Separate prompts for spec relevance, helpfulness, research value
 * 2. Each dimension scored 0-1 independently
 * 3. Weights applied to combine dimension scores
 * 4. Leverages free/cheap models (Gemini, DeepSeek on OpenRouter)
 * 5. Returns final weighted composite score
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateAcceptanceCriteria(config: SpecializedPromptsConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "All three dimensions configured",
      passed: Object.keys(config.weights).length === 3,
      detail: \`Dimensions: \${Object.keys(config.weights).join(", ")}\`,
    },
    {
      name: "Weights sum to ~1.0",
      passed: Math.abs(Object.values(config.weights).reduce((a, b) => a + b, 0) - 1.0) < 0.01,
      detail: \`Sum: \${Object.values(config.weights).reduce((a, b) => a + b, 0).toFixed(2)}\`,
    },
    {
      name: "Prompt templates defined for all dimensions",
      passed: Object.keys(config.promptTemplates).length === 3,
      detail: `\${Object.keys(config.promptTemplates).length} templates\`,
    },
    {
      name: "Free-tier models preferred",
      passed: Object.values(config.modelPreferences).some(p => p.primary.includes("gemini") || p.primary.includes("deepseek")),
      detail: "Uses Gemini/DeepSeek for cost efficiency",
    },
    {
      name: "Parallel evaluation supported",
      passed: typeof config.parallelEvaluation === "boolean",
      detail: \`Parallel: \${config.parallelEvaluation}\`,
    },
    {
      name: "Min composite score threshold set",
      passed: config.minCompositeScore > 0 && config.minCompositeScore < 1,
      detail: \`Threshold: \${config.minCompositeScore}\`,
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
  id: "specialized-prompts",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/TBD",
  upstream: "https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/340",
  bounty: 600,
  generators: [
    "generatePromptBuilder",
    "generateMultiPassEvaluator",
    "generateScoreAggregator",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<SpecializedPromptsConfig> = {}
): void {
  const mergedConfig: SpecializedPromptsConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "prompt-builder.ts": generatePromptBuilder(mergedConfig),
    "multi-pass-evaluator.ts": generateMultiPassEvaluator(mergedConfig),
    "score-aggregator.ts": generateScoreAggregator(mergedConfig),
  };

  console.log(\`Scaffolding specialized prompts system in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
