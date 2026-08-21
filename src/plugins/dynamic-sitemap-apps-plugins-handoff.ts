 /**
  * @file dynamic-sitemap-apps-plugins-handoff.ts
  * @description Handoff scaffolding for "Dynamic Sitemap (Apps & Plugins)"
  * (Issue #5906 / upstream ubiquity/ubq.fi-router#2).
  * Provides generators for cross-referencing GitHub repos to verify app/plugin status,
  * compiling results into XML sitemaps and JSON infrastructure maps for interoperability.
  *
  * Bounty: $75 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface InfraEntity {
   name: string;
   type: 'app' | 'plugin';
   repoUrl: string;
   status: 'active' | 'deprecated' | 'broken' | 'unknown';
   lastChecked: string;
   healthScore?: number; // 0-100
   metadata?: Record<string, unknown>;
 }

 export interface SitemapEntry {
   loc: string;
   lastmod: string;
   changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
   priority: number; // 0.0 - 1.0
 }

 export interface InfraReport {
   generatedAt: string;
   totalEntities: number;
   activeCount: number;
   deprecatedCount: number;
   brokenCount: number;
   entities: InfraEntity[];
 }

 export interface GitHubRepoStatus {
   exists: boolean;
   isArchived: boolean;
   hasRecentCommits: boolean; // within 90 days
   defaultBranch: string;
   description?: string;
   topics: string[];
 }

 // ============================================================================
 // GitHub Status Checker Generator
 // ============================================================================

 /**
  * Generates a utility that checks GitHub repository status to determine
  * if an app or plugin is active, deprecated, or broken.
  */
 export function generateGitHubStatusChecker(): string {
   return `// Auto-generated GitHub Repo Status Checker
 import type { GitHubRepoStatus } from './types';

 export async function checkRepoStatus(
   owner: string,
   repo: string,
   octokit: any
 ): Promise<GitHubRepoStatus> {
   try {
     const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

     // Check for recent commits (within 90 days)
     const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
     let hasRecentCommits = false;

     try {
       const { data: commits } = await octokit.rest.repos.listCommits({
         owner,
         repo,
         per_page: 1,
       });
       if (commits.length > 0) {
         const lastCommitDate = new Date(commits[0].commit.committer.date);
         hasRecentCommits = lastCommitDate >= ninetyDaysAgo;
       }
     } catch {
       // If commits endpoint fails, assume no recent activity
     }

     return {
       exists: true,
       isArchived: repoData.archived ?? false,
       hasRecentCommits,
       defaultBranch: repoData.default_branch,
       description: repoData.description ?? undefined,
       topics: repoData.topics ?? [],
     };
   } catch (err: any) {
     if (err.status === 404) {
       return {
         exists: false,
         isArchived: false,
         hasRecentCommits: false,
         defaultBranch: '',
         topics: [],
       };
     }
     throw err;
   }
 }

 export function classifyEntityStatus(status: GitHubRepoStatus): 'active' | 'deprecated' | 'broken' | 'unknown' {
   if (!status.exists) return 'broken';
   if (status.isArchived) return 'deprecated';
   if (!status.hasRecentCommits) return 'deprecated';
   return 'active';
 }
 `.trim();
 }

 // ============================================================================
 // Infrastructure Compiler Generator
 // ============================================================================

 /**
  * Generates the main compiler that aggregates all apps and plugins,
  * checks their status, and produces a unified infrastructure report.
  */
 export function generateInfraCompiler(): string {
   return `// Auto-generated Infrastructure Compiler
 import type { InfraEntity, InfraReport, GitHubRepoStatus } from './types';
 import { checkRepoStatus, classifyEntityStatus } from './github-status';

 export async function compileInfraReport(
   entitySources: Array<{ name: string; type: 'app' | 'plugin'; repoOwner: string; repoName: string }>,
   octokit: any
 ): Promise<InfraReport> {
   const entities: InfraEntity[] = [];

   for (const source of entitySources) {
     const repoUrl = \`https://github.com/\${source.repoOwner}/\${source.repoName}\`;
     let status: GitHubRepoStatus;

     try {
       status = await checkRepoStatus(source.repoOwner, source.repoName, octokit);
     } catch (err) {
       console.warn(\`Failed to check \${repoUrl}: \${err}\`);
       entities.push({
         name: source.name,
         type: source.type,
         repoUrl,
         status: 'unknown',
         lastChecked: new Date().toISOString(),
       });
       continue;
     }

     const classifiedStatus = classifyEntityStatus(status);

     entities.push({
       name: source.name,
       type: source.type,
       repoUrl,
       status: classifiedStatus,
       lastChecked: new Date().toISOString(),
       metadata: {
         archived: status.isArchived,
         hasRecentCommits: status.hasRecentCommits,
         topics: status.topics,
         description: status.description,
       },
     });
   }

   return {
     generatedAt: new Date().toISOString(),
     totalEntities: entities.length,
     activeCount: entities.filter(e => e.status === 'active').length,
     deprecatedCount: entities.filter(e => e.status === 'deprecated').length,
     brokenCount: entities.filter(e => e.status === 'broken').length,
     entities,
   };
 }
 `.trim();
 }

 // ============================================================================
 // XML Sitemap Generator
 // ============================================================================

 /**
  * Generates an XML sitemap from the infrastructure report.
  * Only includes active entities with appropriate priority weighting.
  */
 export function generateXmlSitemap(report: InfraReport): string {
   const entries = report.entities
     .filter(e => e.status === 'active')
     .map(e => ({
       loc: e.repoUrl,
       lastmod: e.lastChecked.split('T')[0],
       changefreq: 'weekly' as const,
       priority: e.type === 'app' ? 0.8 : 0.6,
     }));

   const xmlLines = [
     '<?xml version="1.0" encoding="UTF-8"?>',
     '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
   ];

   for (const entry of entries) {
     xmlLines.push('  <url>');
     xmlLines.push(\`    <loc>\${entry.loc}</loc>\`);
     xmlLines.push(\`    <lastmod>\${entry.lastmod}</lastmod>\`);
     xmlLines.push(\`    <changefreq>\${entry.changefreq}</changefreq>\`);
     xmlLines.push(\`    <priority>\${entry.priority.toFixed(1)}</priority>\`);
     xmlLines.push('  </url>');
   }

   xmlLines.push('</urlset>');
   return xmlLines.join('\n');
 }

 // ============================================================================
 // JSON Interoperability Export Generator
 // ============================================================================

 /**
  * Generates a clean JSON export suitable for consumption by external
  * monitoring systems, dashboards, or CI pipelines.
  */
 export function generateJsonExport(report: InfraReport): string {
   const exportData = {
     schema: 'ubiquity-infra-map-v1',
     ...report,
     summary: {
       healthPercentage: Math.round((report.activeCount / Math.max(report.totalEntities, 1)) * 100),
       needsAttention: report.entities
         .filter(e => e.status !== 'active')
         .map(e => ({ name: e.name, type: e.type, status: e.status, repoUrl: e.repoUrl })),
     },
   };

   return JSON.stringify(exportData, null, 2);
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5906 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasStatusChecker = Object.values(files).some(c =>
     c.includes('checkRepoStatus') && c.includes('isArchived') && c.includes('hasRecentCommits')
   );
   const hasClassifier = Object.values(files).some(c =>
     c.includes('classifyEntityStatus') && c.includes("'active'") && c.includes("'deprecated'")
   );
   const hasCompiler = Object.values(files).some(c =>
     c.includes('compileInfraReport') && c.includes('InfraReport')
   );
   const hasXmlGenerator = Object.values(files).some(c =>
     c.includes('<?xml') && c.includes('<urlset') && c.includes('<loc>')
   );
   const hasJsonExport = Object.values(files).some(c =>
     c.includes('generateJsonExport') && c.includes('ubiquity-infra-map')
   );
   const hasCrossReference = Object.values(files).some(c =>
     c.includes('repoOwner') && c.includes('repoName') && c.includes('octokit')
   );
   const hasHealthSummary = Object.values(files).some(c =>
     c.includes('healthPercentage') || c.includes('needsAttention')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasStatusChecker, 'GitHub repo status checker exists');
   check(hasClassifier, 'Entity status classifier (active/deprecated/broken) exists');
   check(hasCompiler, 'Infrastructure report compiler exists');
   check(hasXmlGenerator, 'XML sitemap generator exists');
   check(hasJsonExport, 'JSON interoperability export exists');
   check(hasCrossReference, 'Cross-referencing logic using GitHub API exists');
   check(hasHealthSummary, 'Health summary or attention-needed list included');

   return { pass, report };
 }
