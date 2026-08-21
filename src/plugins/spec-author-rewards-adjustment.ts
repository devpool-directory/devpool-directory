/**
 * @file spec-author-rewards-adjustment.ts
 * @description Scaffolding and generator utilities for adjusting specification
 * author rewards to apply multipliers only to word count, not element counts.
 * Prevents excessive rewards from link/element inflation while maintaining
 * premium compensation for specification effort.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#171
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Differential multiplier application separating word count from elements
 * - Specification detection heuristics distinguishing specs from comments
 * - Element reward capping to prevent link farming
 * - Configurable multiplier strategies with deprecation path for word count
 * - Integration patch for reward calculation pipeline
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Component breakdown of a specification's content analysis.
 */
export interface SpecContentBreakdown {
  /** Total word count in the specification */
  wordCount: number;
  /** Number of links/references found */
  linkCount: number;
  /** Number of code blocks or technical elements */
  codeBlockCount: number;
  /** Number of list items or structured elements */
  listItemCount: number;
  /** Number of images or media embeds */
  mediaCount: number;
  /** Whether this appears to be a specification vs regular comment */
  isSpecification: boolean;
  /** Confidence in specification detection 0-1 */
  specConfidence: number;
}

/**
 * Reward component before multiplier application.
 */
export interface RewardComponent {
  /** Type of reward component */
  type: "word_count" | "link" | "code_block" | "list_item" | "media";
  /** Base value before any multipliers */
  baseValue: bigint;
  /** Count of this element type */
  count: number;
  /** Per-unit rate in wei */
  unitRate: bigint;
}

/**
 * Configuration for spec author reward adjustments.
 */
export interface SpecRewardConfig {
  /** Multiplier applied ONLY to word count component for spec authors */
  authorWordMultiplier: number;
  /** Multiplier applied to element components (links, code, etc.) - typically 1.0 */
  authorElementMultiplier: number;
  /** Maximum reward per link to prevent farming */
  maxRewardPerLink: bigint;
  /** Maximum total element reward cap */
  maxTotalElementReward: bigint;
  /** Minimum word count to qualify as specification */
  minWordsForSpec: number;
  /** Patterns indicating specification content */
  specIndicators: RegExp[];
  /** Whether to use diminishing returns for element counts */
  useDiminishingReturns: boolean;
  /** Decay factor for diminishing returns (0.5 = half value after threshold) */
  diminishingDecayFactor: number;
  /** Threshold where diminishing returns begin */
  diminishingThreshold: number;
  /** Deprecation schedule for word count scoring */
  wordCountDeprecation: {
    enabled: boolean;
    currentWeight: number; // 1.0 = full, 0.0 = disabled
    targetDate?: string;
    monthlyDecayRate: number;
  };
}

/**
 * Result of adjusted reward calculation.
 */
export interface AdjustedSpecReward {
  /** Original unadjusted total */
  originalTotal: bigint;
  /** Final adjusted total */
  adjustedTotal: bigint;
  /** Word count component (after multiplier) */
  wordComponent: bigint;
  /** Element components total (after caps/multipliers) */
  elementComponent: bigint;
  /** Applied author word multiplier */
  appliedWordMultiplier: number;
  /** Applied author element multiplier */
  appliedElementMultiplier: number;
  /** Whether caps were triggered */
  capsTriggered: string[];
  /** Content breakdown used for calculation */
  breakdown: SpecContentBreakdown;
}

// ============================================================================
// SPECIFICATION DETECTOR
// ============================================================================

/**
 * Detects whether content is a specification vs regular comment.
 */
export class SpecificationDetector {
  private config: SpecRewardConfig;

  constructor(config: SpecRewardConfig) {
    this.config = config;
  }

  /**
   * Analyze content to determine if it's a specification.
   * 
   * @param content - The text content to analyze
   * @param metadata - Optional metadata (title, labels, etc.)
   * @returns Content breakdown with specification confidence
   */
  analyze(content: string, metadata?: { title?: string; labels?: string[] }): SpecContentBreakdown {
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    // Count elements
    const linkMatches = content.match(/https?:\/\/[^\s)\]]+|www\.[^\s)\]]+/g) || [];
    const codeBlockMatches = content.match(/```[\s\S]*?```/g) || [];
    const inlineCodeMatches = content.match(/`[^`]+`/g) || [];
    const listItemMatches = content.match(/^[\s]*[-*+]\s|^[\s]*\d+\.\s/gm) || [];
    const mediaMatches = content.match(/!\[.*?\]\(.*?\)|<img\s/gi) || [];

    const linkCount = linkMatches.length;
    const codeBlockCount = codeBlockMatches.length + Math.floor(inlineCodeMatches.length / 3);
    const listItemCount = listItemMatches.length;
    const mediaCount = mediaMatches.length;

    // Determine if specification
    let specScore = 0;
    const reasons: string[] = [];

    // Word count indicator
    if (wordCount >= this.config.minWordsForSpec) {
      specScore += 0.3;
      reasons.push(`word_count:${wordCount}`);
    } else if (wordCount >= this.config.minWordsForSpec * 0.5) {
      specScore += 0.15;
    }

    // Structural indicators
    if (codeBlockCount >= 2) {
      specScore += 0.2;
      reasons.push(`code_blocks:${codeBlockCount}`);
    }

    if (listItemCount >= 5) {
      specScore += 0.15;
      reasons.push(`list_items:${listItemCount}`);
    }

    // Pattern matching
    for (const pattern of this.config.specIndicators) {
      if (pattern.test(content)) {
        specScore += 0.1;
        reasons.push(`pattern_match:${pattern.source.slice(0, 20)}`);
        break;
      }
    }

    // Metadata hints
    if (metadata?.title) {
      const titleLower = metadata.title.toLowerCase();
      if (titleLower.includes("spec") || titleLower.includes("proposal") || 
          titleLower.includes("rfc") || titleLower.includes("design")) {
        specScore += 0.25;
        reasons.push("title_indicator");
      }
    }

    if (metadata?.labels) {
      const specLabels = ["specification", "proposal", "enhancement", "rfc"];
      if (metadata.labels.some(l => specLabels.includes(l.toLowerCase()))) {
        specScore += 0.2;
        reasons.push("label_indicator");
      }
    }

    const isSpecification = specScore >= 0.5;
    const specConfidence = Math.min(specScore, 1.0);

    return {
      wordCount,
      linkCount,
      codeBlockCount,
      listItemCount,
      mediaCount,
      isSpecification,
      specConfidence,
    };
  }
}

// ============================================================================
// REWARD CALCULATOR
// ============================================================================

/**
 * Calculates adjusted rewards for specification authors.
 */
export class SpecRewardCalculator {
  private config: SpecRewardConfig;

  constructor(config: SpecRewardConfig) {
    this.config = config;
  }

  /**
   * Calculate adjusted reward with differential multipliers.
   * 
   * @param components - Reward components from content analysis
   * @param isAuthor - Whether the commenter is the spec author
   * @param breakdown - Content breakdown for reference
   * @returns Adjusted reward result
   */
  calculate(
    components: RewardComponent[],
    isAuthor: boolean,
    breakdown: SpecContentBreakdown
  ): AdjustedSpecReward {
    let wordComponent = 0n;
    let elementComponent = 0n;
    const capsTriggered: string[] = [];

    const wordMultiplier = isAuthor ? this.config.authorWordMultiplier : 1.0;
    const elementMultiplier = isAuthor ? this.config.authorElementMultiplier : 1.0;

    // Apply deprecation to word count weight if enabled
    let effectiveWordMultiplier = wordMultiplier;
    if (this.config.wordCountDeprecation.enabled) {
      effectiveWordMultiplier *= this.config.wordCountDeprecation.currentWeight;
    }

    for (const comp of components) {
      let componentValue = comp.baseValue;

      if (comp.type === "word_count") {
        // Apply author multiplier ONLY to word count
        const multiplierBps = Math.round(effectiveWordMultiplier * 10000);
        componentValue = (componentValue * BigInt(multiplierBps)) / 10000n;
        wordComponent += componentValue;
      } else {
        // Element components get element multiplier (typically 1.0)
        let adjustedValue = componentValue;
        
        // Apply per-link cap
        if (comp.type === "link" && this.config.maxRewardPerLink > 0n) {
          const cappedValue = this.config.maxRewardPerLink * BigInt(comp.count);
          if (adjustedValue > cappedValue) {
            capsTriggered.push(`per_link_cap:${comp.count}x${this.formatWei(this.config.maxRewardPerLink)}`);
            adjustedValue = cappedValue;
          }
        }

        // Apply diminishing returns if configured
        if (this.config.useDiminishingReturns && comp.count > this.config.diminishingThreshold) {
          const excess = comp.count - this.config.diminishingThreshold;
          const decayMultiplier = Math.pow(this.config.diminishingDecayFactor, excess / 10);
          const decayBps = Math.round(decayMultiplier * 10000);
          const basePortion = (adjustedValue * BigInt(Math.round(this.config.diminishingThreshold / comp.count * 10000))) / 10000n;
          const excessPortion = (adjustedValue * BigInt(decayBps)) / 10000n;
          adjustedValue = basePortion + excessPortion;
          capsTriggered.push(`diminishing_returns:${comp.type}`);
        }

        // Apply element multiplier
        const elemMultBps = Math.round(elementMultiplier * 10000);
        adjustedValue = (adjustedValue * BigInt(elemMultBps)) / 10000n;

        elementComponent += adjustedValue;
      }
    }

    // Apply total element cap
    if (this.config.maxTotalElementReward > 0n && elementComponent > this.config.maxTotalElementReward) {
      capsTriggered.push(`total_element_cap:${this.formatWei(this.config.maxTotalElementReward)}`);
      elementComponent = this.config.maxTotalElementReward;
    }

    const originalTotal = components.reduce((sum, c) => sum + c.baseValue, 0n);
    const adjustedTotal = wordComponent + elementComponent;

    return {
      originalTotal,
      adjustedTotal,
      wordComponent,
      elementComponent,
      appliedWordMultiplier: effectiveWordMultiplier,
      appliedElementMultiplier: elementMultiplier,
      capsTriggered,
      breakdown,
    };
  }

  /**
   * Build reward components from content breakdown.
   */
  buildComponents(breakdown: SpecContentBreakdown, rates: {
    perWord: bigint;
    perLink: bigint;
    perCodeBlock: bigint;
    perListItem: bigint;
    perMedia: bigint;
  }): RewardComponent[] {
    const components: RewardComponent[] = [];

    if (breakdown.wordCount > 0) {
      components.push({
        type: "word_count",
        baseValue: BigInt(breakdown.wordCount) * rates.perWord,
        count: breakdown.wordCount,
        unitRate: rates.perWord,
      });
    }

    if (breakdown.linkCount > 0) {
      components.push({
        type: "link",
        baseValue: BigInt(breakdown.linkCount) * rates.perLink,
        count: breakdown.linkCount,
        unitRate: rates.perLink,
      });
    }

    if (breakdown.codeBlockCount > 0) {
      components.push({
        type: "code_block",
        baseValue: BigInt(breakdown.codeBlockCount) * rates.perCodeBlock,
        count: breakdown.codeBlockCount,
        unitRate: rates.perCodeBlock,
      });
    }

    if (breakdown.listItemCount > 0) {
      components.push({
        type: "list_item",
        baseValue: BigInt(breakdown.listItemCount) * rates.perListItem,
        count: breakdown.listItemCount,
        unitRate: rates.perListItem,
      });
    }

    if (breakdown.mediaCount > 0) {
      components.push({
        type: "media",
        baseValue: BigInt(breakdown.mediaCount) * rates.perMedia,
        count: breakdown.mediaCount,
        unitRate: rates.perMedia,
      });
    }

    return components;
  }

  private formatWei(amount: bigint): string {
    const str = amount.toString().padStart(19, "0");
    const intPart = str.slice(0, -18) || "0";
    const decPart = str.slice(-18).replace(/0+$/, "") || "0";
    return `${intPart}.${decPart.slice(0, 4)}`;
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_SPEC_REWARD_CONFIG: SpecRewardConfig = {
  authorWordMultiplier: 3.0,      // 3x on words only
  authorElementMultiplier: 1.0,   // No multiplier on elements
  maxRewardPerLink: 5000000000000000000n, // 5 UBQ per link max
  maxTotalElementReward: 50000000000000000000n, // 50 UBQ element cap
  minWordsForSpec: 100,
  specIndicators: [
    /\b(specification|spec|proposal|rfc|design doc|technical design)\b/i,
    /\b(requirements|acceptance criteria|success metrics)\b/i,
    /\b(architecture|implementation plan|migration strategy)\b/i,
    /^#+\s*(overview|background|motivation|goals|non-goals)/im,
  ],
  useDiminishingReturns: true,
  diminishingDecayFactor: 0.7,
  diminishingThreshold: 10,
  wordCountDeprecation: {
    enabled: false,
    currentWeight: 1.0,
    monthlyDecayRate: 0.1,
  },
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for reward calculation pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Adjust spec author rewards to apply multipliers only to word count.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#171
 */

import { 
  SpecificationDetector,
  SpecRewardCalculator,
  DEFAULT_SPEC_REWARD_CONFIG,
  AdjustedSpecReward
} from "./spec-author-rewards-adjustment";

const detector = new SpecificationDetector(DEFAULT_SPEC_REWARD_CONFIG);
const calculator = new SpecRewardCalculator(DEFAULT_SPEC_REWARD_CONFIG);

// Standard rates (from existing config)
const RATES = {
  perWord: 100000000000000000n,      // 0.1 UBQ per word
  perLink: 15000000000000000000n,     // 15 UBQ per link (will be capped)
  perCodeBlock: 5000000000000000000n, // 5 UBQ per code block
  perListItem: 1000000000000000000n,  // 1 UBQ per list item
  perMedia: 3000000000000000000n,     // 3 UBQ per media
};

/**
 * FIXED: Calculate spec author reward with differential multipliers.
 * Replaces flat 3x multiplier that inflated element rewards.
 */
export function calculateSpecAuthorReward(
  content: string,
  isAuthor: boolean,
  metadata?: { title?: string; labels?: string[] }
): AdjustedSpecReward {
  // Analyze content
  const breakdown = detector.analyze(content, metadata);
  
  // Build reward components
  const components = calculator.buildComponents(breakdown, RATES);
  
  // Calculate with adjusted multipliers
  return calculator.calculate(components, isAuthor, breakdown);
}

/**
 * Check if content qualifies as a specification.
 */
export function isSpecification(content: string, metadata?: { title?: string; labels?: string[] }): boolean {
  const breakdown = detector.analyze(content, metadata);
  return breakdown.isSpecification;
}
`;
}

/**
 * Format reward adjustment disclosure for transparency.
 */
export function formatRewardAdjustment(result: AdjustedSpecReward, authorName: string): string {
  if (result.originalTotal === result.adjustedTotal && result.capsTriggered.length === 0) {
    return "";
  }

  const lines: string[] = [
    `### 💰 Specification Author Reward Adjustment`,
    ``,
    `**Author:** @${authorName}`,
    `**Spec Confidence:** ${(result.breakdown.specConfidence * 100).toFixed(0)}%`,
    ``,
    `| Component | Value |`,
    `|-----------|-------|`,
    `| Words (${result.breakdown.wordCount}) × ${result.appliedWordMultiplier.toFixed(1)}x | ${formatWei(result.wordComponent)} UBQ |`,
    `| Elements (links:${result.breakdown.linkCount}, code:${result.breakdown.codeBlockCount}) × ${result.appliedElementMultiplier.toFixed(1)}x | ${formatWei(result.elementComponent)} UBQ |`,
    `| **Total** | **${formatWei(result.adjustedTotal)} UBQ** |`,
    ``,
  ];

  if (result.capsTriggered.length > 0) {
    lines.push(`**Caps Applied:**`);
    for (const cap of result.capsTriggered) {
      lines.push(`- ${cap}`);
    }
    lines.push(``);
  }

  if (result.originalTotal !== result.adjustedTotal) {
    const diff = result.originalTotal - result.adjustedTotal;
    const sign = diff > 0n ? "-" : "+";
    lines.push(`*Original calculation: ${formatWei(result.originalTotal)} UBQ (${sign}${formatWei(diff > 0n ? diff : -diff)} adjustment)*`);
  }

  lines.push(``);
  lines.push(`*Author multiplier (${result.appliedWordMultiplier}x) applies only to word count. Element rewards use standard rates with caps to prevent farming.*`);

  return lines.join("\\n");
}

function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 4)}\`;
}
