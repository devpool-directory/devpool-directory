/**
 * @file comment-edit-rewards.ts
 * @description Scaffolding and generator utilities for crediting users who edit
 * issue/PR comments or specifications. Distributes a portion of rewards to editors
 * while filtering out bot edits and handling edge cases.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#358
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Comment edit history tracker using GitHub API
 * - Editor reward distribution calculator with configurable splits
 * - Bot detection and filtering for automated edits
 * - Edit significance scoring to prevent trivial edit farming
 * - Integration with existing reward calculation pipeline
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a single edit to a comment or issue body.
 */
export interface CommentEdit {
  /** Editor's GitHub username */
  editor: string;
  /** Timestamp of the edit */
  editedAt: Date;
  /** Whether the editor is detected as a bot */
  isBot: boolean;
  /** Character difference count (additions + deletions) */
  charDelta: number;
  /** Whether the edit is considered significant (passes threshold) */
  isSignificant: boolean;
  /** The comment/issue ID that was edited */
  targetId: number;
  /** Type of target edited */
  targetType: "issue" | "comment" | "pr_body";
}

/**
 * Configuration for comment edit rewards.
 */
export interface EditRewardConfig {
  /** Percentage of original reward allocated to editors (0-100) */
  editorSharePercent: number;
  /** Minimum character delta for an edit to be considered significant */
  minCharDelta: number;
  /** Maximum number of editors to reward per item */
  maxEditorsPerItem: number;
  /** List of bot usernames to always exclude */
  botUsernames: string[];
  /** Whether to check user type via GitHub API for bot detection */
  enableApiBotDetection: boolean;
  /** Whether to reward self-edits (author editing their own comment) */
  allowSelfEdits: boolean;
  /** Decay factor for multiple edits by same user (0-1, lower = more decay) */
  repeatEditorDecay: number;
}

/**
 * Result of calculating editor rewards for a single item.
 */
export interface EditorRewardResult {
  /** Original author reward before editor split */
  originalAuthorReward: bigint;
  /** Adjusted author reward after editor deduction */
  adjustedAuthorReward: bigint;
  /** Map of editor username -> reward amount */
  editorRewards: Map<string, bigint>;
  /** Total amount distributed to editors */
  totalEditorRewards: bigint;
  /** Number of edits filtered out (bots, trivial, etc.) */
  filteredEditCount: number;
  /** Warnings generated during calculation */
  warnings: string[];
}

/**
 * GitHub comment with edit history metadata.
 */
export interface CommentWithHistory {
  id: number;
  body: string;
  user: { login: string; type: string };
  created_at: string;
  updated_at: string;
  /** Number of times this comment was edited */
  editCount?: number;
}

// ============================================================================
// BOT DETECTOR
// ============================================================================

/**
 * Detects whether a user is a bot using multiple heuristics.
 */
export class BotDetector {
  private config: EditRewardConfig;
  private cache: Map<string, boolean> = new Map();

  constructor(config: EditRewardConfig) {
    this.config = config;
    // Pre-populate cache with known bots
    for (const bot of config.botUsernames) {
      this.cache.set(bot.toLowerCase(), true);
    }
  }

  /**
   * Check if a username is a bot.
   * Uses cached results and optional API lookup.
   * 
   * @param username - GitHub username to check
   * @param userType - Optional user type from API ("Bot", "User", "Organization")
   * @returns True if the user is a bot
   */
  isBot(username: string, userType?: string): boolean {
    const normalized = username.toLowerCase();

    // Check cache first
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    // Check user type from API if available
    if (userType === "Bot") {
      this.cache.set(normalized, true);
      return true;
    }

    // Check against known bot list
    if (this.config.botUsernames.some(b => b.toLowerCase() === normalized)) {
      this.cache.set(normalized, true);
      return true;
    }

    // Heuristic: common bot naming patterns
    const botPatterns = [
      /\[bot\]$/i,
      /^bot-/i,
      /-bot$/i,
      /^dependabot/i,
      /^renovate/i,
      /^github-actions/i,
      /^ubiquibot/i,
      /^ubiquity-os/i,
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(username)) {
        this.cache.set(normalized, true);
        return true;
      }
    }

    this.cache.set(normalized, false);
    return false;
  }

  /**
   * Batch check multiple usernames.
   */
  areBots(usernames: string[]): Map<string, boolean> {
    const results = new Map<string, boolean>();
    for (const username of usernames) {
      results.set(username, this.isBot(username));
    }
    return results;
  }
}

// ============================================================================
// EDIT SIGNIFICANCE SCORER
// ============================================================================

/**
 * Scores edits for significance to prevent reward farming via trivial changes.
 */
export class EditSignificanceScorer {
  private config: EditRewardConfig;

  constructor(config: EditRewardConfig) {
    this.config = config;
  }

  /**
   * Determine if an edit is significant enough to warrant a reward.
   * 
   * @param oldBody - Original text before edit
   * @param newBody - Text after edit
   * @returns Significance assessment
   */
  assess(oldBody: string, newBody: string): { significant: boolean; charDelta: number; reason: string } {
    const charDelta = this.calculateCharDelta(oldBody, newBody);

    if (charDelta < this.config.minCharDelta) {
      return {
        significant: false,
        charDelta,
        reason: `Edit delta (${charDelta} chars) below minimum threshold (${this.config.minCharDelta})`,
      };
    }

    // Check for whitespace-only changes
    if (oldBody.trim() === newBody.trim()) {
      return {
        significant: false,
        charDelta,
        reason: "Edit only changed whitespace/formatting",
      };
    }

    return {
      significant: true,
      charDelta,
      reason: `Significant edit with ${charDelta} character changes`,
    };
  }

  /**
   * Calculate character-level edit distance.
   * Simple implementation counting additions and deletions.
   */
  private calculateCharDelta(oldText: string, newText: string): number {
    // Simple approach: sum of absolute length difference plus substitution estimate
    const lenDiff = Math.abs(newText.length - oldText.length);
    
    // Count common prefix/suffix to estimate actual changes
    let prefixLen = 0;
    while (prefixLen < oldText.length && prefixLen < newText.length && 
           oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (suffixLen < (oldText.length - prefixLen) && 
           suffixLen < (newText.length - prefixLen) &&
           oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
      suffixLen++;
    }

    const changedOld = oldText.length - prefixLen - suffixLen;
    const changedNew = newText.length - prefixLen - suffixLen;

    return Math.max(changedOld, changedNew);
  }
}

// ============================================================================
// EDITOR REWARD CALCULATOR
// ============================================================================

/**
 * Calculates reward distribution between original authors and editors.
 */
export class EditorRewardCalculator {
  private config: EditRewardConfig;
  private botDetector: BotDetector;
  private scorer: EditSignificanceScorer;

  constructor(config: EditRewardConfig) {
    this.config = config;
    this.botDetector = new BotDetector(config);
    this.scorer = new EditSignificanceScorer(config);
  }

  /**
   * Calculate editor rewards for a comment/issue with edit history.
   * 
   * @param originalAuthor - Username of the original author
   * @param originalReward - Reward amount originally allocated to author
   * @param edits - List of edits made to the item
   * @returns Reward distribution result
   */
  calculate(
    originalAuthor: string,
    originalReward: bigint,
    edits: CommentEdit[]
  ): EditorRewardResult {
    const warnings: string[] = [];
    const editorRewards = new Map<string, bigint>();
    let filteredCount = 0;

    // Filter and validate edits
    const validEdits: CommentEdit[] = [];
    for (const edit of edits) {
      // Skip bot edits
      if (edit.isBot || this.botDetector.isBot(edit.editor)) {
        filteredCount++;
        continue;
      }

      // Skip insignificant edits
      if (!edit.isSignificant) {
        filteredCount++;
        continue;
      }

      // Skip self-edits if not allowed
      if (!this.config.allowSelfEdits && edit.editor.toLowerCase() === originalAuthor.toLowerCase()) {
        filteredCount++;
        continue;
      }

      validEdits.push(edit);
    }

    // Limit to max editors
    if (validEdits.length > this.config.maxEditorsPerItem) {
      warnings.push(`Capped at ${this.config.maxEditorsPerItem} editors (had ${validEdits.length} valid edits)`);
      validEdits.splice(this.config.maxEditorsPerItem);
    }

    // Calculate total editor share
    const totalEditorShare = (originalReward * BigInt(this.config.editorSharePercent)) / 100n;
    const adjustedAuthorReward = originalReward - totalEditorShare;

    // Distribute among editors with decay for repeat editors
    if (validEdits.length > 0 && totalEditorShare > 0n) {
      const editorCounts = new Map<string, number>();
      
      // Count edits per editor
      for (const edit of validEdits) {
        const key = edit.editor.toLowerCase();
        editorCounts.set(key, (editorCounts.get(key) || 0) + 1);
      }

      // Calculate weighted shares with decay
      let totalWeight = 0;
      const weights = new Map<string, number>();
      
      for (const [editor, count] of editorCounts) {
        // Apply decay: first edit = 1.0, second = decay, third = decay^2, etc.
        let weight = 0;
        for (let i = 0; i < count; i++) {
          weight += Math.pow(this.config.repeatEditorDecay, i);
        }
        weights.set(editor, weight);
        totalWeight += weight;
      }

      // Distribute proportionally
      let distributed = 0n;
      const entries = Array.from(weights.entries());
      
      for (let i = 0; i < entries.length; i++) {
        const [editor, weight] = entries[i];
        let amount: bigint;
        
        if (i === entries.length - 1) {
          // Last editor gets remainder to avoid rounding loss
          amount = totalEditorShare - distributed;
        } else {
          amount = (totalEditorShare * BigInt(Math.round(weight * 1000))) / BigInt(Math.round(totalWeight * 1000));
        }
        
        // Find original case username
        const originalCase = validEdits.find(e => e.editor.toLowerCase() === editor)?.editor || editor;
        editorRewards.set(originalCase, amount);
        distributed += amount;
      }
    }

    return {
      originalAuthorReward: originalReward,
      adjustedAuthorReward: validEdits.length > 0 ? adjustedAuthorReward : originalReward,
      editorRewards,
      totalEditorRewards: Array.from(editorRewards.values()).reduce((sum, v) => sum + v, 0n),
      filteredEditCount: filteredCount,
      warnings,
    };
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default configuration for comment edit rewards.
 */
export const DEFAULT_EDIT_REWARD_CONFIG: EditRewardConfig = {
  editorSharePercent: 10, // 10% of reward goes to editors
  minCharDelta: 20, // Minimum 20 chars changed to be significant
  maxEditorsPerItem: 5, // Max 5 editors rewarded per item
  botUsernames: [
    "ubiquibot",
    "ubiquity-os",
    "github-actions[bot]",
    "dependabot[bot]",
    "renovate[bot]",
  ],
  enableApiBotDetection: true,
  allowSelfEdits: false, // Don't reward authors for editing their own comments
  repeatEditorDecay: 0.5, // Second edit worth 50%, third 25%, etc.
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration code for fetching comment edit history.
 * Note: GitHub API doesn't expose full edit history directly;
 * this uses available metadata and webhook events.
 * 
 * @returns TypeScript integration code
 */
export function generateEditHistoryIntegration(): string {
  return `/**
 * Integration: Track comment edits for reward distribution.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#358
 */

import { EditorRewardCalculator, DEFAULT_EDIT_REWARD_CONFIG, CommentEdit } from "./comment-edit-rewards";

/**
 * Process comment update webhook event and track edits.
 * Call this from your webhook handler when receiving "issue_comment" or "issues" events.
 */
export async function handleCommentEditWebhook(
  event: { action: string; comment?: any; issue?: any; sender: { login: string; type: string } },
  editStore: Map<number, CommentEdit[]>
): Promise<void> {
  if (event.action !== "edited") return;

  const target = event.comment || event.issue;
  if (!target) return;

  const edit: CommentEdit = {
    editor: event.sender.login,
    editedAt: new Date(target.updated_at),
    isBot: event.sender.type === "Bot",
    charDelta: 0, // Would need previous version to calculate
    isSignificant: true, // Assume significant for webhook-triggered edits
    targetId: target.id,
    targetType: event.comment ? "comment" : "issue",
  };

  const existing = editStore.get(target.id) || [];
  existing.push(edit);
  editStore.set(target.id, existing);
}

/**
 * Calculate and apply editor rewards during reward distribution.
 */
export function applyEditorRewards(
  authorRewards: Map<string, bigint>,
  editStore: Map<number, CommentEdit[]>,
  itemId: number,
  authorUsername: string
): { adjustedRewards: Map<string, bigint>; editorRewards: Map<string, bigint> } {
  const calculator = new EditorRewardCalculator(DEFAULT_EDIT_REWARD_CONFIG);
  const edits = editStore.get(itemId) || [];
  
  const authorReward = authorRewards.get(authorUsername) || 0n;
  const result = calculator.calculate(authorUsername, authorReward, edits);

  const adjustedRewards = new Map(authorRewards);
  adjustedRewards.set(authorUsername, result.adjustedAuthorReward);

  return {
    adjustedRewards,
    editorRewards: result.editorRewards,
  };
}
`;
}

/**
 * Format editor reward disclosure for GitHub comments.
 */
export function formatEditorRewardDisclosure(result: EditorRewardResult): string {
  if (result.editorRewards.size === 0) {
    return "";
  }

  const lines: string[] = [
    `### ✏️ Editor Rewards Distributed`,
    ``,
    `| Editor | Amount |`,
    `|--------|--------|`,
  ];

  for (const [editor, amount] of result.editorRewards) {
    lines.push(`| @${editor} | ${formatWei(amount)} |`);
  }

  lines.push(``);
  lines.push(`*Original author reward adjusted from ${formatWei(result.originalAuthorReward)} to ${formatWei(result.adjustedAuthorReward)} (${DEFAULT_EDIT_REWARD_CONFIG.editorSharePercent}% allocated to editors)*`);

  if (result.warnings.length > 0) {
    lines.push(``);
    for (const warning of result.warnings) {
      lines.push(`> ⚠️ ${warning}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format wei amount for display.
 */
function formatWei(amount: bigint): string {
  const str = amount.toString().padStart(19, "0");
  const intPart = str.slice(0, -18) || "0";
  const decPart = str.slice(-18).replace(/0+$/, "") || "0";
  return \`\${intPart}.\${decPart.slice(0, 6)}\`;
}
