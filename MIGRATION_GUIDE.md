# DevPool Directory - Migration Guide

## Overview
This guide helps migrate from the old monolithic structure to the new clean architecture implementation.

## Current Migration Status

### ✅ Completed
- **Infrastructure Layer**: GitHub client, logging, configuration, error handling
- **Domain Layer**: Entities (Issue, PullRequest, Organization, Repository, Statistics), Value Objects, Services
- **Repository Implementations**: IssueRepository, PullRequestRepository, OrganizationRepository
- **Storage**: Git-based storage repository for persistence
- **Twitter Integration**: TwitterClient and TwitterMappingService
- **Use Cases**: SyncPartnerIssues, CalculateStatistics, DetectDuplicates, UpdateIssueLabels
- **CLI Commands**: Full command-line interface with sync, deduplicate, statistics commands
- **Dependency Injection**: Complete container setup with Inversify
- **Package Scripts**: Updated for new architecture

### 🚧 Pending
- Full migration of existing directory functionality
- Integration testing setup
- GitHub workflows verification

## Architecture Changes

### Old Structure
```
src/
├── directory/        # Mixed business logic and infrastructure
├── twitter/         # Twitter integration
├── fixtures/        # Test data  
├── utils/          # Utilities
└── main.ts         # Monolithic orchestration
```

### New Structure
```
src/
├── domain/          # Pure business logic
│   ├── entities/    # Business entities
│   ├── repositories/# Repository interfaces
│   ├── services/    # Domain services
│   └── value-objects/# Value objects
├── application/     # Application logic
│   ├── use-cases/   # Business use cases
│   └── services/    # Application services
├── infrastructure/  # External integrations
│   ├── github/      # GitHub API
│   ├── twitter/     # Twitter API
│   ├── storage/     # Git storage
│   ├── config/      # Configuration
│   └── logging/     # Logging
├── presentation/    # User interfaces
│   └── cli/         # Command-line interface
└── shared/         # Cross-cutting concerns
    ├── container/   # DI container
    └── errors/      # Error handling
```

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Run Commands

#### New Architecture Commands
```bash
# Full synchronization (equivalent to old index.ts)
bun start

# Sync specific repositories
bun run sync

# Generate statistics
bun run statistics

# Detect duplicates
bun run deduplicate

# Dry run deduplication
bun run deduplicate:dry
```

#### Legacy Commands (still available)
```bash
# Old synchronization
bun run legacy:sync

# Old deduplication
bun run legacy:deduplicate
```

### 3. Environment Configuration
Your existing `.env` file should work as-is. The new architecture maintains backward compatibility with existing environment variables:

```env
# GitHub Configuration
GITHUB_TOKEN=your_token
DEVPOOL_GITHUB_API_TOKEN=fallback_token
GITHUB_OWNER=your_org
GITHUB_REPOSITORY_NAME=your_repo

# Twitter Configuration (optional)
TWITTER_API_KEY=your_key
TWITTER_API_KEY_SECRET=your_secret
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_TOKEN_SECRET=your_secret

# Logging
LOG_LEVEL=info
```

## Migration Steps for Custom Code

### 1. Using the New Dependency Injection Container

Old approach:
```typescript
import { octokit } from './directory/directory';
const issues = await octokit.issues.listForRepo({...});
```

New approach:
```typescript
import { container, TYPES } from './shared/container/container';
import { IssueRepository } from './domain/repositories/issue-repository.interface';

const issueRepo = container.get<IssueRepository>(TYPES.IssueRepository);
const issues = await issueRepo.findAll(owner, repo);
```

### 2. Using Use Cases Instead of Direct Functions

Old approach:
```typescript
import { syncPartnerRepoIssues } from './directory/sync-partner-repo-issues';
await syncPartnerRepoIssues(repoUrl);
```

New approach:
```typescript
import { container, TYPES } from './shared/container/container';
import { SyncPartnerIssuesUseCase } from './application/use-cases/sync-partner-issues/sync-partner-issues.use-case';

const syncUseCase = container.get<SyncPartnerIssuesUseCase>(TYPES.SyncPartnerIssuesUseCase);
await syncUseCase.execute({
  sourceOwner: 'partner-org',
  sourceRepo: 'partner-repo',
  targetOwner: 'devpool',
  targetRepo: 'directory'
});
```

### 3. Error Handling

Old approach:
```typescript
try {
  // operation
} catch (error) {
  console.error(error);
}
```

New approach:
```typescript
import { container, TYPES } from './shared/container/container';
import { Logger } from './shared/logger';

const logger = container.get<Logger>(TYPES.Logger);

try {
  // operation
} catch (error) {
  logger.error('Operation failed', { error, context: {...} });
}
```

## Testing

### Unit Tests
```bash
bun test:unit
```

### Integration Tests
```bash
bun test:integration
```

### All Tests
```bash
bun test
```

## Key Improvements

1. **Separation of Concerns**: Business logic is isolated from infrastructure
2. **Dependency Injection**: Easy testing and mocking
3. **Type Safety**: Stronger TypeScript typing with Zod validation
4. **Error Handling**: Structured error classes and logging
5. **Testability**: Repository pattern enables easy mocking
6. **Scalability**: Modular architecture supports growth
7. **Maintainability**: Clear boundaries between layers

## Breaking Changes

### API Changes
- Direct GitHub Octokit access is encapsulated
- Functions are replaced with use cases
- Configuration uses Zod validation

### Behavioral Changes
- Logging uses Winston instead of console
- Errors are structured classes
- Twitter integration is optional and fails gracefully

## Backward Compatibility

The system maintains backward compatibility by:
- Supporting existing environment variables
- Providing legacy command aliases
- Reading existing `projects.json` format
- Using the same git storage branch (`__STORAGE__`)

## Troubleshooting

### Issue: Commands not found
Solution: Use `bun run` prefix for all commands

### Issue: Dependency injection errors
Solution: Ensure `reflect-metadata` is imported and TypeScript decorators are enabled

### Issue: Storage branch not found
Solution: The system will automatically create the `__STORAGE__` branch on first run

### Issue: Twitter integration fails
Solution: Twitter is optional - the system continues without it if credentials are missing

## Next Steps

1. Gradually migrate custom scripts to use the new architecture
2. Add integration tests for critical paths
3. Consider implementing additional use cases as needed
4. Monitor performance and optimize as necessary

## Support

For questions or issues with the migration:
1. Check existing tests for usage examples
2. Review the use case implementations
3. Consult the domain models for business logic

The new architecture is designed to be more maintainable and extensible while preserving all existing functionality.