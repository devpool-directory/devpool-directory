import { Container } from "inversify";
import { TYPES } from "./types";

// Infrastructure
import { GitHubClient } from "../../infrastructure/github/github-client";
import { GitHubIssueRepository } from "../../infrastructure/github/repositories/github-issue.repository";
import { GitHubPullRequestRepository } from "../../infrastructure/github/repositories/github-pull-request.repository";
import { GitHubOrganizationRepository } from "../../infrastructure/github/repositories/github-organization.repository";
import { WinstonLogger } from "../../infrastructure/logging/winston.logger";
import { EnvironmentConfig } from "../../infrastructure/config/environment.config";
import { TwitterClient } from "../../infrastructure/twitter/twitter-client";
import { GitStorageRepository } from "../../infrastructure/storage/git-storage.repository";

// Domain Services
import { IssueAggregatorService } from "../../domain/services/issue-aggregator.service";
import { DuplicateDetectorService } from "../../domain/services/duplicate-detector.service";

// Application Services
import { TwitterMappingService } from "../../application/services/twitter-mapping.service";

// Use Cases
import { SyncPartnerIssuesUseCase } from "../../application/use-cases/sync-partner-issues/sync-partner-issues.use-case";
import { CalculateStatisticsUseCase } from "../../application/use-cases/calculate-statistics/calculate-statistics.use-case";
import { DetectDuplicatesUseCase } from "../../application/use-cases/detect-duplicates/detect-duplicates.use-case";
import { UpdateIssueLabelsUseCase } from "../../application/use-cases/update-issue-labels/update-issue-labels.use-case";

// Repository Interfaces
import { IssueRepository } from "../../domain/repositories/issue-repository.interface";
import { PullRequestRepository } from "../../domain/repositories/pull-request-repository.interface";
import { OrganizationRepository } from "../../domain/repositories/organization-repository.interface";

// Logger Interface
import { Logger } from "../../shared/logger";

export function bindDependencies(container: Container): void {
  // Config
  const config = new EnvironmentConfig();
  container.bind(TYPES.Config).toConstantValue(config.get());
  container.bind(TYPES.ConfigManager).toConstantValue(config);

  // Logger
  const logger = new WinstonLogger(config.getLoggingConfig());
  container.bind<Logger>(TYPES.Logger).toConstantValue(logger);

  // GitHub Client
  container.bind(TYPES.GitHubClient).to(GitHubClient).inSingletonScope();

  // Twitter Client
  container.bind(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();

  // Storage
  container.bind(TYPES.GitStorageRepository).to(GitStorageRepository).inSingletonScope();

  // Repositories
  container.bind<IssueRepository>(TYPES.IssueRepository).to(GitHubIssueRepository).inSingletonScope();
  container.bind<PullRequestRepository>(TYPES.PullRequestRepository).to(GitHubPullRequestRepository).inSingletonScope();
  container.bind<OrganizationRepository>(TYPES.OrganizationRepository).to(GitHubOrganizationRepository).inSingletonScope();

  // Domain Services
  container.bind(TYPES.IssueAggregatorService).to(IssueAggregatorService).inSingletonScope();
  container.bind(TYPES.DuplicateDetectorService).to(DuplicateDetectorService).inSingletonScope();

  // Application Services
  container.bind(TYPES.TwitterMappingService).to(TwitterMappingService).inSingletonScope();

  // Use Cases
  container.bind(TYPES.SyncPartnerIssuesUseCase).to(SyncPartnerIssuesUseCase).inSingletonScope();
  container.bind(TYPES.CalculateStatisticsUseCase).to(CalculateStatisticsUseCase).inSingletonScope();
  container.bind(TYPES.DetectDuplicatesUseCase).to(DetectDuplicatesUseCase).inSingletonScope();
  container.bind(TYPES.UpdateIssueLabelsUseCase).to(UpdateIssueLabelsUseCase).inSingletonScope();
}
