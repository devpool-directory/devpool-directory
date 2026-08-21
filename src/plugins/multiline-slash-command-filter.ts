/**
 * @file multiline-slash-command-filter.ts
 * @description Scaffolding and generator utilities for filtering multiline slash
 * commands from comment bodies before reward evaluation. Prevents command content
 * from being scored as regular comments.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#242
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - Multiline slash command detector supporting fenced and indented blocks
 * - Comment body sanitizer removing command content while preserving structure
 * - Command boundary parser handling nested code blocks and edge cases
 * - Integration patch for comment evaluation pipeline
 * - Test fixtures for various multiline command formats
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a detected slash command block in a comment.
 */
export interface SlashCommandBlock {
  /** The command name (e.g., "ask", "generate-rewards") */
  commandName: string;
  /** Start index of the command invocation (including /) */
  startIndex: number;
  /** End index of the entire command block */
  endIndex: number;
  /** The raw text of the command including arguments */
  rawText: string;
  /** Whether this is a multiline command */
  isMultiline: boolean;
  /** Number of lines spanned by the command */
  lineCount: number;
}

/**
 * Result of sanitizing a comment body.
 */
export interface SanitizedComment {
  /** Original comment body */
  originalBody: string;
  /** Body with slash commands removed */
  sanitizedBody: string;
  /** Commands that were removed */
  removedCommands: SlashCommandBlock[];
  /** Whether any modifications were made */
  wasModified: boolean;
  /** Character count difference */
  charDelta: number;
}

/**
 * Configuration for slash command filtering.
 */
export interface SlashCommandFilterConfig {
  /** Known command prefixes to detect */
  commandPrefixes: string[];
  /** Whether to treat fenced code blocks after commands as part of the command */
  includeFencedBlocks: boolean;
  /** Whether to treat indented blocks after commands as part of the command */
  includeIndentedBlocks: boolean;
  /** Maximum lines a multiline command can span before being treated as separate */
  maxCommandLines: number;
  /** Whether to preserve command markers as placeholders */
  preservePlaceholders: boolean;
  /** Placeholder text when preservePlaceholders is true */
  placeholderText: string;
}

// ============================================================================
// COMMAND DETECTOR
// ============================================================================

/**
 * Detects slash command blocks in comment bodies, including multiline variants.
 */
export class SlashCommandDetector {
  private config: SlashCommandFilterConfig;

  constructor(config: SlashCommandFilterConfig) {
    this.config = config;
  }

  /**
   * Find all slash command blocks in a comment body.
   * Handles single-line, fenced multiline, and indented multiline formats.
   * 
   * @param body - The comment body to scan
   * @returns Array of detected command blocks sorted by position
   */
  detect(body: string): SlashCommandBlock[] {
    const blocks: SlashCommandBlock[] = [];
    const lines = body.split("\n");
    let currentPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this line starts with a known command
      for (const prefix of this.config.commandPrefixes) {
        const commandPattern = new RegExp(`^\\/${prefix}(?:\\s|$)`, "i");
        const match = trimmedLine.match(commandPattern);

        if (match) {
          const commandStart = currentPos + line.indexOf(match[0]);
          const commandName = prefix;
          
          // Determine if this is multiline and find its extent
          const blockEnd = this.findCommandBlockEnd(lines, i, currentPos);
          const rawText = body.slice(commandStart, blockEnd.endIndex);
          const lineCount = blockEnd.endLine - i + 1;

          blocks.push({
            commandName,
            startIndex: commandStart,
            endIndex: blockEnd.endIndex,
            rawText,
            isMultiline: lineCount > 1,
            lineCount,
          });

          // Skip past this block for further scanning
          i = blockEnd.endLine;
          currentPos = blockEnd.endIndex;
          break;
        }
      }

      currentPos += line.length + 1; // +1 for newline
    }

    return blocks.sort((a, b) => a.startIndex - b.startIndex);
  }

  /**
   * Find the end boundary of a command block starting at the given line.
   */
  private findCommandBlockEnd(
    lines: string[],
    startLine: number,
    startPos: number
  ): { endIndex: number; endLine: number } {
    let currentPos = startPos + lines[startLine].length + 1;
    let endLine = startLine;

    // Check for fenced code block immediately following
    if (this.config.includeFencedBlocks && startLine + 1 < lines.length) {
      const nextLine = lines[startLine + 1].trim();
      if (nextLine.startsWith("```")) {
        // Find closing fence
        for (let j = startLine + 2; j < lines.length; j++) {
          if (lines[j].trim().startsWith("```")) {
            endLine = j;
            currentPos = 0;
            for (let k = 0; k <= j; k++) {
              currentPos += lines[k].length + 1;
            }
            return { endIndex: currentPos - 1, endLine };
          }
        }
        // No closing fence found - take rest of content up to max lines
        endLine = Math.min(startLine + this.config.maxCommandLines, lines.length - 1);
        currentPos = 0;
        for (let k = 0; k <= endLine; k++) {
          currentPos += lines[k].length + 1;
        }
        return { endIndex: currentPos - 1, endLine };
      }
    }

    // Check for indented block
    if (this.config.includeIndentedBlocks && startLine + 1 < lines.length) {
      const nextLine = lines[startLine + 1];
      if (/^\s{4,}/.test(nextLine) || /^\t/.test(nextLine)) {
        // Consume indented lines
        for (let j = startLine + 1; j < lines.length; j++) {
          const line = lines[j];
          if (/^\s{4,}/.test(line) || /^\t/.test(line) || line.trim() === "") {
            endLine = j;
          } else {
            break;
          }
        }
        currentPos = 0;
        for (let k = 0; k <= endLine; k++) {
          currentPos += lines[k].length + 1;
        }
        return { endIndex: currentPos - 1, endLine };
      }
    }

    // Single line command or simple multiline without fencing/indentation
    // Check subsequent lines for continuation (non-empty, not a new command)
    for (let j = startLine + 1; j < Math.min(startLine + this.config.maxCommandLines, lines.length); j++) {
      const line = lines[j].trim();
      
      // Stop at empty lines, new commands, or markdown headers
      if (line === "" || /^\/\w+/.test(line) || /^#+\s/.test(line)) {
        break;
      }
      
      endLine = j;
    }

    currentPos = 0;
    for (let k = 0; k <= endLine; k++) {
      currentPos += lines[k].length + 1;
    }
    
    return { endIndex: currentPos - 1, endLine };
  }
}

// ============================================================================
// COMMENT SANITIZER
// ============================================================================

/**
 * Removes slash command blocks from comment bodies while preserving structure.
 */
export class CommentSanitizer {
  private config: SlashCommandFilterConfig;
  private detector: SlashCommandDetector;

  constructor(config: SlashCommandFilterConfig) {
    this.config = config;
    this.detector = new SlashCommandDetector(config);
  }

  /**
   * Sanitize a comment body by removing slash command content.
   * 
   * @param body - Original comment body
   * @returns Sanitized result with metadata
   */
  sanitize(body: string): SanitizedComment {
    const commands = this.detector.detect(body);

    if (commands.length === 0) {
      return {
        originalBody: body,
        sanitizedBody: body,
        removedCommands: [],
        wasModified: false,
        charDelta: 0,
      };
    }

    // Build sanitized body by replacing command blocks
    let sanitized = "";
    let lastEnd = 0;

    for (const cmd of commands) {
      // Add content before this command
      sanitized += body.slice(lastEnd, cmd.startIndex);

      // Add placeholder if configured
      if (this.config.preservePlaceholders) {
        sanitized += this.config.placeholderText;
      }

      lastEnd = cmd.endIndex + 1;
    }

    // Add remaining content
    sanitized += body.slice(lastEnd);

    // Clean up excessive whitespace left by removals
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n").trim();

    return {
      originalBody: body,
      sanitizedBody: sanitized,
      removedCommands: commands,
      wasModified: true,
      charDelta: body.length - sanitized.length,
    };
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_SLASH_COMMAND_CONFIG: SlashCommandFilterConfig = {
  commandPrefixes: [
    "ask",
    "generate-rewards",
    "finish",
    "start",
    "stop",
    "review",
    "permit",
    "generate-permit",
    "wallet",
    "query",
    "status",
    "help",
  ],
  includeFencedBlocks: true,
  includeIndentedBlocks: true,
  maxCommandLines: 50,
  preservePlaceholders: false,
  placeholderText: "[command removed]",
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for comment evaluation pipeline.
 */
export function generateIntegrationPatch(): string {
  return `/**
 * Integration: Filter multiline slash commands before evaluation.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#242
 */

import { CommentSanitizer, DEFAULT_SLASH_COMMAND_CONFIG } from "./multiline-slash-command-filter";

const sanitizer = new CommentSanitizer(DEFAULT_SLASH_COMMAND_CONFIG);

/**
 * FIXED: Evaluate comment content after removing slash commands.
 * Replaces direct body evaluation that incorrectly scored command content.
 */
export async function evaluateCommentFiltered(
  commentBody: string,
  evaluateFn: (text: string) => Promise<{ score: number; reason: string }>
): Promise<{ score: number; reason: string; commandsRemoved: number }> {
  const result = sanitizer.sanitize(commentBody);

  if (!result.wasModified) {
    const evalResult = await evaluateFn(commentBody);
    return { ...evalResult, commandsRemoved: 0 };
  }

  // Evaluate only the non-command content
  const evalResult = await evaluateFn(result.sanitizedBody);

  console.log(\`[Filter] Removed \${result.removedCommands.length} command(s) (\${result.charDelta} chars) before evaluation\`);

  return {
    ...evalResult,
    commandsRemoved: result.removedCommands.length,
  };
}

/**
 * Pre-process webhook comment payload before reward calculation.
 */
export function preprocessCommentForRewards(comment: { body: string }): {
  body: string;
  hadCommands: boolean;
  commandNames: string[];
} {
  const result = sanitizer.sanitize(comment.body);
  
  return {
    body: result.sanitizedBody,
    hadCommands: result.wasModified,
    commandNames: result.removedCommands.map(c => c.commandName),
  };
}
`;
}

/**
 * Format filter disclosure for debugging/audit.
 */
export function formatFilterDisclosure(result: SanitizedComment): string {
  if (!result.wasModified) return "";

  const lines: string[] = [
    `### 🔧 Slash Commands Filtered`,
    ``,
    `\${result.removedCommands.length} command(s) removed before evaluation:`,
    ``,
  ];

  for (const cmd of result.removedCommands) {
    lines.push(\`- \`/\${cmd.commandName}\` (\${cmd.lineCount} line\${cmd.lineCount > 1 ? "s" : ""}, \${cmd.rawText.length} chars)\`);
  }

  lines.push(``);
  lines.push(`*Content reduced by \${result.charDelta} characters. Only non-command text was evaluated for rewards.*`);

  return lines.join("\\n");
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

export function generateTestFixtures(): {
  singleLine: string;
  multilineFenced: string;
  multilineIndented: string;
  mixedContent: string;
  multipleCommands: string;
} {
  return {
    singleLine: "/ask What is the status of this task?",
    
    multilineFenced: \`/ask Please analyze this code:
\\\`\\\`\\\`typescript
function example() {
  return 42;
}
\\\`\\\`\\\`
Some trailing text.\`,

    multilineIndented: \`/generate-rewards
    Based on the following contributions:
    - User A: fixed bug
    - User B: added tests
    
    Calculate fair distribution.\`,

    mixedContent: \`Great work on this PR!

/ask Can you explain the architecture decision?

The performance improvements look solid.\`,

    multipleCommands: \`/start

Working on the implementation now.

/finish
Done! Here's what I changed:
- Fixed the parser
- Added validation\`,
  };
}
