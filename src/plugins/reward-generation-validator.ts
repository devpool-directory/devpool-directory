/**
 * Validate Reward Generation Behavior
 *
 * Enforces multi-party collaboration requirements before allowing reward
 * generation. Prevents self-dealing by requiring that spec writing, assignment,
 * and review actions involve different human collaborators (unless admin override).
 *
 * Addresses: devpool-directory#5887 / ubiquity-os-marketplace/text-conversation-rewards#455
 */

export type ContributionRole = "SPEC_WRITER" | "ASSIGNEE" | "REVIEWER" | "ADMIN";

export interface ContributorAction {
  actor: string;
  role: ContributionRole;
  timestamp: number;
}

export interface RewardValidationResult {
  eligible: boolean;
  reason: string;
  missingRoles: ContributionRole[];
  uniqueActors: number;
  isAdminOverride: boolean;
}

export interface RewardContext {
  actions: ContributorAction[];
  adminAddresses: string[];
  allowSoloAdmin?: boolean;
}

/**
 * Checks whether a reward should be generated based on collaboration requirements.
 * Requires at least 2 distinct non-admin actors across spec/assign/review roles,
 * OR a single admin performing all actions (if allowSoloAdmin is true).
 */
export function validateRewardEligibility(context: RewardContext): RewardValidationResult {
  const { actions, adminAddresses, allowSoloAdmin = false } = context;

  if (!actions || actions.length === 0) {
    return {
      eligible: false,
      reason: "No contribution actions recorded.",
      missingRoles: ["SPEC_WRITER", "ASSIGNEE", "REVIEWER"],
      uniqueActors: 0,
      isAdminOverride: false,
    };
  }

  const normalizedAdmins = new Set(adminAddresses.map((a) => a.toLowerCase()));

  // Separate admin and non-admin actions
  const adminActions = actions.filter((a) => normalizedAdmins.has(a.actor.toLowerCase()));
  const nonAdminActions = actions.filter((a) => !normalizedAdmins.has(a.actor.toLowerCase()));

  // Check for solo admin override
  if (allowSoloAdmin && adminActions.length > 0 && nonAdminActions.length === 0) {
    const adminRoles = new Set(adminActions.map((a) => a.role));
    const hasAllRoles = ["SPEC_WRITER", "ASSIGNEE", "REVIEWER"].every((r) =>
      adminRoles.has(r as ContributionRole)
    );

    if (hasAllRoles) {
      return {
        eligible: true,
        reason: "Admin override: single admin performed all required roles.",
        missingRoles: [],
        uniqueActors: 1,
        isAdminOverride: true,
      };
    }
  }

  // Collect unique non-admin actors per role
  const roleActors: Record<string, Set<string>> = {
    SPEC_WRITER: new Set(),
    ASSIGNEE: new Set(),
    REVIEWER: new Set(),
  };

  for (const action of nonAdminActions) {
    if (action.role in roleActors) {
      roleActors[action.role].add(action.actor.toLowerCase());
    }
  }

  const missingRoles: ContributionRole[] = [];
  for (const role of ["SPEC_WRITER", "ASSIGNEE", "REVIEWER"] as ContributionRole[]) {
    if (roleActors[role].size === 0) {
      missingRoles.push(role);
    }
  }

  // Count total unique non-admin actors across all roles
  const allUniqueActors = new Set<string>();
  for (const actors of Object.values(roleActors)) {
    for (const actor of actors) {
      allUniqueActors.add(actor);
    }
  }

  if (missingRoles.length > 0) {
    return {
      eligible: false,
      reason: `Missing required roles: ${missingRoles.join(", ")}. All three roles must be filled by non-admin contributors.`,
      missingRoles,
      uniqueActors: allUniqueActors.size,
      isAdminOverride: false,
    };
  }

  // Require at least 2 distinct non-admin actors to prevent self-dealing
  if (allUniqueActors.size < 2) {
    return {
      eligible: false,
      reason: `Only ${allUniqueActors.size} unique non-admin actor(s) found. At least 2 distinct humans must participate across spec/assign/review roles.`,
      missingRoles: [],
      uniqueActors: allUniqueActors.size,
      isAdminOverride: false,
    };
  }

  return {
    eligible: true,
    reason: `Valid collaboration: ${allUniqueActors.size} unique non-admin actors across all required roles.`,
    missingRoles: [],
    uniqueActors: allUniqueActors.size,
    isAdminOverride: false,
  };
}

/**
 * Extracts contributor actions from a GitHub issue/PR timeline.
 * Maps common timeline events to contribution roles.
 */
export function extractActionsFromTimeline(
  timelineEvents: Array<{ event: string; actor?: { login: string }; created_at?: string }>
): ContributorAction[] {
  const actions: ContributorAction[] = [];

  const roleMapping: Record<string, ContributionRole> = {
    assigned: "ASSIGNEE",
    unassigned: "ASSIGNEE",
    reviewed: "REVIEWER",
    changes_requested: "REVIEWER",
    approved: "REVIEWER",
    commented: "SPEC_WRITER", // Issue body author or spec comments
    opened: "SPEC_WRITER",
    edited: "SPEC_WRITER",
  };

  for (const event of timelineEvents) {
    if (!event.actor?.login) continue;
    const role = roleMapping[event.event];
    if (role) {
      actions.push({
        actor: event.actor.login,
        role,
        timestamp: event.created_at ? new Date(event.created_at).getTime() : Date.now(),
      });
    }
  }

  return actions;
}

/**
 * Generates a human-readable audit report for reward validation.
 */
export function generateValidationReport(result: RewardValidationResult): string {
  const status = result.eligible ? "✅ ELIGIBLE" : "❌ BLOCKED";
  const lines = [
    `## Reward Validation Report`,
    `**Status:** ${status}`,
    `**Reason:** ${result.reason}`,
    `**Unique Actors:** ${result.uniqueActors}`,
    `**Admin Override:** ${result.isAdminOverride ? "Yes" : "No"}`,
  ];

  if (result.missingRoles.length > 0) {
    lines.push(`**Missing Roles:** ${result.missingRoles.join(", ")}`);
  }

  return lines.join("\n");
}
