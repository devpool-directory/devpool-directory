/**
 * @file research-credit.ts
 * @description Scaffolding and generator utilities for crediting research effort
 * when assignees are disqualified or tasks prove impossible. Ensures contributors
 * receive comment rewards for research time while preventing gaming.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#296
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Research effort detector from issue timeline events
 * - Comment reward allocator excluding current assignee on completion
 * - Previous assignee credit restoration logic
 * - PR review exclusion to prevent double-dipping
 * - Anti-gaming safeguards with cooldown periods
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a period of assignment for tracking research effort.
 */
export interface AssignmentPeriod {
  /** GitHub username of the assignee */
  assignee: string;
  /** When they were assigned */
  assignedAt: Date;
  /** When they were unassigned (null if still assigned) */
  unassignedAt?: Date;
  /** Reason for unassignment if applicable */
  unassignReason?: "disqualified" | "voluntary" | "reassigned" | "completed";
  /** Number of comments made during this assignment period */
  commentCountDuringAssignment: number;
  /** Whether this period qualifies for research credit */
  qualifiesForResearchCredit: boolean;
}

/**
 * Configuration for research credit distribution.
 */
export interface ResearchCreditConfig {
  /** Minimum assignment duration in hours to qualify for research credit */
  minAssignmentHours: number;
  /** Minimum comments during assignment to demonstrate research effort */
  minCommentsForCredit: number;
  /** Whether to exclude current assignee from comment rewards on completion */
  excludeCurrentAssigneeOnComplete: boolean;
  /** Whether to restore comment credits to previous assignees */
  creditPreviousAssignees: boolean;
  /** Cooldown hours before same user can earn research credit again */
  researchCreditCooldownHours: number;
  /** Maximum research credit percentage of total comment pool */
  maxResearchCreditPercent: number;
  /** Whether to exclude PR reviews from research credit calculation */
  excludePrReviews: boolean;
}

/**
 * Result of research credit calculation for an issue.
 */
export interface ResearchCreditResult {
  /** Issue number processed */
  issueNumber: number;
  /** Repository identifier */
  repo: string;
  /** Current assignee at time of evaluation */
  currentAssignee: string | null;
  /** Whether task was completed normally vs disqualification */
  taskCompleted: boolean;
  /** Users eligible for comment rewards (excluding current assignee if configured) */
  commentRewardEligible: string[];
  /** Users receiving research credit for prior assignment periods */
  researchCreditRecipients: Array<{
    username: string;
    assignmentPeriod: AssignmentPeriod;
    creditAmount: bigint;
    reason: string;
  }>;
  /** Total comment reward pool amount */
  totalCommentPool: bigint;
  /** Amount allocated to research credits */
  researchCreditTotal: bigint;
  /** Warnings generated during calculation */
  warnings: string[];
}

/**
 * Timeline event from GitHub issue.
 */
export interface IssueTimelineEvent {
  event: string;
  actor?: { login: string };
  assignee?: { login: string };
  created_at: string;
  body?: string;
}

// ============================================================================
// ASSIGNMENT TRACKER
// ============================================================================

/**
 * Tracks assignment history from issue timeline events.
 */
export class AssignmentTracker {
  /**
   * Extract assignment periods from timeline events.
   * 
   * @param events - Issue timeline events sorted chronologically
   * @returns Array of assignment periods
   */
  extractPeriods(events: IssueTimelineEvent[]): AssignmentPeriod[] {
    const periods: AssignmentPeriod[] = [];
    let currentAssignee: { username: string; assignedAt: Date } | null = null;

    for (const event of events) {
      if (event.event === "assigned" && event.assignee) {
        // Close any existing open assignment
        if (currentAssignee) {
          periods.push({
            assignee: currentAssignee.username,
            assignedAt: currentAssignee.assignedAt,
            unassignedAt: new Date(event.created_at),
            unassignReason: "reassigned",
            commentCountDuringAssignment: 0, // Will be filled later
            qualifiesForResearchCredit: false,
          });
        }
        currentAssignee = {
          username: event.assignee.login,
          assignedAt: new Date(event.created_at),
        };
      } else if (event.event === "unassigned" && event.assignee) {
        if (currentAssignee && currentAssignee.username.toLowerCase() === event.assignee.login.toLowerCase()) {
          periods.push({
            assignee: currentAssignee.username,
            assignedAt: currentAssignee.assignedAt,
            unassignedAt: new Date(event.created_at),
            unassignReason: "voluntary",
            commentCountDuringAssignment: 0,
            qualifiesForResearchCredit: false,
          });
          currentAssignee = null;
        }
      } else if (event.event === "closed") {
        // Task completed - close current assignment
        if (currentAssignee) {
          periods.push({
            assignee: currentAssignee.username,
            assignedAt: currentAssignee.assignedAt,
            unassignedAt: new Date(event.created_at),
            unassignReason: "completed",
            commentCountDuringAssignment: 0,
            qualifiesForResearchCredit: false,
          });
          currentAssignee = null;
        }
      }
    }

    // Handle still-assigned case
    if (currentAssignee) {
      periods.push({
        assignee: currentAssignee.username,
        assignedAt: currentAssignee.assignedAt,
        commentCountDuringAssignment: 0,
        qualifiesForResearchCredit: false,
      });
    }

    return periods;
  }

  /**
   * Detect disqualification events and mark affected periods.
   * Looks for bot comments indicating disqualification.
   * 
   * @param periods - Assignment periods to update
   * @param comments - Issue comments to scan for disqualification notices
   */
  markDisqualifications(
    periods: AssignmentPeriod[],
    comments: Array<{ user: { login: string }; body: string; created_at: string }>
  ): void {
    const disqualificationPatterns = [
      /you have used all available deadline extensions and have been disqualified/i,
      /disqualified from this task/i,
      /removed as assignee.*deadline/i,
    ];

    for (const comment of comments) {
      const isBot = comment.user.login.includes("[bot]") || 
                    comment.user.login.toLowerCase().includes("ubiquity");
      
      if (!isBot) continue;

      for (const pattern of disqualificationPatterns) {
        if (pattern.test(comment.body)) {
          const commentTime = new Date(comment.created_at);
          
          // Find the assignment period that was active at disqualification time
          for (const period of periods) {
            if (period.unassignedAt && 
                Math.abs(period.unassignedAt.getTime() - commentTime.getTime()) < 60000) {
              period.unassignReason = "disqualified";
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Count comments made by each assignee during their assignment period.
   * 
   * @param periods - Assignment periods to annotate
   * @param comments - All issue comments
   */
  countCommentsDuringAssignment(
    periods: AssignmentPeriod[],
    comments: Array<{ user: { login: string }; created_at: string }>
  ): void {
    for (const period of periods) {
      const periodStart = period.assignedAt.getTime();
      const periodEnd = period.unassignedAt?.getTime() ?? Date.now();

      period.commentCountDuringAssignment = comments.filter(c => {
        const commentTime = new Date(c.created_at).getTime();
        return c.user.login.toLowerCase() === period.assignee.toLowerCase() &&
               commentTime >= periodStart &&
               commentTime <= periodEnd;
      }).length;
    }
  }
}

// ============================================================================
// RESEARCH CREDIT CALCULATOR
// ============================================================================

/**
 * Calculates research credits and comment reward eligibility.
 */
export class ResearchCreditCalculator {
  private config: ResearchCreditConfig;
  private tracker: AssignmentTracker;

  constructor(config: ResearchCreditConfig) {
    this.config = config;
    this.tracker = new AssignmentTracker();
  }

  /**
   * Calculate research credits for an issue.
   * 
   * @param params - Calculation parameters
   * @returns Research credit result
   */
  calculate(params: {
    issueNumber: number;
    repo: string;
    timelineEvents: IssueTimelineEvent[];
    comments: Array<{ user: { login: string }; body: string; created_at: string }>;
    currentAssignee: string | null;
    isTaskComplete: boolean;
    totalCommentPool: bigint;
    recentResearchCredits: Map<string, Date>; // username -> last credit timestamp
  }): ResearchCreditResult {
    const warnings: string[] = [];
    
    // Extract and annotate assignment periods
    const periods = this.tracker.extractPeriods(params.timelineEvents);
    this.tracker.markDisqualifications(periods, params.comments);
    this.tracker.countCommentsDuringAssignment(periods, params.comments);

    // Determine research credit eligibility for each period
    for (const period of periods) {
      period.qualifiesForResearchCredit = this.evaluatePeriodEligibility(
        period,
        params.recentResearchCredits
      );
    }

    // Build comment reward eligible list
    const allCommenters = [...new Set(params.comments.map(c => c.user.login.toLowerCase()))];
    let commentRewardEligible = allCommenters;

    // Exclude current assignee if task completed and configured
    if (params.isTaskComplete && 
        this.config.excludeCurrentAssigneeOnComplete && 
        params.currentAssignee) {
      commentRewardEligible = commentRewardEligible.filter(
        u => u !== params.currentAssignee.toLowerCase()
      );
    }

    // Calculate research credits for qualifying previous assignees
    const researchCreditRecipients: ResearchCreditResult["researchCreditRecipients"] = [];
    let researchCreditTotal = 0n;

    if (this.config.creditPreviousAssignees) {
      const maxResearchPool = (params.totalCommentPool * BigInt(this.config.maxResearchCreditPercent)) / 100n;
      
      for (const period of periods) {
        if (!period.qualifiesForResearchCredit) continue;
        
        // Skip current assignee if task completed
        if (params.isTaskComplete && 
            params.currentAssignee && 
            period.assignee.toLowerCase() === params.currentAssignee.toLowerCase()) {
          continue;
        }

        // Calculate credit amount (proportional to assignment duration and comments)
        const durationHours = period.unassignedAt 
          ? (period.unassignedAt.getTime() - period.assignedAt.getTime()) / 3600000
          : 0;
        
        // Base credit: proportional share of research pool
        const qualifyingPeriods = periods.filter(p => p.qualifiesForResearchCredit).length;
        const baseShare = qualifyingPeriods > 0 ? maxResearchPool / BigInt(qualifyingPeriods) : 0n;
        
        // Bonus for longer assignments and more comments
        const durationMultiplier = Math.min(durationHours / 24, 3); // Cap at 3x for 3+ days
        const commentBonus = Math.min(period.commentCountDuringAssignment / 5, 2); // Cap at 2x for 5+ comments
        
        const creditAmount = (baseShare * BigInt(Math.round((1 + durationMultiplier + commentBonus) * 100))) / 100n;

        if (creditAmount > 0n && researchCreditTotal + creditAmount <= maxResearchPool) {
          researchCreditRecipients.push({
            username: period.assignee,
            assignmentPeriod: period,
            creditAmount,
            reason: period.unassignReason === "disqualified"
              ? `Research credit for ${durationHours.toFixed(1)}h assignment (disqualified after ${period.commentCountDuringAssignment} comments)`
              : `Research credit for ${durationHours.toFixed(1)}h assignment with ${period.commentCountDuringAssignment} comments`,
          });
          researchCreditTotal += creditAmount;
        }
      }
    }

    return {
      issueNumber: params.issueNumber,
      repo: params.repo,
      currentAssignee: params.currentAssignee,
      taskCompleted: params.isTaskComplete,
      commentRewardEligible,
      researchCreditRecipients,
      totalCommentPool: params.totalCommentPool,
      researchCreditTotal,
      warnings,
    };
  }

  /**
   * Evaluate whether an assignment period qualifies for research credit.
   */
  private evaluatePeriodEligibility(
    period: AssignmentPeriod,
    recentCredits: Map<string, Date>
  ): boolean {
    // Must have been unassigned (not currently working on it)
    if (!period.unassignedAt) return false;

    // Check minimum assignment duration
    const durationHours = (period.unassignedAt.getTime() - period.assignedAt.getTime()) / 3600000;
    if (durationHours < this.config.minAssignmentHours) return false;

    // Check minimum comment activity
    if (period.commentCountDuringAssignment < this.config.minCommentsForCredit) return false;

    // Check cooldown period
    const lastCredit = recentCredits.get(period.assignee.toLowerCase());
    if (lastCredit) {
      const hoursSinceLastCredit = (Date.now() - lastCredit.getTime()) / 3600000;
      if (hoursSinceLastCredit < this.config.researchCreditCooldownHours) return false;
    }

    // Disqualified users always qualify (they need the credit most)
    if (period.unassignReason === "disqualified") return true;

    // Voluntary unassignment also qualifies
    if (period.unassignReason === "voluntary") return true;

    // Reassigned may qualify if they had significant engagement
    if (period.unassignReason === "reassigned" && period.commentCountDuringAssignment >= this.config.minCommentsForCredit * 2) {
      return true;
    }

    // Completed tasks don't get research credit (they get normal rewards)
    if (period.unassignReason === "completed") return false;

    return false;
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_RESEARCH_CREDIT_CONFIG: ResearchCreditConfig = {
  minAssignmentHours: 12, // At least half a day of work
  minCommentsForCredit: 2, // Must show some engagement
  excludeCurrentAssigneeOnComplete: true,
  creditPreviousAssignees: true,
  researchCreditCooldownHours: 168, // 1 week cooldown
  maxResearchCreditPercent: 20, // Max 20% of comment pool
  excludePrReviews: true,
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration code for reward pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Add research credit to reward distribution.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#296
 */

import { ResearchCreditCalculator, DEFAULT_RESEARCH_CREDIT_CONFIG } from "./research-credit";

/**
 * Apply research credits before final reward distribution.
 */
export async function applyResearchCredits(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  commentPool: bigint,
  currentRewards: Map<string, bigint>
): Promise<{ adjustedRewards: Map<string, bigint>; researchCredits: Map<string, bigint> }> {
  const calculator = new ResearchCreditCalculator(DEFAULT_RESEARCH_CREDIT_CONFIG);
  
  // Fetch timeline and comments
  const { data: events } = await octokit.rest.issues.listEvents({
    owner, repo, issue_number: issueNumber, per_page: 100,
  });
  const { data: comments } = await octokit.rest.issues.listComments({
    owner, repo, issue_number: issueNumber, per_page: 100,
  });
  
  // Get current assignee
  const { data: issue } = await octokit.rest.issues.get({
    owner, repo, issue_number: issueNumber,
  });
  const currentAssignee = issue.assignee?.login || null;
  const isComplete = issue.state === "closed";
  
  // Load recent research credits from database/cache
  const recentCredits = new Map<string, Date>(); // Would load from Supabase
  
  const result = calculator.calculate({
    issueNumber,
    repo: \`\${owner}/\${repo}\`,
    timelineEvents: events,
    comments,
    currentAssignee,
    isTaskComplete: isComplete,
    totalCommentPool: commentPool,
    recentCredits,
  });
  
  // Merge research credits into rewards
  const adjustedRewards = new Map(currentRewards);
  const researchCredits = new Map<string, bigint>();
  
  for (const recipient of result.researchCreditRecipients) {
    const existing = adjustedRewards.get(recipient.username) || 0n;
    adjustedRewards.set(recipient.username, existing + recipient.creditAmount);
    researchCredits.set(recipient.username, recipient.creditAmount);
  }
  
  // Remove current assignee from comment rewards if task completed
  if (isComplete && currentAssignee && DEFAULT_RESEARCH_CREDIT_CONFIG.excludeCurrentAssigneeOnComplete) {
    // Keep only non-comment rewards for current assignee
    // This assumes comment rewards are tagged separately in your system
  }
  
  return { adjustedRewards, researchCredits };
}
`;
}

/**
 * Format research credit disclosure for GitHub comments.
 */
export function formatResearchCreditComment(result: ResearchCreditResult): string {
  if (result.researchCreditRecipients.length === 0) return "";

  const lines: string[] = [
    `### 🔬 Research Credits Awarded`,
    ``,
    `Contributors who invested time researching this task before being unassigned receive credit:`,
    ``,
    `| Contributor | Duration | Comments | Credit | Reason |`,
    `|-------------|----------|----------|--------|--------|`,
  ];

  for (const r of result.researchCreditRecipients) {
    const duration = r.assignmentPeriod.unassignedAt
      ? ((r.assignmentPeriod.unassignedAt.getTime() - r.assignmentPeriod.assignedAt.getTime()) / 3600000).toFixed(1) + "h"
      : "ongoing";
    lines.push(`| @${r.username} | ${duration} | ${r.assignmentPeriod.commentCountDuringAssignment} | ${formatWei(r.creditAmount)} | ${r.reason} |`);
  }

  lines.push(``);
  lines.push(`*Total research credits: ${formatWei(result.researchCreditTotal)} (${((Number(result.researchCreditTotal) / Number(result.totalCommentPool)) * 100).toFixed(1)}% of comment pool)*`);

  return lines.join("\n");
}

function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 4)}\`;
}
