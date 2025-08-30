export const TYPES = {
  // Repositories
  IssueRepository: Symbol.for('IssueRepository'),
  PullRequestRepository: Symbol.for('PullRequestRepository'),
  OrganizationRepository: Symbol.for('OrganizationRepository'),
  
  // Domain Services
  IssueAggregatorService: Symbol.for('IssueAggregatorService'),
  DuplicateDetectorService: Symbol.for('DuplicateDetectorService'),
  PriceCalculatorService: Symbol.for('PriceCalculatorService'),
  
  // Use Cases
  SyncPartnerIssuesUseCase: Symbol.for('SyncPartnerIssuesUseCase'),
  CalculateStatisticsUseCase: Symbol.for('CalculateStatisticsUseCase'),
  DetectDuplicatesUseCase: Symbol.for('DetectDuplicatesUseCase'),
  UpdateIssueLabelsUseCase: Symbol.for('UpdateIssueLabelsUseCase'),
  
  // Infrastructure
  GitHubClient: Symbol.for('GitHubClient'),
  TwitterClient: Symbol.for('TwitterClient'),
  Logger: Symbol.for('Logger'),
  ConfigManager: Symbol.for('ConfigManager'),
  Config: Symbol.for('Config'),
  GitStorageRepository: Symbol.for('GitStorageRepository'),
  
  // Application Services
  OrchestrationService: Symbol.for('OrchestrationService'),
  WorkflowService: Symbol.for('WorkflowService'),
  NotificationService: Symbol.for('NotificationService'),
  TwitterMappingService: Symbol.for('TwitterMappingService'),
  
  // Storage
  StorageService: Symbol.for('StorageService'),
  CacheService: Symbol.for('CacheService')
};