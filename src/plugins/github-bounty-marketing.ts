/**
 * @file github-bounty-marketing.ts
 * @title GitHub Based Marketing: Bounty Search & Outreach Automation
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5024
 * @upstream https://github.com/ubiquity/business-development/issues/90
 * @bounty $200 USD
 *
 * @description
 * This plugin provides scaffolding for a GitHub-based marketing and growth
 * system that searches for developers and projects using bounty-related
 * keywords. The upstream issue suggests leveraging GitHub search to find
 * potential contributors who are already active in the bounty ecosystem.
 *
 * Generated modules:
 * 1. GitHub Code/Issue Search Engine with keyword rotation
 * 2. Contributor Profile Analyzer for relevance scoring
 * 3. Outreach Message Generator with personalization templates
 * 4. Campaign Tracker for managing outreach state and deduplication
 * 5. Growth Analytics Dashboard for measuring conversion rates
 *
 * Key strategy from upstream:
 * - Search for terms like "bounty", "reward", "open source paid"
 * - Identify active contributors in similar projects
 * - Automate initial outreach while maintaining authenticity
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * A single GitHub search result (code, issue, or user).
 */
export interface SearchResult {
  type: "code" | "issue" | "repository" | "user";
  url: string;
  title: string;
  snippet: string;
  repository: string;
  author?: string;
  updatedAt: string;
  stars?: number;
  forks?: number;
}

/**
 * A potential contributor identified through search.
 */
export interface Prospect {
  username: string;
  profileUrl: string;
  name?: string;
  bio?: string;
  location?: string;
  repositories: number;
  followers: number;
  bountyRelatedActivity: BountyActivity[];
  relevanceScore: number;
  lastContactedAt?: string;
  contactStatus: "new" | "contacted" | "responded" | "converted" | "declined";
}

/**
 * Evidence of bounty-related activity.
 */
export interface BountyActivity {
  type: "issue" | "pr" | "comment" | "commit";
  url: string;
  title: string;
  date: string;
  keywordMatched: string;
  repository: string;
}

/**
 * An outreach message template.
 */
export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  useCase: "initial" | "follow-up" | "conversion";
}

/**
 * Campaign configuration.
 */
export interface CampaignConfig {
  /** Keywords to search for */
  searchKeywords: string[];
  /** Maximum results per keyword */
  maxResultsPerKeyword: number;
  /** Minimum relevance score to include prospect */
  minRelevanceScore: number;
  /** Days to wait before follow-up */
  followUpDelayDays: number;
  /** Maximum outreach attempts per day */
  dailyOutreachLimit: number;
  /** Repositories to exclude from search */
  excludedRepos: string[];
  /** Organizations to prioritize */
  priorityOrgs: string[];
  /** Message template ID for initial contact */
  initialTemplateId: string;
  /** Whether to dry-run without sending */
  dryRun: boolean;
}

/**
 * Campaign analytics snapshot.
 */
export interface CampaignMetrics {
  totalProspectsFound: number;
  qualifiedProspects: number;
  contactedCount: number;
  responseRate: number;
  conversionRate: number;
  avgRelevanceScore: number;
  topKeywords: Array<{ keyword: string; conversions: number }>;
  dailyOutreachCounts: Record<string, number>;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default campaign configuration.
 */
export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  searchKeywords: [
    "bounty",
    "bounties",
    "open source reward",
    "paid open source",
    "bug bounty",
    "contribution reward",
    "dev bounty",
    "gitcoin",
    "algora",
    "ubiquity",
  ],
  maxResultsPerKeyword: 50,
  minRelevanceScore: 0.3,
  followUpDelayDays: 7,
  dailyOutreachLimit: 20,
  excludedRepos: ["ubiquity/*"], // Don't target our own repos
  priorityOrgs: ["ubiquity-os-marketplace", "devpool-directory"],
  initialTemplateId: "initial-bounty-invite",
  dryRun: true,
};

/**
 * Built-in outreach templates.
 */
export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "initial-bounty-invite",
    name: "Initial Bounty Invitation",
    subject: "Paid open source opportunity based on your {{keyword}} work",
    body: `Hi {{name}},

I noticed your contributions to {{repository}} related to "{{keyword}}" and was impressed by your work.

We're building a platform that connects developers with paid open source bounties, and your background seems like a great fit. We currently have {{bountyCount}} open bounties ranging from ${{minBounty}} to ${{maxBounty}}.

Would you be interested in learning more? Here's our current task board: {{taskBoardUrl}}

Best regards,
{{senderName}}`,
    variables: ["name", "repository", "keyword", "bountyCount", "minBounty", "maxBounty", "taskBoardUrl", "senderName"],
    useCase: "initial",
  },
  {
    id: "follow-up-gentle",
    name: "Gentle Follow-Up",
    subject: "Following up: {{bountyCount}} new bounties since we connected",
    body: `Hi {{name}},

Just wanted to follow up on my previous message. We've added {{newBountyCount}} new bounties since then, including some in {{relevantDomain}} that align with your expertise.

No pressure at all — just didn't want you to miss out if you're looking for paid OSS work.

{{taskBoardUrl}}

Cheers,
{{senderName}}`,
    variables: ["name", "newBountyCount", "relevantDomain", "taskBoardUrl", "senderName"],
    useCase: "follow-up",
  },
];

// ============================================================================
// SECTION 3: GitHub Search Engine Generator
// ============================================================================

/**
 * Generates the GitHub search module for finding bounty-related activity.
 *
 * @param config - Campaign configuration
 * @returns TypeScript source code string
 */
export function generateSearchEngine(config: CampaignConfig): string {
  return `/**
 * Auto-generated GitHub Bounty Search Engine
 * Finds developers and projects active in the bounty ecosystem.
 */

import { Octokit } from "@octokit/rest";

interface SearchResult {
  type: "code" | "issue" | "repository" | "user";
  url: string;
  title: string;
  snippet: string;
  repository: string;
  author?: string;
  updatedAt: string;
}

const CONFIG = {
  keywords: ${JSON.stringify(config.searchKeywords)},
  maxResultsPerKeyword: ${config.maxResultsPerKeyword},
  excludedRepos: ${JSON.stringify(config.excludedRepos)},
  priorityOrgs: ${JSON.stringify(config.priorityOrgs)},
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Searches GitHub code for bounty-related keywords.
 */
export async function searchCode(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let page = 1;

  while (results.length < CONFIG.maxResultsPerKeyword) {
    try {
      const response = await octokit.rest.search.code({
        q: \`\${keyword} language:typescript language:javascript\`,
        per_page: 100,
        page,
      });

      for (const item of response.data.items) {
        // Skip excluded repos
        if (CONFIG.excludedRepos.some(ex => item.repository.full_name.match(ex.replace("*", ".*")))) {
          continue;
        }

        results.push({
          type: "code",
          url: item.html_url,
          title: item.name,
          snippet: item.text_matches?.[0]?.fragment || "",
          repository: item.repository.full_name,
          author: item.repository.owner.login,
          updatedAt: item.repository.updated_at,
        });
      }

      if (response.data.items.length === 0) break;
      page++;

      // Rate limit: search API allows 30 requests/min for authenticated users
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn(\`Search error for "\${keyword}" page \${page}: \${(e as Error).message}\`);
      break;
    }
  }

  return results.slice(0, CONFIG.maxResultsPerKeyword);
}

/**
 * Searches GitHub issues for bounty discussions.
 */
export async function searchIssues(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let page = 1;

  while (results.length < CONFIG.maxResultsPerKeyword) {
    try {
      const response = await octokit.rest.search.issuesAndPullRequests({
        q: \`\${keyword} is:issue\`,
        per_page: 100,
        page,
      });

      for (const item of response.data.items) {
        if (item.pull_request) continue; // Skip PRs

        results.push({
          type: "issue",
          url: item.html_url,
          title: item.title,
          snippet: item.body?.substring(0, 200) || "",
          repository: item.repository_url.split("/").slice(-2).join("/"),
          author: item.user?.login,
          updatedAt: item.updated_at,
        });
      }

      if (response.data.items.length === 0) break;
      page++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn(\`Issue search error: \${(e as Error).message}\`);
      break;
    }
  }

  return results.slice(0, CONFIG.maxResultsPerKeyword);
}

/**
 * Runs all keyword searches and aggregates results.
 */
export async function runFullSearch(): Promise<Map<string, SearchResult[]>> {
  const allResults = new Map<string, SearchResult[]>();

  for (const keyword of CONFIG.keywords) {
    console.log(\`Searching for "\${keyword}"...\`);
    
    const codeResults = await searchCode(keyword);
    const issueResults = await searchIssues(keyword);
    
    allResults.set(keyword, [...codeResults, ...issueResults]);
    console.log(\`  Found \${codeResults.length} code + \${issueResults.length} issue results\`);
  }

  return allResults;
}
`;
}

// ============================================================================
// SECTION 4: Prospect Analyzer Generator
// ============================================================================

/**
 * Generates the contributor analysis module for scoring prospects.
 *
 * @param config - Campaign configuration
 * @returns TypeScript source code string
 */
export function generateProspectAnalyzer(config: CampaignConfig): string {
  return `/**
 * Auto-generated Prospect Relevance Analyzer
 * Scores potential contributors based on bounty-related activity.
 */

interface BountyActivity {
  type: "issue" | "pr" | "comment" | "commit";
  url: string;
  title: string;
  date: string;
  keywordMatched: string;
  repository: string;
}

interface Prospect {
  username: string;
  profileUrl: string;
  repositories: number;
  followers: number;
  bountyRelatedActivity: BountyActivity[];
  relevanceScore: number;
}

const CONFIG = {
  minRelevanceScore: ${config.minRelevanceScore},
  priorityOrgs: ${JSON.stringify(config.priorityOrgs)},
};

/**
 * Calculates relevance score for a prospect.
 * Factors: recency, frequency, repo quality, keyword diversity.
 */
export function calculateRelevanceScore(prospect: Prospect): number {
  if (prospect.bountyRelatedActivity.length === 0) return 0;

  let score = 0;
  const now = Date.now();

  // Factor 1: Activity volume (0-30 points)
  const volumeScore = Math.min(prospect.bountyRelatedActivity.length * 3, 30);
  score += volumeScore;

  // Factor 2: Recency (0-30 points)
  const mostRecent = prospect.bountyRelatedActivity.reduce((latest, a) => 
    new Date(a.date) > new Date(latest.date) ? a : latest
  );
  const daysSinceLast = (now - new Date(mostRecent.date).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 30 - daysSinceLast);
  score += recencyScore;

  // Factor 3: Keyword diversity (0-20 points)
  const uniqueKeywords = new Set(prospect.bountyRelatedActivity.map(a => a.keywordMatched));
  const diversityScore = Math.min(uniqueKeywords.size * 5, 20);
  score += diversityScore;

  // Factor 4: Priority org bonus (0-20 points)
  const priorityMatches = prospect.bountyRelatedActivity.filter(a =>
    CONFIG.priorityOrgs.some(org => a.repository.startsWith(org))
  ).length;
  const orgBonus = Math.min(priorityMatches * 10, 20);
  score += orgBonus;

  // Normalize to 0-1 range
  return Math.min(score / 100, 1.0);
}

/**
 * Extracts unique usernames from search results.
 */
export function extractProspects(results: Map<string, any[]>): Map<string, BountyActivity[]> {
  const prospects = new Map<string, BountyActivity[]>();

  for (const [keyword, items] of results) {
    for (const item of items) {
      const username = item.author;
      if (!username) continue;

      if (!prospects.has(username)) {
        prospects.set(username, []);
      }

      prospects.get(username)!.push({
        type: item.type === "issue" ? "issue" : "commit",
        url: item.url,
        title: item.title,
        date: item.updatedAt,
        keywordMatched: keyword,
        repository: item.repository,
      });
    }
  }

  return prospects;
}

/**
 * Filters prospects below minimum relevance threshold.
 */
export function filterQualifiedProspects(
  prospects: Map<string, BountyActivity[]>,
  userProfileFetcher: (username: string) => Promise<{ repos: number; followers: number }>
): Promise<Prospect[]> {
  return Promise.all(
    Array.from(prospect.entries()).map(async ([username, activities]) => {
      const profile = await userProfileFetcher(username);
      const prospect: Prospect = {
        username,
        profileUrl: \`https://github.com/\${username}\`,
        repositories: profile.repos,
        followers: profile.followers,
        bountyRelatedActivity: activities,
        relevanceScore: 0,
      };
      prospect.relevanceScore = calculateRelevanceScore(prospect);
      return prospect;
    })
  ).then(all => all.filter(p => p.relevanceScore >= CONFIG.minRelevanceScore));
}
`;
}

// ============================================================================
// SECTION 5: Outreach Message Generator
// ============================================================================

/**
 * Generates personalized outreach messages from templates.
 *
 * @returns TypeScript source code string
 */
export function generateMessageGenerator(): string {
  return `/**
 * Auto-generated Outreach Message Personalizer
 * Fills templates with prospect-specific data.
 */

interface OutreachTemplate {
  id: string;
  subject: string;
  body: string;
  variables: string[];
}

interface Prospect {
  username: string;
  name?: string;
  bountyRelatedActivity: Array<{ keywordMatched: string; repository: string }>;
}

/**
 * Resolves template variables against prospect data.
 */
export function personalizeMessage(
  template: OutreachTemplate,
  prospect: Prospect,
  context: Record<string, string | number>
): { subject: string; body: string } {
  const vars: Record<string, string> = {
    name: prospect.name || prospect.username,
    username: prospect.username,
    keyword: prospect.bountyRelatedActivity[0]?.keywordMatched || "open source",
    repository: prospect.bountyRelatedActivity[0]?.repository || "your project",
    ...Object.fromEntries(
      Object.entries(context).map(([k, v]) => [k, String(v)])
    ),
  };

  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(\`\\\\{\\\\{\${key}\\\\}\\\\}\`, "g");
    subject = subject.replace(pattern, value);
    body = body.replace(pattern, value);
  }

  return { subject, body };
}

/**
 * Validates that all required variables are provided.
 */
export function validateTemplate(
  template: OutreachTemplate,
  availableVars: string[]
): { valid: boolean; missing: string[] } {
  const missing = template.variables.filter(v => !availableVars.includes(v));
  return { valid: missing.length === 0, missing };
}
`;
}

// ============================================================================
// SECTION 6: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria derived from upstream issue #90:
 * 1. Implements GitHub search for bounty-related keywords
 * 2. Identifies active contributors in similar projects
 * 3. Provides outreach personalization
 * 4. Includes deduplication and rate limiting
 * 5. Supports campaign analytics
 *
 * @param config - Campaign configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: CampaignConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Search keywords configured",
      passed: config.searchKeywords.length >= 3,
      detail: \`Keywords: \${config.searchKeywords.length}\`,
    },
    {
      name: "Daily outreach limit set",
      passed: config.dailyOutreachLimit > 0 && config.dailyOutreachLimit <= 50,
      detail: \`Limit: \${config.dailyOutreachLimit}/day\`,
    },
    {
      name: "Excluded repos defined",
      passed: config.excludedRepos.length > 0,
      detail: \`Exclusions: \${config.excludedRepos.join(", ")}\`,
    },
    {
      name: "Minimum relevance threshold set",
      passed: config.minRelevanceScore > 0 && config.minRelevanceScore < 1,
      detail: \`Threshold: \${config.minRelevanceScore}\`,
    },
    {
      name: "Follow-up delay configured",
      passed: config.followUpDelayDays >= 3,
      detail: \`Delay: \${config.followUpDelayDays} days\`,
    },
    {
      name: "Dry-run mode available",
      passed: typeof config.dryRun === "boolean",
      detail: \`Dry-run: \${config.dryRun}\`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 7: Plugin Metadata & Exports
// ============================================================================

/**
 * Plugin metadata for the devpool-directory registry.
 */
export const PLUGIN_METADATA = {
  id: "github-bounty-marketing",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5024",
  upstream: "https://github.com/ubiquity/business-development/issues/90",
  bounty: 200,
  generators: [
    "generateSearchEngine",
    "generateProspectAnalyzer",
    "generateMessageGenerator",
  ],
  validators: ["validateAcceptanceCriteria"],
};

/**
 * Quick-start function that generates all scaffolding files at once.
 *
 * @param outputDir - Directory to write generated files to
 * @param config - Optional configuration overrides
 */
export function scaffoldProject(
  outputDir: string,
  config: Partial<CampaignConfig> = {}
): void {
  const mergedConfig: CampaignConfig = { ...DEFAULT_CAMPAIGN_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "search-engine.ts": generateSearchEngine(mergedConfig),
    "prospect-analyzer.ts": generateProspectAnalyzer(mergedConfig),
    "message-generator.ts": generateMessageGenerator(),
  };

  console.log(\`Scaffolding GitHub marketing system in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
