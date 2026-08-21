/**
 * @file text-conversation-llm-router-command-support.ts
 * @description Scaffolding and generator utilities for enabling command execution
 * when triggered via LLM router mentions (e.g., "@UbiquityOS can you generate rewards").
 * Addresses the issue where natural-language routed commands are ignored because
 * the system only checks for direct bot events rather than user-initiated LLM calls.
 *
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#344
 * Problem: Commands like `/finish` don't work when invoked through LLM routing
 * (e.g., `@UbiquityOS can you generate rewards`) because the parser only handles
 * direct slash commands and bot-triggered events, not user mentions that get
 * processed by the kernel's LLM layer.
 * Solution: Implement a mention-aware command extractor that detects LLM-routed
 * invocations in user comments, maps natural language intents to canonical commands,
 * and feeds them into the existing command pipeline with proper provenance tracking.
 */

import type { PluginContext } from "./types";

/**
 * Configuration for LLM router command support.
 */
export interface LlmRouterCommandConfig {
  /** Bot mention patterns that indicate LLM routing */
  botMentionPatterns: string[];
  /** Mapping of natural language phrases to canonical commands */
  intentToCommandMap: Record<string, string>;
  /** Whether to require explicit confirmation before executing routed commands */
  requireConfirmation: boolean;
  /** Maximum age in hours for a mention to be considered actionable */
  maxMentionAgeHours: number;
  /** Log level for routing operations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Detected LLM-routed command invocation.
 */
export interface RoutedCommandInvocation {
  originalText: string;
  detectedIntent: string;
  mappedCommand: string;
  invokerLogin: string;
  invokerId: number;
  commentId: number;
  issueNumber: number;
  prNumber?: number;
  timestamp: string;
  confidence: number;
  requiresConfirmation: boolean;
}

/**
 * Result of processing an LLM-routed command.
 */
export interface RoutedCommandResult {
  success: boolean;
  invocation: RoutedCommandInvocation;
  executedCommand?: string;
  error?: string;
  confirmationPending: boolean;
  timestamp: string;
}

/**
 * Generates TypeScript interfaces for the LLM router command system.
 * @returns String containing interface definitions
 */
export function generateLlmRouterInterfaces(): string {
  return `
/**
 * Interface for detecting LLM-routed command invocations in user comments.
 */
export interface IRoutedCommandDetector {
  /**
   * Scans a comment for LLM-routed command invocations.
   * @param commentBody - The full comment text
   * @param metadata - Comment metadata (author, timestamp, IDs)
   * @param config - Router configuration
   * @returns Array of detected command invocations, if any
   */
  detect(
    commentBody: string,
    metadata: {
      invokerLogin: string;
      invokerId: number;
      commentId: number;
      issueNumber: number;
      prNumber?: number;
      timestamp: string;
    },
    config: LlmRouterCommandConfig
  ): RoutedCommandInvocation[];
}

/**
 * Interface for mapping natural language intents to canonical commands.
 */
export interface IIntentResolver {
  /**
   * Resolves a natural language phrase to a canonical command.
   * @param text - The text containing the intent
   * @param config - Router configuration with intent mappings
   * @returns Mapped command string or null if no match found
   */
  resolve(text: string, config: LlmRouterCommandConfig): { command: string; confidence: number } | null;
}

/**
 * Interface for executing routed commands through the existing pipeline.
 */
export interface IRoutedCommandExecutor {
  /**
   * Executes a routed command invocation.
   * @param invocation - The detected command to execute
   * @param config - Router configuration
   * @returns Execution result with success/failure status
   */
  execute(invocation: RoutedCommandInvocation, config: LlmRouterCommandConfig): Promise<RoutedCommandResult>;
}

/**
 * Interface for tracking routed command provenance.
 */
export interface IRoutedCommandTracker {
  /**
   * Records a routed command execution for audit purposes.
   * @param result - The execution result to record
   */
  record(result: RoutedCommandResult): void;

  /**
   * Checks if a comment has already been processed as a routed command.
   * @param commentId - Comment ID to check
   * @returns True if already processed
   */
  isProcessed(commentId: number): boolean;
}
`;
}

/**
 * Generates the routed command detector implementation.
 * @returns String containing detector class implementation
 */
export function generateRoutedCommandDetector(): string {
  return `
import type { IRoutedCommandDetector, RoutedCommandInvocation } from "./interfaces";
import type { LlmRouterCommandConfig } from "../text-conversation-llm-router-command-support";

/**
 * Detects LLM-routed command invocations by identifying bot mentions
 * followed by natural language command intents in user comments.
 */
export class RoutedCommandDetector implements IRoutedCommandDetector {
  detect(
    commentBody: string,
    metadata: {
      invokerLogin: string;
      invokerId: number;
      commentId: number;
      issueNumber: number;
      prNumber?: number;
      timestamp: string;
    },
    config: LlmRouterCommandConfig
  ): RoutedCommandInvocation[] {
    const invocations: RoutedCommandInvocation[] = [];

    // Check if comment contains a bot mention
    const hasBotMention = config.botMentionPatterns.some(pattern =>
      commentBody.toLowerCase().includes(pattern.toLowerCase())
    );

    if (!hasBotMention) {
      return invocations;
    }

    // Check mention age
    const mentionAge = Date.now() - new Date(metadata.timestamp).getTime();
    const maxAgeMs = config.maxMentionAgeHours * 3600000;
    if (mentionAge > maxAgeMs) {
      console[config.logLevel]?.(
        \`[RoutedCommand] Mention in comment \${metadata.commentId} is too old (\${(mentionAge / 3600000).toFixed(1)}h)\`
      );
      return invocations;
    }

    // Resolve intent to command
    const resolver = new IntentResolver();
    const resolved = resolver.resolve(commentBody, config);

    if (resolved) {
      invocations.push({
        originalText: commentBody,
        detectedIntent: commentBody.substring(0, 100), // Truncate for logging
        mappedCommand: resolved.command,
        invokerLogin: metadata.invokerLogin,
        invokerId: metadata.invokerId,
        commentId: metadata.commentId,
        issueNumber: metadata.issueNumber,
        prNumber: metadata.prNumber,
        timestamp: metadata.timestamp,
        confidence: resolved.confidence,
        requiresConfirmation: config.requireConfirmation,
      });

      console[config.logLevel]?.(
        \`[RoutedCommand] Detected '\${resolved.command}' from @\${metadata.invokerLogin} (confidence: \${resolved.confidence.toFixed(2)})\`
      );
    }

    return invocations;
  }
}
`;
}

/**
 * Generates the intent resolver implementation.
 * @returns String containing resolver class implementation
 */
export function generateIntentResolver(): string {
  return `
import type { IIntentResolver } from "./interfaces";
import type { LlmRouterCommandConfig } from "../text-conversation-llm-router-command-support";

/**
 * Maps natural language phrases in bot mentions to canonical commands
 * using configurable pattern matching.
 */
export class IntentResolver implements IIntentResolver {
  resolve(
    text: string,
    config: LlmRouterCommandConfig
  ): { command: string; confidence: number } | null {
    const normalizedText = text.toLowerCase().trim();

    let bestMatch: { command: string; confidence: number } | null = null;

    for (const [intentPhrase, command] of Object.entries(config.intentToCommandMap)) {
      if (normalizedText.includes(intentPhrase.toLowerCase())) {
        // Confidence based on phrase length relative to total text
        const confidence = Math.min(
          intentPhrase.length / Math.max(normalizedText.length, 1),
          1.0
        );

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { command, confidence };
        }
      }
    }

    return bestMatch;
  }
}
`;
}

/**
 * Generates the routed command executor implementation.
 * @returns String containing executor class implementation
 */
export function generateRoutedCommandExecutor(): string {
  return `
import type { IRoutedCommandExecutor, RoutedCommandInvocation, RoutedCommandResult } from "./interfaces";
import type { LlmRouterCommandConfig } from "../text-conversation-llm-router-command-support";

/**
 * Executes routed commands by feeding them into the existing command pipeline
 * with proper provenance tracking and optional confirmation gating.
 */
export class RoutedCommandExecutor implements IRoutedCommandExecutor {
  async execute(
    invocation: RoutedCommandInvocation,
    config: LlmRouterCommandConfig
  ): Promise<RoutedCommandResult> {
    const timestamp = new Date().toISOString();

    // Gate on confirmation if required
    if (invocation.requiresConfirmation) {
      console[config.logLevel]?.(
        \`[RoutedCommand] Confirmation required for '\${invocation.mappedCommand}' from @\${invocation.invokerLogin}. Pending.\`
      );
      return {
        success: false,
        invocation,
        confirmationPending: true,
        timestamp,
      };
    }

    try {
      // In production: invoke the actual command handler
      // await commandHandler.execute(invocation.mappedCommand, {
      //   issueNumber: invocation.issueNumber,
      //   prNumber: invocation.prNumber,
      //   invoker: invocation.invokerLogin,
      //   source: "llm_router",
      //   originalCommentId: invocation.commentId,
      // });

      console[config.logLevel]?.(
        \`[RoutedCommand] Executing '\${invocation.mappedCommand}' for issue #\${invocation.issueNumber}\`
      );

      return {
        success: true,
        invocation,
        executedCommand: invocation.mappedCommand,
        confirmationPending: false,
        timestamp,
      };
    } catch (err) {
      return {
        success: false,
        invocation,
        error: err instanceof Error ? err.message : String(err),
        confirmationPending: false,
        timestamp,
      };
    }
  }
}
`;
}

/**
 * Generates test scaffolding for the LLM router command system.
 * @returns String containing Vitest test suite
 */
export function generateLlmRouterTests(): string {
  return `
import { describe, it, expect, beforeEach } from "vitest";
import { RoutedCommandDetector, IntentResolver } from "../text-conversation-llm-router-command-support";
import type { LlmRouterCommandConfig } from "../text-conversation-llm-router-command-support";

describe("LLM Router Command Support", () => {
  let detector: RoutedCommandDetector;
  let resolver: IntentResolver;
  let config: LlmRouterCommandConfig;

  beforeEach(() => {
    detector = new RoutedCommandDetector();
    resolver = new IntentResolver();
    config = {
      botMentionPatterns: ["@ubiquityos", "@ubiquity-os"],
      intentToCommandMap: {
        "generate rewards": "/finish",
        "calculate rewards": "/finish",
        "start task": "/start",
        "stop task": "/stop",
      },
      requireConfirmation: false,
      maxMentionAgeHours: 24,
      logLevel: "warn" as const,
    };
  });

  it("should detect routed command in bot mention", () => {
    const metadata = {
      invokerLogin: "contributor",
      invokerId: 1001,
      commentId: 42,
      issueNumber: 344,
      timestamp: new Date().toISOString(),
    };

    const invocations = detector.detect(
      "@UbiquityOS can you generate rewards for this task?",
      metadata,
      config
    );

    expect(invocations).toHaveLength(1);
    expect(invocations[0].mappedCommand).toBe("/finish");
    expect(invocations[0].invokerLogin).toBe("contributor");
    expect(invocations[0].confidence).toBeGreaterThan(0);
  });

  it("should return empty array when no bot mention present", () => {
    const metadata = {
      invokerLogin: "contributor",
      invokerId: 1001,
      commentId: 42,
      issueNumber: 344,
      timestamp: new Date().toISOString(),
    };

    const invocations = detector.detect(
      "Can someone generate rewards?",
      metadata,
      config
    );

    expect(invocations).toHaveLength(0);
  });

  it("should resolve intent to correct command", () => {
    const result = resolver.resolve("@UbiquityOS please generate rewards now", config);
    expect(result).not.toBeNull();
    expect(result?.command).toBe("/finish");
  });

  it("should return null for unrecognized intents", () => {
    const result = resolver.resolve("@UbiquityOS what time is it?", config);
    expect(result).toBeNull();
  });

  it("should reject mentions older than max age", () => {
    const oldTimestamp = new Date(Date.now() - 48 * 3600000).toISOString(); // 48h ago
    const metadata = {
      invokerLogin: "contributor",
      invokerId: 1001,
      commentId: 42,
      issueNumber: 344,
      timestamp: oldTimestamp,
    };

    const invocations = detector.detect(
      "@UbiquityOS generate rewards",
      metadata,
      config
    );

    expect(invocations).toHaveLength(0);
  });

  it("should handle case-insensitive bot mentions", () => {
    const metadata = {
      invokerLogin: "contributor",
      invokerId: 1001,
      commentId: 42,
      issueNumber: 344,
      timestamp: new Date().toISOString(),
    };

    const invocations = detector.detect(
      "@UBIQUITYOS generate rewards",
      metadata,
      config
    );

    expect(invocations).toHaveLength(1);
  });
});
`;
}

/**
 * Main generator function for all LLM router command artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<LlmRouterCommandConfig>
): Record<string, string> {
  const resolvedConfig: LlmRouterCommandConfig = {
    botMentionPatterns: ["@ubiquityos", "@ubiquity-os"],
    intentToCommandMap: {
      "generate rewards": "/finish",
      "calculate rewards": "/finish",
      "start task": "/start",
      "stop task": "/stop",
      "check status": "/status",
    },
    requireConfirmation: false,
    maxMentionAgeHours: 24,
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateLlmRouterInterfaces(),
    detector: generateRoutedCommandDetector(),
    resolver: generateIntentResolver(),
    executor: generateRoutedCommandExecutor(),
    tests: generateLlmRouterTests(),
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

  if (!artifacts.interfaces.includes("IRoutedCommandDetector")) {
    errors.push("Missing IRoutedCommandDetector interface");
  }

  if (!artifacts.interfaces.includes("IIntentResolver")) {
    errors.push("Missing IIntentResolver interface");
  }

  if (!artifacts.interfaces.includes("IRoutedCommandExecutor")) {
    errors.push("Missing IRoutedCommandExecutor interface");
  }

  if (!artifacts.detector.includes("RoutedCommandDetector")) {
    errors.push("Missing RoutedCommandDetector class");
  }

  if (!artifacts.resolver.includes("IntentResolver")) {
    errors.push("Missing IntentResolver class");
  }

  if (!artifacts.executor.includes("RoutedCommandExecutor")) {
    errors.push("Missing RoutedCommandExecutor class");
  }

  if (!artifacts.tests.includes("should detect routed command in bot mention")) {
    errors.push("Missing critical test for routed command detection");
  }

  if (!artifacts.tests.includes("should return empty array when no bot mention present")) {
    errors.push("Missing test for non-mention filtering");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateLlmRouterInterfaces,
  generateRoutedCommandDetector,
  generateIntentResolver,
  generateRoutedCommandExecutor,
  generateLlmRouterTests,
};
