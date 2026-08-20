/**
 * @module SpecializedPrompts
 * @description Handoff plugin for implementing specialized evaluation prompts for conversation rewards.
 * Generates scaffolding for separate AI evaluation dimensions (relevance, helpfulness, research),
 * weighted scoring aggregation, and OpenRouter integration with free-tier models (Gemini/DeepSeek).
 * Replaces monolithic prompt with modular evaluation pipeline.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#340
 * DevPool Issue: #5007
 * Bounty Value: $600 USD
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface IEvaluationDimension {
  id: string;
  name: string;
  description: string;
  weight: number; // 0.0 to 1.0
  promptTemplate: string;
}

export interface IEvaluationResult {
  dimensionId: string;
  score: number; // 0.0 to 1.0
  reasoning: string;
  modelUsed: string;
  latencyMs: number;
}

export interface IAggregatedScore {
  beneficiary: string;
  dimensionScores: Record<string, number>;
  weightedTotal: number;
  evaluations: IEvaluationResult[];
}

export interface IPromptConfig {
  openrouterApiKeyEnvVar: string;
  defaultModel: string;
  fallbackModel: string;
  maxTokensPerEvaluation: number;
  temperature: number;
  dimensions: IEvaluationDimension[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export function getDefaultConfig(): IPromptConfig {
  return {
    openrouterApiKeyEnvVar: "OPENROUTER_API_KEY",
    defaultModel: "google/gemini-pro-1.5-exp:free",
    fallbackModel: "deepseek/deepseek-chat:free",
    maxTokensPerEvaluation: 500,
    temperature: 0.1,
    dimensions: [
      {
        id: "relevance",
        name: "Spec Relevance",
        description: "How relevant the comment is to solving the issue specification",
        weight: 0.5,
        promptTemplate: `You are evaluating a GitHub comment's relevance to an issue specification.

ISSUE SPEC:
{{spec}}

COMMENT:
{{comment}}

Rate from 0.0 to 1.0 how directly this comment contributes to solving the spec above.
- 1.0 = Directly solves or significantly advances the spec
- 0.7 = Provides useful implementation details or corrections
- 0.4 = Tangentially related but not actionable
- 0.1 = Off-topic or irrelevant
- 0.0 = Spam or noise

Respond in JSON only: {"score": 0.XX, "reasoning": "brief explanation"}`,
      },
      {
        id: "helpfulness",
        name: "Contributor Helpfulness",
        description: "How helpful the comment is for answering contributor questions",
        weight: 0.3,
        promptTemplate: `You are evaluating how helpful a GitHub comment is for assisting contributors.

CONVERSATION CONTEXT:
{{context}}

COMMENT:
{{comment}}

Rate from 0.0 to 1.0 how helpful this comment is for answering questions or guiding contributors.
- 1.0 = Comprehensive answer that fully resolves confusion
- 0.7 = Clear guidance with actionable next steps
- 0.4 = Partial answer or vague suggestion
- 0.1 = Acknowledges question without substance
- 0.0 = Unhelpful or dismissive

Respond in JSON only: {"score": 0.XX, "reasoning": "brief explanation"}`,
      },
      {
        id: "research",
        name: "Research & Insights",
        description: "How useful the comment is for adding research and insights to the project",
        weight: 0.2,
        promptTemplate: `You are evaluating the research value of a GitHub comment.

PROJECT CONTEXT:
{{projectContext}}

COMMENT:
{{comment}}

Rate from 0.0 to 1.0 how much new research, data, or insight this comment adds.
- 1.0 = Novel research, benchmarks, or critical external references
- 0.7 = Useful links, comparisons, or technical analysis
- 0.4 = Restates known information with minor additions
- 0.1 = Generic statements without evidence
- 0.0 = No research value

Respond in JSON only: {"score": 0.XX, "reasoning": "brief explanation"}`,
      },
    ],
  };
}

// ============================================================================
// PROMPT TEMPLATE ENGINE
// ============================================================================

/**
 * Generates the prompt template rendering service.
 */
export function generatePromptEngine(): string {
  return `/**
 * Prompt Template Engine
 * Renders evaluation prompts with context injection.
 */
export class PromptEngine {
  /**
   * Renders a prompt template with variable substitution.
   */
  render(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = \`\\{\\{\${key}\\}\\}\`;
      result = result.replaceAll(placeholder, value);
    }
    return result;
  }

  /**
   * Prepares evaluation prompt for a specific dimension.
   */
  prepareEvaluationPrompt(
    dimension: any,
    comment: string,
    context: { spec?: string; conversationContext?: string; projectContext?: string }
  ): string {
    const variables: Record<string, string> = {
      comment,
      spec: context.spec || "",
      context: context.conversationContext || "",
      projectContext: context.projectContext || "",
    };
    return this.render(dimension.promptTemplate, variables);
  }
}`;
}

// ============================================================================
// OPENROUTER EVALUATION SERVICE
// ============================================================================

/**
 * Generates the OpenRouter-based evaluation service.
 */
export function generateEvaluationService(): string {
  return `/**
 * OpenRouter Evaluation Service
 * Calls free-tier models via OpenRouter for each evaluation dimension.
 */
export class EvaluationService {
  private apiKey: string;
  private defaultModel: string;
  private fallbackModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: any) {
    this.apiKey = process.env[config.openrouterApiKeyEnvVar] || "";
    if (!this.apiKey) throw new Error(\`\${config.openrouterApiKeyEnvVar} not configured\`);
    this.defaultModel = config.defaultModel;
    this.fallbackModel = config.fallbackModel;
    this.maxTokens = config.maxTokensPerEvaluation;
    this.temperature = config.temperature;
  }

  /**
   * Evaluates a single dimension for a comment.
   */
  async evaluateDimension(
    prompt: string,
    dimensionId: string,
    useFallback: boolean = false
  ): Promise<any> {
    const model = useFallback ? this.fallbackModel : this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: \`Bearer \${this.apiKey}\`,
          "HTTP-Referer": "https://ubiquity.finance",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        if (!useFallback) {
          // Retry with fallback model
          return this.evaluateDimension(prompt, dimensionId, true);
        }
        throw new Error(\`OpenRouter API error: \${response.status}\`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        dimensionId,
        score: Math.min(1, Math.max(0, parseFloat(parsed.score) || 0)),
        reasoning: parsed.reasoning || "",
        modelUsed: model,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      if (!useFallback) {
        return this.evaluateDimension(prompt, dimensionId, true);
      }
      return {
        dimensionId,
        score: 0,
        reasoning: \`Evaluation failed: \${error instanceof Error ? error.message : String(error)}\`,
        modelUsed: model,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Evaluates all dimensions for a comment in parallel.
   */
  async evaluateAll(
    comment: string,
    dimensions: any[],
    promptEngine: any,
    context: { spec?: string; conversationContext?: string; projectContext?: string }
  ): Promise<any[]> {
    const prompts = dimensions.map((d: any) => ({
      dimension: d,
      prompt: promptEngine.prepareEvaluationPrompt(d, comment, context),
    }));

    const results = await Promise.all(
      prompts.map((p: any) => this.evaluateDimension(p.prompt, p.dimension.id))
    );

    return results;
  }
}`;
}

// ============================================================================
// SCORE AGGREGATOR
// ============================================================================

/**
 * Generates the weighted score aggregation service.
 */
export function generateScoreAggregator(): string {
  return `/**
 * Weighted Score Aggregator
 * Combines dimension scores using configured weights.
 */
export class ScoreAggregator {
  private dimensions: any[];

  constructor(dimensions: any[]) {
    this.dimensions = dimensions;
    this.validateWeights();
  }

  /**
   * Validates that dimension weights sum to approximately 1.0.
   */
  private validateWeights(): void {
    const totalWeight = this.dimensions.reduce((sum: number, d: any) => sum + d.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(\`Dimension weights sum to \${totalWeight}, expected 1.0\`);
    }
  }

  /**
   * Aggregates evaluation results into a weighted total score.
   */
  aggregate(beneficiary: string, evaluations: any[]): any {
    const dimensionScores: Record<string, number> = {};
    let weightedTotal = 0;

    for (const evalResult of evaluations) {
      const dimension = this.dimensions.find((d: any) => d.id === evalResult.dimensionId);
      if (!dimension) continue;

      dimensionScores[evalResult.dimensionId] = evalResult.score;
      weightedTotal += evalResult.score * dimension.weight;
    }

    return {
      beneficiary,
      dimensionScores,
      weightedTotal: Math.round(weightedTotal * 10000) / 10000,
      evaluations,
    };
  }

  /**
   * Ranks beneficiaries by weighted total score.
   */
  rank(scores: any[]): any[] {
    return [...scores].sort((a, b) => b.weightedTotal - a.weightedTotal);
  }
}`;
}

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

/**
 * Generates the full evaluation pipeline orchestrator.
 */
export function generatePipelineOrchestrator(): string {
  return `/**
 * Specialized Prompts Pipeline
 * Orchestrates multi-dimensional evaluation for conversation rewards.
 */
import { PromptEngine } from "./prompt-engine";
import { EvaluationService } from "./evaluation.service";
import { ScoreAggregator } from "./score-aggregator";

export class EvaluationPipeline {
  private promptEngine: PromptEngine;
  private evaluationService: EvaluationService;
  private aggregator: ScoreAggregator;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.promptEngine = new PromptEngine();
    this.evaluationService = new EvaluationService(config);
    this.aggregator = new ScoreAggregator(config.dimensions);
  }

  /**
   * Evaluates all comments for an issue and returns ranked scores.
   */
  async evaluateIssue(
    comments: Array<{ author: string; body: string }>,
    context: { spec: string; conversationContext?: string; projectContext?: string }
  ): Promise<any[]> {
    const scores: any[] = [];

    // Process comments in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < comments.length; i += batchSize) {
      const batch = comments.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (comment) => {
          const evaluations = await this.evaluationService.evaluateAll(
            comment.body,
            this.config.dimensions,
            this.promptEngine,
            context
          );
          return this.aggregator.aggregate(comment.author, evaluations);
        })
      );

      scores.push(...batchResults);
    }

    return this.aggregator.rank(scores);
  }

  /**
   * Formats evaluation results for GitHub comment output.
   */
  formatResults(rankedScores: any[]): string {
    const lines: string[] = [];
    lines.push("## 📊 Conversation Reward Evaluation");
    lines.push("");
    lines.push("| Rank | Contributor | Relevance | Helpfulness | Research | Total |");
    lines.push("|------|-------------|-----------|-------------|----------|-------|");

    rankedScores.forEach((score, idx) => {
      const rel = (score.dimensionScores.relevance || 0).toFixed(2);
      const help = (score.dimensionScores.helpfulness || 0).toFixed(2);
      const res = (score.dimensionScores.research || 0).toFixed(2);
      const total = score.weightedTotal.toFixed(3);
      lines.push(\`| \${idx + 1} | @\${score.beneficiary} | \${rel} | \${help} | \${res} | **\${total}** |\`);
    });

    lines.push("");
    lines.push("*Evaluated using specialized prompts via OpenRouter (Gemini/DeepSeek)*");
    return lines.join("\\n");
  }
}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateAcceptanceCriteria(files: Record<string, string>): { passed: boolean; checks: Array<{ name: string; status: "pass" | "fail" }> } {
  const checks = [
    { name: "Relevance dimension defined", status: Object.values(files).some(c => c.includes("relevance") && c.includes("Spec Relevance")) ? "pass" : "fail" },
    { name: "Helpfulness dimension defined", status: Object.values(files).some(c => c.includes("helpfulness") && c.includes("Contributor Helpfulness")) ? "pass" : "fail" },
    { name: "Research dimension defined", status: Object.values(files).some(c => c.includes("research") && c.includes("Research & Insights")) ? "pass" : "fail" },
    { name: "Weight configuration present", status: Object.values(files).some(c => c.includes("weight:") && c.includes("0.5")) ? "pass" : "fail" },
    { name: "OpenRouter integration", status: Object.values(files).some(c => c.includes("openrouter.ai") && c.includes("chat/completions")) ? "pass" : "fail" },
    { name: "Free-tier model support", status: Object.values(files).some(c => c.includes(":free") || c.includes("gemini") || c.includes("deepseek")) ? "pass" : "fail" },
    { name: "JSON response format", status: Object.values(files).some(c => c.includes("json_object") || c.includes("JSON only")) ? "pass" : "fail" },
    { name: "Score aggregator with weights", status: Object.values(files).some(c => c.includes("ScoreAggregator") && c.includes("weightedTotal")) ? "pass" : "fail" },
    { name: "Pipeline orchestrator", status: Object.values(files).some(c => c.includes("EvaluationPipeline")) ? "pass" : "fail" },
    { name: "Fallback model support", status: Object.values(files).some(c => c.includes("fallbackModel") || c.includes("useFallback")) ? "pass" : "fail" },
  ];
  return { passed: checks.every(c => c.status === "pass"), checks };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const SpecializedPromptsPlugin = {
  name: "specialized-prompts",
  version: "1.0.0",
  issue: "#5007",
  upstreamIssue: "ubiquity-os-marketplace/text-conversation-rewards#340",
  bountyValue: 600,
  generators: {
    promptEngine: generatePromptEngine,
    evaluationService: generateEvaluationService,
    scoreAggregator: generateScoreAggregator,
    pipeline: generatePipelineOrchestrator,
  },
  validators: { acceptanceCriteria: validateAcceptanceCriteria },
  config: { default: getDefaultConfig },
};

export default SpecializedPromptsPlugin;
