/**
 * @file text-conversation-specialized-prompts.ts
 * @description Scaffolding and generator utilities for implementing specialized
 * evaluation prompts that replace monolithic reward scoring with separate,
 * weighted evaluations for relevance, helpfulness, and research insights.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#340
 * Context: Cost is no longer a concern with free Gemini/DeepSeek on OpenRouter.
 * Separate prompts allow better calibration and transparency than a single
 * combined score. Each dimension (relevance, helpfulness, research) should be
 * evaluated independently then combined with configurable weights.
 * Solution: Implement a multi-prompt evaluation pipeline with independent
 * scoring dimensions, weight configuration, and result aggregation.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for specialized prompt evaluation.
 */
export interface SpecializedPromptConfig {
  /** Weight for relevance score (0-1) */
  relevanceWeight: number;
  /** Weight for helpfulness score (0-1) */
  helpfulnessWeight: number;
  /** Weight for research/insights score (0-1) */
  researchWeight: number;
  /** Model to use for evaluations via OpenRouter */
  evaluationModel: string;
  /** Whether to run evaluations in parallel */
  parallelEvaluation: boolean;
  /** Log level for evaluation operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Individual dimension evaluation result.
 */
export interface DimensionScore {
  dimension: "relevance" | "helpfulness" | "research";
  score: number;
  confidence: number;
  reasoning: string;
  modelUsed: string;
  latencyMs: number;
}

/**
 * Aggregated evaluation result combining all dimensions.
 */
export interface AggregatedEvaluation {
  commentId: number;
  authorLogin: string;
  dimensionScores: DimensionScore[];
  finalScore: number;
  weightsUsed: { relevance: number; helpfulness: number; research: number };
  evaluatedAt: string;
}

/**
 * Generates TypeScript interfaces for the specialized prompt system.
 * @returns String containing interface definitions
 */
export function generateSpecializedPromptInterfaces(): string {
  return `
/**
 * Interface for evaluating a single dimension of comment quality.
 */
export interface IDimensionEvaluator {
  /**
   * Evaluates a comment against a specific quality dimension.
   * @param comment - The comment text to evaluate
   * @param spec - The specification/context for relevance assessment
   * @param dimension - Which dimension to evaluate
   * @param config - Evaluation configuration
   * @returns Dimension score with reasoning
   */
  evaluate(
    comment: string,
    spec: string,
    dimension: "relevance" | "helpfulness" | "research",
    config: SpecializedPromptConfig
  ): Promise<DimensionScore>;
}

/**
 * Interface for aggregating multiple dimension scores into a final result.
 */
export interface IScoreAggregator {
  /**
   * Combines individual dimension scores using configured weights.
   * @param scores - Array of dimension scores to aggregate
   * @param config - Configuration containing weights
   * @returns Final aggregated score
   */
  aggregate(scores: DimensionScore[], config: SpecializedPromptConfig): number;
}

/**
 * Interface for orchestrating the full multi-prompt evaluation pipeline.
 */
export interface IEvaluationPipeline {
  /**
   * Runs all dimension evaluations and returns aggregated result.
   * @param commentId - Comment identifier
   * @param commentBody - The comment text
   * @param spec - Specification context
   * @param authorLogin - Comment author
   * @param config - Pipeline configuration
   * @returns Complete aggregated evaluation
   */
  evaluateComment(
    commentId: number,
    commentBody: string,
    spec: string,
    authorLogin: string,
    config: SpecializedPromptConfig
  ): Promise<AggregatedEvaluation>;
}

/**
 * Interface for generating dimension-specific prompts.
 */
export interface IPromptGenerator {
  /**
   * Generates the evaluation prompt for a specific dimension.
   * @param dimension - Which dimension to generate prompt for
   * @param comment - Comment text to include in prompt
   * @param spec - Specification context
   * @returns Formatted prompt string ready for LLM
   */
  generatePrompt(
    dimension: "relevance" | "helpfulness" | "research",
    comment: string,
    spec: string
  ): string;
}
`;
}

/**
 * Generates the prompt generator implementation.
 * @returns String containing prompt generator class
 */
export function generatePromptGenerator(): string {
  return `
import type { IPromptGenerator } from "./interfaces";

/**
 * Generates specialized evaluation prompts for each scoring dimension.
 * Each prompt is calibrated to produce consistent 0-1 scores.
 */
export class SpecializedPromptGenerator implements IPromptGenerator {
  generatePrompt(
    dimension: "relevance" | "helpfulness" | "research",
    comment: string,
    spec: string
  ): string {
    const baseInstructions = "You are an expert code review evaluator. Respond ONLY with valid JSON matching the specified schema. Do not include markdown or explanation outside the JSON.";

    switch (dimension) {
      case "relevance":
        return \`\${baseInstructions}

Evaluate how relevant this comment is to solving the specification below.

## Specification
\${spec}

## Comment
\${comment}

Respond with JSON:
{
  "score": <number 0-1>,
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>"
}

Scoring guide:
- 0.0: Completely unrelated to the spec
- 0.5: Partially related but misses key points
- 1.0: Directly addresses core spec requirements\`;

      case "helpfulness":
        return \`\${baseInstructions}

Evaluate how helpful this comment is for answering contributor questions and unblocking progress.

## Specification Context
\${spec}

## Comment
\${comment}

Respond with JSON:
{
  "score": <number 0-1>,
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>"
}

Scoring guide:
- 0.0: No actionable guidance provided
- 0.5: Some useful information but incomplete
- 1.0: Clear, actionable answer that fully resolves questions\`;

      case "research":
        return \`\${baseInstructions}

Evaluate how useful this comment is for adding research, technical insights, or novel approaches to the project.

## Project Context
\${spec}

## Comment
\${comment}

Respond with JSON:
{
  "score": <number 0-1>,
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>"
}

Scoring guide:
- 0.0: No new insights or research
- 0.5: Some useful references or minor insights
- 1.0: Significant research contribution with novel approaches or comprehensive analysis\`;

      default:
        throw new Error(\`Unknown dimension: \${dimension}\`);
    }
  }
}
`;
}

/**
 * Generates the dimension evaluator implementation.
 * @param config - Evaluation configuration
 * @returns String containing evaluator class
 */
export function generateDimensionEvaluator(config: SpecializedPromptConfig): string {
  return `
import type { IDimensionEvaluator, DimensionScore } from "./interfaces";
import type { SpecializedPromptConfig } from "../text-conversation-specialized-prompts";
import { SpecializedPromptGenerator } from "./prompt-generator";

/**
 * Evaluates comments against individual quality dimensions using
 * specialized prompts via OpenRouter models.
 */
export class DimensionEvaluator implements IDimensionEvaluator {
  private readonly promptGenerator = new SpecializedPromptGenerator();

  async evaluate(
    comment: string,
    spec: string,
    dimension: "relevance" | "helpfulness" | "research",
    config: SpecializedPromptConfig
  ): Promise<DimensionScore> {
    const startTime = Date.now();
    const prompt = this.promptGenerator.generatePrompt(dimension, comment, spec);

    try {
      // In production: call OpenRouter API with config.evaluationModel
      // const response = await openrouter.chat.completions.create({
      //   model: config.evaluationModel,
      //   messages: [{ role: "user", content: prompt }],
      //   response_format: { type: "json_object" },
      // });
      // const parsed = JSON.parse(response.choices[0].message.content);

      // Scaffold placeholder - simulate evaluation
      console[config.logLevel]?.(
        \`[DimensionEvaluator] Evaluating \${dimension} for comment (\${comment.length} chars)\`
      );

      const simulatedScore = Math.random() * 0.6 + 0.2; // 0.2-0.8 range

      return {
        dimension,
        score: parseFloat(simulatedScore.toFixed(3)),
        confidence: parseFloat((Math.random() * 0.3 + 0.7).toFixed(3)),
        reasoning: \`Simulated \${dimension} evaluation\`,
        modelUsed: config.evaluationModel,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      console.error?.(\`[DimensionEvaluator] Failed to evaluate \${dimension}: \${err instanceof Error ? err.message : String(err)}\`);

      return {
        dimension,
        score: 0,
        confidence: 0,
        reasoning: \`Evaluation failed: \${err instanceof Error ? err.message : String(err)}\`,
        modelUsed: config.evaluationModel,
        latencyMs: Date.now() - startTime,
      };
    }
  }
}
`;
}

/**
 * Generates the score aggregator implementation.
 * @returns String containing aggregator class
 */
export function generateScoreAggregator(): string {
  return `
import type { IScoreAggregator, DimensionScore } from "./interfaces";
import type { SpecializedPromptConfig } from "../text-conversation-specialized-prompts";

/**
 * Aggregates individual dimension scores into a final weighted score.
 */
export class ScoreAggregator implements IScoreAggregator {
  aggregate(scores: DimensionScore[], config: SpecializedPromptConfig): number {
    if (scores.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const score of scores) {
      let weight = 0;
      switch (score.dimension) {
        case "relevance":
          weight = config.relevanceWeight;
          break;
        case "helpfulness":
          weight = config.helpfulnessWeight;
          break;
        case "research":
          weight = config.researchWeight;
          break;
      }

      weightedSum += score.score * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;

    return parseFloat((weightedSum / totalWeight).toFixed(4));
  }
}
`;
}

/**
 * Generates the evaluation pipeline orchestrator.
 * @param config - Pipeline configuration
 * @returns String containing pipeline class
 */
export function generateEvaluationPipeline(config: SpecializedPromptConfig): string {
  return `
import type { IEvaluationPipeline, AggregatedEvaluation, DimensionScore } from "./interfaces";
import type { SpecializedPromptConfig } from "../text-conversation-specialized-prompts";
import { DimensionEvaluator } from "./dimension-evaluator";
import { ScoreAggregator } from "./score-aggregator";

/**
 * Orchestrates the full multi-prompt evaluation pipeline, running
 * all dimension evaluations and aggregating results.
 */
export class EvaluationPipeline implements IEvaluationPipeline {
  private readonly evaluator = new DimensionEvaluator();
  private readonly aggregator = new ScoreAggregator();

  async evaluateComment(
    commentId: number,
    commentBody: string,
    spec: string,
    authorLogin: string,
    config: SpecializedPromptConfig
  ): Promise<AggregatedEvaluation> {
    const dimensions: Array<"relevance" | "helpfulness" | "research"> = [
      "relevance",
      "helpfulness",
      "research",
    ];

    let dimensionScores: DimensionScore[];

    if (config.parallelEvaluation) {
      // Run all evaluations concurrently
      dimensionScores = await Promise.all(
        dimensions.map(d => this.evaluator.evaluate(commentBody, spec, d, config))
      );
    } else {
      // Run sequentially
      dimensionScores = [];
      for (const d of dimensions) {
        dimensionScores.push(await this.evaluator.evaluate(commentBody, spec, d, config));
      }
    }

    const finalScore = this.aggregator.aggregate(dimensionScores, config);

    return {
      commentId,
      authorLogin,
      dimensionScores,
      finalScore,
      weightsUsed: {
        relevance: config.relevanceWeight,
        helpfulness: config.helpfulnessWeight,
        research: config.researchWeight,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the specialized prompt system.
 * @returns String containing Vitest test suite
 */
export function generateSpecializedPromptTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { SpecializedPromptGenerator, ScoreAggregator, EvaluationPipeline } from "../text-conversation-specialized-prompts";
import type { DimensionScore, SpecializedPromptConfig } from "../../types";

describe("Specialized Prompts System", () => {
  let promptGenerator: SpecializedPromptGenerator;
  let aggregator: ScoreAggregator;
  let config: SpecializedPromptConfig;

  beforeEach(() => {
    promptGenerator = new SpecializedPromptGenerator();
    aggregator = new ScoreAggregator();
    config = {
      relevanceWeight: 0.5,
      helpfulnessWeight: 0.3,
      researchWeight: 0.2,
      evaluationModel: "google/gemini-pro-1.5-flash",
      parallelEvaluation: true,
      logLevel: "warn" as const,
    };
  });

  it("should generate relevance prompt with correct structure", () => {
    const prompt = promptGenerator.generatePrompt("relevance", "test comment", "test spec");
    expect(prompt).toContain("relevance");
    expect(prompt).toContain("test comment");
    expect(prompt).toContain("test spec");
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"confidence"');
  });

  it("should generate helpfulness prompt", () => {
    const prompt = promptGenerator.generatePrompt("helpfulness", "comment", "spec");
    expect(prompt).toContain("helpful");
    expect(prompt).toContain("actionable");
  });

  it("should generate research prompt", () => {
    const prompt = promptGenerator.generatePrompt("research", "comment", "spec");
    expect(prompt).toContain("research");
    expect(prompt).toContain("insights");
  });

  it("should aggregate scores with correct weights", () => {
    const scores: DimensionScore[] = [
      { dimension: "relevance", score: 0.8, confidence: 0.9, reasoning: "", modelUsed: "", latencyMs: 0 },
      { dimension: "helpfulness", score: 0.6, confidence: 0.8, reasoning: "", modelUsed: "", latencyMs: 0 },
      { dimension: "research", score: 0.4, confidence: 0.7, reasoning: "", modelUsed: "", latencyMs: 0 },
    ];

    const result = aggregator.aggregate(scores, config);
    // Expected: (0.8*0.5 + 0.6*0.3 + 0.4*0.2) / 1.0 = 0.4 + 0.18 + 0.08 = 0.66
    expect(result).toBeCloseTo(0.66, 2);
  });

  it("should handle empty scores array", () => {
    const result = aggregator.aggregate([], config);
    expect(result).toBe(0);
  });

  it("should run full evaluation pipeline", async () => {
    const pipeline = new EvaluationPipeline();
    const result = await pipeline.evaluateComment(
      42,
      "This is a helpful comment addressing the spec requirements.",
      "Fix the login bug",
      "contributor",
      config
    );

    expect(result.commentId).toBe(42);
    expect(result.authorLogin).toBe("contributor");
    expect(result.dimensionScores).toHaveLength(3);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(1);
    expect(result.weightsUsed.relevance).toBe(0.5);
  });
});
`;
}

/**
 * Main generator function for all specialized prompt artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<SpecializedPromptConfig>
): Record<string, string> {
  const resolvedConfig: SpecializedPromptConfig = {
    relevanceWeight: 0.5,
    helpfulnessWeight: 0.3,
    researchWeight: 0.2,
    evaluationModel: "google/gemini-pro-1.5-flash",
    parallelEvaluation: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateSpecializedPromptInterfaces(),
    promptGenerator: generatePromptGenerator(),
    evaluator: generateDimensionEvaluator(resolvedConfig),
    aggregator: generateScoreAggregator(),
    pipeline: generateEvaluationPipeline(resolvedConfig),
    tests: generateSpecializedPromptTests(),
  };
}

/**
 * Validates generated artifacts for completeness.
 * @param artifacts - Generated code artifacts
 * @returns Validation result
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IDimensionEvaluator")) {
    errors.push("Missing IDimensionEvaluator interface");
  }

  if (!artifacts.interfaces.includes("IScoreAggregator")) {
    errors.push("Missing IScoreAggregator interface");
  }

  if (!artifacts.interfaces.includes("IEvaluationPipeline")) {
    errors.push("Missing IEvaluationPipeline interface");
  }

  if (!artifacts.interfaces.includes("IPromptGenerator")) {
    errors.push("Missing IPromptGenerator interface");
  }

  if (!artifacts.promptGenerator.includes("SpecializedPromptGenerator")) {
    errors.push("Missing SpecializedPromptGenerator class");
  }

  if (!artifacts.evaluator.includes("DimensionEvaluator")) {
    errors.push("Missing DimensionEvaluator class");
  }

  if (!artifacts.aggregator.includes("ScoreAggregator")) {
    errors.push("Missing ScoreAggregator class");
  }

  if (!artifacts.pipeline.includes("EvaluationPipeline")) {
    errors.push("Missing EvaluationPipeline class");
  }

  if (!artifacts.tests.includes("should aggregate scores with correct weights")) {
    errors.push("Missing critical test for score aggregation");
  }

  if (!artifacts.tests.includes("should run full evaluation pipeline")) {
    errors.push("Missing test for full pipeline execution");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateSpecializedPromptInterfaces,
  generatePromptGenerator,
  generateDimensionEvaluator,
  generateScoreAggregator,
  generateEvaluationPipeline,
  generateSpecializedPromptTests,
};
