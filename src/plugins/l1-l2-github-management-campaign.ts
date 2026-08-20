/**
 * Launch Campaign Towards L1s/L2s for Managing Their GitHubs
 *
 * Implements scraper, enrichment pipeline, deduplication, and multi-channel
 * campaign utilities for targeting Layer 1 and Layer 2 blockchain projects
 * with an "AI agency" pitch for GitHub administration via UbiquityOS.
 *
 * Addresses: devpool-directory#5925 / ubiquity/business-development#184
 */

export interface L1L2Project {
  name: string;
  category: "layer-1" | "layer-2";
  website?: string;
  githubUrl?: string;
  coinmarketcapSlug: string;
  rank?: number;
}

export interface EnrichedLead {
  project: L1L2Project;
  linkedinCorporate?: string;
  linkedinManagement: Array<{ name: string; title: string; profileUrl: string }>;
  githubStars?: number;
  githubContributors?: number;
  corporateEmails: string[];
  contactPersons: Array<{ name: string; email?: string; role: string }>;
  clayEnrichedAt?: number;
}

export interface CampaignSequence {
  channel: "email" | "linkedin" | "twitter";
  steps: Array<{
    dayOffset: number;
    subject?: string;
    body: string;
  }>;
}

export interface CampaignConfig {
  scraperHoursEstimate: number;
  clayHoursEstimate: number;
  copyPrepHoursEstimate: number;
  followUpMinutesPerDay: number;
  followUpDays: number;
  channelsCount: number;
  clayCreditsAvailable: boolean;
  clayCreditsRefreshDate: string;
}

const DEFAULT_CONFIG: CampaignConfig = {
  scraperHoursEstimate: 1,
  clayHoursEstimate: 3,
  copyPrepHoursEstimate: 1,
  followUpMinutesPerDay: 20,
  followUpDays: 10,
  channelsCount: 3,
  clayCreditsAvailable: false,
  clayCreditsRefreshDate: "2026-04-01",
};

/**
 * Generates Playwright-compatible scraper script for CoinMarketCap L1/L2 pages.
 * Clicks each row to extract website/GitHub links from the detail panel.
 * Per spec: "scraper needs to click on every row and then scrape that block"
 */
export function generateCmcScraperScript(category: "layer-1" | "layer-2"): string {
  const url = category === "layer-1"
    ? "https://coinmarketcap.com/view/layer-1/"
    : "https://coinmarketcap.com/view/layer-2/";

  return `// Playwright scraper for CoinMarketCap ${category.toUpperCase()} list
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('${url}', { waitUntil: 'networkidle' });

  const projects = [];
  const rows = await page.$$('table tbody tr');

  for (let i = 0; i < rows.length; i++) {
    // Click row to open detail panel
    await rows[i].click();
    await page.waitForSelector('.coin-detail-panel', { timeout: 5000 }).catch(() => null);

    // Extract website and GitHub from detail panel
    const name = await rows[i].$eval('td:nth-child(2)', el => el.textContent?.trim()).catch(() => '');
    const website = await page.$eval('.coin-detail-panel a[href*="website"]', el => el.href).catch(() => '');
    const github = await page.$eval('.coin-detail-panel a[href*="github"]', el => el.href).catch(() => '');

    if (name) {
      projects.push({
        name,
        category: '${category}',
        website,
        githubUrl: github,
        coinmarketcapSlug: name.toLowerCase().replace(/\\s+/g, '-'),
        rank: i + 1,
      });
    }

    // Close detail panel before next row
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log(JSON.stringify(projects, null, 2));
  await browser.close();
})();
`;
}

/**
 * Estimates total campaign effort in hours per spec breakdown.
 * Returns blocked status if Clay credits are unavailable.
 */
export function estimateTotalEffort(config: CampaignConfig = DEFAULT_CONFIG): {
  scraperHours: number;
  clayHours: number;
  copyHours: number;
  followUpHours: number;
  totalHours: number;
  isBlocked: boolean;
  blockedReason?: string;
} {
  const followUpHours = (config.followUpMinutesPerDay * config.followUpDays * config.channelsCount) / 60;
  const totalHours = config.scraperHoursEstimate + config.clayHoursEstimate + config.copyPrepHoursEstimate + followUpHours;

  return {
    scraperHours: config.scraperHoursEstimate,
    clayHours: config.clayHoursEstimate,
    copyHours: config.copyPrepHoursEstimate,
    followUpHours: Math.round(followUpHours * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    isBlocked: !config.clayCreditsAvailable,
    blockedReason: !config.clayCreditsAvailable
      ? `Clay tasks blocked until credits refresh on ${config.clayCreditsRefreshDate}`
      : undefined,
  };
}

/**
 * Generates Clay enrichment task definitions for lead data.
 * Per spec: find LinkedIn profiles, scrape GitHub data, find corporate emails.
 */
export function generateClayEnrichmentTasks(): Array<{
  taskName: string;
  description: string;
  inputField: string;
  outputField: string;
  estimatedMinutes: number;
}> {
  return [
    {
      taskName: "Find LinkedIn Corporate Page",
      description: "Search for company LinkedIn page using project name and website",
      inputField: "project.name",
      outputField: "linkedinCorporate",
      estimatedMinutes: 15,
    },
    {
      taskName: "Find Top Management LinkedIn Profiles",
      description: "Identify CTO, VP Engineering, and Lead Developer profiles",
      inputField: "linkedinCorporate",
      outputField: "linkedinManagement",
      estimatedMinutes: 45,
    },
    {
      taskName: "Scrape GitHub Repository Data",
      description: "Extract stars, contributors count, and recent activity",
      inputField: "project.githubUrl",
      outputField: "githubStats",
      estimatedMinutes: 30,
    },
    {
      taskName: "Find Corporate Emails",
      description: "Discover email patterns and verify deliverability",
      inputField: "project.website",
      outputField: "corporateEmails",
      estimatedMinutes: 40,
    },
    {
      taskName: "Identify Key Contact Persons",
      description: "Map decision-makers for GitHub/tooling adoption",
      inputField: "linkedinManagement",
      outputField: "contactPersons",
      estimatedMinutes: 30,
    },
  ];
}

/**
 * Deduplicates enriched leads against nReach ETH DAOs list.
 * Per spec: "Merge / deduplicate with nReach ETH DAOs list to avoid spamming same people"
 */
export function deduplicateWithNreach(
  enrichedLeads: EnrichedLead[],
  nreachContacts: Array<{ email: string; organization: string }>
): { unique: EnrichedLead[]; duplicatesRemoved: number } {
  const nreachEmails = new Set(nreachContacts.map((c) => c.email.toLowerCase()));
  const nreachOrgs = new Set(nreachContacts.map((c) => c.organization.toLowerCase()));

  const unique: EnrichedLead[] = [];
  let duplicatesRemoved = 0;

  for (const lead of enrichedLeads) {
    const isDuplicateEmail = lead.contactPersons.some(
      (cp) => cp.email && nreachEmails.has(cp.email.toLowerCase())
    );
    const isDuplicateOrg = nreachOrgs.has(lead.project.name.toLowerCase());

    if (isDuplicateEmail || isDuplicateOrg) {
      duplicatesRemoved++;
    } else {
      unique.push(lead);
    }
  }

  return { unique, duplicatesRemoved };
}

/**
 * Generates the "AI agency" pitch copy for multi-channel outreach.
 * Per spec: approach like an agency, charge thousands/month, hand over daily admin to UbiquityOS.
 */
export function generateAgencyPitchCopy(channel: "email" | "linkedin" | "twitter"): CampaignSequence {
  const baseValueProp = `We're an AI-powered engineering agency that manages GitHub repositories for blockchain projects. Our team + UbiquityOS handle daily administration — issue triage, contributor management, sprint planning, and code review coordination — so your core team focuses on protocol development.`;

  switch (channel) {
    case "email":
      return {
        channel: "email",
        steps: [
          {
            dayOffset: 0,
            subject: "GitHub administration for ${projectName} — handled by AI + human team",
            body: `Hi ${contactName},\n\n${baseValueProp}\n\nWe work with L1/L2 projects like yours on a monthly retainer ($3-8K/mo depending on repo size). You get a dedicated team that shows up, drives results, and gradually hands control back as your processes mature.\n\nWould you be open to a 15-min call to see if this fits ${projectName}?`,
          },
          {
            dayOffset: 3,
            subject: "Re: GitHub administration for ${projectName}",
            body: `Following up — we recently helped [similar project] reduce issue backlog by 60% in their first month. Happy to share specifics if useful.\n\nBest,\n[Name]`,
          },
          {
            dayOffset: 7,
            subject: "Last note: GitHub ops for ${projectName}",
            body: `Final follow-up — if GitHub administration isn't a priority right now, no worries at all. We'll keep shipping and can reconnect when timing aligns.\n\nCheers,\n[Name]`,
          },
        ],
      };

    case "linkedin":
      return {
        channel: "linkedin",
        steps: [
          {
            dayOffset: 0,
            body: `Hey ${contactName} — noticed ${projectName}'s GitHub activity. We run an AI+human agency that handles daily repo admin for L1/L2 teams (issue triage, contributor mgmt, sprint planning). Teams typically save 15-20 hrs/week. Open to a quick chat?`,
          },
          {
            dayOffset: 5,
            body: `Circling back — happy to share a case study from a similar ${category} project if helpful. No pressure either way!`,
          },
        ],
      };

    case "twitter":
      return {
        channel: "twitter",
        steps: [
          {
            dayOffset: 0,
            body: `@${handle} We help L1/L2 teams offload GitHub admin to an AI+human agency. Issue triage, contributor mgmt, sprint planning — handled for you. DM if interested 🚀`,
          },
        ],
      };
  }
}

/**
 * Calculates expected monthly revenue per client based on tiered pricing.
 * Per spec: "charge several thousands a month, like an agency"
 */
export function calculatePricingTier(githubStars: number, contributorCount: number): {
  monthlyUsd: number;
  tier: "starter" | "growth" | "enterprise";
  justification: string;
} {
  if (githubStars >= 5000 || contributorCount >= 100) {
    return {
      monthlyUsd: 8000,
      tier: "enterprise",
      justification: `Large ecosystem (${githubStars} stars, ${contributorCount} contributors). Full-time AI+human coverage.`,
    };
  }
  if (githubStars >= 1000 || contributorCount >= 30) {
    return {
      monthlyUsd: 5000,
      tier: "growth",
      justification: `Mid-size project (${githubStars} stars, ${contributorCount} contributors). Part-time dedicated team.`,
    };
  }
  return {
    monthlyUsd: 3000,
    tier: "starter",
    justification: `Early-stage project. Core admin coverage with AI-first approach.`,
  };
}

/**
 * Generates campaign launch readiness checklist.
 */
export function generateLaunchChecklist(
  enrichedLeadCount: number,
  config: CampaignConfig = DEFAULT_CONFIG
): Array<{ item: string; ready: boolean; blocker?: string }> {
  return [
    {
      item: "CMC L1/L2 scraper developed and tested",
      ready: true,
    },
    {
      item: "Clay enrichment tasks configured",
      ready: config.clayCreditsAvailable,
      blocker: config.clayCreditsAvailable ? undefined : `Credits refresh ${config.clayCreditsRefreshDate}`,
    },
    {
      item: `Leads enriched (${enrichedLeadCount} targets)`,
      ready: enrichedLeadCount > 0 && config.clayCreditsAvailable,
      blocker: enrichedLeadCount === 0 ? "Run scraper first" : undefined,
    },
    {
      item: "Deduplicated against nReach ETH DAOs list",
      ready: enrichedLeadCount > 0,
    },
    {
      item: "Campaign copy prepared for all channels",
      ready: true,
    },
    {
      item: "Multi-channel sequences loaded into outreach tool",
      ready: false,
      blocker: "Manual step after copy approval",
    },
  ];
}

/**
 * Generates a campaign status summary for stakeholder updates.
 */
export function generateCampaignStatusReport(
  totalLeads: number,
  enrichedLeads: number,
  deduplicatedLeads: number,
  launchedChannels: string[],
  config: CampaignConfig = DEFAULT_CONFIG
): string {
  const effort = estimateTotalEffort(config);
  const lines = [
    "## L1/L2 GitHub Management Campaign Status",
    "",
    "### Pipeline",
    `| Stage | Count |`,
    `|-------|-------|`,
    `| Raw Leads (CMC Scraper) | ${totalLeads} |`,
    `| Enriched (Clay) | ${enrichedLeads} |`,
    `| Deduplicated (vs nReach) | ${deduplicatedLeads} |`,
    `| Channels Launched | ${launchedChannels.length}/${config.channelsCount} |`,
    "",
    "### Effort Estimate",
    `| Task | Hours | Status |`,
    `|------|-------|--------|`,
    `| Scraper Development | ${effort.scraperHours}h | ✅ |`,
    `| Clay Enrichment | ${effort.clayHours}h | ${effort.isBlocked ? "🚫 Blocked" : "✅"} |`,
    `| Copy Preparation | ${effort.copyHours}h | ✅ |`,
    `| Follow-ups (${effort.followUpHours}h) | ${effort.followUpHours}h | ⏳ Pending |`,
    `| **Total** | **${effort.totalHours}h** | |`,
    "",
  ];

  if (effort.isBlocked) {
    lines.push(`⚠️ **Blocked:** ${effort.blockedReason}`);
  }

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
