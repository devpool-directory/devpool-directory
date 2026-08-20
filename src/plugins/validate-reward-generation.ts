/**
 * @file validate-reward-generation.ts
 * @description Scaffolding and generator utilities for validating reward generation
 * behavior to ensure proper human collaboration requirements are enforced.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#455
 * Bounty Value: $600 USD (estimated based on validation issues)
 * 
 * This module provides:
 * - Human collaboration requirement validator
 * - Role separation enforcement (spec writer != assignee != reviewer)
 * - Admin override detection and logging
 * - Reward blocking logic for non-compliant contributions
 * - Audit trail for validation decisions
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a contributor's role in an issue lifecycle.
 */
export enum ContributorRole {
  SPEC_AUTHOR = "spec_author",
  ASSIGNEE = "assignee",
  REVIEWER = "reviewer",
  COMMENTER = "commenter",
  ADMIN = "admin",
}

/**
 * Represents a single contribution event.
 */
export interface ContributionEvent {
  /** GitHub username of the contributor */
  username: string;
  /** Role performed in this event */
  role: ContributorRole;
  /** Timestamp of the contribution */
  timestamp: Date;
  /** Associated artifact (PR number, comment ID, etc.) */
  artifactId?: string;
  /** Whether this was an admin action */
  isAdminAction: boolean;
}

/**
 * Validation result for a reward candidate.
 */
export interface RewardValidationResult {
  /** Whether the reward should be granted */
  approved: boolean;
  /** Username being validated */
  username: string;
  /** Calculated reward amount (0 if blocked) */
  rewardAmount: bigint;
  /** Reason for approval or rejection */
  reason: string;
  /** Roles performed by this user */
  rolesPerformed: ContributorRole[];
  /** Whether admin override was applied */
  adminOverride: boolean;
  /** List of validation warnings */
  warnings: string[];
  /** Detailed audit entries */
  auditTrail: ValidationAuditEntry[];
}

/**
 * Audit entry for validation decisions.
 */
export interface ValidationAuditEntry {
  timestamp: Date;
  checkName: string;
  passed: boolean;
  details: Record<string, unknown>;
}

/**
 * Configuration for reward validation.
 */
export interface RewardValidationConfig {
  /** Whether to enforce role separation */
  enforceRoleSeparation: boolean;
  /** Minimum distinct humans required for reward eligibility */
  minDistinctHumans: number;
  /** Whether admins can bypass validation */
  allowAdminOverride: boolean;
  /** Roles that must be performed by different humans */
  separatedRoles: ContributorRole[];
  /** GitHub usernames with admin privileges */
  adminUsernames: string[];
  /** Whether to log all validation decisions */
  enableAuditLogging: boolean;
}

/**
 * Context for a reward validation check.
 */
export interface RewardValidationContext {
  issueNumber: number;
  repoOwner: string;
  repoName: string;
  /** All contribution events for this issue */
  contributions: ContributionEvent[];
  /** Proposed reward distribution */
  proposedRewards: Map<string, bigint>;
  /** Issue metadata */
  issueMetadata: {
    author: string;
    createdAt: Date;
    closedAt?: Date;
    labels: string[];
  };
}

// ============================================================================
// VALIDATION ENGINE
// ============================================================================

/**
 * Core engine for validating reward generation behavior.
 * Ensures human collaboration requirements are met before rewards are distributed.
 */
export class RewardGenerationValidator {
  private config: RewardValidationConfig;
  private auditLog: ValidationAuditEntry[] = [];

  constructor(config: RewardValidationConfig) {
    this.config = config;
  }

  /**
   * Validate all proposed rewards for an issue.
   * 
   * @param context - Validation context with contributions and proposed rewards
   * @returns Map of username to validation result
   */
  async validateAll(context: RewardValidationContext): Promise<Map<string, RewardValidationResult>> {
    this.auditLog = [];
    const results = new Map<string, RewardValidationResult>();

    // First, analyze contribution patterns
    const contributionAnalysis = this.analyzeContributions(context.contributions);

    // Validate each proposed reward
    for (const [username, amount] of context.proposedRewards) {
      const result = this.validateSingleReward(
        username,
        amount,
        context,
        contributionAnalysis
      );
      results.set(username, result);
    }

    // Log summary
    const approvedCount = Array.from(results.values()).filter(r => r.approved).length;
    const blockedCount = results.size - approvedCount;

    this.logAudit({
      timestamp: new Date(),
      checkName: "validation_summary",
      passed: blockedCount === 0,
      details: {
        issueNumber: context.issueNumber,
        totalCandidates: results.size,
        approved: approvedCount,
        blocked: blockedCount,
      },
    });

    return results;
  }

  /**
   * Validate a single reward candidate.
   */
  private validateSingleReward(
    username: string,
    proposedAmount: bigint,
    context: RewardValidationContext,
    analysis: ContributionAnalysis
  ): RewardValidationResult {
    const warnings: string[] = [];
    const auditTrail: ValidationAuditEntry[] = [];
    let approved = true;
    let reason = "";
    let adminOverride = false;

    // Get user's contributions
    const userContributions = context.contributions.filter(c => c.username.toLowerCase() === username.toLowerCase());
    const rolesPerformed = [...new Set(userContributions.map(c => c.role))];

    // Check 1: User actually contributed
    if (userContributions.length === 0) {
      approved = false;
      reason = "No contributions found for this user";
      auditTrail.push({
        timestamp: new Date(),
        checkName: "contribution_exists",
        passed: false,
        details: { username },
      });
    } else {
      auditTrail.push({
        timestamp: new Date(),
        checkName: "contribution_exists",
        passed: true,
        details: { username, contributionCount: userContributions.length },
      });
    }

    // Check 2: Role separation enforcement
    if (approved && this.config.enforceRoleSeparation) {
      const separationCheck = this.checkRoleSeparation(username, rolesPerformed, analysis);
      
      auditTrail.push({
        timestamp: new Date(),
        checkName: "role_separation",
        passed: separationCheck.passed,
        details: {
          username,
          rolesPerformed,
          conflictingRoles: separationCheck.conflictingRoles,
        },
      });

      if (!separationCheck.passed) {
        // Check for admin override
        const isAdmin = this.isAdmin(username);
        
        if (isAdmin && this.config.allowAdminOverride) {
          adminOverride = true;
          warnings.push(`⚠️ Admin override applied: ${username} performed multiple roles (${rolesPerformed.join(", ")})`);
        } else {
          approved = false;
          reason = `Role separation violation: ${username} performed conflicting roles: ${separationCheck.conflictingRoles.join(", ")}. Different humans must handle spec writing, assignment, and review.`;
        }
      }
    }

    // Check 3: Minimum distinct humans requirement
    if (approved && analysis.distinctHumanCount < this.config.minDistinctHumans) {
      const isAdmin = this.isAdmin(username);
      
      if (isAdmin && this.config.allowAdminOverride) {
        adminOverride = true;
        warnings.push(`⚠️ Admin override: Only ${analysis.distinctHumanCount} distinct contributors (minimum: ${this.config.minDistinctHumans})`);
      } else {
        approved = false;
        reason = `Insufficient collaboration: Only ${analysis.distinctHumanCount} distinct contributors involved. Minimum required: ${this.config.minDistinctHumans}`;
      }

      auditTrail.push({
        timestamp: new Date(),
        checkName: "min_distinct_humans",
        passed: false,
        details: {
          distinctCount: analysis.distinctHumanCount,
          required: this.config.minDistinctHumans,
          adminOverride,
        },
      });
    }

    // Check 4: Self-approval detection
    if (approved) {
      const selfApprovalCheck = this.detectSelfApproval(username, context);
      
      auditTrail.push({
        timestamp: new Date(),
        checkName: "self_approval",
        passed: !selfApprovalCheck.detected,
        details: {
          username,
          detected: selfApprovalCheck.detected,
          details: selfApprovalCheck.details,
        },
      });

      if (selfApprovalCheck.detected) {
        const isAdmin = this.isAdmin(username);
        
        if (isAdmin && this.config.allowAdminOverride) {
          adminOverride = true;
          warnings.push(`⚠️ Admin self-approval detected and allowed: ${selfApprovalCheck.details}`);
        } else {
          approved = false;
          reason = `Self-approval detected: ${selfApprovalCheck.details}. Rewards require independent human validation.`;
        }
      }
    }

    // Set final reason if approved
    if (approved && !reason) {
      reason = adminOverride 
        ? "Approved via admin override" 
        : "All validation checks passed";
    }

    return {
      approved,
      username,
      rewardAmount: approved ? proposedAmount : 0n,
      reason,
      rolesPerformed,
      adminOverride,
      warnings,
      auditTrail,
    };
  }

  /**
   * Analyze contribution patterns across all participants.
   */
  private analyzeContributions(contributions: ContributionEvent[]): ContributionAnalysis {
    const uniqueUsers = new Set(contributions.map(c => c.username.toLowerCase()));
    const roleAssignments = new Map<string, Set<ContributorRole>>();

    for (const contrib of contributions) {
      const key = contrib.username.toLowerCase();
      if (!roleAssignments.has(key)) {
        roleAssignments.set(key, new Set());
      }
      roleAssignments.get(key)!.add(contrib.role);
    }

    // Find users with multiple critical roles
    const multiRoleUsers: string[] = [];
    for (const [user, roles] of roleAssignments) {
      const criticalRoles = Array.from(roles).filter(r => 
        this.config.separatedRoles.includes(r)
      );
      if (criticalRoles.length > 1) {
        multiRoleUsers.push(user);
      }
    }

    return {
      distinctHumanCount: uniqueUsers.size,
      roleAssignments,
      multiRoleUsers,
      totalEvents: contributions.length,
    };
  }

  /**
   * Check if a user violates role separation rules.
   */
  private checkRoleSeparation(
    username: string,
    rolesPerformed: ContributorRole[],
    analysis: ContributionAnalysis
  ): { passed: boolean; conflictingRoles: ContributorRole[] } {
    const separatedRolesPerformed = rolesPerformed.filter(r => 
      this.config.separatedRoles.includes(r)
    );

    if (separatedRolesPerformed.length <= 1) {
      return { passed: true, conflictingRoles: [] };
    }

    return {
      passed: false,
      conflictingRoles: separatedRolesPerformed,
    };
  }

  /**
   * Detect self-approval scenarios.
   */
  private detectSelfApproval(
    username: string,
    context: RewardValidationContext
  ): { detected: boolean; details: string } {
    const lowerUsername = username.toLowerCase();
    
    // Check if user authored the issue AND is receiving rewards
    if (context.issueMetadata.author.toLowerCase() === lowerUsername) {
      // Check if they also reviewed their own work
      const reviewEvents = context.contributions.filter(
        c => c.username.toLowerCase() === lowerUsername && c.role === ContributorRole.REVIEWER
      );
      
      if (reviewEvents.length > 0) {
        return {
          detected: true,
          details: `${username} authored the issue and reviewed their own work`,
        };
      }

      // Check if they assigned themselves
      const assignmentEvents = context.contributions.filter(
        c => c.username.toLowerCase() === lowerUsername && c.role === ContributorRole.ASSIGNEE
      );
      
      if (assignmentEvents.length > 0 && context.issueMetadata.author.toLowerCase() === lowerUsername) {
        // This might be okay if someone else reviewed
        const otherReviewers = context.contributions.filter(
          c => c.role === ContributorRole.REVIEWER && c.username.toLowerCase() !== lowerUsername
        );
        
        if (otherReviewers.length === 0) {
          return {
            detected: true,
            details: `${username} authored and self-assigned without independent review`,
          };
        }
      }
    }

    return { detected: false, details: "" };
  }

  /**
   * Check if a username has admin privileges.
   */
  private isAdmin(username: string): boolean {
    return this.config.adminUsernames.some(
      admin => admin.toLowerCase() === username.toLowerCase()
    );
  }

  /**
   * Log an audit entry.
   */
  private logAudit(entry: ValidationAuditEntry): void {
    if (this.config.enableAuditLogging) {
      this.auditLog.push(entry);
    }
  }

  /**
   * Get the accumulated audit log.
   */
  getAuditLog(): ValidationAuditEntry[] {
    return [...this.auditLog];
  }
}

interface ContributionAnalysis {
  distinctHumanCount: number;
  roleAssignments: Map<string, Set<ContributorRole>>;
  multiRoleUsers: string[];
  totalEvents: number;
}

// ============================================================================
// GITHUB COMMENT FORMATTER
// ============================================================================

/**
 * Formats validation results as a GitHub comment.
 * Provides transparency about why rewards were approved or blocked.
 * 
 * @param results - Validation results for all candidates
 * @param context - Original validation context
 * @returns Markdown-formatted comment
 */
export function formatValidationComment(
  results: Map<string, RewardValidationResult>,
  context: RewardValidationContext
): string {
  const lines: string[] = [
    `### 🔍 Reward Generation Validation Report`,
    ``,
    `**Issue:** #${context.issueNumber}`,
    `**Validation Timestamp:** ${new Date().toISOString()}`,
    ``,
  ];

  const approved = Array.from(results.values()).filter(r => r.approved);
  const blocked = Array.from(results.values()).filter(r => !r.approved);

  lines.push(`#### Summary`);
  lines.push(`- **Total Candidates:** ${results.size}`);
  lines.push(`- **✅ Approved:** ${approved.length}`);
  lines.push(`- **❌ Blocked:** ${blocked.length}`);
  lines.push(``);

  if (approved.length > 0) {
    lines.push(`#### ✅ Approved Rewards`);
    lines.push(`| User | Amount | Roles | Notes |`);
    lines.push(`|------|--------|-------|-------|`);
    
    for (const r of approved) {
      const notes = r.adminOverride ? "🔑 Admin override" : "";
      const roles = r.rolesPerformed.join(", ");
      lines.push(`| @${r.username} | ${formatAmount(r.rewardAmount)} | ${roles} | ${notes} |`);
    }
    lines.push(``);
  }

  if (blocked.length > 0) {
    lines.push(`#### ❌ Blocked Rewards`);
    lines.push(`| User | Reason |`);
    lines.push(`|------|--------|`);
    
    for (const r of blocked) {
      lines.push(`| @${r.username} | ${r.reason} |`);
    }
    lines.push(``);
  }

  // Warnings section
  const allWarnings = Array.from(results.values())
    .flatMap(r => r.warnings.map(w => ({ user: r.username, warning: w })));
  
  if (allWarnings.length > 0) {
    lines.push(`#### ⚠️ Warnings`);
    for (const { user, warning } of allWarnings) {
      lines.push(`- **@${user}:** ${warning}`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Generated by Reward Generation Validator*`);

  return lines.join("\n");
}

/**
 * Format bigint amount for display.
 */
function formatAmount(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return `${intPart}.${decPart.slice(0, 4)}`;
}

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generates integration code for the reward generation pipeline.
 * Call this before distributing rewards to validate eligibility.
 * 
 * @returns TypeScript integration code
 */
export function generateIntegrationCode(): string {
  return `/**
 * Integration patch for reward generation pipeline.
 * Add validation step before reward distribution.
 */

import { 
  RewardGenerationValidator,
  RewardValidationConfig,
  RewardValidationContext,
  ContributorRole,
  formatValidationComment 
} from "./validate-reward-generation";

/**
 * Validate rewards before distribution.
 * Returns filtered reward map with only approved rewards.
 */
export async function validateBeforeDistribution(
  context: RewardValidationContext
): Promise<{ approvedRewards: Map<string, bigint>; validationComment: string }> {
  const config: RewardValidationConfig = {
    enforceRoleSeparation: process.env.ENFORCE_ROLE_SEPARATION !== "false",
    minDistinctHumans: parseInt(process.env.MIN_DISTINCT_HUMANS || "2", 10),
    allowAdminOverride: process.env.ALLOW_ADMIN_OVERRIDE !== "false",
    separatedRoles: [
      ContributorRole.SPEC_AUTHOR,
      ContributorRole.ASSIGNEE,
      ContributorRole.REVIEWER,
    ],
    adminUsernames: (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim()).filter(Boolean),
    enableAuditLogging: true,
  };

  const validator = new RewardGenerationValidator(config);
  const results = await validator.validateAll(context);

  // Build approved rewards map
  const approvedRewards = new Map<string, bigint>();
  for (const [username, result] of results) {
    if (result.approved && result.rewardAmount > 0n) {
      approvedRewards.set(username, result.rewardAmount);
    }
  }

  // Generate validation comment
  const validationComment = formatValidationComment(results, context);

  return { approvedRewards, validationComment };
}

/**
 * Extract contribution events from GitHub issue timeline.
 */
export async function extractContributions(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<ContributionEvent[]> {
  const contributions: ContributionEvent[] = [];

  // Get issue details
  const { data: issue } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  // Issue author as spec writer
  contributions.push({
    username: issue.user.login,
    role: ContributorRole.SPEC_AUTHOR,
    timestamp: new Date(issue.created_at),
    isAdminAction: false,
  });

  // Get timeline events
  const { data: events } = await octokit.rest.issues.listEvents({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  for (const event of events) {
    if (event.event === "assigned" && event.assignee) {
      contributions.push({
        username: event.assignee.login,
        role: ContributorRole.ASSIGNEE,
        timestamp: new Date(event.created_at),
        artifactId: String(event.id),
        isAdminAction: false,
      });
    }
  }

  // Get comments for reviews
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  for (const comment of comments) {
    // Heuristic: comments with review indicators
    if (comment.body?.includes("/review") || comment.body?.includes("LGTM")) {
      contributions.push({
        username: comment.user.login,
        role: ContributorRole.REVIEWER,
        timestamp: new Date(comment.created_at),
        artifactId: String(comment.id),
        isAdminAction: false,
      });
    }
  }

  return contributions;
}
`;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Generate test fixtures for validation scenarios.
 */
export function generateTestFixtures(): {
  validScenario: RewardValidationContext;
  selfApprovalScenario: RewardValidationContext;
  insufficientCollaborationScenario: RewardValidationContext;
} {
  const baseMetadata = {
    author: "alice",
    createdAt: new Date("2025-01-01"),
    labels: ["bounty"],
  };

  return {
    validScenario: {
      issueNumber: 100,
      repoOwner: "test",
      repoName: "repo",
      contributions: [
        { username: "alice", role: ContributorRole.SPEC_AUTHOR, timestamp: new Date(), isAdminAction: false },
        { username: "bob", role: ContributorRole.ASSIGNEE, timestamp: new Date(), isAdminAction: false },
        { username: "charlie", role: ContributorRole.REVIEWER, timestamp: new Date(), isAdminAction: false },
      ],
      proposedRewards: new Map([["bob", 100n]]),
      issueMetadata: baseMetadata,
    },
    selfApprovalScenario: {
      issueNumber: 101,
      repoOwner: "test",
      repoName: "repo",
      contributions: [
        { username: "alice", role: ContributorRole.SPEC_AUTHOR, timestamp: new Date(), isAdminAction: false },
        { username: "alice", role: ContributorRole.ASSIGNEE, timestamp: new Date(), isAdminAction: false },
        { username: "alice", role: ContributorRole.REVIEWER, timestamp: new Date(), isAdminAction: false },
      ],
      proposedRewards: new Map([["alice", 100n]]),
      issueMetadata: baseMetadata,
    },
    insufficientCollaborationScenario: {
      issueNumber: 102,
      repoOwner: "test",
      repoName: "repo",
      contributions: [
        { username: "alice", role: ContributorRole.SPEC_AUTHOR, timestamp: new Date(), isAdminAction: false },
        { username: "alice", role: ContributorRole.ASSIGNEE, timestamp: new Date(), isAdminAction: false },
      ],
      proposedRewards: new Map([["alice", 100n]]),
      issueMetadata: baseMetadata,
    },
  };
}
