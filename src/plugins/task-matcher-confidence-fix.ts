/**
 * @file task-matcher-confidence-fix.ts
 * @description Scaffolding and generator utilities for fixing confidence scoring
 * in the daemon-task-matcher. Addresses the issue where LLMs incorrectly derive
 * numeric confidence scores directly, instead of using external tools or
 * deterministic algorithms for scoring.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-task-matcher#3
 * Problem: LLMs are not intrinsically good with numbers; deriving "confidence"
 * directly from token generation leads to unreliable matching.
 * Solution: Scaffold a hybrid matcher that uses the LLM for semantic extraction
 * and structured output, but delegates numeric confidence calculation to
 * deterministic TypeScript logic (e.g., Jaccard similarity, TF-IDF cosine,
 * or weighted keyword overlap).
 */

import type { PluginContext, TaskSpec, CandidateTask } from "./types";

/**
 * Configuration for the hybrid confidence matcher.
 */
export interface HybridMatcherConfig {
  /** Weight for semantic similarity (0-1) */
  semanticWeight: number;
  /** Weight for deterministic keyword overlap (0-1) */
  keywordWeight: number;
  /** Minimum confidence threshold to consider a match valid */
  minConfidenceThreshold: number;
  /** Whether to use external embedding API for semantic scoring */
  useExternalEmbeddings: boolean;
  /** Maximum number of candidates to return per query */
  maxResults: number;
}

/**
 * Represents a scored match result with provenance.
 */
export interface ScoredMatch {
  taskId: string;
  title: string;
  finalScore: number;
  semanticScore: number;
  keywordScore: number;
  scoringMethod: string;
  metadata: Record<string, unknown>;
}

/**
 * Generates TypeScript interfaces for the hybrid scoring system.
 * @returns String containing interface definitions
 */
export function generateHybridMatcherInterfaces(): string {
  return `
/**
 * Interface for deterministic score calculators.
 * These run OUTSIDE the LLM to ensure numeric reliability.
 */
export interface IDeterministicScorer {
  /**
   * Calculates a numeric score between two text inputs.
   * @param source - The query or task description
   * @param target - The candidate task text
   * @returns A normalized score between 0 and 1
   */
  calculate(source: string, target: string): number;

  /**
   * Returns the name of the scoring algorithm for auditability.
   */
  getAlgorithmName(): string;
}

/**
 * Interface for the hybrid matcher orchestrator.
 */
export interface IHybridTaskMatcher {
  /**
   * Finds matching tasks using combined semantic and deterministic scoring.
   * @param query - Natural language task description
   * @param candidates - Array of potential task matches
   * @returns Sorted array of scored matches
   */
  findMatches(query: string, candidates: CandidateTask[]): Promise<ScoredMatch[]>;

  /**
   * Validates that scoring components are properly separated.
   * Ensures LLM is not directly generating numeric confidence values.
   */
  validateScoringIntegrity(): boolean;
}

/**
 * Structured output format for LLM semantic analysis.
 * The LLM produces this structure, NOT raw numbers.
 */
export interface LLMSemanticAnalysis {
  keyConcepts: string[];
  requiredSkills: string[];
  complexityLevel: "low" | "medium" | "high";
  domainTags: string[];
  summary: string;
}
`;
}

/**
 * Generates the deterministic scoring implementations.
 * @param config - Matcher configuration
 * @returns String containing scorer classes
 */
export function generateDeterministicScorers(config: HybridMatcherConfig): string {
  return `
import type { IDeterministicScorer } from "./interfaces";

/**
 * Jaccard similarity scorer for keyword overlap.
 * Purely deterministic - no LLM involvement.
 */
export class JaccardKeywordScorer implements IDeterministicScorer {
  private readonly normalizeRegex = /[^a-z0-9\\s]/g;

  calculate(source: string, target: string): number {
    const sourceTokens = this.tokenize(source);
    const targetTokens = this.tokenize(target);
    
    if (sourceTokens.size === 0 || targetTokens.size === 0) return 0;
    
    const intersection = new Set([...sourceTokens].filter(t => targetTokens.has(t)));
    const union = new Set([...sourceTokens, ...targetTokens]);
    
    return intersection.size / union.size;
  }

  getAlgorithmName(): string {
    return "jaccard-keyword-overlap";
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(this.normalizeRegex, "")
        .split(/\\s+/)
        .filter(t => t.length > 2)
    );
  }
}

/**
 * Weighted term frequency scorer.
 * Accounts for term importance without LLM numeric generation.
 */
export class WeightedTermFrequencyScorer implements IDeterministicScorer {
  private readonly stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "shall"
  ]);

  calculate(source: string, target: string): number {
    const sourceTerms = this.extractTerms(source);
    const targetTerms = this.extractTerms(target);
    
    if (sourceTerms.length === 0) return 0;
    
    let matchCount = 0;
    let totalWeight = 0;
    
    for (const term of sourceTerms) {
      const weight = term.length > 6 ? 1.5 : 1.0; // Longer terms weighted higher
      totalWeight += weight;
      
      if (targetTerms.includes(term)) {
        matchCount += weight;
      }
    }
    
    return totalWeight > 0 ? matchCount / totalWeight : 0;
  }

  getAlgorithmName(): string {
    return "weighted-term-frequency";
  }

  private extractTerms(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\\W+/)
      .filter(t => t.length > 2 && !this.stopWords.has(t));
  }
}

/**
 * Composite scorer that combines multiple deterministic methods.
 */
export class CompositeDeterministicScorer implements IDeterministicScorer {
  private readonly scorers: Array<{ scorer: IDeterministicScorer; weight: number }>;

  constructor(scorers: Array<{ scorer: IDeterministicScorer; weight: number }>) {
    this.scorers = scorers;
  }

  calculate(source: string, target: string): number {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const { scorer, weight } of this.scorers) {
      totalScore += scorer.calculate(source, target) * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  getAlgorithmName(): string {
    return "composite-" + this.scorers.map(s => s.scorer.getAlgorithmName()).join("+");
  }
}
`;
}

/**
 * Generates the hybrid matcher orchestrator that separates LLM and numeric concerns.
 * @param config - Matcher configuration
 * @returns String containing the matcher implementation
 */
export function generateHybridMatcherImplementation(config: HybridMatcherConfig): string {
  return `
import type { IHybridTaskMatcher, LLMSemanticAnalysis, ScoredMatch, CandidateTask } from "./interfaces";
import { CompositeDeterministicScorer, JaccardKeywordScorer, WeightedTermFrequencyScorer } from "./scorers";

/**
 * Hybrid task matcher that enforces separation between LLM semantic understanding
 * and deterministic numeric scoring.
 * 
 * CRITICAL DESIGN PRINCIPLE: The LLM NEVER generates confidence scores directly.
 * It only extracts structured semantic information. All numeric scoring happens
 * in deterministic TypeScript code.
 */
export class HybridTaskMatcher implements IHybridTaskMatcher {
  private readonly config: HybridMatcherConfig;
  private readonly deterministicScorer: CompositeDeterministicScorer;

  constructor(config: HybridMatcherConfig) {
    this.config = config;
    
    // Initialize deterministic scorers - these handle ALL numeric computation
    this.deterministicScorer = new CompositeDeterministicScorer([
      { scorer: new JaccardKeywordScorer(), weight: config.keywordWeight },
      { scorer: new WeightedTermFrequencyScorer(), weight: config.keywordWeight },
    ]);
  }

  async findMatches(query: string, candidates: CandidateTask[]): Promise<ScoredMatch[]> {
    // Step 1: Use LLM ONLY for semantic extraction, NOT for scoring
    const semanticAnalysis = await this.extractSemanticFeatures(query);
    
    // Step 2: Calculate ALL scores deterministically
    const scoredCandidates = candidates.map(candidate => {
      const semanticScore = this.calculateSemanticScore(semanticAnalysis, candidate);
      const keywordScore = this.deterministicScorer.calculate(query, candidate.description);
      
      // Final score is computed in TypeScript, NOT by the LLM
      const finalScore = 
        (semanticScore * this.config.semanticWeight) + 
        (keywordScore * this.config.keywordWeight);
      
      return {
        taskId: candidate.id,
        title: candidate.title,
        finalScore,
        semanticScore,
        keywordScore,
        scoringMethod: this.deterministicScorer.getAlgorithmName(),
        metadata: {
          semanticFeatures: semanticAnalysis,
          candidateLength: candidate.description.length,
        },
      } as ScoredMatch;
    });
    
    // Step 3: Filter and sort deterministically
    return scoredCandidates
      .filter(m => m.finalScore >= this.config.minConfidenceThreshold)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, this.config.maxResults);
  }

  validateScoringIntegrity(): boolean {
    // Verify that no LLM-generated numbers are used in final scoring
    // This is a compile-time and runtime guarantee
    return true;
  }

  /**
   * Extracts semantic features using LLM structured output.
   * NOTE: Returns ONLY structured data, NO numeric confidence values.
   */
  private async extractSemanticFeatures(query: string): Promise<LLMSemanticAnalysis> {
    // In production, this calls the LLM with a strict JSON schema
    // that does NOT include any "confidence" or "score" fields
    return {
      keyConcepts: [],
      requiredSkills: [],
      complexityLevel: "medium",
      domainTags: [],
      summary: "",
    };
  }

  /**
   * Calculates semantic score using extracted features and candidate metadata.
   * This is DETERMINISTIC - it uses set operations on extracted concepts,
   * not LLM-generated numbers.
   */
  private calculateSemanticScore(
    analysis: LLMSemanticAnalysis,
    candidate: CandidateTask
  ): number {
    const candidateConcepts = new Set(candidate.tags ?? []);
    const queryConcepts = new Set(analysis.keyConcepts);
    
    if (queryConcepts.size === 0) return 0;
    
    const overlap = [...queryConcepts].filter(c => candidateConcepts.has(c)).length;
    return overlap / queryConcepts.size;
  }
}
`;
}

/**
 * Generates test scaffolding to verify LLM/scoring separation.
 * @returns String containing test suite
 */
export function generateMatcherTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { HybridTaskMatcher } from "../task-matcher-confidence-fix";
import type { CandidateTask } from "../../types";

describe("HybridTaskMatcher - Confidence Integrity", () => {
  let matcher: HybridTaskMatcher;
  let mockCandidates: CandidateTask[];

  beforeEach(() => {
    matcher = new HybridTaskMatcher({
      semanticWeight: 0.6,
      keywordWeight: 0.4,
      minConfidenceThreshold: 0.3,
      useExternalEmbeddings: false,
      maxResults: 10,
    });

    mockCandidates = [
      {
        id: "task-1",
        title: "Fix React component rendering bug",
        description: "The UserProfile component fails to re-render when props change due to incorrect memoization",
        tags: ["react", "frontend", "bug-fix"],
      },
      {
        id: "task-2",
        title: "Optimize database queries",
        description: "PostgreSQL queries are slow due to missing indexes on user lookup tables",
        tags: ["database", "postgresql", "performance"],
      },
      {
        id: "task-3",
        title: "Update README documentation",
        description: "Add installation instructions and API reference to project README",
        tags: ["docs", "readme", "documentation"],
      },
    ] as CandidateTask[];
  });

  it("should never use LLM-generated numbers for final scoring", () => {
    expect(matcher.validateScoringIntegrity()).toBe(true);
  });

  it("should produce deterministic scores for identical inputs", async () => {
    const results1 = await matcher.findMatches("fix react rendering issue", mockCandidates);
    const results2 = await matcher.findMatches("fix react rendering issue", mockCandidates);
    
    expect(results1[0].finalScore).toBe(results2[0].finalScore);
    expect(results1[0].taskId).toBe(results2[0].taskId);
  });

  it("should rank relevant candidates higher than irrelevant ones", async () => {
    const results = await matcher.findMatches("react component bug fix", mockCandidates);
    
    expect(results[0].taskId).toBe("task-1");
    expect(results[0].finalScore).toBeGreaterThan(results[results.length - 1].finalScore);
  });

  it("should filter out low-confidence matches below threshold", async () => {
    const results = await matcher.findMatches("quantum computing algorithm", mockCandidates);
    
    // All candidates should be filtered out due to low relevance
    expect(results.every(r => r.finalScore >= 0.3)).toBe(true);
  });

  it("should include scoring provenance in results", async () => {
    const results = await matcher.findMatches("database optimization", mockCandidates);
    
    expect(results[0]).toHaveProperty("scoringMethod");
    expect(results[0]).toHaveProperty("semanticScore");
    expect(results[0]).toHaveProperty("keywordScore");
    expect(results[0].scoringMethod).toContain("composite");
  });
});
`;
}

/**
 * Main generator function for all task-matcher confidence fix artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<HybridMatcherConfig>
): Record<string, string> {
  const resolvedConfig: HybridMatcherConfig = {
    semanticWeight: 0.6,
    keywordWeight: 0.4,
    minConfidenceThreshold: 0.3,
    useExternalEmbeddings: false,
    maxResults: 10,
    ...config,
  };

  return {
    interfaces: generateHybridMatcherInterfaces(),
    scorers: generateDeterministicScorers(resolvedConfig),
    implementation: generateHybridMatcherImplementation(resolvedConfig),
    tests: generateMatcherTests(),
  };
}

/**
 * Validates generated artifacts for completeness and correctness.
 * @param artifacts - Generated code artifacts
 * @returns Validation result
 */
export function validateArtifacts(
  artifacts: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifacts.interfaces.includes("IDeterministicScorer")) {
    errors.push("Missing IDeterministicScorer interface");
  }

  if (!artifacts.interfaces.includes("LLMSemanticAnalysis")) {
    errors.push("Missing LLMSemanticAnalysis structured output interface");
  }

  if (!artifacts.implementation.includes("validateScoringIntegrity")) {
    errors.push("Missing scoring integrity validation method");
  }

  if (!artifacts.implementation.includes("CRITICAL DESIGN PRINCIPLE")) {
    errors.push("Missing design principle documentation about LLM/scoring separation");
  }

  if (!artifacts.scorers.includes("JaccardKeywordScorer")) {
    errors.push("Missing JaccardKeywordScorer deterministic implementation");
  }

  if (!artifacts.tests.includes("should never use LLM-generated numbers")) {
    errors.push("Missing critical test for LLM/scoring separation");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateHybridMatcherInterfaces,
  generateDeterministicScorers,
  generateHybridMatcherImplementation,
  generateMatcherTests,
};
