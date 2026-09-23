/**
 * Reward distribution logic for directory issues.
 *
 * This module implements a simple differential reward system where
 * reopened issues receive a reduced reward compared to newly opened
 * issues. The reward values are intentionally kept simple so that
 * they can be tuned via environment variables or configuration
 * files if needed in the future.
 */

import type { Issue } from './types';

/**
 * Configuration for reward calculation.
 * These values can be overridden by environment variables if desired.
 */
const BASE_REWARD = 10; // Base reward points for a new issue
const REOPENED_MULTIPLIER = 0.5; // 50% reward for reopened issues

/**
 * Determines whether an issue has been reopened.
 *
 * GitHub does not expose a direct `reopened` flag on the issue
 * object, so we rely on the presence of a `reopened` boolean
 * property that is added by the directory ingestion process.
 *
 * @param issue - The issue object from the directory
 * @returns true if the issue is considered reopened
 */
function isReopened(issue: Issue): boolean {
  // The directory ingestion pipeline may set `reopened` to true
  // for issues that have been reopened. If not present, default
  // to false.
  return !!(issue as any).reopened;
}

/**
 * Calculates the reward for a single issue.
 *
 * @param issue - The issue to evaluate
 * @returns The reward points for the issue
 */
export function calculateReward(issue: Issue): number {
  return isReopened(issue) ? BASE_REWARD * REOPENED_MULTIPLIER : BASE_REWARD;
}

/**
 * Aggregates rewards for a list of issues, grouping by the issue author.
 *
 * @param issues - Array of issues to process
 * @returns An object mapping author login to total reward points
 */
export function distributeRewards(issues: Issue[]): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const issue of issues) {
    const author = (issue.user?.login ?? 'unknown') as string;
    const reward = calculateReward(issue);
    distribution[author] = (distribution[author] ?? 0) + reward;
  }

  return distribution;
}
