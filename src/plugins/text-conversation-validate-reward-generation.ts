/**
 * @file text-conversation-validate-reward-generation.ts
 * @description Scaffolding and generator utilities for validating reward generation
 * behavior to ensure rewards are blocked when no distinct human collaborator has
 * approved the work. Addresses the issue where solo contributors receive rewards
 * without external review or approval.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#455
 * Problem: Rewards are generated even when no human collaborator other than the
 * assignee has participated (spec write, assign, review should involve different
 * humans unless admin). This allows self-approval loops.
 * Solution: Implement a multi-party participation validator that checks for
 * distinct human actors across spec authoring, assignment, and review phases
 * before allowing reward generation to proceed.
 */

import type { PluginContext, PullRequest, TaskAssignee } from "./types";

/**
 * Configuration for reward generation validation.
 */
export interface RewardValidationConfig {
  /** Minimum number of distinct human participants required */
  minDistinctParticipants: number;
  /** Whether admins are exempt from multi-party requirement */
  adminExempt: boolean;
  /** Roles that count as valid participation */
  requiredRoles: Array<"spec_author" | "assigner" | "reviewer" | "approver">;
  /** Whether bot accounts should be excluded from participant counts */
  excludeBots: boolean;
  /** Log level for validation decisions */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Record of a participant's role in the task lifecycle.
 */
export interface ParticipantRecord {
  login: string;
  userId: number;
  roles: string[];
  isBot: boolean;
  isAdmin: boolean;
  firstActionAt: string;
}

/**
 * Result of validating reward generation eligibility.
 */
export interface RewardValidationResult {
  eligible: boolean;
  reason: string;
  distinctParticipantCount: number;
  participants: ParticipantRecord[];
  missingRoles: string[];
  adminOverride: boolean;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the reward validation system.
 * @returns String containing interface definitions
 */
export function generateRewardValidationInterfaces(): string {
  return `
/**
 * Interface for collecting participation data across task lifecycle.
 */
export interface IParticipationCollector {
  /**
   * Collects all human participants and their roles for a given issue/PR.
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param prNumber - Optional associated PR number
   * @returns Array of participant records with role assignments
   */
  collect(
    owner: string,
    repo: string,
    issueNumber: number,
    prNumber?: number
  ): Promise<ParticipantRecord[]>;
}

/**
 * Interface for validating multi-party participation requirements.
 */
export interface IRewardEligibilityValidator {
  /**
   * Validates whether reward generation should proceed based on participation.
   * @param participants - Collected participant records
   * @param assignee - Current task assignee
   * @param config - Validation configuration
   * @returns Validation result with eligibility determination
   */
  validate(
    participants: ParticipantRecord[],
    assignee: TaskAssignee,
    config: RewardValidationConfig
  ): RewardValidationResult;
}

/**
 * Interface for checking admin status of participants.
 */
export interface IAdminChecker {
  /**
   * Checks whether a user has admin privileges in the repository.
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param login - GitHub login to check
   * @returns True if user is an admin
   */
  isAdmin(owner: string, repo: string, login: string): Promise<boolean>;
}

/**
 * Interface for detecting bot accounts.
 */
export interface IBotDetector {
  /**
   * Determines whether a GitHub account is a bot.
   * @param login - GitHub login to check
   * @param userType - GitHub user type field
   * @returns True if account is identified as a bot
   */
  isBot(login: string, userType?: string): boolean;
}
`;
}

/**
 * Generates the participation collector implementation.
 * @param config - Validation configuration
 * @returns String containing collector class implementation
 */
export function generateParticipationCollector(config: RewardValidationConfig): string {
  return `
import type { IParticipationCollector, ParticipantRecord } from "./interfaces";

/**
 * Collects participation data from issue conversations, PR reviews,
 * and assignment events to build a complete participant roster.
 */
export class ParticipationCollector implements IParticipationCollector {
  private readonly config: RewardValidationConfig;

  constructor(config: RewardValidationConfig) {
    this.config = config;
  }

  async collect(
    owner: string,
    repo: string,
    issueNumber: number,
    prNumber?: number
  ): Promise<ParticipantRecord[]> {
    console[this.config.logLevel]?.(
      \`[Participation] Collecting for \${owner}/\${repo}#\${issueNumber}\`
    );

    // In production: fetch from GitHub API
    // - Issue comments for spec authors
    // - Assignment events for assigners
    // - PR reviews for reviewers/approvers
    // - User profiles for bot/admin detection

    // Scaffold placeholder
    const participants: ParticipantRecord[] = [];

    return participants;
  }
}
`;
}

/**
 * Generates the reward eligibility validator implementation.
 * @returns String containing validator class implementation
 */
export function generateEligibilityValidator(): string {
  return `
import type { IRewardEligibilityValidator, RewardValidationResult, ParticipantRecord, TaskAssignee, RewardValidationConfig } from "./interfaces";

/**
 * Validates that reward generation meets multi-party participation requirements.
 * Blocks rewards when only the assignee has participated without admin exemption.
 */
export class RewardEligibilityValidator implements IRewardEligibilityValidator {
  validate(
    participants: ParticipantRecord[],
    assignee: TaskAssignee,
    config: RewardValidationConfig
  ): RewardValidationResult {
    const timestamp = new Date().toISOString();

    // Filter out bots if configured
    const humanParticipants = config.excludeBots
      ? participants.filter(p => !p.isBot)
      : participants;

    // Count distinct participants excluding the assignee
    const distinctLogins = new Set(humanParticipants.map(p => p.login));
    const nonAssigneeParticipants = humanParticipants.filter(
      p => p.login !== assignee.login
    );
    const distinctNonAssignee = new Set(nonAssigneeParticipants.map(p => p.login));

    // Check for admin override
    const assigneeIsAdmin = humanParticipants.some(
      p => p.login === assignee.login && p.isAdmin
    );
    const adminOverride = config.adminExempt && assigneeIsAdmin;

    // Check required roles coverage
    const coveredRoles = new Set<string>();
    for (const p of humanParticipants) {
      for (const role of p.roles) {
        coveredRoles.add(role);
      }
    }
    const missingRoles = config.requiredRoles.filter(r => !coveredRoles.has(r));

    // Determine eligibility
    const meetsMinParticipants = distinctNonAssignee.size >= (config.minDistinctParticipants - 1);
    const meetsRoleRequirements = missingRoles.length === 0;
    const eligible = adminOverride || (meetsMinParticipants && meetsRoleRequirements);

    let reason: string;
    if (adminOverride) {
      reason = \`Admin override: @\${assignee.login} is an admin and exempt from multi-party requirement\`;
    } else if (!meetsMinParticipants) {
      reason = \`Insufficient distinct participants: \${distinctNonAssignee.size} non-assignee participant(s) found, need \${config.minDistinctParticipants - 1}\`;
    } else if (!meetsRoleRequirements) {
      reason = \`Missing required roles: \${missingRoles.join(", ")}\`;
    } else {
      reason = \`Validation passed: \${distinctLogins.size} distinct participant(s) covering all required roles\`;
    }

    console[eligible ? "info" : "warn"]?.(\`[RewardValidation] \${reason}\`);

    return {
      eligible,
      reason,
      distinctParticipantCount: distinctLogins.size,
      participants: humanParticipants,
      missingRoles,
      adminOverride,
      timestamp,
    };
  }
}
`;
}

/**
 * Generates test scaffolding for the reward validation system.
 * @returns String containing Vitest test suite
 */
export function generateRewardValidationTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { RewardEligibilityValidator } from "../text-conversation-validate-reward-generation";
import type { ParticipantRecord, TaskAssignee, RewardValidationConfig } from "../../types";

describe("Reward Generation Validation", () => {
  let validator: RewardEligibilityValidator;
  let config: RewardValidationConfig;
  let mockAssignee: TaskAssignee;

  beforeEach(() => {
    validator = new RewardEligibilityValidator();
    config = {
      minDistinctParticipants: 2,
      adminExempt: true,
      requiredRoles: ["spec_author", "reviewer"],
      excludeBots: true,
      logLevel: "warn" as const,
    };
    mockAssignee = { id: 1001, login: "contributor" };
  });

  it("should block rewards when only assignee participated", () => {
    const participants: ParticipantRecord[] = [
      {
        login: "contributor",
        userId: 1001,
        roles: ["spec_author", "assigner"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
    ];

    const result = validator.validate(participants, mockAssignee, config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Insufficient distinct participants");
  });

  it("should allow rewards when distinct reviewer exists", () => {
    const participants: ParticipantRecord[] = [
      {
        login: "contributor",
        userId: 1001,
        roles: ["spec_author"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
      {
        login: "reviewer-a",
        userId: 2001,
        roles: ["reviewer"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
    ];

    const result = validator.validate(participants, mockAssignee, config);
    expect(result.eligible).toBe(true);
    expect(result.distinctParticipantCount).toBe(2);
  });

  it("should allow admin override when configured", () => {
    const participants: ParticipantRecord[] = [
      {
        login: "admin-user",
        userId: 3001,
        roles: ["spec_author"],
        isBot: false,
        isAdmin: true,
        firstActionAt: new Date().toISOString(),
      },
    ];

    const adminAssignee: TaskAssignee = { id: 3001, login: "admin-user" };
    const result = validator.validate(participants, adminAssignee, config);
    expect(result.eligible).toBe(true);
    expect(result.adminOverride).toBe(true);
  });

  it("should exclude bots from participant count", () => {
    const participants: ParticipantRecord[] = [
      {
        login: "contributor",
        userId: 1001,
        roles: ["spec_author"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
      {
        login: "ubiquity-os[bot]",
        userId: 9999,
        roles: ["reviewer"],
        isBot: true,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
    ];

    const result = validator.validate(participants, mockAssignee, config);
    expect(result.eligible).toBe(false);
    expect(result.distinctParticipantCount).toBe(1);
  });

  it("should report missing roles", () => {
    const participants: ParticipantRecord[] = [
      {
        login: "contributor",
        userId: 1001,
        roles: ["spec_author"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
      {
        login: "assigner",
        userId: 2001,
        roles: ["assigner"],
        isBot: false,
        isAdmin: false,
        firstActionAt: new Date().toISOString(),
      },
    ];

    const result = validator.validate(participants, mockAssignee, config);
    expect(result.missingRoles).toContain("reviewer");
  });
});
`;
}

/**
 * Main generator function for all reward validation artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<RewardValidationConfig>
): Record<string, string> {
  const resolvedConfig: RewardValidationConfig = {
    minDistinctParticipants: 2,
    adminExempt: true,
    requiredRoles: ["spec_author", "reviewer"],
    excludeBots: true,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateRewardValidationInterfaces(),
    collector: generateParticipationCollector(resolvedConfig),
    validator: generateEligibilityValidator(),
    tests: generateRewardValidationTests(),
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

  if (!artifacts.interfaces.includes("IParticipationCollector")) {
    errors.push("Missing IParticipationCollector interface");
  }

  if (!artifacts.interfaces.includes("IRewardEligibilityValidator")) {
    errors.push("Missing IRewardEligibilityValidator interface");
  }

  if (!artifacts.validator.includes("RewardEligibilityValidator")) {
    errors.push("Missing RewardEligibilityValidator class");
  }

  if (!artifacts.tests.includes("should block rewards when only assignee participated")) {
    errors.push("Missing critical test for solo-participant blocking");
  }

  if (!artifacts.tests.includes("should allow admin override when configured")) {
    errors.push("Missing test for admin exemption");
  }

  if (!artifacts.tests.includes("should exclude bots from participant count")) {
    errors.push("Missing test for bot exclusion");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateRewardValidationInterfaces,
  generateParticipationCollector,
  generateEligibilityValidator,
  generateRewardValidationTests,
};
