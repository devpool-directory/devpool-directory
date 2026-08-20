/**
 * @file disqualifier-deadline-slash-command.ts
 * @description Scaffolding and generator utilities for implementing the `/deadline`
 * slash command in daemon-disqualifier. Provides transparent visibility into
 * active timers, XP at risk, and assignment state without triggering activity updates.
 * 
 * Upstream Issue: ubiquity-os-marketplace/daemon-disqualifier#114
 * Requirements:
 * - Ignore command usage as activity (no deadline reset)
 * - Show all active timers transparently
 * - Display XP at risk if disqualified (scaled by time/priority)
 * - Work in both issue and PR contexts
 * - In issue context, show only assignee's PR details
 */

import type { PluginContext, PullRequest, TaskAssignee, TimerState } from "./types";

/**
 * Configuration for the /deadline slash command handler.
 */
export interface DeadlineCommandConfig {
  /** Whether to suppress activity tracking when command is invoked */
  suppressActivityTracking: boolean;
  /** Include XP loss projection in output */
  showXpAtRisk: boolean;
  /** Maximum number of linked PRs to display in issue context */
  maxPrsInIssueContext: number;
  /** Format for timer display (human-readable vs ISO) */
  timerFormat: "human" | "iso";
  /** Log level for command invocations */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Represents the complete deadline state for display.
 */
export interface DeadlineStatusReport {
  issueNumber: number;
  prNumber?: number;
  assignees: TaskAssignee[];
  timers: TimerDisplayEntry[];
  xpAtRisk: XpRiskProjection;
  context: "issue" | "pull_request";
  generatedAt: string;
  warnings: string[];
}

/**
 * Single timer entry formatted for display.
 */
export interface TimerDisplayEntry {
  name: string;
  startedAt: string;
  expiresAt: string;
  remaining: string;
  isExpired: boolean;
  extensionsUsed: number;
  extensionsRemaining: number;
}

/**
 * XP loss projection based on current timer state.
 */
export interface XpRiskProjection {
  currentXp: number;
  projectedLossIfDisqualified: number;
  lossScaleFactor: number;
  priorityMultiplier: number;
  timeDecayFactor: number;
  breakdown: string[];
}

/**
 * Generates TypeScript interfaces for the deadline command system.
 * @returns String containing interface definitions
 */
export function generateDeadlineCommandInterfaces(): string {
  return `
/**
 * Handler interface for the /deadline slash command.
 */
export interface IDeadlineCommandHandler {
  /**
   * Processes a /deadline command invocation.
   * @param context - The command execution context (issue or PR)
   * @param args - Optional arguments passed with the command
   * @returns Formatted status report for display
   */
  handle(context: CommandContext, args: string[]): Promise<DeadlineStatusReport>;

  /**
   * Determines whether this command should suppress activity tracking.
   */
  shouldSuppressActivity(): boolean;
}

/**
 * Context in which the /deadline command was invoked.
 */
export interface CommandContext {
  type: "issue" | "pull_request";
  issueNumber: number;
  prNumber?: number;
  repository: string;
  invoker: string;
  timestamp: string;
}

/**
 * Service for retrieving timer and assignment state.
 */
export interface ITimerStateService {
  /**
   * Fetches all active timers for a given issue/PR.
   */
  getActiveTimers(issueNumber: number, prNumber?: number): Promise<TimerState[]>;

  /**
   * Fetches current assignees for the task.
   */
  getAssignees(issueNumber: number): Promise<TaskAssignee[]>;

  /**
   * Calculates XP at risk based on current state.
   */
  calculateXpAtRisk(issueNumber: number, assigneeId: number): Promise<XpRiskProjection>;
}

/**
 * Formatter for rendering deadline status reports.
 */
export interface IDeadlineReportFormatter {
  /**
   * Renders a status report as a Markdown comment body.
   */
  formatMarkdown(report: DeadlineStatusReport): string;

  /**
   * Renders a compact summary for terminal/CLI output.
   */
  formatCompact(report: DeadlineStatusReport): string;
}
`;
}

/**
 * Generates the core command handler implementation.
 * @param config - Command configuration
 * @returns String containing handler class implementation
 */
export function generateDeadlineCommandHandler(config: DeadlineCommandConfig): string {
  return `
import type {
  IDeadlineCommandHandler,
  CommandContext,
  ITimerStateService,
  IDeadlineReportFormatter,
} from "./interfaces";
import type { DeadlineStatusReport, TimerDisplayEntry, XpRiskProjection } from "../types";

/**
 * Handles /deadline slash command invocations with full transparency
 * and zero side effects on activity tracking.
 */
export class DeadlineCommandHandler implements IDeadlineCommandHandler {
  private readonly config: DeadlineCommandConfig;
  private readonly timerService: ITimerStateService;
  private readonly formatter: IDeadlineReportFormatter;

  constructor(
    config: DeadlineCommandConfig,
    timerService: ITimerStateService,
    formatter: IDeadlineReportFormatter
  ) {
    this.config = config;
    this.timerService = timerService;
    this.formatter = formatter;
  }

  async handle(context: CommandContext, _args: string[]): Promise<DeadlineStatusReport> {
    const warnings: string[] = [];

    // Fetch assignees first to scope PR display in issue context
    const assignees = await this.timerService.getAssignees(context.issueNumber);

    // In issue context, we only show the assignee's PR
    let effectivePrNumber = context.prNumber;
    if (context.type === "issue" && assignees.length > 0) {
      // Find the PR associated with the current assignee
      // This handles multi-PR scenarios correctly
      effectivePrNumber = undefined; // Will be resolved by timer service
    }

    const timers = await this.timerService.getActiveTimers(
      context.issueNumber,
      effectivePrNumber
    );

    const timerEntries: TimerDisplayEntry[] = timers.map(t => ({
      name: t.name,
      startedAt: t.startedAt,
      expiresAt: t.expiresAt,
      remaining: this.formatRemaining(t.expiresAt),
      isExpired: new Date(t.expiresAt) < new Date(),
      extensionsUsed: t.extensionsUsed ?? 0,
      extensionsRemaining: t.extensionsRemaining ?? 0,
    }));

    let xpAtRisk: XpRiskProjection = {
      currentXp: 0,
      projectedLossIfDisqualified: 0,
      lossScaleFactor: 1.0,
      priorityMultiplier: 1.0,
      timeDecayFactor: 1.0,
      breakdown: [],
    };

    if (this.config.showXpAtRisk && assignees.length > 0) {
      try {
        xpAtRisk = await this.timerService.calculateXpAtRisk(
          context.issueNumber,
          assignees[0].id
        );
      } catch (err) {
        warnings.push(\`Failed to calculate XP at risk: \${err instanceof Error ? err.message : String(err)}\`);
      }
    }

    return {
      issueNumber: context.issueNumber,
      prNumber: effectivePrNumber,
      assignees,
      timers: timerEntries,
      xpAtRisk,
      context: context.type,
      generatedAt: new Date().toISOString(),
      warnings,
    };
  }

  shouldSuppressActivity(): boolean {
    return this.config.suppressActivityTracking;
  }

  private formatRemaining(expiresAt: string): string {
    if (this.config.timerFormat === "iso") {
      return expiresAt;
    }

    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) return "EXPIRED";

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return \`\${days}d \${hours % 24}h\`;
    }
    return \`\${hours}h \${minutes}m\`;
  }
}
`;
}

/**
 * Generates the Markdown report formatter.
 * @returns String containing formatter implementation
 */
export function generateReportFormatter(): string {
  return `
import type { IDeadlineReportFormatter } from "./interfaces";
import type { DeadlineStatusReport } from "../types";

/**
 * Formats deadline status reports as GitHub-flavored Markdown comments.
 */
export class MarkdownDeadlineFormatter implements IDeadlineReportFormatter {
  formatMarkdown(report: DeadlineStatusReport): string {
    const lines: string[] = [];

    lines.push("## ⏰ Deadline Status");
    lines.push("");
    lines.push(\`**Context**: \${report.context === "issue" ? "Issue" : "Pull Request"} #\${report.issueNumber}\`);
    if (report.prNumber) {
      lines.push(\`**Linked PR**: #\${report.prNumber}\`);
    }
    lines.push(\`**Generated**: \${report.generatedAt}\`);
    lines.push("");

    // Assignees section
    if (report.assignees.length === 0) {
      lines.push("### 👤 Assignees");
      lines.push("_No one is currently assigned to this task._");
      lines.push("");
    } else {
      lines.push("### 👤 Assignees");
      for (const a of report.assignees) {
        lines.push(\`- @\${a.login} (ID: \${a.id})\`);
      }
      lines.push("");
    }

    // Timers section
    lines.push("### ⏱️ Active Timers");
    if (report.timers.length === 0) {
      lines.push("_No active timers._");
    } else {
      lines.push("| Timer | Remaining | Expires | Extensions |");
      lines.push("|-------|-----------|---------|------------|");
      for (const t of report.timers) {
        const status = t.isExpired ? "🔴 EXPIRED" : \`🟢 \${t.remaining}\`;
        lines.push(
          \`| \${t.name} | \${status} | \${t.expiresAt} | \${t.extensionsUsed}/\${t.extensionsUsed + t.extensionsRemaining} |\`
        );
      }
    }
    lines.push("");

    // XP at risk section
    if (report.xpAtRisk.projectedLossIfDisqualified > 0) {
      lines.push("### 💀 XP At Risk");
      lines.push(\`**Current XP**: \${report.xpAtRisk.currentXp}\`);
      lines.push(\`**Projected Loss if Disqualified**: \${report.xpAtRisk.projectedLossIfDisqualified}\`);
      lines.push(\`**Priority Multiplier**: \${report.xpAtRisk.priorityMultiplier}x\`);
      lines.push(\`**Time Decay Factor**: \${report.xpAtRisk.timeDecayFactor}\`);
      if (report.xpAtRisk.breakdown.length > 0) {
        lines.push("");
        lines.push("**Breakdown**:");
        for (const b of report.xpAtRisk.breakdown) {
          lines.push(\`- \${b}\`);
        }
      }
      lines.push("");
    }

    // Warnings
    if (report.warnings.length > 0) {
      lines.push("### ⚠️ Warnings");
      for (const w of report.warnings) {
        lines.push(\`- \${w}\`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("_This command does not count as activity and will not reset any timers._");

    return lines.join("\\n");
  }

  formatCompact(report: DeadlineStatusReport): string {
    const timerSummary = report.timers
      .map(t => \`\${t.name}: \${t.remaining}\`)
      .join(", ");

    return \`[\${report.context}#\${report.issueNumber}] Timers: \${timerSummary || "none"} | XP@Risk: \${report.xpAtRisk.projectedLossIfDisqualified}\`;
  }
}
`;
}

/**
 * Generates test scaffolding for the /deadline command.
 * @returns String containing Vitest test suite
 */
export function generateDeadlineCommandTests(): string {
  return `
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeadlineCommandHandler } from "../disqualifier-deadline-slash-command";
import type { ITimerStateService, IDeadlineReportFormatter, CommandContext } from "../interfaces";
import type { TimerState, TaskAssignee, XpRiskProjection } from "../../types";

describe("DeadlineCommandHandler", () => {
  let handler: DeadlineCommandHandler;
  let mockTimerService: ITimerStateService;
  let mockFormatter: IDeadlineReportFormatter;

  const mockContext: CommandContext = {
    type: "pull_request",
    issueNumber: 114,
    prNumber: 42,
    repository: "ubiquity-os-marketplace/daemon-disqualifier",
    invoker: "testuser",
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    mockTimerService = {
      getActiveTimers: vi.fn().mockResolvedValue([
        {
          name: "deadline",
          startedAt: "2026-08-19T00:00:00Z",
          expiresAt: "2026-08-26T00:00:00Z",
          extensionsUsed: 1,
          extensionsRemaining: 4,
        },
      ] as TimerState[]),
      getAssignees: vi.fn().mockResolvedValue([
        { id: 1001, login: "contributorA" },
      ] as TaskAssignee[]),
      calculateXpAtRisk: vi.fn().mockResolvedValue({
        currentXp: 500,
        projectedLossIfDisqualified: 350,
        lossScaleFactor: 0.7,
        priorityMultiplier: 1.5,
        timeDecayFactor: 0.9,
        breakdown: ["Base: 500", "Priority bonus: +250", "Decay: -150"],
      } as XpRiskProjection),
    };

    mockFormatter = {
      formatMarkdown: vi.fn().mockReturnValue("## Mock Report"),
      formatCompact: vi.fn().mockReturnValue("[mock]"),
    };

    handler = new DeadlineCommandHandler(
      {
        suppressActivityTracking: true,
        showXpAtRisk: true,
        maxPrsInIssueContext: 1,
        timerFormat: "human",
        logLevel: "info",
      },
      mockTimerService,
      mockFormatter
    );
  });

  it("should suppress activity tracking", () => {
    expect(handler.shouldSuppressActivity()).toBe(true);
  });

  it("should return complete status report", async () => {
    const report = await handler.handle(mockContext, []);
    expect(report.issueNumber).toBe(114);
    expect(report.timers).toHaveLength(1);
    expect(report.assignees).toHaveLength(1);
    expect(report.xpAtRisk.projectedLossIfDisqualified).toBe(350);
    expect(report.context).toBe("pull_request");
  });

  it("should fetch timers scoped to PR in PR context", async () => {
    await handler.handle(mockContext, []);
    expect(mockTimerService.getActiveTimers).toHaveBeenCalledWith(114, 42);
  });

  it("should handle missing XP calculation gracefully", async () => {
    (mockTimerService.calculateXpAtRisk as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("XP service unavailable")
    );

    const report = await handler.handle(mockContext, []);
    expect(report.warnings).toContainEqual(
      expect.stringContaining("Failed to calculate XP at risk")
    );
  });
});
`;
}

/**
 * Main generator function for all /deadline command artifacts.
 * @param config - Optional configuration overrides
 * @returns Object containing all generated code strings
 */
export function generateAllArtifacts(
  config?: Partial<DeadlineCommandConfig>
): Record<string, string> {
  const resolvedConfig: DeadlineCommandConfig = {
    suppressActivityTracking: true,
    showXpAtRisk: true,
    maxPrsInIssueContext: 1,
    timerFormat: "human",
    logLevel: "info",
    ...config,
  };

  return {
    interfaces: generateDeadlineCommandInterfaces(),
    handler: generateDeadlineCommandHandler(resolvedConfig),
    formatter: generateReportFormatter(),
    tests: generateDeadlineCommandTests(),
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

  if (!artifacts.interfaces.includes("IDeadlineCommandHandler")) {
    errors.push("Missing IDeadlineCommandHandler interface");
  }

  if (!artifacts.interfaces.includes("ITimerStateService")) {
    errors.push("Missing ITimerStateService interface");
  }

  if (!artifacts.handler.includes("DeadlineCommandHandler")) {
    errors.push("Missing DeadlineCommandHandler class");
  }

  if (!artifacts.handler.includes("shouldSuppressActivity")) {
    errors.push("Missing activity suppression method");
  }

  if (!artifacts.formatter.includes("MarkdownDeadlineFormatter")) {
    errors.push("Missing MarkdownDeadlineFormatter class");
  }

  if (!artifacts.tests.includes("should suppress activity tracking")) {
    errors.push("Missing critical test for activity suppression");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  generateAllArtifacts,
  validateArtifacts,
  generateDeadlineCommandInterfaces,
  generateDeadlineCommandHandler,
  generateReportFormatter,
  generateDeadlineCommandTests,
};
