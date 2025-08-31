export const TYPES = {
  // Repositories
  IssueRepository: Symbol.for("IssueRepository"),
  PullRequestRepository: Symbol.for("PullRequestRepository"),
  OrganizationRepository: Symbol.for("OrganizationRepository"),

  // Domain Services
  IssueAggregatorService: Symbol.for("IssueAggregatorService"),
  DuplicateDetectorService: Symbol.for("DuplicateDetectorService"),

  // Use Cases
  SyncPartnerIssuesUseCase: Symbol.for("SyncPartnerIssuesUseCase"),
  CalculateStatisticsUseCase: Symbol.for("CalculateStatisticsUseCase"),
  DetectDuplicatesUseCase: Symbol.for("DetectDuplicatesUseCase"),
  UpdateIssueLabelsUseCase: Symbol.for("UpdateIssueLabelsUseCase"),

  // Infrastructure
  GitHubClient: Symbol.for("GitHubClient"),
  TwitterClient: Symbol.for("TwitterClient"),
  Logger: Symbol.for("Logger"),
  ConfigManager: Symbol.for("ConfigManager"),
  Config: Symbol.for("Config"),
  GitStorageRepository: Symbol.for("GitStorageRepository"),

  // Application Services
  TwitterMappingService: Symbol.for("TwitterMappingService"),

};
