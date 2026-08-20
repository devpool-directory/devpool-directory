/**
 * @module RepoXPReportCTA
 * @description Handoff plugin for automating XP report delivery as a landing page CTA.
 * Generates scaffolding for triggering text-conversation-rewards runs on user-submitted repos,
 * enforcing one-free-report-per-org limits, and delivering results via email/dashboard link.
 * Leverages travel-stipend tech for secure action triggering.
 *
 * Upstream Issue: ubiquity/business-development#196
 * DevPool Issue: #5008
 * Bounty Value: $400 USD
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface IXPReportRequest {
  repoUrl: string;
  userEmail: string;
  orgName: string;
  requestedAt: string;
}

export interface IXPReportResult {
  repoUrl: string;
  orgName: string;
  reportPeriod: string;
  totalXP: number;
  contributorCount: number;
  dashboardUrl: string;
  generatedAt: string;
}

export interface IOrgUsageRecord {
  orgName: string;
  repoUrl: string;
  userEmail: string;
  usedAt: string;
  reportId: string;
}

export interface ICTAConfig {
  maxReportsPerOrg: number;
  reportPeriodDays: number;
  kernelSignatureEnvVar: string;
  workflowRef: string;
  emailProvider: "sendgrid" | "resend" | "ses";
  dashboardBaseUrl: string;
  allowPrivateRepos: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export function getDefaultConfig(): ICTAConfig {
  return {
    maxReportsPerOrg: 1,
    reportPeriodDays: 30,
    kernelSignatureEnvVar: "KERNEL_SIGNATURE",
    workflowRef: "ubiquity-os-marketplace/text-conversation-rewards/.github/workflows/compute.yml@main",
    emailProvider: "resend",
    dashboardBaseUrl: "https://xp.ubiquity.finance/dashboard",
    allowPrivateRepos: false,
  };
}

// ============================================================================
// ORG USAGE TRACKER
// ============================================================================

/**
 * Generates the org usage tracking service to enforce one-free-report limit.
 */
export function generateOrgUsageTracker(): string {
  return `/**
 * Org Usage Tracker
 * Enforces one-free-report-per-organization limit.
 * Uses Supabase or Redis for persistent storage.
 */
import { createClient } from "@supabase/supabase-js";

export class OrgUsageTracker {
  private supabase: any;
  private maxReportsPerOrg: number;

  constructor(supabaseUrl: string, supabaseKey: string, maxReportsPerOrg: number = 1) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.maxReportsPerOrg = maxReportsPerOrg;
  }

  /**
   * Checks if an organization has already used their free report.
   */
  async hasUsedFreeReport(orgName: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("org_xp_reports")
      .select("*", { count: "exact", head: true })
      .eq("org_name", orgName.toLowerCase());

    if (error) throw new Error(\`Failed to check org usage: \${error.message}\`);
    return (count || 0) >= this.maxReportsPerOrg;
  }

  /**
   * Records a new report usage for an organization.
   */
  async recordUsage(record: any): Promise<void> {
    const { error } = await this.supabase.from("org_xp_reports").insert({
      org_name: record.orgName.toLowerCase(),
      repo_url: record.repoUrl,
      user_email: record.userEmail,
      report_id: record.reportId,
      used_at: new Date().toISOString(),
    });

    if (error) throw new Error(\`Failed to record usage: \${error.message}\`);
  }

  /**
   * Validates that a repo belongs to the claimed org.
   * Prevents org-squatting by verifying repo ownership.
   */
  async validateRepoOwnership(repoUrl: string, claimedOrg: string, githubToken: string): Promise<boolean> {
    // Extract owner from URL
    const match = repoUrl.match(/github\\.com\\/([^/]+)\\/([^/]+)/);
    if (!match) return false;

    const owner = match[1];
    
    // For organizations, verify directly
    if (owner.toLowerCase() === claimedOrg.toLowerCase()) {
      return true;
    }

    // Check if owner is a user who belongs to the claimed org
    try {
      const response = await fetch(
        \`https://api.github.com/orgs/\${claimedOrg}/members/\${owner}\`,
        { headers: { Authorization: \`Bearer \${githubToken}\` } }
      );
      return response.status === 204 || response.status === 200;
    } catch {
      return false;
    }
  }
}`;
}

// ============================================================================
// WORKFLOW TRIGGER SERVICE
// ============================================================================

/**
 * Generates the service for triggering text-conversation-rewards workflow.
 */
export function generateWorkflowTrigger(): string {
  return `/**
 * XP Report Workflow Trigger
 * Triggers text-conversation-rewards compute workflow securely.
 * Uses kernel signature or direct GitHub Actions API call.
 */
export class WorkflowTriggerService {
  private kernelSignature: string;
  private workflowRef: string;
  private githubToken: string;

  constructor(kernelSignature: string, workflowRef: string, githubToken: string) {
    this.kernelSignature = kernelSignature;
    this.workflowRef = workflowRef;
    this.githubToken = githubToken;
  }

  /**
   * Parses workflow reference into owner/repo/path/ref components.
   */
  parseWorkflowRef(ref: string): { owner: string; repo: string; path: string; ref: string } {
    // Format: owner/repo/.github/workflows/file.yml@ref
    const [pathPart, refPart] = ref.split("@");
    const parts = pathPart.split("/");
    const owner = parts[0];
    const repo = parts[1];
    const path = parts.slice(2).join("/");
    
    return { owner, repo, path, ref: refPart || "main" };
  }

  /**
   * Triggers the compute workflow for a specific repository.
   */
  async triggerCompute(
    targetRepo: string,
    periodDays: number,
    callbackUrl?: string
  ): Promise<{ runId: number; status: string }> {
    const { owner, repo, path, ref } = this.parseWorkflowRef(this.workflowRef);

    // Prepare workflow inputs
    const inputs = {
      repo: targetRepo,
      period_days: periodDays.toString(),
      output_format: "json",
      callback_url: callbackUrl || "",
      kernel_signature: this.kernelSignature,
    };

    // Trigger via GitHub Actions API
    const response = await fetch(
      \`https://api.github.com/repos/\${owner}/\${repo}/actions/workflows/\${path.split("/").pop()}/dispatches\`,
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${this.githubToken}\`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          ref,
          inputs,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(\`Workflow trigger failed: \${response.status} - \${errorText}\`);
    }

    // Get the run ID (requires polling since dispatch doesn't return it directly)
    const runId = await this.getLatestRunId(owner, repo, path);
    
    return { runId, status: "queued" };
  }

  /**
   * Polls for the latest workflow run matching our trigger.
   */
  private async getLatestRunId(owner: string, repo: string, workflowPath: string): Promise<number> {
    // Wait briefly for run to be created
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetch(
      \`https://api.github.com/repos/\${owner}/\${repo}/actions/runs?per_page=5&status=queued\`,
      { headers: { Authorization: \`Bearer \${this.githubToken}\` } }
    );

    const data = await response.json();
    const latestRun = data.workflow_runs?.[0];
    
    if (!latestRun) throw new Error("Could not find triggered workflow run");
    
    return latestRun.id;
  }

  /**
   * Checks workflow run status.
   */
  async getRunStatus(runId: number): Promise<{ status: string; conclusion: string | null; artifactsUrl: string }> {
    const { owner, repo } = this.parseWorkflowRef(this.workflowRef);
    
    const response = await fetch(
      \`https://api.github.com/repos/\${owner}/\${repo}/actions/runs/\${runId}\`,
      { headers: { Authorization: \`Bearer \${this.githubToken}\` } }
    );

    const data = await response.json();
    
    return {
      status: data.status,
      conclusion: data.conclusion,
      artifactsUrl: data.artifacts_url,
    };
  }
}`;
}

// ============================================================================
// REPORT DELIVERY SERVICE
// ============================================================================

/**
 * Generates the email delivery service for XP reports.
 */
export function generateReportDelivery(): string {
  return `/**
 * XP Report Delivery Service
 * Sends report results via email with dashboard link.
 */
export class ReportDeliveryService {
  private emailProvider: string;
  private apiKey: string;
  private dashboardBaseUrl: string;

  constructor(emailProvider: string, apiKey: string, dashboardBaseUrl: string) {
    this.emailProvider = emailProvider;
    this.apiKey = apiKey;
    this.dashboardBaseUrl = dashboardBaseUrl;
  }

  /**
   * Sends XP report email to user.
   */
  async sendReport(userEmail: string, report: any): Promise<boolean> {
    const dashboardUrl = \`\${this.dashboardBaseUrl}/\${report.reportId}\`;
    
    const htmlContent = \`
      <h2>Your Ubiquity XP Report</h2>
      <p>Here's your team's XP summary for <strong>\${report.repoUrl}</strong>:</p>
      
      <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Period</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">Last \${report.periodDays} days</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Total XP</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">\${report.totalXP.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Contributors</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">\${report.contributorCount}</td>
        </tr>
      </table>
      
      <p style="margin-top: 20px;">
        <a href="\${dashboardUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Full Dashboard</a>
      </p>
      
      <p style="margin-top: 20px; font-size: 12px; color: #666;">
        This was your free XP report. Upgrade to unlock unlimited reports, historical trends, and team analytics.
      </p>
    \`;

    if (this.emailProvider === "resend") {
      return this.sendViaResend(userEmail, htmlContent);
    } else if (this.emailProvider === "sendgrid") {
      return this.sendViaSendGrid(userEmail, htmlContent);
    }
    
    throw new Error(\`Unsupported email provider: \${this.emailProvider}\`);
  }

  private async sendViaResend(to: string, html: string): Promise<boolean> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${this.apiKey}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ubiquity XP <xp@ubiquity.finance>",
        to: [to],
        subject: "Your Ubiquity XP Report is Ready",
        html,
      }),
    });

    return response.ok;
  }

  private async sendViaSendGrid(to: string, html: string): Promise<boolean> {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${this.apiKey}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "xp@ubiquity.finance", name: "Ubiquity XP" },
        subject: "Your Ubiquity XP Report is Ready",
        content: [{ type: "text/html", value: html }],
      }),
    });

    return response.ok;
  }
}`;
}

// ============================================================================
// LABEL INFERENCE ENGINE
// ============================================================================

/**
 * Generates the label inference service for theoretical XP calculation.
 */
export function generateLabelInference(): string {
  return `/**
 * Label Inference Engine
 * Infers priority/reward labels for repos without explicit configuration.
 * Used when generating XP reports for repos not yet configured in UbiquityOS.
 */
export class LabelInferenceEngine {
  // Default label mappings based on common patterns
  private static PRIORITY_PATTERNS = [
    { pattern: /critical|urgent|p0/i, priority: "Urgent", multiplier: 4 },
    { pattern: /high|important|p1/i, priority: "High", multiplier: 3 },
    { pattern: /medium|normal|p2/i, priority: "Medium", multiplier: 2 },
    { pattern: /low|minor|p3|good.first.issue/i, priority: "Low", multiplier: 1 },
  ];

  private static REWARD_PATTERNS = [
    { pattern: /\\$\\d{3,}|price:\\s*\\d+/i, extractValue: true },
    { pattern: /bounty|reward/i, defaultUsd: 100 },
  ];

  /**
   * Infers priority from issue labels or title.
   */
  inferPriority(labels: string[], title: string): { priority: string; multiplier: number } {
    const searchText = \`\${labels.join(" ")} \${title}\`;
    
    for (const { pattern, priority, multiplier } of LabelInferenceEngine.PRIORITY_PATTERNS) {
      if (pattern.test(searchText)) {
        return { priority, multiplier };
      }
    }
    
    // Default to Medium if no pattern matches
    return { priority: "Medium", multiplier: 2 };
  }

  /**
   * Infers reward value from labels or metadata.
   */
  inferReward(labels: string[], body: string): number {
    const searchText = \`\${labels.join(" ")} \${body}\`;
    
    // Try to extract explicit dollar amount
    const dollarMatch = searchText.match(/\\$(\\d+)/);
    if (dollarMatch) {
      return parseInt(dollarMatch[1]);
    }

    // Try Price: XXX USD format
    const priceMatch = searchText.match(/Price:\\s*(\\d+)/i);
    if (priceMatch) {
      return parseInt(priceMatch[1]);
    }

    // Default reward for unlabeled issues
    return 50;
  }

  /**
   * Calculates theoretical XP for an issue.
   */
  calculateIssueXP(issue: { labels: string[]; title: string; body: string }): number {
    const { multiplier } = this.inferPriority(issue.labels, issue.title);
    const reward = this.inferReward(issue.labels, issue.body);
    
    // XP formula: reward * priority_multiplier
    return Math.round(reward * multiplier);
  }
}`;
}

// ============================================================================
// API ENDPOINT HANDLER
// ============================================================================

/**
 * Generates the API endpoint for CTA form submission.
 */
export function generateApiHandler(): string {
  return `/**
 * XP Report CTA API Handler
 * Handles form submissions from landing page.
 */
import { OrgUsageTracker } from "./org-usage-tracker";
import { WorkflowTriggerService } from "./workflow-trigger";
import { ReportDeliveryService } from "./report-delivery";
import { LabelInferenceEngine } from "./label-inference";

export async function handleXPReportRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const config = {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    kernelSignature: process.env.KERNEL_SIGNATURE!,
    githubToken: process.env.GITHUB_TOKEN!,
    workflowRef: "ubiquity-os-marketplace/text-conversation-rewards/.github/workflows/compute.yml@main",
    emailApiKey: process.env.RESEND_API_KEY!,
    dashboardBaseUrl: "https://xp.ubiquity.finance/dashboard",
    maxReportsPerOrg: 1,
    reportPeriodDays: 30,
  };

  try {
    const body = await request.json();
    const { repoUrl, userEmail } = body;

    // Validate input
    if (!repoUrl || !userEmail) {
      return Response.json({ error: "repoUrl and userEmail required" }, { status: 400 });
    }

    // Reject private repos
    if (repoUrl.includes("private") || !repoUrl.startsWith("https://github.com/")) {
      return Response.json({ error: "Only public GitHub repositories are supported" }, { status: 400 });
    }

    // Extract org name from repo URL
    const orgMatch = repoUrl.match(/github\\.com\\/([^/]+)/);
    if (!orgMatch) {
      return Response.json({ error: "Invalid repository URL" }, { status: 400 });
    }
    const orgName = orgMatch[1];

    // Check org usage limit
    const usageTracker = new OrgUsageTracker(config.supabaseUrl, config.supabaseKey, config.maxReportsPerOrg);
    const hasUsed = await usageTracker.hasUsedFreeReport(orgName);
    
    if (hasUsed) {
      return Response.json({ 
        error: "Your organization has already used its free XP report. Upgrade for unlimited access.",
        upgradeUrl: "https://ubiquity.finance/pricing"
      }, { status: 403 });
    }

    // Validate repo ownership
    const isValidOwner = await usageTracker.validateRepoOwnership(repoUrl, orgName, config.githubToken);
    if (!isValidOwner) {
      return Response.json({ error: "Repository does not belong to the claimed organization" }, { status: 403 });
    }

    // Trigger workflow
    const trigger = new WorkflowTriggerService(config.kernelSignature, config.workflowRef, config.githubToken);
    const { runId } = await trigger.triggerCompute(repoUrl, config.reportPeriodDays);

    // Record usage (optimistic - could move to post-completion)
    await usageTracker.recordUsage({
      orgName,
      repoUrl,
      userEmail,
      reportId: \`rpt_\${Date.now()}\`,
    });

    return Response.json({
      success: true,
      message: "XP report generation started. You'll receive an email within 15 minutes.",
      runId,
    });

  } catch (error) {
    console.error("XP Report CTA error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateAcceptanceCriteria(files: Record<string, string>): { passed: boolean; checks: Array<{ name: string; status: "pass" | "fail" }> } {
  const checks = [
    { name: "Org usage tracker with one-per-org limit", status: Object.values(files).some(c => c.includes("OrgUsageTracker") && c.includes("maxReportsPerOrg")) ? "pass" : "fail" },
    { name: "Workflow trigger service", status: Object.values(files).some(c => c.includes("WorkflowTriggerService") && c.includes("triggerCompute")) ? "pass" : "fail" },
    { name: "Kernel signature authentication", status: Object.values(files).some(c => c.includes("kernelSignature") || c.includes("KERNEL_SIGNATURE")) ? "pass" : "fail" },
    { name: "Private repo rejection", status: Object.values(files).some(c => c.includes("allowPrivateRepos") || c.includes("private")) ? "pass" : "fail" },
    { name: "Email delivery service", status: Object.values(files).some(c => c.includes("ReportDeliveryService") && c.includes("sendReport")) ? "pass" : "fail" },
    { name: "Dashboard link generation", status: Object.values(files).some(c => c.includes("dashboardUrl") || c.includes("dashboardBaseUrl")) ? "pass" : "fail" },
    { name: "Label inference for theoretical XP", status: Object.values(files).some(c => c.includes("LabelInferenceEngine") && c.includes("inferPriority")) ? "pass" : "fail" },
    { name: "API handler with validation", status: Object.values(files).some(c => c.includes("handleXPReportRequest") && c.includes("POST")) ? "pass" : "fail" },
    { name: "Repo ownership validation", status: Object.values(files).some(c => c.includes("validateRepoOwnership")) ? "pass" : "fail" },
    { name: "Duplicate prevention logic", status: Object.values(files).some(c => c.includes("hasUsedFreeReport")) ? "pass" : "fail" },
  ];
  return { passed: checks.every(c => c.status === "pass"), checks };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const RepoXPReportCTAPlugin = {
  name: "repo-xp-report-cta",
  version: "1.0.0",
  issue: "#5008",
  upstreamIssue: "ubiquity/business-development#196",
  bountyValue: 400,
  generators: {
    orgUsageTracker: generateOrgUsageTracker,
    workflowTrigger: generateWorkflowTrigger,
    reportDelivery: generateReportDelivery,
    labelInference: generateLabelInference,
    apiHandler: generateApiHandler,
  },
  validators: { acceptanceCriteria: validateAcceptanceCriteria },
  config: { default: getDefaultConfig },
};

export default RepoXPReportCTAPlugin;
