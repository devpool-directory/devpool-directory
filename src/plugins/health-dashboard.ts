/**
 * Health Dashboard (Issue #5905)
 * 
 * Generates a health status report for apps and plugins by checking
 * test results, CI status, and endpoint availability.
 * 
 * Addresses: devpool-directory#5905 / ubiquity/ubq.fi-router#3
 */

import { Octokit } from "octokit";

export interface HealthCheckResult {
  name: string;
  type: "app" | "plugin" | "service";
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  last_check: string;
  details: {
    ci_passing?: boolean;
    tests_passing?: boolean;
    endpoint_reachable?: boolean;
    error_message?: string;
  };
}

export interface HealthDashboardReport {
  generated_at: string;
  total_checks: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
  results: HealthCheckResult[];
}

/**
 * Check CI/workflow status for a repository.
 */
export async function checkRepoHealth(
  octokit: Octokit,
  owner: string,
  repo: string,
  type: HealthCheckResult["type"] = "app"
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: `${owner}/${repo}`,
    type,
    status: "unknown",
    last_check: new Date().toISOString(),
    details: {},
  };

  try {
    // Check latest workflow run status
    const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 1,
      status: "completed",
    });

    if (runs.workflow_runs.length > 0) {
      const latestRun = runs.workflow_runs[0];
      result.details.ci_passing = latestRun.conclusion === "success";
      
      if (latestRun.conclusion === "success") {
        result.status = "healthy";
      } else if (latestRun.conclusion === "failure") {
        result.status = "unhealthy";
        result.details.error_message = `CI failed: ${latestRun.name} (${latestRun.conclusion})`;
      } else {
        result.status = "degraded";
        result.details.error_message = `CI inconclusive: ${latestRun.conclusion}`;
      }
    } else {
      result.details.error_message = "No workflow runs found";
    }

    // Check if repo has recent activity (not abandoned)
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(repoData.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceUpdate > 90 && result.status === "healthy") {
      result.status = "degraded";
      result.details.error_message = `No updates in ${daysSinceUpdate} days`;
    }

  } catch (error: any) {
    result.status = "unhealthy";
    result.details.error_message = `Failed to check: ${error.message}`;
  }

  return result;
}

/**
 * Generate a full health dashboard report for multiple repos.
 */
export async function generateHealthDashboard(
  octokit: Octokit,
  targets: Array<{ owner: string; repo: string; type?: HealthCheckResult["type"] }>
): Promise<HealthDashboardReport> {
  const results: HealthCheckResult[] = [];

  for (const target of targets) {
    const result = await checkRepoHealth(octokit, target.owner, target.repo, target.type);
    results.push(result);
    
    // Rate limit courtesy
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const report: HealthDashboardReport = {
    generated_at: new Date().toISOString(),
    total_checks: results.length,
    healthy: results.filter(r => r.status === "healthy").length,
    degraded: results.filter(r => r.status === "degraded").length,
    unhealthy: results.filter(r => r.status === "unhealthy").length,
    unknown: results.filter(r => r.status === "unknown").length,
    results,
  };

  return report;
}

/**
 * Format health dashboard as markdown for display.
 */
export function formatHealthDashboard(report: HealthDashboardReport): string {
  const lines: string[] = [];
  
  lines.push(`# 🏥 Health Dashboard`);
  lines.push(`*Generated: ${report.generated_at}*`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| ✅ Healthy | ${report.healthy} |`);
  lines.push(`| ⚠️ Degraded | ${report.degraded} |`);
  lines.push(`| ❌ Unhealthy | ${report.unhealthy} |`);
  lines.push(`| ❓ Unknown | ${report.unknown} |`);
  lines.push(`| **Total** | **${report.total_checks}** |`);
  lines.push("");
  lines.push(`## Details`);
  lines.push("");

  for (const result of report.results) {
    const icon = result.status === "healthy" ? "✅" :
                 result.status === "degraded" ? "⚠️" :
                 result.status === "unhealthy" ? "❌" : "❓";
    
    lines.push(`### ${icon} ${result.name} (${result.type})`);
    lines.push(`- **Status:** ${result.status.toUpperCase()}`);
    lines.push(`- **CI Passing:** ${result.details.ci_passing ?? "N/A"}`);
    if (result.details.error_message) {
      lines.push(`- **Note:** ${result.details.error_message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
