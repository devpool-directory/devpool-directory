/**
 * @file relevance-scoring-refinement.ts
 * @description Scaffolding and generator utilities for refining relevance scoring
 * prompts to better detect low-value or off-topic comments. Addresses cases where
 * generic or tangential comments incorrectly receive high relevance scores.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#223
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Enhanced relevance scoring prompt with anti-gaming heuristics
 * - Comment quality classifier distinguishing substantive from superficial content
 * - Test fixture framework using real-world examples of mis-scored comments
 * - Prompt template generator with configurable strictness levels
 * - Integration patch for text-vector-embeddings evaluation pipeline
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Quality classification for comment relevance assessment.
 */
export enum CommentQualityTier {
  /** Directly addresses task requirements with technical substance */
  HIGH_VALUE = "high_value",
  /** Relevant but lacks depth or actionable content */
  MODERATE_VALUE = "moderate_value",
  /** Tangentially related or generic acknowledgment */
  LOW_VALUE = "low_value",
  /** Off-topic, spam, or purely social content */
  NO_VALUE = "no_value",
}

/**
 * Configuration for relevance scoring refinement.
 */
export interface RelevanceScoringConfig {
  /** Strictness level for scoring (0-1, higher = more strict) */
  strictnessLevel: number;
  /** Whether to penalize generic acknowledgments */
  penalizeGenericAcknowledgments: boolean;
  /** Whether to require technical specificity for high scores */
  requireTechnicalSpecificity: boolean;
  /** Maximum score cap for comments without code references */
  maxScoreWithoutCodeRef: number;
  /** Keywords indicating low-value generic responses */
  lowValueKeywords: string[];
  /** Patterns indicating substantive technical contribution */
  highValuePatterns: RegExp[];
  /** Whether to consider comment length as a factor */
  considerLength: boolean;
  /** Minimum character count for moderate+ scoring */
  minCharsForModerate: number;
}

/**
 * Result of relevance scoring with quality metadata.
 */
export interface RelevanceScoreResult {
  /** Raw relevance score 0-1 */
  score: number;
  /** Quality tier classification */
  qualityTier: CommentQualityTier;
  /** Reasons for the assigned score */
  scoringReasons: string[];
  /** Detected red flags that reduced the score */
  redFlags: string[];
  /** Whether this matches a known anti-pattern */
  matchesAntiPattern: boolean;
  /** Confidence in the scoring decision 0-1 */
  confidence: number;
}

/**
 * Test fixture representing a real-world scoring case.
 */
export interface ScoringTestFixture {
  /** Unique identifier for the test case */
  id: string;
  /** The comment text to evaluate */
  commentText: string;
  /** Context about the issue/task being discussed */
  issueContext: string;
  /** Expected quality tier */
  expectedTier: CommentQualityTier;
  /** Maximum acceptable score for this case */
  maxAcceptableScore: number;
  /** Why this case is important for calibration */
  rationale: string;
  /** Source reference (issue/comment URL) */
  sourceUrl?: string;
}

// ============================================================================
// PROMPT TEMPLATE GENERATOR
// ============================================================================

/**
 * Generates refined relevance scoring prompts with anti-gaming measures.
 */
export class RelevancePromptGenerator {
  private config: RelevanceScoringConfig;

  constructor(config: RelevanceScoringConfig) {
    this.config = config;
  }

  /**
   * Generate a complete relevance scoring system prompt.
   * Incorporates lessons learned from mis-scored comments.
   * 
   * @param issueDescription - The issue/task description for context
   * @returns Complete system prompt for LLM-based scoring
   */
  generateSystemPrompt(issueDescription: string): string {
    const strictnessAdjective = this.getStrictnessAdjective();
    
    return `You are a ${strictnessAdjective} relevance scoring engine for open-source bounty rewards.

## YOUR TASK
Evaluate whether a comment contributes meaningfully to resolving the following issue:

---
${issueDescription}
---

## SCORING CRITERIA (0.0 to 1.0)

### HIGH VALUE (0.7-1.0)
Comment MUST demonstrate ALL of:
- Direct engagement with specific technical aspects of the issue
- Actionable insights, code suggestions, or architectural analysis
- Evidence of understanding the problem domain
- Original thought beyond restating the issue

### MODERATE VALUE (0.4-0.69)
Comment demonstrates SOME of:
- Relevant questions that clarify requirements
- Links to related issues, documentation, or prior art
- Identification of edge cases or potential problems
- Constructive feedback on proposed approaches

### LOW VALUE (0.1-0.39)
Comment exhibits ANY of:
- Generic acknowledgments ("looks good", "nice work", "agreed")
- Restating obvious information from the issue
- Social pleasantries without technical substance
- Vague encouragement without specific feedback
- Comments primarily about process rather than content

### NO VALUE (0.0)
Comment is:
- Completely off-topic
- Spam or self-promotion
- Pure emoji reactions without context
- Automated bot output without human insight

## ANTI-GAMING RULES
${this.generateAntiGamingRules()}

## OUTPUT FORMAT
Respond with ONLY valid JSON:
{
  "score": <number 0.0-1.0>,
  "quality_tier": "<high_value|moderate_value|low_value|no_value>",
  "reasons": ["<specific reason 1>", "<specific reason 2>"],
  "red_flags": ["<any detected gaming patterns>"],
  "confidence": <number 0.0-1.0>
}

Do NOT include any text outside the JSON object.`;
  }

  /**
   * Generate anti-gaming rules based on configuration.
   */
  private generateAntiGamingRules(): string {
    const rules: string[] = [];

    if (this.config.penalizeGenericAcknowledgments) {
      rules.push(`- GENERIC ACKNOWLEDGMENTS like "${this.config.lowValueKeywords.slice(0, 5).join('", "')}" should NEVER score above 0.3 unless accompanied by substantive technical content.`);
    }

    if (this.config.requireTechnicalSpecificity) {
      rules.push("- Comments without specific references to code, architecture, or technical concepts should be capped at 0.5 regardless of length.");
    }

    if (this.config.maxScoreWithoutCodeRef < 1.0) {
      rules.push(`- Comments that don't reference specific files, functions, or code patterns cannot exceed ${(this.config.maxScoreWithoutCodeRef * 100).toFixed(0)}% relevance.`);
    }

    rules.push("- Length alone does NOT indicate value. A 500-word generic response scores LOWER than a 50-word precise technical insight.");
    rules.push("- Multiple comments from the same user should be evaluated INDEPENDENTLY. Prior high scores do not justify subsequent low-effort comments.");
    rules.push("- Comments that merely agree with or rephrase others without adding new information are LOW VALUE.");

    return rules.join("\n");
  }

  /**
   * Get adjective describing current strictness level.
   */
  private getStrictnessAdjective(): string {
    if (this.config.strictnessLevel >= 0.8) return "highly discriminating";
    if (this.config.strictnessLevel >= 0.5) return "moderately strict";
    return "lenient";
  }

  /**
   * Generate user prompt for evaluating a specific comment.
   */
  generateUserPrompt(commentText: string, commenterRole?: string): string {
    let prompt = `Evaluate this comment:\n\n"${commentText}"\n`;
    
    if (commenterRole) {
      prompt += `\nCommenter role: ${commenterRole}\n`;
    }

    prompt += `\nRemember: Score based on TECHNICAL CONTRIBUTION to solving the issue, not politeness, length, or enthusiasm.`;

    return prompt;
  }
}

// ============================================================================
// COMMENT QUALITY CLASSIFIER
// ============================================================================

/**
 * Pre-classifies comments using heuristic patterns before LLM scoring.
 * Provides fast filtering and augments LLM decisions.
 */
export class CommentQualityClassifier {
  private config: RelevanceScoringConfig;

  constructor(config: RelevanceScoringConfig) {
    this.config = config;
  }

  /**
   * Perform heuristic pre-classification of a comment.
   * Used to set score bounds and inform LLM evaluation.
   * 
   * @param comment - Comment text to classify
   * @returns Preliminary quality assessment
   */
  preClassify(comment: string): {
    suggestedTier: CommentQualityTier;
    maxScoreCap: number;
    detectedPatterns: string[];
    shouldSkipLlm: boolean;
  } {
    const lowerComment = comment.toLowerCase().trim();
    const detectedPatterns: string[] = [];
    let maxScoreCap = 1.0;
    let suggestedTier = CommentQualityTier.MODERATE_VALUE;
    let shouldSkipLlm = false;

    // Check for obvious no-value patterns
    const noValuePatterns = [
      /^[\s]*$/,                          // Empty
      /^[👍👎❤️🎉😄😕🚀]+$/u,            // Emoji only
      /^(lgtm|looks good|nice|great|awesome|thanks|thx|ty)[.!]?$/i,  // Simple ack
      /^\+1$|^agree$|^same$/i,           // Agreement without substance
    ];

    for (const pattern of noValuePatterns) {
      if (pattern.test(lowerComment)) {
        detectedPatterns.push("matches_no_value_pattern");
        return {
          suggestedTier: CommentQualityTier.NO_VALUE,
          maxScoreCap: 0.05,
          detectedPatterns,
          shouldSkipLlm: true,
        };
      }
    }

    // Check for low-value keywords
    const lowValueMatches = this.config.lowValueKeywords.filter(kw => 
      lowerComment.includes(kw.toLowerCase())
    );
    if (lowValueMatches.length > 0 && comment.length < 100) {
      detectedPatterns.push(`low_value_keywords: ${lowValueMatches.join(", ")}`);
      maxScoreCap = Math.min(maxScoreCap, 0.3);
      suggestedTier = CommentQualityTier.LOW_VALUE;
    }

    // Check for high-value indicators
    const hasCodeRef = /```|`[^`]+`|\b(function|class|method|variable|import|export)\b/i.test(comment);
    const hasFileRef = /\.\w{1,4}\b|\/[\w-]+\/|src\/|lib\/|test\//i.test(comment);
    const hasTechnicalDepth = this.config.highValuePatterns.some(p => p.test(comment));

    if (hasCodeRef || hasFileRef || hasTechnicalDepth) {
      detectedPatterns.push("has_technical_specificity");
      suggestedTier = CommentQualityTier.HIGH_VALUE;
    } else if (!hasCodeRef && this.config.requireTechnicalSpecificity) {
      maxScoreCap = Math.min(maxScoreCap, this.config.maxScoreWithoutCodeRef);
      detectedPatterns.push("no_code_reference_capped");
    }

    // Length check
    if (this.config.considerLength && comment.length < this.config.minCharsForModerate) {
      if (suggestedTier === CommentQualityTier.HIGH_VALUE) {
        detectedPatterns.push("short_but_technical");
      } else {
        maxScoreCap = Math.min(maxScoreCap, 0.4);
        detectedPatterns.push("below_minimum_length");
        suggestedTier = CommentQualityTier.LOW_VALUE;
      }
    }

    return {
      suggestedTier,
      maxScoreCap,
      detectedPatterns,
      shouldSkipLlm,
    };
  }

  /**
   * Validate and potentially adjust an LLM-generated score.
   * Applies hard caps and consistency checks.
   */
  validateScore(
    llmResult: RelevanceScoreResult,
    preClassification: ReturnType<CommentQualityClassifier["preClassify"]>
  ): RelevanceScoreResult {
    const adjusted = { ...llmResult };

    // Apply max score cap from pre-classification
    if (adjusted.score > preClassification.maxScoreCap) {
      adjusted.redFlags.push(
        `Score capped from ${adjusted.score.toFixed(2)} to ${preClassification.maxScoreCap.toFixed(2)} ` +
        `due to: ${preClassification.detectedPatterns.join(", ")}`
      );
      adjusted.score = preClassification.maxScoreCap;
      
      // Adjust tier if needed
      if (adjusted.score < 0.4) adjusted.qualityTier = CommentQualityTier.LOW_VALUE;
      else if (adjusted.score < 0.7) adjusted.qualityTier = CommentQualityTier.MODERATE_VALUE;
    }

    // Flag significant disagreement between pre-class and LLM
    const tierMismatch = 
      (preClassification.suggestedTier === CommentQualityTier.LOW_VALUE && 
       adjusted.qualityTier === CommentQualityTier.HIGH_VALUE) ||
      (preClassification.suggestedTier === CommentQualityTier.NO_VALUE && 
       adjusted.qualityTier !== CommentQualityTier.NO_VALUE);

    if (tierMismatch) {
      adjusted.redFlags.push(
        `Heuristic/LLM tier mismatch: heuristic=${preClassification.suggestedTier}, llm=${adjusted.qualityTier}`
      );
      adjusted.confidence = Math.min(adjusted.confidence, 0.5);
    }

    return adjusted;
  }
}

// ============================================================================
// TEST FIXTURE REGISTRY
// ============================================================================

/**
 * Registry of real-world scoring test cases for prompt calibration.
 */
export class ScoringTestFixtureRegistry {
  private fixtures: Map<string, ScoringTestFixture> = new Map();

  /**
   * Register a test fixture.
   */
  register(fixture: ScoringTestFixture): void {
    this.fixtures.set(fixture.id, fixture);
  }

  /**
   * Get all registered fixtures.
   */
  getAll(): ScoringTestFixture[] {
    return Array.from(this.fixtures.values());
  }

  /**
   * Get fixtures for a specific quality tier.
   */
  getByTier(tier: CommentQualityTier): ScoringTestFixture[] {
    return this.getAll().filter(f => f.expectedTier === tier);
  }

  /**
   * Generate few-shot examples for prompt inclusion.
   * Selects representative cases from each tier.
   */
  generateFewShotExamples(maxPerTier: number = 2): string {
    const lines: string[] = ["## CALIBRATION EXAMPLES", ""];

    for (const tier of [
      CommentQualityTier.HIGH_VALUE,
      CommentQualityTier.MODERATE_VALUE,
      CommentQualityTier.LOW_VALUE,
      CommentQualityTier.NO_VALUE,
    ]) {
      const examples = this.getByTier(tier).slice(0, maxPerTier);
      if (examples.length === 0) continue;

      lines.push(`### ${tier.toUpperCase().replace("_", " ")} EXAMPLES`);
      for (const ex of examples) {
        lines.push(`**Comment:** "${ex.commentText.slice(0, 200)}${ex.commentText.length > 200 ? "..." : ""}"`);
        lines.push(`**Expected Score:** ≤${ex.maxAcceptableScore.toFixed(2)} (${ex.expectedTier})`);
        lines.push(`**Why:** ${ex.rationale}`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_RELEVANCE_SCORING_CONFIG: RelevanceScoringConfig = {
  strictnessLevel: 0.7,
  penalizeGenericAcknowledgments: true,
  requireTechnicalSpecificity: true,
  maxScoreWithoutCodeRef: 0.5,
  lowValueKeywords: [
    "looks good",
    "nice work",
    "great job",
    "awesome",
    "thanks",
    "agreed",
    "lgtm",
    "+1",
    "makes sense",
    "sounds good",
    "good point",
    "interesting",
    "noted",
    "will review",
    "checking this",
  ],
  highValuePatterns: [
    /\b(bug|fix|patch|refactor|optimize|improve)\b.*\b(in|at|for|of)\b.*\b(line|function|method|class|module|file)/i,
    /\b(consider|suggest|recommend)\b.*\b(using|changing|replacing|adding|removing)\b/i,
    /```[\s\S]*```/,
    /\b(error|exception|crash|fail)\b.*\b(because|due to|caused by|when)\b/i,
    /\b(performance|memory|latency|throughput)\b.*\b(improve|reduce|increase|optimize)/i,
  ],
  considerLength: true,
  minCharsForModerate: 50,
};

/**
 * Create default test fixture registry with known problematic cases.
 */
export function createDefaultFixtureRegistry(): ScoringTestFixtureRegistry {
  const registry = new ScoringTestFixtureRegistry();

  // Case from issue #223: gentlementlegen comments scoring too high
  registry.register({
    id: "gentlementlegen-generic-ack",
    commentText: "I think we need to make sure that linguist generated ignored files are NOT included in line count",
    issueContext: "Review incentive calculation bug where generated files inflate line counts",
    expectedTier: CommentQualityTier.MODERATE_VALUE,
    maxAcceptableScore: 0.5,
    rationale: "Restates the issue requirement without providing implementation details, code references, or novel insight. Should not score as high as comments that propose specific solutions.",
    sourceUrl: "https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/230#issuecomment-2639130155",
  });

  registry.register({
    id: "generic-agreement",
    commentText: "Agreed, this is important.",
    issueContext: "Any technical issue",
    expectedTier: CommentQualityTier.LOW_VALUE,
    maxAcceptableScore: 0.2,
    rationale: "Pure agreement without adding information. Zero technical substance.",
  });

  registry.register({
    id: "high-value-code-suggestion",
    commentText: "The issue is in `calculateRewards()` at line 142. We should filter files using `linguist.detectGenerated()` before summing additions. Here's a fix:\n```typescript\nconst nonGenerated = files.filter(f => !linguist.isGenerated(f.filename));\n```",
    issueContext: "Review incentive calculation bug",
    expectedTier: CommentQualityTier.HIGH_VALUE,
    maxAcceptableScore: 1.0,
    rationale: "Identifies specific location, proposes concrete solution with code example.",
  });

  registry.register({
    id: "moderate-question",
    commentText: "Should we also exclude test fixtures from the line count? They're often auto-generated but not caught by linguist.",
    issueContext: "Review incentive calculation bug",
    expectedTier: CommentQualityTier.MODERATE_VALUE,
    maxAcceptableScore: 0.6,
    rationale: "Raises relevant edge case but doesn't provide solution. Valuable but not high-value.",
  });

  return registry;
}

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for text-vector-embeddings evaluation.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Refined relevance scoring with anti-gaming measures.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#223
 */

import { 
  RelevancePromptGenerator, 
  CommentQualityClassifier,
  ScoringTestFixtureRegistry,
  DEFAULT_RELEVANCE_SCORING_CONFIG,
  createDefaultFixtureRegistry,
  RelevanceScoreResult
} from "./relevance-scoring-refinement";

const config = DEFAULT_RELEVANCE_SCORING_CONFIG;
const promptGenerator = new RelevancePromptGenerator(config);
const classifier = new CommentQualityClassifier(config);
const fixtureRegistry = createDefaultFixtureRegistry();

/**
 * FIXED: Score comment relevance with refined prompt and validation.
 * Replaces naive scoring that over-rewarded generic comments.
 */
export async function scoreCommentRelevance(
  comment: string,
  issueDescription: string,
  llmCallFn: (systemPrompt: string, userPrompt: string) => Promise<string>,
  commenterRole?: string
): Promise<RelevanceScoreResult> {
  // Step 1: Pre-classify using heuristics
  const preClass = classifier.preClassify(comment);
  
  if (preClass.shouldSkipLlm) {
    return {
      score: preClass.maxScoreCap,
      qualityTier: preClass.suggestedTier,
      scoringReasons: ["Heuristic match - LLM skipped"],
      redFlags: preClass.detectedPatterns,
      matchesAntiPattern: true,
      confidence: 0.95,
    };
  }

  // Step 2: Generate refined prompts
  const systemPrompt = promptGenerator.generateSystemPrompt(issueDescription) + 
    "\\n\\n" + fixtureRegistry.generateFewShotExamples(1);
  const userPrompt = promptGenerator.generateUserPrompt(comment, commenterRole);

  // Step 3: Call LLM
  try {
    const rawResponse = await llmCallFn(systemPrompt, userPrompt);
    const parsed = JSON.parse(rawResponse) as RelevanceScoreResult;

    // Step 4: Validate against heuristics
    const validated = classifier.validateScore(parsed, preClass);

    return validated;
  } catch (error) {
    // Fallback to heuristic-only score on LLM failure
    console.warn("[Relevance] LLM scoring failed, using heuristic fallback:", error);
    return {
      score: preClass.maxScoreCap * 0.8, // Conservative fallback
      qualityTier: preClass.suggestedTier,
      scoringReasons: ["LLM failed - heuristic fallback"],
      redFlags: [...preClass.detectedPatterns, "llm_parse_error"],
      matchesAntiPattern: false,
      confidence: 0.3,
    };
  }
}

/**
 * Run calibration tests against known fixtures.
 * Use to validate prompt changes before deployment.
 */
export async function runCalibrationTests(
  llmCallFn: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<{
  passed: number;
  failed: number;
  failures: Array<{ id: string; expected: number; actual: number; delta: number }>;
}> {
  const fixtures = fixtureRegistry.getAll();
  let passed = 0;
  const failures: Array<{ id: string; expected: number; actual: number; delta: number }> = [];

  for (const fixture of fixtures) {
    const result = await scoreCommentRelevance(
      fixture.commentText,
      fixture.issueContext,
      llmCallFn
    );

    if (result.score <= fixture.maxAcceptableScore) {
      passed++;
    } else {
      failures.push({
        id: fixture.id,
        expected: fixture.maxAcceptableScore,
        actual: result.score,
        delta: result.score - fixture.maxAcceptableScore,
      });
    }
  }

  return {
    passed,
    failed: failures.length,
    failures,
  };
}
`;
}

/**
 * Format scoring audit for transparency.
 */
export function formatScoringAudit(result: RelevanceScoreResult, commentPreview: string): string {
  const lines: string[] = [
    `### 📊 Relevance Score Audit`,
    ``,
    `**Score:** ${result.score.toFixed(2)} (${result.qualityTier.replace("_", " ")})`,
    `**Confidence:** ${(result.confidence * 100).toFixed(0)}%`,
    ``,
  ];

  if (result.scoringReasons.length > 0) {
    lines.push(`**Reasons:**`);
    for (const r of result.scoringReasons) {
      lines.push(`- ${r}`);
    }
    lines.push(``);
  }

  if (result.redFlags.length > 0) {
    lines.push(`**⚠️ Red Flags:**`);
    for (const f of result.redFlags) {
      lines.push(`- ${f}`);
    }
    lines.push(``);
  }

  lines.push(`<details>`);
  lines.push(`<summary>Comment Preview</summary>`);
  lines.push(``);
  lines.push(`> ${commentPreview.slice(0, 300)}${commentPreview.length > 300 ? "..." : ""}`);
  lines.push(``);
  lines.push(`</details>`);

  return lines.join("\n");
}
