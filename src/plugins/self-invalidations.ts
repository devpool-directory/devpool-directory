/**
 * Self Invalidations for Permit Management
 *
 * Provides utilities for users to invalidate their own unclaimed permits,
 * filtering them from UI displays without requiring admin intervention.
 * Addresses the issue of bogus/abandoned permits cluttering developer dashboards.
 *
 * Addresses: devpool-directory#5911 / ubiquity/pay.ubq.fi#455
 */

export interface Permit {
  id: string;
  beneficiary: string;
  amount: string;
  token: string;
  issuedAt: number;
  claimedAt?: number;
  invalidatedAt?: number;
  invalidatedBy?: string;
  nonce: number;
}

export interface InvalidationRequest {
  permitId: string;
  requester: string;
  reason?: string;
}

export interface InvalidationResult {
  success: boolean;
  permitId: string;
  error?: string;
  updatedPermit?: Permit;
}

/**
 * Checks whether a user is authorized to self-invalidate a permit.
 * Only the original beneficiary can self-invalidate; admins can invalidate any.
 */
export function canSelfInvalidate(
  permit: Permit,
  requester: string,
  adminAddresses: string[] = []
): boolean {
  const normalizedRequester = requester.toLowerCase();
  const normalizedBeneficiary = permit.beneficiary.toLowerCase();
  const normalizedAdmins = adminAddresses.map((a) => a.toLowerCase());

  // Beneficiary can always self-invalidate their own unclaimed permits
  if (normalizedRequester === normalizedBeneficiary) {
    return true;
  }

  // Admins can invalidate any permit
  if (normalizedAdmins.includes(normalizedRequester)) {
    return true;
  }

  return false;
}

/**
 * Validates that a permit is eligible for invalidation.
 * Already claimed or already invalidated permits cannot be re-invalidated.
 */
export function validateInvalidationEligibility(permit: Permit): {
  eligible: boolean;
  reason?: string;
} {
  if (permit.claimedAt) {
    return {
      eligible: false,
      reason: `Permit ${permit.id} was already claimed at ${new Date(permit.claimedAt).toISOString()}.`,
    };
  }

  if (permit.invalidatedAt) {
    return {
      eligible: false,
      reason: `Permit ${permit.id} was already invalidated at ${new Date(permit.invalidatedAt).toISOString()} by ${permit.invalidatedBy || "unknown"}.`,
    };
  }

  return { eligible: true };
}

/**
 * Performs the self-invalidation of a permit, returning the updated record.
 * This is a pure function — actual persistence must be handled by the caller.
 */
export function invalidatePermit(
  permit: Permit,
  requester: string,
  adminAddresses: string[] = [],
  timestamp: number = Date.now()
): InvalidationResult {
  // Authorization check
  if (!canSelfInvalidate(permit, requester, adminAddresses)) {
    return {
      success: false,
      permitId: permit.id,
      error: `User '${requester}' is not authorized to invalidate permit ${permit.id}. Only the beneficiary or an admin can perform this action.`,
    };
  }

  // Eligibility check
  const eligibility = validateInvalidationEligibility(permit);
  if (!eligibility.eligible) {
    return {
      success: false,
      permitId: permit.id,
      error: eligibility.reason,
    };
  }

  const updatedPermit: Permit = {
    ...permit,
    invalidatedAt: timestamp,
    invalidatedBy: requester,
  };

  return {
    success: true,
    permitId: permit.id,
    updatedPermit,
  };
}

/**
 * Filters a list of permits to exclude invalidated ones from UI display.
 * This is the primary mechanism for "naturally filtering out" self-invalidated permits.
 */
export function filterActivePermits(permits: Permit[]): Permit[] {
  return permits.filter((p) => !p.invalidatedAt && !p.claimedAt);
}

/**
 * Returns statistics about permit invalidation state for dashboard display.
 */
export function getInvalidationStats(permits: Permit[]): {
  total: number;
  active: number;
  claimed: number;
  invalidated: number;
  selfInvalidated: number;
} {
  let active = 0;
  let claimed = 0;
  let invalidated = 0;
  let selfInvalidated = 0;

  for (const p of permits) {
    if (p.claimedAt) {
      claimed++;
    } else if (p.invalidatedAt) {
      invalidated++;
      // Self-invalidated: invalidated by the beneficiary themselves
      if (p.invalidatedBy && p.invalidatedBy.toLowerCase() === p.beneficiary.toLowerCase()) {
        selfInvalidated++;
      }
    } else {
      active++;
    }
  }

  return {
    total: permits.length,
    active,
    claimed,
    invalidated,
    selfInvalidated,
  };
}

/**
 * Batch invalidation: processes multiple invalidation requests atomically.
 * Returns individual results for each request without failing the entire batch.
 */
export function batchInvalidatePermits(
  permits: Permit[],
  requests: InvalidationRequest[],
  adminAddresses: string[] = [],
  timestamp: number = Date.now()
): {
  results: InvalidationResult[];
  updatedPermits: Permit[];
  successCount: number;
  failureCount: number;
} {
  const permitMap = new Map(permits.map((p) => [p.id, { ...p }]));
  const results: InvalidationResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const request of requests) {
    const permit = permitMap.get(request.permitId);
    if (!permit) {
      results.push({
        success: false,
        permitId: request.permitId,
        error: `Permit ${request.permitId} not found.`,
      });
      failureCount++;
      continue;
    }

    const result = invalidatePermit(permit, request.requester, adminAddresses, timestamp);
    results.push(result);

    if (result.success && result.updatedPermit) {
      permitMap.set(request.permitId, result.updatedPermit);
      successCount++;
    } else {
      failureCount++;
    }
  }

  return {
    results,
    updatedPermits: Array.from(permitMap.values()),
    successCount,
    failureCount,
  };
}
