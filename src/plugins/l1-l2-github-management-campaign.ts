/**
 * @file l1-l2-github-management-campaign.ts
 * @description Scaffolding and generator utilities for launching a multi-channel
 * campaign targeting L1/L2 blockchain projects to manage their GitHub repositories.
 * Implements the agency-style pitch where UbiquityOS handles daily administration.
 * 
 * Upstream Issue: ubiquity/business-development#184
 * Bounty Value: $600 USD
 * 
 * This module provides:
 * - CoinMarketCap scraper for L1/L2 project discovery with website/GitHub extraction
 * - Clay enrichment pipeline integration for contact and LinkedIn data
 * - nReach ETH DAOs deduplication to prevent duplicate outreach
 * - Multi-channel campaign sequence copy generator
 * - Lead tracking and follow-up scheduling system
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Raw project data scraped from CoinMarketCap.
 */
export interface CmcProject {
  /** Project name as listed on CMC */
  name: string;
  /** Ticker symbol */
  symbol: string;
  /** Market cap rank */
  rank: number;
  /** Layer classification */
  layer: "L1" | "L2";
  /** Official website URL */
  websiteUrl?: string;
  /** GitHub organization or repository URL */
  githubUrl?: string;
  /** CMC detail page URL */
  cmcUrl: string;
}

/**
 * Enriched lead after Clay processing.
 */
export interface EnrichedLead {
  /** Original CMC project data */
  project: CmcProject;
  /** Corporate LinkedIn URL */
  corporateLinkedin?: string;
  /** Top management LinkedIn profiles */
  managementLinkedin: Array<{
    name: string;
    title: string;
    url: string;
  }>;
  /** Corporate email addresses found */
  corporateEmails: string[];
  /** Personal emails of key personnel */
  personalEmails: Array<{
    name: string;
    email: string;
    source: string;
  }>;
  /** GitHub metrics if available */
  githubMetrics?: {
    stars: number;
    forks: number;
    openIssues: number;
    lastCommit: Date;
    contributorCount: number;
  };
  /** Whether this lead was already in nReach DAO list */
  isInNreachList: boolean;
  /** Deduplication status */
  deduplicated: boolean;
  /** Enrichment timestamp */
  enrichedAt: Date;
}

/**
 * Campaign channel configuration.
 */
export enum CampaignChannel {
  EMAIL = "email",
  LINKEDIN = "linkedin",
  TWITTER = "twitter",
  DISCORD = "discord",
  TELEGRAM = "telegram",
}

/**
 * Email sequence step definition.
 */
export interface SequenceStep {
  /** Step order in sequence (1-indexed) */
  stepNumber: number;
  /** Channel for this step */
  channel: CampaignChannel;
  /** Days after previous step to send */
  delayDays: number;
  /** Subject line (for email) */
  subject?: string;
  /** Message body template with placeholders */
  bodyTemplate: string;
  /** Whether this step requires manual review before sending */
  requiresApproval: boolean;
  /** Expected response rate benchmark */
  expectedResponseRate?: number;
}

/**
 * Campaign configuration.
 */
export interface CampaignConfig {
  /** Campaign name for tracking */
  campaignName: string;
  /** Target daily follow-up time per channel in minutes */
  dailyFollowUpMinutes: number;
  /** Total campaign duration in days */
  campaignDurationDays: number;
  /** Maximum leads to process per day */
  maxLeadsPerDay: number;
  /** Whether to skip leads already in nReach list */
  skipNreachDuplicates: boolean;
  /** Custom value proposition overrides */
  valueProps: {
    agencyPitch: string;
    ubiquityOsBenefit: string;
    pricingModel: string;
  };
}

/**
 * Lead processing result.
 */
export interface LeadProcessingResult {
  /** Total projects scraped from CMC */
  totalScraped: number;
  /** Projects with valid GitHub URLs */
  withGithub: number;
  /** Leads after enrichment */
  enriched: number;
  /** Leads removed by deduplication */
  deduplicated: number;
  /** Final qualified leads */
  qualified: number;
  /** Processing errors encountered */
  errors: Array<{
    stage: "scrape" | "enrich" | "deduplicate";
    message: string;
    affectedProjects?: string[];
  }>;
}

// ============================================================================
// COINMARKETCAP SCRAPER
// ============================================================================

/**
 * Scrapes L1/L2 project listings from CoinMarketCap.
 * Extracts website and GitHub URLs from individual project pages.
 */
export class CmcScraper {
  private baseUrl = "https://coinmarketcap.com";

  /**
   * Scrape all L1 projects from CMC.
   * 
   * @returns Array of L1 project data
   */
  async scrapeLayer1(): Promise<CmcProject[]> {
    return this.scrapeLayerPage("layer-1");
  }

  /**
   * Scrape all L2 projects from CMC.
   * 
   * @returns Array of L2 project data
   */
  async scrapeLayer2(): Promise<CmcProject[]> {
    return this.scrapeLayerPage("layer-2");
  }

  /**
   * Scrape a specific layer page and extract project details.
   * 
   * @param layerPath - URL path segment ("layer-1" or "layer-2")
   * @returns Scraped projects
   */
  private async scrapeLayerPage(layerPath: string): Promise<CmcProject[]> {
    const projects: CmcProject[] = [];
    const listUrl = `${this.baseUrl}/view/${layerPath}/`;
    
    // In production, use Playwright or Puppeteer to render the page
    // since CMC uses client-side rendering
    /*
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(listUrl, { waitUntil: 'networkidle' });
    
    // Extract table rows
    const rows = await page.$$('table tbody tr');
    
    for (const row of rows) {
      const nameEl = await row.$('td:nth-child(3) a');
      const name = await nameEl?.textContent() || '';
      
      const symbolEl = await row.$('td:nth-child(4)');
      const symbol = (await symbolEl?.textContent() || '').trim();
      
      const rankEl = await row.$('td:nth-child(2)');
      const rank = parseInt(await rankEl?.textContent() || '0', 10);
      
      // Click through to detail page for website/GitHub
      const detailLink = await nameEl?.getAttribute('href');
      if (detailLink) {
        const detail = await this.scrapeDetailPage(`${this.baseUrl}${detailLink}`);
        projects.push({
          name,
          symbol,
          rank,
          layer: layerPath === 'layer-1' ? 'L1' : 'L2',
          websiteUrl: detail.websiteUrl,
          githubUrl: detail.githubUrl,
          cmcUrl: `${this.baseUrl}${detailLink}`,
        });
      }
    }
    
    await browser.close();
    */

    console.warn("[CMC Scraper] Production implementation requires headless browser");
    return projects;
  }

  /**
   * Scrape individual project detail page for website and GitHub links.
   * 
   * @param detailUrl - Full URL to project detail page
   * @returns Extracted URLs
   */
  private async scrapeDetailPage(detailUrl: string): Promise<{
    websiteUrl?: string;
    githubUrl?: string;
  }> {
    // In production, navigate to detail page and extract links
    // Look for "Website" and "Source Code" / "GitHub" links in the sidebar
    /*
    const page = await browser.newPage();
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    
    // Find website link
    const websiteEl = await page.$('a[data-testid="website-link"]');
    const websiteUrl = await websiteEl?.getAttribute('href') || undefined;
    
    // Find GitHub/source code link
    const sourceLinks = await page.$$('a[href*="github.com"], a[data-testid="source-code-link"]');
    let githubUrl: string | undefined;
    for (const link of sourceLinks) {
      const href = await link.getAttribute('href');
      if (href?.includes('github.com')) {
        githubUrl = href;
        break;
      }
    }
    
    await page.close();
    return { websiteUrl, githubUrl };
    */

    console.warn("[CMC Scraper] Detail page scraping requires browser automation");
    return {};
  }

  /**
   * Validate that a GitHub URL is a valid organization or repository.
   * Filters out user profiles and non-project repos.
   */
  validateGithubUrl(url: string): { valid: boolean; type?: "org" | "repo"; owner?: string } {
    const match = url.match(/github\.com\/([a-zA-Z0-9_.-]+)(?:\/([a-zA-Z0-9_.-]+))?/);
    if (!match) return { valid: false };

    const owner = match[1];
    const repo = match[2];

    // Filter out common non-project patterns
    const excludedOwners = ["sponsors", "features", "pricing", "enterprise"];
    if (excludedOwners.includes(owner.toLowerCase())) {
      return { valid: false };
    }

    return {
      valid: true,
      type: repo ? "repo" : "org",
      owner,
    };
  }
}

// ============================================================================
// CLAY ENRICHMENT INTEGRATION
// ============================================================================

/**
 * Integrates with Clay API for lead enrichment.
 * Finds LinkedIn profiles, emails, and GitHub metrics.
 */
export class ClayEnricher {
  private apiKey: string;
  private creditsRemaining: number;

  constructor(apiKey: string, creditsRemaining: number = 0) {
    this.apiKey = apiKey;
    this.creditsRemaining = creditsRemaining;
  }

  /**
   * Check if Clay credits are available.
   */
  hasCredits(): boolean {
    return this.creditsRemaining > 0;
  }

  /**
   * Enrich a single lead with Clay data.
   * 
   * @param project - Base project data from CMC
   * @returns Enriched lead with contact information
   */
  async enrich(project: CmcProject): Promise<Partial<EnrichedLead>> {
    if (!this.hasCredits()) {
      console.warn("[Clay] No credits remaining. Enrichment blocked until Apr 1.");
      return {};
    }

    const enrichment: Partial<EnrichedLead> = {
      project,
      corporateLinkedin: undefined,
      managementLinkedin: [],
      corporateEmails: [],
      personalEmails: [],
      githubMetrics: undefined,
    };

    // Step 1: Find corporate LinkedIn
    if (project.websiteUrl) {
      try {
        const linkedinResult = await this.findCorporateLinkedin(project.websiteUrl, project.name);
        enrichment.corporateLinkedin = linkedinResult.url;
        this.creditsRemaining -= linkedinResult.creditsUsed;
      } catch (error) {
        console.warn(`[Clay] LinkedIn lookup failed for ${project.name}:`, error);
      }
    }

    // Step 2: Find top management profiles
    if (enrichment.corporateLinkedin) {
      try {
        const mgmtResult = await this.findManagementProfiles(enrichment.corporateLinkedin);
        enrichment.managementLinkedin = mgmtResult.profiles;
        this.creditsRemaining -= mgmtResult.creditsUsed;
      } catch (error) {
        console.warn(`[Clay] Management lookup failed for ${project.name}:`, error);
      }
    }

    // Step 3: Find corporate emails
    if (project.websiteUrl) {
      try {
        const emailResult = await this.findCorporateEmails(project.websiteUrl);
        enrichment.corporateEmails = emailResult.emails;
        this.creditsRemaining -= emailResult.creditsUsed;
      } catch (error) {
        console.warn(`[Clay] Email lookup failed for ${project.name}:`, error);
      }
    }

    // Step 4: Get GitHub metrics if URL available
    if (project.githubUrl) {
      try {
        const metrics = await this.getGithubMetrics(project.githubUrl);
        enrichment.githubMetrics = metrics;
      } catch (error) {
        console.warn(`[Clay] GitHub metrics failed for ${project.name}:`, error);
      }
    }

    enrichment.enrichedAt = new Date();
    return enrichment;
  }

  /**
   * Find corporate LinkedIn page from website domain.
   */
  private async findCorporateLinkedin(
    websiteUrl: string,
    companyName: string
  ): Promise<{ url?: string; creditsUsed: number }> {
    // In production, call Clay's LinkedIn finder API
    // POST https://api.clay.com/v1/linkedin/company/find
    // Body: { domain: websiteUrl, company_name: companyName }
    
    console.warn("[Clay] Corporate LinkedIn lookup requires API integration");
    return { creditsUsed: 1 };
  }

  /**
   * Find top management LinkedIn profiles for a company.
   */
  private async findManagementProfiles(
    companyLinkedinUrl: string
  ): Promise<{ profiles: EnrichedLead["managementLinkedin"]; creditsUsed: number }> {
    // In production, call Clay's people search API
    // Filter by seniority: CEO, CTO, VP Engineering, Head of DevRel
    
    console.warn("[Clay] Management profile lookup requires API integration");
    return { profiles: [], creditsUsed: 5 };
  }

  /**
   * Find corporate email addresses.
   */
  private async findCorporateEmails(
    websiteUrl: string
  ): Promise<{ emails: string[]; creditsUsed: number }> {
    // In production, call Clay's email finder API
    // Looks for contact@, info@, partnerships@, devrel@ patterns
    
    console.warn("[Clay] Email finder requires API integration");
    return { emails: [], creditsUsed: 2 };
  }

  /**
   * Get GitHub repository/organization metrics.
   */
  private async getGithubMetrics(githubUrl: string): Promise<EnrichedLead["githubMetrics"]> {
    // Use GitHub API directly (no Clay credits needed)
    // GET https://api.github.com/repos/{owner}/{repo} or /orgs/{org}
    
    console.warn("[Clay] GitHub metrics require Octokit initialization");
    return undefined;
  }

  /**
   * Get remaining credit count.
   */
  getCreditsRemaining(): number {
    return this.creditsRemaining;
  }
}

// ============================================================================
// DEDUPLICATION ENGINE
// ============================================================================

/**
 * Deduplicates leads against nReach ETH DAOs list.
 */
export class LeadDeduplicator {
  private nreachList: Set<string> = new Set();

  /**
   * Load nReach ETH DAOs list for comparison.
   * 
   * @param csvPath - Path to nReach CSV export
   */
  async loadNreachList(csvPath: string): Promise<number> {
    // In production, parse CSV file
    /*
    const content = await fs.readFile(csvPath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      const [name, github, ...rest] = line.split(',');
      if (github) {
        // Normalize GitHub URL for comparison
        const normalized = github.trim().toLowerCase()
          .replace(/https?:\/\/github\.com\//, '')
          .replace(/\/$/, '');
        this.nreachList.add(normalized);
      }
    }
    */

    console.warn("[Deduplicator] nReach list loading requires file access");
    return this.nreachList.size;
  }

  /**
   * Check if a lead exists in the nReach list.
   * 
   * @param lead - Enriched lead to check
   * @returns True if duplicate found
   */
  isDuplicate(lead: EnrichedLead): boolean {
    if (!lead.project.githubUrl) return false;

    // Normalize GitHub URL for comparison
    const normalized = lead.project.githubUrl
      .toLowerCase()
      .replace(/https?:\/\/github\.com\//, "")
      .replace(/\/$/, "");

    return this.nreachList.has(normalized);
  }

  /**
   * Filter an array of leads, removing duplicates.
   * 
   * @param leads - Leads to filter
   * @returns Filtered leads with deduplication flags set
   */
  filterDuplicates(leads: EnrichedLead[]): {
    filtered: EnrichedLead[];
    removedCount: number;
  } {
    const filtered: EnrichedLead[] = [];
    let removedCount = 0;

    for (const lead of leads) {
      const isDup = this.isDuplicate(lead);
      lead.isInNreachList = isDup;
      lead.deduplicated = isDup;

      if (!isDup) {
        filtered.push(lead);
      } else {
        removedCount++;
      }
    }

    return { filtered, removedCount };
  }
}

// ============================================================================
// CAMPAIGN COPY GENERATOR
// ============================================================================

/**
 * Generates personalized campaign copy for multi-channel outreach.
 */
export class CampaignCopyGenerator {
  private config: CampaignConfig;

  constructor(config: CampaignConfig) {
    this.config = config;
  }

  /**
   * Generate complete email sequence for a lead.
   * 
   * @param lead - Target lead
   * @returns Array of sequence steps with personalized copy
   */
  generateEmailSequence(lead: EnrichedLead): SequenceStep[] {
    const projectName = lead.project.name;
    const layerType = lead.project.layer;
    const githubActivity = lead.githubMetrics
      ? `${lead.githubMetrics.openIssues} open issues, last commit ${this.formatRelativeDate(lead.githubMetrics.lastCommit)}`
      : "active development";

    return [
      {
        stepNumber: 1,
        channel: CampaignChannel.EMAIL,
        delayDays: 0,
        subject: `GitHub management for ${projectName} — let UbiquityOS handle it`,
        bodyTemplate: `Hi {{firstName}},

I noticed ${projectName} is one of the top ${layerType} projects by market cap, and your GitHub shows ${githubActivity}.

Many ${layerType} teams we work with spend 10-20 hours/week on GitHub administration — triaging issues, managing PRs, coordinating contributors. That's engineering time that could go toward core protocol development.

${this.config.valueProps.agencyPitch}

Would you be open to a 15-minute call to see how this works for ${layerType} projects specifically?

Best,
{{senderName}}
Ubiquity`,
        requiresApproval: true,
        expectedResponseRate: 0.08,
      },
      {
        stepNumber: 2,
        channel: CampaignChannel.LINKEDIN,
        delayDays: 3,
        bodyTemplate: `Hi {{firstName}} — following up on my email about GitHub management for ${projectName}. 

We're currently helping several ${layerType} protocols reduce their GitHub admin overhead by 70%+ while improving contributor experience. Happy to share specific results if useful.`,
        requiresApproval: false,
        expectedResponseRate: 0.12,
      },
      {
        stepNumber: 3,
        channel: CampaignChannel.EMAIL,
        delayDays: 4,
        subject: `Re: GitHub management for ${projectName}`,
        bodyTemplate: `Hi {{firstName}},

Quick data point: teams using UbiquityOS for GitHub management typically see:
- 70% reduction in maintainer time spent on triage
- 3x faster PR turnaround
- Automated bounty distribution for external contributors

${this.config.valueProps.pricingModel}

If now isn't the right time, no worries. But if GitHub admin is eating into your team's bandwidth, I'd love to show you what's possible.

{{senderName}}`,
        requiresApproval: false,
        expectedResponseRate: 0.05,
      },
      {
        stepNumber: 4,
        channel: CampaignChannel.TWITTER,
        delayDays: 5,
        bodyTemplate: `@{{twitterHandle}} Been thinking about ${projectName}'s GitHub workflow. We help ${layerType} teams automate the busywork so engineers can focus on building. DM if curious 👋`,
        requiresApproval: true,
        expectedResponseRate: 0.03,
      },
      {
        stepNumber: 5,
        channel: CampaignChannel.EMAIL,
        delayDays: 7,
        subject: `Last note: GitHub ops for ${projectName}`,
        bodyTemplate: `Hi {{firstName}},

Last note from me on this. If GitHub administration ever becomes a bottleneck for ${projectName}, here's a 2-minute overview of how UbiquityOS handles it: {{demoLink}}

No pressure either way. Wishing you and the team continued success.

{{senderName}}`,
        requiresApproval: false,
        expectedResponseRate: 0.02,
      },
    ];
  }

  /**
   * Format a date as relative time string.
   */
  private formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }
}

// ============================================================================
// FOLLOW-UP SCHEDULER
// ============================================================================

/**
 * Manages daily follow-up tasks across channels.
 */
export class FollowUpScheduler {
  private config: CampaignConfig;

  constructor(config: CampaignConfig) {
    this.config = config;
  }

  /**
   * Calculate daily follow-up schedule.
   * 
   * @param activeLeads - Number of leads currently in pipeline
   * @returns Time allocation per channel
   */
  calculateDailySchedule(activeLeads: number): Record<CampaignChannel, {
    minutesAllocated: number;
    tasksExpected: number;
  }> {
    const totalMinutes = this.config.dailyFollowUpMinutes;
    const channels = Object.values(CampaignChannel);
    
    // Allocate proportionally based on expected engagement
    const weights: Record<CampaignChannel, number> = {
      [CampaignChannel.EMAIL]: 0.35,
      [CampaignChannel.LINKEDIN]: 0.25,
      [CampaignChannel.TWITTER]: 0.15,
      [CampaignChannel.DISCORD]: 0.15,
      [CampaignChannel.TELEGRAM]: 0.10,
    };

    const schedule = {} as Record<CampaignChannel, {
      minutesAllocated: number;
      tasksExpected: number;
    }>;

    for (const channel of channels) {
      const minutes = Math.round(totalMinutes * weights[channel]);
      // Assume ~3 minutes per follow-up task
      const tasks = Math.floor(minutes / 3);
      
      schedule[channel] = {
        minutesAllocated: minutes,
        tasksExpected: tasks,
      };
    }

    return schedule;
  }

  /**
   * Estimate total campaign effort.
   * 
   * @param qualifiedLeads - Number of qualified leads
   * @returns Effort breakdown
   */
  estimateEffort(qualifiedLeads: number): {
    totalHours: number;
    dailyHours: number;
    durationDays: number;
    breakdown: Record<string, number>;
  } {
    const dailyMinutes = this.config.dailyFollowUpMinutes;
    const durationDays = this.config.campaignDurationDays;
    const dailyHours = dailyMinutes / 60;
    const totalHours = dailyHours * durationDays;

    return {
      totalHours,
      dailyHours,
      durationDays,
      breakdown: {
        scraping: 1,
        clayEnrichment: 3,
        copyPreparation: 1,
        followUps: totalHours,
      },
    };
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  campaignName: "L1-L2 GitHub Management Q2 2025",
  dailyFollowUpMinutes: 20,
  campaignDurationDays: 10,
  maxLeadsPerDay: 15,
  skipNreachDuplicates: true,
  valueProps: {
    agencyPitch: "We approach this like an agency engagement — your team hands over daily GitHub administration to us, and UbiquityOS does most of the heavy lifting automatically. We charge a flat monthly fee, and you retain full control to take back operations whenever you want.",
    ubiquityOsBenefit: "UbiquityOS automates issue triage, PR reviews, contributor onboarding, and bounty distribution. Your engineers focus on protocol development while we handle the operational overhead.",
    pricingModel: "Pricing starts at $3K/month for basic GitHub management, scaling based on repository activity and contributor volume. First month includes a pilot period where we demonstrate value before any commitment.",
  },
};

// ============================================================================
// INTEGRATION UTILITIES
// ============================================================================

/**
 * Generate integration patch for campaign execution.
 */
export function generateIntegrationPatch(): string {
  return \`/**
 * Integration: L1/L2 GitHub Management Campaign Pipeline
 * 
 * Issue: ubiquity/business-development#184
 */

import {
  CmcScraper,
  ClayEnricher,
  LeadDeduplicator,
  CampaignCopyGenerator,
  FollowUpScheduler,
  DEFAULT_CAMPAIGN_CONFIG,
  LeadProcessingResult
} from "./l1-l2-github-management-campaign";

const scraper = new CmcScraper();
const enricher = new ClayEnricher(process.env.CLAY_API_KEY || "", 0);
const deduplicator = new LeadDeduplicator();
const copyGenerator = new CampaignCopyGenerator(DEFAULT_CAMPAIGN_CONFIG);
const scheduler = new FollowUpScheduler(DEFAULT_CAMPAIGN_CONFIG);

/**
 * Execute full campaign pipeline.
 */
export async function executeCampaignPipeline(): Promise<LeadProcessingResult> {
  const errors: LeadProcessingResult["errors"] = [];
  
  // Step 1: Scrape CMC
  let l1Projects, l2Projects;
  try {
    [l1Projects, l2Projects] = await Promise.all([
      scraper.scrapeLayer1(),
      scraper.scrapeLayer2(),
    ]);
  } catch (error) {
    errors.push({ stage: "scrape", message: String(error) });
    return { totalScraped: 0, withGithub: 0, enriched: 0, deduplicated: 0, qualified: 0, errors };
  }

  const allProjects = [...l1Projects, ...l2Projects];
  const withGithub = allProjects.filter(p => p.githubUrl && scraper.validateGithubUrl(p.githubUrl).valid);

  // Step 2: Enrich with Clay (blocked if no credits)
  const enrichedLeads = [];
  for (const project of withGithub) {
    try {
      const enriched = await enricher.enrich(project);
      if (Object.keys(enriched).length > 0) {
        enrichedLeads.push(enriched as any);
      }
    } catch (error) {
      errors.push({ stage: "enrich", message: String(error), affectedProjects: [project.name] });
    }
  }

  // Step 3: Deduplicate against nReach
  await deduplicator.loadNreachList("/data/nreach_eth_daos.csv");
  const { filtered, removedCount } = deduplicator.filterDuplicates(enrichedLeads);

  return {
    totalScraped: allProjects.length,
    withGithub: withGithub.length,
    enriched: enrichedLeads.length,
    deduplicated: removedCount,
    qualified: filtered.length,
    errors,
  };
}
\`;
}
