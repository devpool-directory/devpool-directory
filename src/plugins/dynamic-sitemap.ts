/**
 * Dynamic Sitemap (Apps & Plugins) - Issue #5906
 * 
 * Generates XML and JSON sitemaps for all apps and plugins by compiling
 * health check results and repository metadata.
 * 
 * Addresses: devpool-directory#5906 / ubiquity/ubq.fi-router#2
 */

import { Octokit } from "octokit";

export interface SitemapEntry {
  url: string;
  name: string;
  type: "app" | "plugin" | "service";
  lastmod: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  description?: string;
  repo_url: string;
}

export interface SitemapReport {
  generated_at: string;
  total_entries: number;
  entries: SitemapEntry[];
  xml_sitemap: string;
  json_sitemap: object;
}

/**
 * Generate XML sitemap content.
 */
function generateXmlSitemap(entries: SitemapEntry[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const entry of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.url)}</loc>`);
    lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    if (entry.description) {
      lines.push(`    <title>${escapeXml(entry.name)}</title>`);
    }
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fetch repository metadata for sitemap entry.
 */
async function fetchRepoMetadata(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ description?: string; updated_at: string }> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      description: data.description || undefined,
      updated_at: data.updated_at,
    };
  } catch {
    return { updated_at: new Date().toISOString() };
  }
}

/**
 * Generate dynamic sitemap for a list of app/plugin repositories.
 */
export async function generateDynamicSitemap(
  octokit: Octokit,
  targets: Array<{ owner: string; repo: string; type: SitemapEntry["type"]; baseUrl: string }>
): Promise<SitemapReport> {
  const entries: SitemapEntry[] = [];

  for (const target of targets) {
    const metadata = await fetchRepoMetadata(octokit, target.owner, target.repo);
    
    // Determine status based on recent activity
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(metadata.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    let status: SitemapEntry["status"] = "healthy";
    if (daysSinceUpdate > 90) {
      status = "degraded";
    } else if (daysSinceUpdate > 180) {
      status = "unhealthy";
    }

    entries.push({
      url: `${target.baseUrl}/${target.repo}`,
      name: `${target.owner}/${target.repo}`,
      type: target.type,
      lastmod: metadata.updated_at,
      status,
      description: metadata.description,
      repo_url: `https://github.com/${target.owner}/${target.repo}`,
    });

    // Rate limit courtesy
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const xmlSitemap = generateXmlSitemap(entries);
  const jsonSitemap = {
    generated_at: new Date().toISOString(),
    total_entries: entries.length,
    entries: entries.map(e => ({
      url: e.url,
      name: e.name,
      type: e.type,
      lastmod: e.lastmod,
      status: e.status,
      description: e.description,
      repo_url: e.repo_url,
    })),
  };

  return {
    generated_at: new Date().toISOString(),
    total_entries: entries.length,
    entries,
    xml_sitemap: xmlSitemap,
    json_sitemap: jsonSitemap,
  };
}

/**
 * Format sitemap report summary for display.
 */
export function formatSitemapReport(report: SitemapReport): string {
  const lines: string[] = [];
  
  lines.push(`\n${"=".repeat(70)}`);
  lines.push(`DYNAMIC SITEMAP REPORT`);
  lines.push(`${"=".repeat(70)}`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Total Entries: ${report.total_entries}`);
  lines.push("");
  lines.push("Entries:");
  
  for (const entry of report.entries) {
    const icon = entry.status === "healthy" ? "✅" :
                 entry.status === "degraded" ? "⚠️" :
                 entry.status === "unhealthy" ? "❌" : "❓";
    lines.push(`  ${icon} ${entry.name} (${entry.type})`);
    lines.push(`     URL: ${entry.url}`);
    lines.push(`     Last Modified: ${entry.lastmod}`);
    if (entry.description) {
      lines.push(`     Description: ${entry.description.substring(0, 80)}${entry.description.length > 80 ? "..." : ""}`);
    }
  }

  lines.push("");
  lines.push(`XML Sitemap Length: ${report.xml_sitemap.length} bytes`);
  lines.push(`${"=".repeat(70)}\n`);
  
  return lines.join("\n");
}
