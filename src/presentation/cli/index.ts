#!/usr/bin/env node
import "reflect-metadata";
import { Command } from "commander";
import { container, TYPES } from "../../shared/container/container";
import { SyncPartnerIssuesUseCase } from "../../application/use-cases/sync-partner-issues/sync-partner-issues.use-case";
import { CalculateStatisticsUseCase } from "../../application/use-cases/calculate-statistics/calculate-statistics.use-case";
import { DetectDuplicatesUseCase } from "../../application/use-cases/detect-duplicates/detect-duplicates.use-case";
import { Logger } from "../../shared/logger";
import * as fs from "fs";
import * as path from "path";

const program = new Command();
const logger = container.get<Logger>(TYPES.Logger);

// Load configuration
const config = container.get<any>(TYPES.Config);

program.name("devpool-directory").description("DevPool Directory - GitHub Issue Aggregator").version("2.0.0");

program
  .command("sync")
  .description("Sync partner issues to the central repository")
  .option("-o, --organizations <orgs...>", "Partner organizations to sync")
  .option("-r, --repos <repos...>", "Specific repositories to sync")
  .option("--dry-run", "Run without making changes")
  .option("--include-closed", "Include closed issues")
  .action(async (options) => {
    try {
      logger.info("Starting sync operation", options);

      const syncUseCase = container.get<SyncPartnerIssuesUseCase>(TYPES.SyncPartnerIssuesUseCase);

      // Get partner repositories from configuration or options
      let partnerRepos: string[] = [];

      if (options.repos) {
        partnerRepos = options.repos;
      } else if (options.organizations) {
        // TODO: Fetch all repos from organizations
        logger.warn("Organization-based sync not yet implemented");
        partnerRepos = [];
      } else {
        // Load from projects.json
        const projectsPath = path.join(process.cwd(), "projects.json");
        if (fs.existsSync(projectsPath)) {
          const projects = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));
          partnerRepos = projects.urls || [];
        }
      }

      if (partnerRepos.length === 0) {
        logger.warn("No partner repositories found to sync");
        return;
      }

      // Sync each partner repository
      for (const repoUrl of partnerRepos) {
        try {
          const [owner, repo] = extractOwnerRepo(repoUrl);

          const result = await syncUseCase.execute({
            sourceOwner: owner,
            sourceRepo: repo,
            targetOwner: config.github.owner,
            targetRepo: config.github.repo,
            includeClosed: options.includeClosed || false,
            dryRun: options.dryRun || false,
          });

          logger.info(`Synced ${result.syncedIssues} issues from ${owner}/${repo}`, {
            created: result.createdIssues,
            updated: result.updatedIssues,
            skipped: result.skippedIssues,
          });
        } catch (error) {
          logger.error(`Failed to sync ${repoUrl}`, error);
        }
      }

      logger.info("Sync completed successfully");
    } catch (error) {
      logger.error("Sync failed", error);
      process.exit(1);
    }
  });

program
  .command("deduplicate")
  .description("Detect and handle duplicate issues")
  .option("--threshold <number>", "Similarity threshold (0-1)", "0.9")
  .option("--dry-run", "Run without making changes")
  .action(async (options) => {
    try {
      logger.info("Starting deduplication", options);

      const deduplicateUseCase = container.get<DetectDuplicatesUseCase>(TYPES.DetectDuplicatesUseCase);

      const result = await deduplicateUseCase.execute({
        owner: config.github.owner,
        repo: config.github.repo,
        threshold: parseFloat(options.threshold),
        dryRun: options.dryRun || false,
      });

      logger.info("Deduplication completed", {
        duplicateGroups: result.duplicateGroups.length,
        totalDuplicates: result.totalDuplicates,
        processedIssues: result.processedIssues,
        closedDuplicates: result.closedDuplicates,
      });

      if (options.dryRun) {
        console.log("\nDuplicate Groups Found:");
        for (const group of result.duplicateGroups) {
          console.log(`\nOriginal: #${group.originalIssue.number} - ${group.originalIssue.title}`);
          console.log("Duplicates:");
          for (const dup of group.duplicates) {
            console.log(`  - #${dup.issue.number} - ${dup.issue.title} (similarity: ${dup.similarity.toFixed(2)})`);
          }
        }
      }
    } catch (error) {
      logger.error("Deduplication failed", error);
      process.exit(1);
    }
  });

program
  .command("statistics")
  .description("Generate statistics report")
  .option("-f, --format <format>", "Output format (json|markdown)", "json")
  .option("-o, --output <file>", "Output file path")
  .action(async (options) => {
    try {
      logger.info("Generating statistics", options);

      const statisticsUseCase = container.get<CalculateStatisticsUseCase>(TYPES.CalculateStatisticsUseCase);

      const result = await statisticsUseCase.execute({
        owner: config.github.owner,
        repo: config.github.repo,
      });

      let output: string;

      if (options.format === "markdown") {
        output = generateMarkdownReport(result.statistics);
      } else {
        output = JSON.stringify(result.statistics.toJSON(), null, 2);
      }

      if (options.output) {
        fs.writeFileSync(options.output, output);
        logger.info(`Statistics written to ${options.output}`);
      } else {
        console.log(output);
      }

      logger.info("Statistics generated successfully");
    } catch (error) {
      logger.error("Statistics generation failed", error);
      process.exit(1);
    }
  });

// Main sync command (runs full synchronization like the original)
program
  .command("run")
  .description("Run full synchronization process")
  .action(async () => {
    try {
      logger.info("Starting full synchronization process");

      // Run full synchronization
      await runFullSync();

      logger.info("Full synchronization completed");
    } catch (error) {
      logger.error("Full synchronization failed", error);
      process.exit(1);
    }
  });

// Helper functions
function extractOwnerRepo(url: string): [string, string] {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return [match[1], match[2].replace(".git", "")];
  }
  throw new Error(`Invalid GitHub URL: ${url}`);
}

function generateMarkdownReport(statistics: any): string {
  const stats = statistics.toJSON ? statistics.toJSON() : statistics;

  return `# DevPool Directory Statistics

Generated: ${new Date(stats.lastUpdated).toLocaleString()}

## Issues
- **Total**: ${stats.issues.total}
- **Open**: ${stats.issues.open}
- **Closed**: ${stats.issues.closed}
- **Labeled**: ${stats.issues.labeled}
- **Assigned**: ${stats.issues.assigned}
- **Priced**: ${stats.issues.priced}

## Pull Requests
- **Total**: ${stats.pullRequests.total}
- **Open**: ${stats.pullRequests.open}
- **Closed**: ${stats.pullRequests.closed}
- **Merged**: ${stats.pullRequests.merged}
- **Draft**: ${stats.pullRequests.draft}

## Rewards
- **Total Value**: $${stats.rewards.total}
- **Paid**: $${stats.rewards.paid}
- **Pending**: $${stats.rewards.pending}

### By Tier
${Object.entries(stats.rewards.byTier)
  .map(([tier, count]) => `- **${tier}**: ${count}`)
  .join("\n")}

## Contributors
- **Total**: ${stats.contributors.total}
- **Active**: ${stats.contributors.active}
- **New**: ${stats.contributors.new}

## Partner Repositories
- **Count**: ${stats.partnerRepositories}
`;
}

async function runFullSync(): Promise<void> {
  const syncUseCase = container.get<SyncPartnerIssuesUseCase>(TYPES.SyncPartnerIssuesUseCase);
  const statisticsUseCase = container.get<CalculateStatisticsUseCase>(TYPES.CalculateStatisticsUseCase);
  const twitterMappingService = container.get<any>(TYPES.TwitterMappingService);

  // Initialize Twitter mapping
  if (twitterMappingService) {
    await twitterMappingService.initialize();
  }

  // Load partner repositories
  const projectsPath = path.join(process.cwd(), "projects.json");
  let partnerRepos: string[] = [];

  if (fs.existsSync(projectsPath)) {
    const projects = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));
    partnerRepos = projects.urls || [];
  }

  // Sync each partner repository
  for (const repoUrl of partnerRepos) {
    try {
      const [owner, repo] = extractOwnerRepo(repoUrl);

      await syncUseCase.execute({
        sourceOwner: owner,
        sourceRepo: repo,
        targetOwner: config.github.owner,
        targetRepo: config.github.repo,
        includeClosed: false,
        dryRun: false,
      });

      logger.info(`Synced repository ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Failed to sync ${repoUrl}`, error);
    }
  }

  // Calculate and save statistics
  await statisticsUseCase.execute({
    owner: config.github.owner,
    repo: config.github.repo,
    partnerRepos,
  });

  logger.info("Full synchronization completed");
}

program.parse(process.argv);
