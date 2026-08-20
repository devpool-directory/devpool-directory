/**
 * @file llm-command-router.ts
 * @description Scaffolding and generator utilities for routing commands triggered
 * via LLM mentions (e.g., "@UbiquityOS can you generate rewards") to the correct
 * command handlers. Bridges the gap between natural language LLM routing and
 * structured command execution.
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#344
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - LLM mention detection and extraction from comment bodies
 * - Natural language intent classifier for command routing
 * - Command mapping registry with fuzzy matching support
 * - Integration bridge converting LLM-routed requests to standard commands
 * - Fallback handling for unrecognized intents
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a detected LLM mention in a comment.
 */
export interface LlmMention {
  /** The bot username mentioned (e.g., "UbiquityOS") */
  botUsername: string;
  /** The full text following the mention */
  promptText: string;
  /** Position of the mention in the original body */
  startIndex: number;
  /** End position of the mention + prompt */
  endIndex: number;
  /** Whether this appears to be a command request vs general conversation */
  isCommandIntent: boolean;
}

/**
 * Classified intent from an LLM-routed message.
 */
export interface ClassifiedIntent {
  /** Matched command identifier */
  commandId: string | null;
  /** Confidence score 0-1 */
  confidence: number;
  /** Extracted parameters from the natural language prompt */
  extractedParams: Record<string, string>;
  /** Original prompt text */
  originalPrompt: string;
  /** Whether this matched any known command */
  hasMatch: boolean;
  /** Closest partial match if no exact match found */
  closestMatch?: string;
}

/**
 * Command definition for the router registry.
 */
export interface CommandDefinition {
  /** Unique command identifier (e.g., "/finish", "/generate-rewards") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Keywords that indicate this command in natural language */
  triggerKeywords: string[];
  /** Regex patterns for more complex matching */
  triggerPatterns?: RegExp[];
  /** Parameter extraction patterns */
  paramExtractors?: Array<{
    name: string;
    pattern: RegExp;
    defaultValue?: string;
  }>;
  /** Description for documentation */
  description: string;
  /** Whether this command requires confirmation */
  requiresConfirmation: boolean;
}

/**
 * Result of routing an LLM mention to a command.
 */
export interface RoutingResult {
  /** Whether routing succeeded */
  success: boolean;
  /** The routed command (null if no match) */
  command: CommandDefinition | null;
  /** Classified intent details */
  intent: ClassifiedIntent;
  /** Generated synthetic command string equivalent */
  syntheticCommand: string | null;
  /** Error message if routing failed */
  error?: string;
  /** Warnings generated during routing */
  warnings: string[];
}

/**
 * Configuration for the LLM command router.
 */
export interface LlmRouterConfig {
  /** Bot usernames to detect as LLM targets */
  botUsernames: string[];
  /** Minimum confidence threshold for accepting a match */
  minConfidenceThreshold: number;
  /** Whether to enable fuzzy keyword matching */
  enableFuzzyMatching: boolean;
  /** Maximum edit distance for fuzzy matches */
  maxEditDistance: number;
  /** Whether to extract parameters from natural language */
  enableParamExtraction: boolean;
  /** Default command when no match is found */
  defaultCommandId: string | null;
}

// ============================================================================
// MENTION DETECTOR
// ============================================================================

/**
 * Detects and extracts LLM bot mentions from comment bodies.
 */
export class MentionDetector {
  private botUsernames: string[];

  constructor(botUsernames: string[]) {
    // Normalize to lowercase for case-insensitive matching
    this.botUsernames = botUsernames.map(u => u.toLowerCase());
  }

  /**
   * Find all LLM mentions in a comment body.
   * 
   * @param body - The comment or issue body text
   * @returns Array of detected mentions
   */
  detect(body: string): LlmMention[] {
    const mentions: LlmMention[] = [];
    const lowerBody = body.toLowerCase();

    for (const botName of this.botUsernames) {
      // Match @BotName patterns
      const pattern = new RegExp(`@${this.escapeRegex(botName)}\\b`, "gi");
      let match;

      while ((match = pattern.exec(body)) !== null) {
        const startIndex = match.index;
        const afterMention = body.slice(startIndex + match[0].length).trim();
        
        // Extract prompt text (until next @mention or end of line for simple cases)
        const nextMention = afterMention.search(/@\w+/);
        const promptText = nextMention >= 0 
          ? afterMention.slice(0, nextMention).trim()
          : afterMention.trim();

        // Heuristic: check if this looks like a command intent
        const isCommandIntent = this.detectCommandIntent(promptText);

        mentions.push({
          botUsername: botName,
          promptText,
          startIndex,
          endIndex: startIndex + match[0].length + promptText.length,
          isCommandIntent,
        });
      }
    }

    return mentions;
  }

  /**
   * Check if a prompt appears to be requesting a command action.
   */
  private detectCommandIntent(prompt: string): boolean {
    const commandIndicators = [
      /\b(generate|create|make|build|run|execute|do|finish|complete|start|trigger)\b/i,
      /\b(reward|bounty|payment|payout)\b/i,
      /\b(review|approve|merge|close)\b/i,
      /\?$/, // Questions often indicate requests
      /\bcan you\b/i,
      /\bplease\b/i,
    ];

    return commandIndicators.some(pattern => pattern.test(prompt));
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// ============================================================================
// INTENT CLASSIFIER
// ============================================================================

/**
 * Classifies natural language prompts into known commands.
 */
export class IntentClassifier {
  private commands: Map<string, CommandDefinition> = new Map();
  private config: LlmRouterConfig;

  constructor(commands: CommandDefinition[], config: LlmRouterConfig) {
    this.config = config;
    for (const cmd of commands) {
      this.commands.set(cmd.id, cmd);
    }
  }

  /**
   * Classify a prompt into a command intent.
   * 
   * @param prompt - Natural language prompt from LLM mention
   * @returns Classified intent with confidence score
   */
  classify(prompt: string): ClassifiedIntent {
    const lowerPrompt = prompt.toLowerCase();
    let bestMatch: { id: string; score: number } | null = null;
    const extractedParams: Record<string, string> = {};

    for (const [id, cmd] of this.commands) {
      let score = 0;

      // Check keyword matches
      for (const keyword of cmd.triggerKeywords) {
        if (lowerPrompt.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Check regex pattern matches (higher weight)
      if (cmd.triggerPatterns) {
        for (const pattern of cmd.triggerPatterns) {
          if (pattern.test(prompt)) {
            score += 2;
          }
        }
      }

      // Normalize score by number of triggers
      const totalTriggers = cmd.triggerKeywords.length + (cmd.triggerPatterns?.length || 0);
      const normalizedScore = totalTriggers > 0 ? score / totalTriggers : 0;

      if (normalizedScore > (bestMatch?.score || 0)) {
        bestMatch = { id, score: normalizedScore };
      }
    }

    // Apply fuzzy matching if enabled and no strong match
    if (this.config.enableFuzzyMatching && (!bestMatch || bestMatch.score < 0.5)) {
      const fuzzyMatch = this.fuzzyMatch(lowerPrompt);
      if (fuzzyMatch && fuzzyMatch.score > (bestMatch?.score || 0)) {
        bestMatch = fuzzyMatch;
      }
    }

    // Extract parameters if we have a match
    if (bestMatch && this.config.enableParamExtraction) {
      const cmd = this.commands.get(bestMatch.id);
      if (cmd?.paramExtractors) {
        for (const extractor of cmd.paramExtractors) {
          const match = prompt.match(extractor.pattern);
          if (match && match[1]) {
            extractedParams[extractor.name] = match[1];
          } else if (extractor.defaultValue) {
            extractedParams[extractor.name] = extractor.defaultValue;
          }
        }
      }
    }

    const hasMatch = bestMatch !== null && bestMatch.score >= this.config.minConfidenceThreshold;

    return {
      commandId: hasMatch ? bestMatch!.id : null,
      confidence: bestMatch?.score || 0,
      extractedParams,
      originalPrompt: prompt,
      hasMatch,
      closestMatch: !hasMatch && bestMatch ? bestMatch.id : undefined,
    };
  }

  /**
   * Perform fuzzy matching against command keywords.
   */
  private fuzzyMatch(prompt: string): { id: string; score: number } | null {
    let best: { id: string; score: number } | null = null;

    for (const [id, cmd] of this.commands) {
      for (const keyword of cmd.triggerKeywords) {
        const distance = this.levenshteinDistance(prompt, keyword.toLowerCase());
        const maxLen = Math.max(prompt.length, keyword.length);
        const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

        if (similarity > (best?.score || 0) && similarity > 0.6) {
          best = { id, score: similarity * 0.8 }; // Discount fuzzy matches
        }
      }
    }

    return best;
  }

  /**
   * Calculate Levenshtein edit distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// ============================================================================
// COMMAND ROUTER
// ============================================================================

/**
 * Main router that bridges LLM mentions to structured commands.
 */
export class LlmCommandRouter {
  private mentionDetector: MentionDetector;
  private intentClassifier: IntentClassifier;
  private config: LlmRouterConfig;

  constructor(commands: CommandDefinition[], config: LlmRouterConfig) {
    this.config = config;
    this.mentionDetector = new MentionDetector(config.botUsernames);
    this.intentClassifier = new IntentClassifier(commands, config);
  }

  /**
   * Route a comment body containing LLM mentions to commands.
   * 
   * @param body - Comment or issue body text
   * @returns Array of routing results (one per detected mention)
   */
  route(body: string): RoutingResult[] {
    const mentions = this.mentionDetector.detect(body);
    const results: RoutingResult[] = [];

    for (const mention of mentions) {
      if (!mention.isCommandIntent) {
        results.push({
          success: false,
          command: null,
          intent: {
            commandId: null,
            confidence: 0,
            extractedParams: {},
            originalPrompt: mention.promptText,
            hasMatch: false,
          },
          syntheticCommand: null,
          error: "Mention does not appear to be a command request",
          warnings: [],
        });
        continue;
      }

      const intent = this.intentClassifier.classify(mention.promptText);
      
      if (intent.hasMatch && intent.commandId) {
        const command = this.intentClassifier["commands"].get(intent.commandId) || null;
        const syntheticCommand = this.buildSyntheticCommand(command!, intent);

        results.push({
          success: true,
          command,
          intent,
          syntheticCommand,
          warnings: [],
        });
      } else if (this.config.defaultCommandId) {
        const defaultCmd = this.intentClassifier["commands"].get(this.config.defaultCommandId) || null;
        results.push({
          success: true,
          command: defaultCmd,
          intent,
          syntheticCommand: defaultCmd ? `/${defaultCmd.id}` : null,
          warnings: [`No confident match found (confidence: ${intent.confidence.toFixed(2)}), using default command`],
        });
      } else {
        results.push({
          success: false,
          command: null,
          intent,
          syntheticCommand: null,
          error: `Could not determine command intent (confidence: ${intent.confidence.toFixed(2)})`,
          warnings: intent.closestMatch 
            ? [`Closest match was "${intent.closestMatch}" but below threshold`]
            : [],
        });
      }
    }

    return results;
  }

  /**
   * Build a synthetic command string from classified intent.
   * This allows LLM-routed requests to be processed by existing command handlers.
   */
  private buildSyntheticCommand(command: CommandDefinition, intent: ClassifiedIntent): string {
    const params = Object.entries(intent.extractedParams)
      .map(([key, value]) => `--${key}="${value}"`)
      .join(" ");

    return `/${command.id}${params ? " " + params : ""}`;
  }

  /**
   * Register additional commands at runtime.
   */
  registerCommand(command: CommandDefinition): void {
    this.intentClassifier["commands"].set(command.id, command);
  }
}

// ============================================================================
// DEFAULT COMMAND REGISTRY
// ============================================================================

/**
 * Default commands for the text-conversation-rewards plugin.
 */
export const DEFAULT_COMMANDS: CommandDefinition[] = [
  {
    id: "finish",
    name: "Finish Task",
    triggerKeywords: ["finish", "complete", "done", "finalize"],
    triggerPatterns: [/\b(finish|complete)\s+(this\s+)?(task|issue|pr|bounty)\b/i],
    description: "Mark task as complete and trigger reward generation",
    requiresConfirmation: false,
  },
  {
    id: "generate-rewards",
    name: "Generate Rewards",
    triggerKeywords: ["reward", "rewards", "payout", "generate", "distribute"],
    triggerPatterns: [
      /\b(generate|create|calculate)\s+(the\s+)?rewards?\b/i,
      /\bdistribute\s+(the\s+)?(bounty|payment|reward)s?\b/i,
    ],
    paramExtractors: [
      { name: "amount", pattern: /\b(\d+(?:\.\d+)?)\s*(?:USD|usd|dollars?)\b/, defaultValue: "auto" },
    ],
    description: "Generate reward distribution for contributors",
    requiresConfirmation: true,
  },
  {
    id: "review",
    name: "Request Review",
    triggerKeywords: ["review", "check", "audit"],
    triggerPatterns: [/\b(request|start|do)\s+(a\s+)?review\b/i],
    description: "Initiate code review process",
    requiresConfirmation: false,
  },
  {
    id: "status",
    name: "Check Status",
    triggerKeywords: ["status", "progress", "update", "state"],
    triggerPatterns: [/\b(what'?s?\s+)?(the\s+)?status\b/i, /\b(check|show)\s+(me\s+)?(the\s+)?(progress|status)\b/i],
    description: "Get current task or bounty status",
    requiresConfirmation: false,
  },
];

/**
 * Default router configuration.
 */
export const DEFAULT_ROUTER_CONFIG: LlmRouterConfig = {
  botUsernames: ["UbiquityOS", "ubiquity-os", "ubiquibot"],
  minConfidenceThreshold: 0.3,
  enableFuzzyMatching: true,
  maxEditDistance: 3,
  enableParamExtraction: true,
  defaultCommandId: null,
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Create a pre-configured router for text-conversation-rewards.
 */
export function createDefaultRouter(): LlmCommandRouter {
  return new LlmCommandRouter(DEFAULT_COMMANDS, DEFAULT_ROUTER_CONFIG);
}

/**
 * Generate integration patch for webhook handlers.
 * 
 * @returns TypeScript code to integrate LLM routing into event processing
 */
export function generateWebhookIntegration(): string {
  return `/**
 * Integration: Handle LLM-routed commands in webhook events.
 * 
 * Issue: ubiquity-os-marketplace/text-conversation-rewards#344
 */

import { createDefaultRouter, RoutingResult } from "./llm-command-router";

const router = createDefaultRouter();

/**
 * Process incoming comment event and detect LLM-routed commands.
 * Call this BEFORE standard command parsing to catch @UbiquityOS mentions.
 */
export async function handleLlmRoutedComment(
  event: { action: string; comment?: { body: string }; sender: { login: string; type: string } },
  executeCommand: (cmd: string, context: any) => Promise<void>
): Promise<boolean> {
  // Only process created/edited comments from non-bots
  if (!["created", "edited"].includes(event.action)) return false;
  if (!event.comment?.body) return false;
  if (event.sender.type === "Bot") return false;

  // Route any LLM mentions
  const results = router.route(event.comment.body);
  
  let handled = false;
  for (const result of results) {
    if (result.success && result.syntheticCommand) {
      console.log(\`[LLM Router] Routed "@\${result.command?.name}" -> \${result.syntheticCommand}\`);
      
      await executeCommand(result.syntheticCommand, {
        source: "llm_mention",
        originalPrompt: result.intent.originalPrompt,
        confidence: result.intent.confidence,
        params: result.intent.extractedParams,
      });
      
      handled = true;
    } else if (result.warnings.length > 0) {
      console.warn(\`[LLM Router] Warning: \${result.warnings.join(", ")}\`);
    }
  }

  return handled;
}

/**
 * Format routing feedback for GitHub comments.
 */
export function formatRoutingFeedback(results: RoutingResult[]): string {
  const routed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (routed.length === 0 && failed.length === 0) return "";

  const lines: string[] = ["### 🤖 LLM Command Routing"];

  for (const r of routed) {
    lines.push(\`✅ Routed to \`/\${r.command?.id}\` (confidence: \${(r.intent.confidence * 100).toFixed(0)}%)\`);
  }

  for (const r of failed) {
    lines.push(\`❌ Could not route: \${r.error}\`);
    if (r.intent.closestMatch) {
      lines.push(\`   Did you mean \`/\${r.intent.closestMatch}\`?\`);
    }
  }

  return lines.join("\\n");
}
`;
}

/**
 * Format help text showing available LLM-routable commands.
 */
export function formatHelpText(): string {
  const lines: string[] = [
    "### 🤖 Available LLM Commands",
    "",
    "You can trigger these commands by mentioning `@UbiquityOS`:",
    "",
  ];

  for (const cmd of DEFAULT_COMMANDS) {
    const examples = cmd.triggerKeywords.slice(0, 3).map(k => `"${k}"`).join(", ");
    lines.push(`- **/${cmd.id}** - ${cmd.description}`);
    lines.push(`  Try: _"@UbiquityOS ${examples.split(",")[0]}..."_`);
  }

  lines.push("");
  lines.push("*Natural language requests are automatically routed to the appropriate command.*");

  return lines.join("\n");
}
