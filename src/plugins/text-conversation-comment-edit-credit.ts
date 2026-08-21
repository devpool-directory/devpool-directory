/**
 * @file text-conversation-comment-edit-credit.ts
 * @description Scaffolding and generator utilities for crediting users who edit
 * issue/PR comments (specifications) with a portion of the reward, similar to
 * how original authors receive credit. Addresses the feature request to recognize
 * specification refinement contributions while filtering out bot edits.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#358
 * Context: Specification edits by humans improve task clarity and should be
 * rewarded, but most edits are automated (bots). Need to distinguish meaningful
 * human edits from noise and allocate reward portions fairly.
 * Solution: Implement an edit history analyzer that identifies substantive
 * human edits to comments, calculates contribution weight, and integrates
 * with the reward distribution system.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for comment edit credit allocation.
 */
export interface CommentEditCreditConfig {
  /** Maximum percentage of total reward allocable to editors */
  maxEditorRewardPercent: number;
  /** Minimum character delta to consider an edit substantive */
  minEditDeltaChars: number;
  /** Whether to exclude bot accounts from edit credit */
  excludeBots: boolean;
  /** Minimum time between edits to count as separate contributions */
  minEditIntervalMs: number;
  /** Log level for edit credit operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Record of a single comment edit event.
 */
export interface CommentEditRecord {
  editorLogin: string;
  editorId: number;
  isBot: boolean;
  editedAt: string;
  previousBody: string;
  newBody: string;
  charDelta: number;
  isSubstantive: boolean;
}

/**
 * Aggregated edit contribution for a single user.
 */
export interface EditorContribution {
  login: string;
  userId: number;
  substantiveEditCount: number;
  totalCharsAdded: number;
  totalCharsRemoved: number;
  firstEditAt: string;
  lastEditAt: string;
  rewardSharePercent: number;
}

/**
 * Result of analyzing comment edits for reward distribution.
 */
export interface EditCreditAnalysis {
  issueNumber: number;
  prNumber?: number;
  totalEditors: number;
  eligibleEditors: number;
  contributions: EditorContribution[];
  totalEditorRewardPercent: number;
  authorRewardPercent: number;
  skippedEdits: { reason: string; count: number }[];
}

/**
 * Generates TypeScript interfaces for the edit credit system.
 * @returns String containing interface definitions
 */
export function generateEditCreditInterfaces(): string {
  return `
/**
 * Interface for retrieving comment edit history.
 */
export interface ICommentEditHistoryFetcher {
  /**
   * Fetches all edit events for comments on an issue or PR.
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param prNumber - Optional PR number for PR comments
   * @returns Array of edit records sorted chronologically
   */
  fetchEditHistory(
    owner: string,
    repo: string,
    issueNumber: number,
    prNumber?: number
  ): Promise<CommentEditRecord[]>;
}

/**
 * Interface for analyzing edit significance.
 */
export interface IEditSignificanceAnalyzer {
  /**
   * Determines if an edit is substantive enough to warrant credit.
   * Filters out whitespace-only changes, bot auto-formats, etc.
   * @param edit - The edit record to evaluate
   * @param config - Credit configuration
   * @returns True if edit qualifies for reward consideration
   */
  isSubstantive(edit: CommentEditRecord, config: CommentEditCreditConfig): boolean;
}

/**
 * Interface for calculating reward shares among editors.
 */
export interface IEditorRewardCalculator {
  /**
   * Calculates reward distribution percentages for eligible editors.
   * @param contributions - Aggregated editor contributions
   * @param config - Credit configuration
   * @returns Updated contributions with rewardSharePercent populated
   */
  calculateShares(
    contributions: EditorContribution[],
    config: CommentEditCreditConfig
  ): EditorContribution[];
}

/**
 * Interface for detecting bot vs human editors.
 */
export interface IEditorTypeDetector {
  /**
   * Determines if an editor account is a bot.
   * @param login - GitHub login to check
   * @param userType - GitHub user type field if available
   * @returns True if account is identified as automated
   */
  isBot(login: string, userType?: string): boolean;
}
`;
}

/**
 * Generates the edit significance analyzer implementation.
 * @returns String containing analyzer class implementation
 */
export function generateEditSignificanceAnalyzer(): string {
  return `
import type { IEditSignificanceAnalyzer, CommentEditRecord } from "./interfaces";
import type { CommentEditCreditConfig } from "../text-conversation-comment-edit-credit";

/**
 * Analyzes comment edits to determine if they represent substantive
 * specification improvements worthy of reward credit.
 */
export class EditSignificanceAnalyzer implements IEditSignificanceAnalyzer {
  isSubstantive(edit: CommentEditRecord, config: CommentEditCreditConfig): boolean {
    // Skip bot edits if configured
    if (config.excludeBots && edit.isBot) {
      return false;
    }

    // Check minimum character delta
    if (Math.abs(edit.charDelta) < config.minEditDeltaChars) {
      return false;
    }

    // Filter out whitespace-only changes
    const prevNormalized = edit.previousBody.replace(/\\s+/g, " ").trim();
    const newNormalized = edit.newBody.replace(/\\s+/g, " ").trim();
    if (prevNormalized === newNormalized) {
      return false;
    }

    // Filter out trivial formatting changes (e.g., just adding/removing blank lines)
    const prevLines = prevNormalized.split("\\n").filter(l => l.length > 0);
    const newLines = newNormalized.split("\\n").filter(l => l.length > 0);
    if (prevLines.length === newLines.length && prevLines.every((l, i) => l === newLines[i])) {
      return false;
    }

    return true;
  }
}
`;
}

/**
 * Generates the editor reward calculator implementation.
 * @returns String containing calculator class implementation
 */
export function generateEditorRewardCalculator(): string {
  return `
import type { IEditorRewardCalculator, EditorContribution } from "./interfaces";
import type { CommentEditCreditConfig } from "../text-conversation-comment-edit-credit";

/**
 * Calculates fair reward distribution among editors based on
 * contribution volume and recency.
 */
export class EditorRewardCalculator implements IEditorRewardCalculator {
  calculateShares(
    contributions: EditorContribution[],
    config: CommentEditCreditConfig
  ): EditorContribution[] {
    if (contributions.length === 0) {
      return contributions;
    }

    // Calculate total contribution weight
    let totalWeight = 0;
    for (const c of contributions) {
      // Weight = substantive edits + normalized chars added
      const charWeight = Math.min(c.totalCharsAdded / 100, 10); // Cap at 10
      const editWeight = c.substantiveEditCount;
      totalWeight += charWeight + editWeight;
    }

    if (totalWeight === 0) {
      // Equal distribution if no measurable contribution
      const equalShare = Math.min(
        config.maxEditorRewardPercent / contributions.length,
        config.maxEditorRewardPercent
      );
      return contributions.map(c => ({ ...c, rewardSharePercent: equalShare }));
    }

    // Distribute proportionally up to max
    let allocatedPercent = 0;
    const result = contributions.map(c => {
      const charWeight = Math.min(c.totalCharsAdded / 100, 10);
      const editWeight = c.substantiveEditCount;
      const rawShare = ((charWeight + editWeight) / totalWeight) * config.maxEditorRewardPercent;
      const share = Math.min(rawShare, config.maxEditorRewardPercent);
      allocatedPercent += share;
      return { ...c, rewardSharePercent: share };
    });

    // Ensure we don't exceed max total
    if (allocatedPercent > config.maxEditorRewardPercent) {
      const scaleFactor = config.maxEditorRewardPercent / allocatedPercent;
      for (const c of result) {
        c.rewardSharePercent *= scaleFactor;
      }
    }

    return result;
  }
}
`;
}

/**
 * Generates test scaffolding for the comment edit credit system.
 * @returns String containing Vitest test suite
 */
export function generateEditCreditTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { EditSignificanceAnalyzer, EditorRewardCalculator } from "../text-conversation-comment-edit-credit";
import type { CommentEditRecord, EditorContribution } from "../../types";
import type { CommentEditCreditConfig } from "../text-conversation-comment-edit-credit";

describe("Comment Edit Credit System", () => {
  let analyzer: EditSignificanceAnalyzer;
  let calculator: EditorRewardCalculator;
  let config: CommentEditCreditConfig;

  beforeEach(() => {
    analyzer = new EditSignificanceAnalyzer();
    calculator = new EditorRewardCalculator();
    config = {
      maxEditorRewardPercent: 20,
      minEditDeltaChars: 10,
      excludeBots: true,
      minEditIntervalMs: 60000,
      logLevel: "warn" as const,
    };
  });

  it("should mark substantive content additions as significant", () => {
    const edit: CommentEditRecord = {
      editorLogin: "human-editor",
      editorId: 1001,
      isBot: false,
      editedAt: new Date().toISOString(),
      previousBody: "Original spec",
      newBody: "Original spec with important clarification about API behavior",
      charDelta: 45,
      isSubstantive: false,
    };
    expect(analyzer.isSubstantive(edit, config)).toBe(true);
  });

  it("should reject whitespace-only changes", () => {
    const edit: CommentEditRecord = {
      editorLogin: "human-editor",
      editorId: 1001,
      isBot: false,
      editedAt: new Date().toISOString(),
      previousBody: "Some text",
      newBody: "Some   text  ",
      charDelta: 4,
      isSubstantive: false,
    };
    expect(analyzer.isSubstantive(edit, config)).toBe(false);
  });

  it("should reject bot edits when configured", () => {
    const edit: CommentEditRecord = {
      editorLogin: "ubiquity-os[bot]",
      editorId: 9999,
      isBot: true,
      editedAt: new Date().toISOString(),
      previousBody: "Old",
      newBody: "New substantial content addition here",
      charDelta: 30,
      isSubstantive: false,
    };
    expect(analyzer.isSubstantive(edit, config)).toBe(false);
  });

  it("should reject edits below minimum delta", () => {
    const edit: CommentEditRecord = {
      editorLogin: "human-editor",
      editorId: 1001,
      isBot: false,
      editedAt: new Date().toISOString(),
      previousBody: "Text",
      newBody: "Tex",
      charDelta: -1,
      isSubstantive: false,
    };
    expect(analyzer.isSubstantive(edit, config)).toBe(false);
  });

  it("should distribute reward shares proportionally", () => {
    const contributions: EditorContribution[] = [
      {
        login: "editor-a",
        userId: 1001,
        substantiveEditCount: 3,
        totalCharsAdded: 200,
        totalCharsRemoved: 10,
        firstEditAt: new Date().toISOString(),
        lastEditAt: new Date().toISOString(),
        rewardSharePercent: 0,
      },
      {
        login: "editor-b",
        userId: 1002,
        substantiveEditCount: 1,
        totalCharsAdded: 50,
        totalCharsRemoved: 0,
        firstEditAt: new Date().toISOString(),
        lastEditAt: new Date().toISOString(),
        rewardSharePercent: 0,
      },
    ];

    const result = calculator.calculateShares(contributions, config);
    expect(result[0].rewardSharePercent).toBeGreaterThan(result[1].rewardSharePercent);
    const total = result.reduce((sum, c) => sum + c.rewardSharePercent, 0);
    expect(total).toBeLessThanOrEqual(config.maxEditorRewardPercent + 0.01);
  });

  it("should handle empty contributions array", () => {
    const result = calculator.calculateShares([], config);
    expect(result).toHaveLength(0);
  });
});
`;
}

/**
 * Main generator function for all comment edit credit artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<CommentEditCreditConfig>
): Record<string, string> {
  const resolvedConfig: CommentEditCreditConfig = {
    maxEditorRewardPercent: 20,
    minEditDeltaChars: 10,
    excludeBots: true,
    minEditIntervalMs: 60000,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateEditCreditInterfaces(),
    analyzer: generateEditSignificanceAnalyzer(),
    calculator: generateEditorRewardCalculator(),
    tests: generateEditCreditTests(),
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

  if (!artifacts.interfaces.includes("ICommentEditHistoryFetcher")) {
    errors.push("Missing ICommentEditHistoryFetcher interface");
  }

  if (!artifacts.interfaces.includes("IEditSignificanceAnalyzer")) {
    errors.push("Missing IEditSignificanceAnalyzer interface");
  }

  if (!artifacts.interfaces.includes("IEditorRewardCalculator")) {
    errors.push("Missing IEditorRewardCalculator interface");
  }

  if (!artifacts.analyzer.includes("EditSignificanceAnalyzer")) {
    errors.push("Missing EditSignificanceAnalyzer class");
  }

  if (!artifacts.calculator.includes("EditorRewardCalculator")) {
    errors.push("Missing EditorRewardCalculator class");
  }

  if (!artifacts.tests.includes("should mark substantive content additions as significant")) {
    errors.push("Missing critical test for substantive edit detection");
  }

  if (!artifacts.tests.includes("should reject bot edits when configured")) {
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
  generateEditCreditInterfaces,
  generateEditSignificanceAnalyzer,
  generateEditorRewardCalculator,
  generateEditCreditTests,
};
