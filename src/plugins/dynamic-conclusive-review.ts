/**
 * @file dynamic-conclusive-review.ts
 * @description Scaffolding and generator utilities for implementing dynamic
 * conclusive review scoring based on contributor XP. Ensures review rewards
 * are weighted by repository expertise to prevent farming by new accounts.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#221
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - XP-based review weight calculator with configurable tiers
 * - Contributor reputation fetcher from XP/Supabase systems
 * - Minimum XP threshold enforcement for review eligibility
 * - Dynamic multiplier application to base review rewards
 * - Integration patch for review incentive pipeline
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * XP tier definitions for review weight calculation.
 */
export enum XpTier {
  /** New contributor, minimal trust */
  NEWCOMER = "newcomer",
  /** Established contributor with some history */
  CONTRIBUTOR = "contributor",
  /** Experienced contributor with significant XP */
  EXPERT = "expert",
  /** Core maintainer level XP */
  MAINTAINER = "maintainer",
}

/**
 * Configuration for XP-based review weighting.
 */
export interface ReviewWeightConfig {
  /** Minimum XP required to earn any review reward */
  minXpForReward: number;
  /** XP thresholds for each tier */
  tierThresholds: Record<XpTier, number>;
  /** Multiplier applied to base reward for each tier */
  tierMultipliers: Record<XpTier, number>;
  /** Whether to completely block rewards below minimum XP */
  blockBelowMinimum: boolean;
  /** Maximum multiplier cap to prevent excessive rewards */
  maxMultiplier: number;
  /** Whether to use logarithmic scaling instead of discrete tiers */
  useLogarithmicScaling: boolean;
  /** Base XP value for logarithmic calculation */
  logBase: number;
}

/**
 * Contributor XP profile for review weighting.
 */
export interface ContributorXpProfile {
  username: string;
  totalXp: number;
  repoXp: number;
  tier: XpTier;
  multiplier: number;
  isEligible: boolean;
  xpSource: "supabase" | "github-contributions" | "fallback";
}

/**
 * Result of applying XP-based weight to a review reward.
 */
export interface WeightedReviewReward {
  reviewer: string;
  baseReward: bigint;
  xpMultiplier: number;
  weightedReward: bigint;
  tier: XpTier;
  wasBlocked: boolean;
  blockReason?: string;
}

// ============================================================================
// XP TIER CALCULATOR
// ============================================================================

/**
 * Calculates review weights based on contributor XP levels.
 */
export class ReviewWeightCalculator {
  private config: ReviewWeightConfig;

  constructor(config: ReviewWeightConfig) {
    this.config = config;
  }

  /**
   * Determine XP tier for a contributor.
   * 
   * @param repoXp - XP earned in the specific repository
   * @returns Assigned tier
   */
  determineTier(repoXp: number): XpTier {
    if (repoXp >= this.config.tierThresholds[XpTier.MAINTAINER]) return XpTier.MAINTAINER;
    if (repoXp >= this.config.tierThresholds[XpTier.EXPERT]) return XpTier.EXPERT;
    if (repoXp >= this.config.tierThresholds[XpTier.CONTRIBUTOR]) return XpTier.CONTRIBUTOR;
    return XpTier.NEWCOMER;
  }

  /**
   * Calculate reward multiplier based on XP.
   * Supports both discrete tiers and logarithmic scaling.
   * 
   * @param repoXp - Repository-specific XP
   * @param tier - Pre-calculated tier (optional)
   * @returns Multiplier to apply to base reward
   */
  calculateMultiplier(repoXp: number, tier?: XpTier): number {
    // Check minimum threshold
    if (this.config.blockBelowMinimum && repoXp < this.config.minXpForReward) {
      return 0;
    }

    let multiplier: number;

    if (this.config.useLogarithmicScaling) {
      // Logarithmic scaling: multiplier = log_base(xp + 1)
      const rawMultiplier = Math.log(repoXp + 1) / Math.log(this.config.logBase);
      multiplier = Math.min(rawMultiplier, this.config.maxMultiplier);
    } else {
      // Discrete tier-based multiplier
      const effectiveTier = tier || this.determineTier(repoXp);
      multiplier = this.config.tierMultipliers[effectiveTier];
    }

    // Apply minimum floor if not blocking
    if (!this.config.blockBelowMinimum && repoXp < this.config.minXpForReward) {
      multiplier = Math.min(multiplier, 0.1); // Token reward only
    }

    return Math.min(multiplier, this.config.maxMultiplier);
  }

  /**
   * Build complete XP profile for a contributor.
   * 
   * @param username - GitHub username
   * @param repoXp - XP in the target repository
   * @param totalXp - Total XP across all repos
   * @param source - Where XP data came from
   * @returns Complete contributor profile
   */
  buildProfile(
    username: string,
    repoXp: number,
    totalXp: number = 0,
    source: ContributorXpProfile["xpSource"] = "fallback"
  ): ContributorXpProfile {
    const tier = this.determineTier(repoXp);
    const multiplier = this.calculateMultiplier(repoXp, tier);
    const isEligible = !this.config.blockBelowMinimum || repoXp >= this.config.minXpForReward;

    return {
      username,
      totalXp,
      repoXp,
      tier,
      multiplier,
      isEligible,
      xpSource: source,
    };
  }

  /**
   * Apply XP weighting to a review reward.
   * 
   * @param reviewer - Reviewer username
   * @param baseReward - Original calculated reward
   * @param profile - Contributor XP profile
   * @returns Weighted reward result
   */
  applyWeight(
    reviewer: string,
    baseReward: bigint,
    profile: ContributorXpProfile
  ): WeightedReviewReward {
    if (!profile.isEligible) {
      return {
        reviewer,
        baseReward,
        xpMultiplier: 0,
        weightedReward: 0n,
        tier: profile.tier,
        wasBlocked: true,
        blockReason: `Insufficient XP (${profile.repoXp} < ${this.config.minXpForReward} minimum)`,
      };
    }

    const multiplierBps = Math.round(profile.multiplier * 10000);
    const weightedReward = (baseReward * BigInt(multiplierBps)) / 10000n;

    return {
      reviewer,
      baseReward,
      xpMultiplier: profile.multiplier,
      weightedReward,
      tier: profile.tier,
      wasBlocked: false,
    };
  }
}

// ============================================================================
// XP DATA FETCHER
// ============================================================================

/**
 * Fetches contributor XP data from various sources.
 */
export class XpDataFetcher {
  private cache: Map<string, ContributorXpProfile> = new Map();

  /**
   * Fetch XP profile for a contributor.
   * Tries multiple sources in priority order.
   * 
   * @param username - GitHub username
   * @param repoOwner - Repository owner
   * @param repoName - Repository name
   * @param calculator - Weight calculator for profile building
   * @returns Contributor XP profile
   */
  async fetchProfile(
    username: string,
    repoOwner: string,
    repoName: string,
    calculator: ReviewWeightCalculator
  ): Promise<ContributorXpProfile> {
    const cacheKey = `${username}:${repoOwner}/${repoName}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Try Supabase first (primary XP store)
    try {
      const supabaseProfile = await this.fetchFromSupabase(username, repoOwner, repoName);
      if (supabaseProfile) {
        const profile = calculator.buildProfile(
          username,
          supabaseProfile.repoXp,
          supabaseProfile.totalXp,
          "supabase"
        );
        this.cache.set(cacheKey, profile);
        return profile;
      }
    } catch (error) {
      console.warn(`[XP] Supabase fetch failed for ${username}:`, error);
    }

    // Fallback: Estimate from GitHub contributions
    try {
      const githubXp = await this.estimateFromGitHub(username, repoOwner, repoName);
      const profile = calculator.buildProfile(
        username,
        githubXp,
        githubXp,
        "github-contributions"
      );
      this.cache.set(cacheKey, profile);
      return profile;
    } catch (error) {
      console.warn(`[XP] GitHub estimation failed for ${username}:`, error);
    }

    // Final fallback: Zero XP newcomer
    const profile = calculator.buildProfile(username, 0, 0, "fallback");
    this.cache.set(cacheKey, profile);
    return profile;
  }

  /**
   * Fetch XP from Supabase XP tracking system.
   */
  private async fetchFromSupabase(
    username: string,
    repoOwner: string,
    repoName: string
  ): Promise<{ repoXp: number; totalXp: number } | null> {
    // In production, this would query the XP table
    // const { data } = await supabase
    //   .from('user_xp')
    //   .select('repo_xp, total_xp')
    //   .eq('username', username)
    //   .eq('repo', `${repoOwner}/${repoName}`)
    //   .single();
    
    // Placeholder for scaffolding
    console.warn("[XP] Supabase integration requires client initialization");
    return null;
  }

  /**
   * Estimate XP from GitHub contribution history.
   * Used as fallback when XP system is unavailable.
   */
  private async estimateFromGitHub(
    username: string,
    repoOwner: string,
    repoName: string
  ): Promise<number> {
    // In production, query GitHub API for merged PRs, reviews, etc.
    // const { data: prs } = await octokit.rest.pulls.list({
    //   owner: repoOwner,
    //   repo: repoName,
    //   state: 'closed',
    //   sort: 'created',
    //   direction: 'desc',
    // });
    // const mergedPrs = prs.filter(pr => pr.user?.login === username && pr.merged_at);
    // return mergedPrs.length * 10; // Simple heuristic
    
    console.warn("[XP] GitHub contribution estimation requires Octokit");
    return 0;
  }

  /**
   * Clear the XP cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_REVIEW_WEIGHT_CONFIG: ReviewWeightConfig = {
  minXpForReward: 50,
  tierThresholds: {
    [XpTier.NEWCOMER]: 0,
    [XpTier.CONTRIBUTOR]: 100,
    [XpTier.EXPERT]: 500,
    [XpTier.MAINTAINER]: 2000,
  },
  tierMultipliers: {
    [XpTier.NEWCOMER]: 0.0,   // Blocked or token only
    [XpTier.CONTRIBUTOR]: 0.5, // 50% of base reward
    [XpTier.EXPERT]: 1.0,      // Full reward
    [XpTier.MAINTAINER]: 1.5,  // 150% bonus
  },
  blockBelowMinimum: true,
  maxMultiplier: 2.0,
  useLogarithmicScaling: false,
  logBase: 10,
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for review incentive pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Apply XP-based weighting to review rewards.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#221
 */

import { 
  ReviewWeightCalculator, 
  XpDataFetcher,
  DEFAULT_REVIEW_WEIGHT_CONFIG,
  WeightedReviewReward
} from "./dynamic-conclusive-review";

const calculator = new ReviewWeightCalculator(DEFAULT_REVIEW_WEIGHT_CONFIG);
const xpFetcher = new XpDataFetcher();

/**
 * FIXED: Calculate review rewards with XP-based weighting.
 * Replaces flat review rewards that were easy to farm.
 */
export async function calculateXpWeightedReviewRewards(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  baseRewards: Map<string, bigint>
): Promise<{
  weightedRewards: Map<string, bigint>;
  blockedReviewers: string[];
  auditLog: string[];
}> {
  const weightedRewards = new Map<string, bigint>();
  const blockedReviewers: string[] = [];
  const auditLog: string[] = [];

  for (const [reviewer, baseReward] of baseRewards) {
    // Fetch XP profile
    const profile = await xpFetcher.fetchProfile(reviewer, owner, repo, calculator);
    
    // Apply weighting
    const result = calculator.applyWeight(reviewer, baseReward, profile);
    
    if (result.wasBlocked) {
      blockedReviewers.push(reviewer);
      auditLog.push(\`BLOCKED: @\${reviewer} - \${result.blockReason}\`);
    } else {
      weightedRewards.set(reviewer, result.weightedReward);
      
      if (result.xpMultiplier !== 1.0) {
        auditLog.push(
          \`ADJUSTED: @\${reviewer} \${result.tier} (\${profile.repoXp} XP) ` +
          \`multiplier=\${result.xpMultiplier.toFixed(2)} ` +
          \`base=\${baseReward} -> weighted=\${result.weightedReward}\`
        );
      }
    }
  }

  return { weightedRewards, blockedReviewers, auditLog };
}
`;
}

/**
 * Format XP weighting disclosure for GitHub comments.
 */
export function formatXpWeightingComment(results: WeightedReviewReward[]): string {
  const adjusted = results.filter(r => !r.wasBlocked && r.xpMultiplier !== 1.0);
  const blocked = results.filter(r => r.wasBlocked);

  if (adjusted.length === 0 && blocked.length === 0) return "";

  const lines: string[] = [
    `### 🎯 XP-Based Review Weighting Applied`,
    ``,
  ];

  if (adjusted.length > 0) {
    lines.push(`#### Adjusted Rewards`);
    lines.push(`| Reviewer | Tier | XP | Multiplier | Base | Final |`);
    lines.push(`|----------|------|----|------------| ----|-------|`);
    
    for (const r of adjusted) {
      lines.push(
        \`| @\${r.reviewer} | \${r.tier} | — | \${r.xpMultiplier.toFixed(2)}x | \${formatWei(r.baseReward)} | \${formatWei(r.weightedReward)} |\`
      );
    }
    lines.push(``);
  }

  if (blocked.length > 0) {
    lines.push(`#### ⛔ Blocked (Insufficient XP)`);
    for (const r of blocked) {
      lines.push(\`- @\${r.reviewer}: \${r.blockReason}\`);
    }
    lines.push(``);
  }

  lines.push(`*Review rewards are weighted by repository XP to ensure meaningful contributions are credited.*`);

  return lines.join("\\n");
}

function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 4)}\`;
}
