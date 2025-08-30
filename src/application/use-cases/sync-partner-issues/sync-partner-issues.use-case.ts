import { injectable, inject } from 'inversify';
import { TYPES } from '../../../shared/types';
import { IssueRepository } from '../../../domain/repositories/issue-repository.interface';
import { OrganizationRepository } from '../../../domain/repositories/organization-repository.interface';
import { IssueAggregatorService } from '../../../domain/services/issue-aggregator.service';
import { DuplicateDetectorService } from '../../../domain/services/duplicate-detector.service';
import { 
  SyncPartnerIssuesRequest, 
  SyncPartnerIssuesResponse,
  SyncedIssue,
  SyncError 
} from './sync-partner-issues.dto';
import { Issue } from '../../../domain/entities/issue';
import { Logger } from '../../../shared/logger';

@injectable()
export class SyncPartnerIssuesUseCase {
  constructor(
    @inject(TYPES.IssueRepository) private readonly issueRepository: IssueRepository,
    @inject(TYPES.OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @inject(TYPES.IssueAggregatorService) private readonly issueAggregator: IssueAggregatorService,
    @inject(TYPES.DuplicateDetectorService) private readonly duplicateDetector: DuplicateDetectorService,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  async execute(request: SyncPartnerIssuesRequest): Promise<SyncPartnerIssuesResponse> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    const syncedIssues: SyncedIssue[] = [];
    let issuesCreated = 0;
    let issuesUpdated = 0;
    let issuesSkipped = 0;

    try {
      this.logger.info('Starting partner issues sync', {
        organizations: request.partnerOrganizations,
        repositories: request.partnerRepositories,
        target: `${request.targetOwner}/${request.targetRepo}`,
        dryRun: request.dryRun
      });

      const partnerIssues = await this.fetchPartnerIssues(request);
      
      this.logger.info(`Fetched ${partnerIssues.length} partner issues`);

      const existingIssues = await this.issueRepository.findAll(
        request.targetOwner,
        request.targetRepo,
        { state: { value: 'all' } as any }
      );

      for (const issue of partnerIssues) {
        try {
          const syncResult = await this.syncIssue(
            issue,
            existingIssues,
            request
          );

          syncedIssues.push(syncResult);

          switch (syncResult.action) {
            case 'created':
              issuesCreated++;
              break;
            case 'updated':
              issuesUpdated++;
              break;
            case 'skipped':
              issuesSkipped++;
              break;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          errors.push({
            issueId: issue.id,
            issueTitle: issue.title,
            error: errorMessage,
            timestamp: new Date()
          });

          this.logger.error('Failed to sync issue', {
            issue: issue.getFullIdentifier(),
            error: errorMessage
          });
        }
      }

      const duration = Date.now() - startTime;

      this.logger.info('Partner issues sync completed', {
        issuesSynced: syncedIssues.length,
        issuesCreated,
        issuesUpdated,
        issuesSkipped,
        errors: errors.length,
        duration
      });

      return {
        success: errors.length === 0,
        issuesSynced: syncedIssues.length,
        issuesCreated,
        issuesUpdated,
        issuesSkipped,
        errors,
        syncedIssues,
        duration
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Partner issues sync failed', { error: errorMessage });

      return {
        success: false,
        issuesSynced: 0,
        issuesCreated,
        issuesUpdated,
        issuesSkipped,
        errors: [{
          issueId: 'N/A',
          issueTitle: 'Sync operation',
          error: errorMessage,
          timestamp: new Date()
        }],
        syncedIssues,
        duration: Date.now() - startTime
      };
    }
  }

  private async fetchPartnerIssues(
    request: SyncPartnerIssuesRequest
  ): Promise<Issue[]> {
    const aggregationOptions = {
      includeClosedIssues: request.includeClosedIssues,
      sortBy: 'created' as const
    };

    let result;

    if (request.partnerRepositories && request.partnerRepositories.length > 0) {
      result = await this.issueAggregator.aggregateFromRepositories(
        request.partnerRepositories,
        aggregationOptions
      );
    } else {
      result = await this.issueAggregator.aggregateFromOrganizations(
        request.partnerOrganizations,
        aggregationOptions
      );
    }

    return result.issues;
  }

  private async syncIssue(
    issue: Issue,
    existingIssues: Issue[],
    request: SyncPartnerIssuesRequest
  ): Promise<SyncedIssue> {
    const duplicates = this.duplicateDetector.detectDuplicates(
      issue,
      existingIssues,
      { threshold: 0.9 }
    );

    if (duplicates.length > 0) {
      const existingIssue = duplicates[0].issue;
      
      if (this.shouldUpdateIssue(issue, existingIssue)) {
        if (!request.dryRun) {
          await this.updateTargetIssue(
            request.targetOwner,
            request.targetRepo,
            existingIssue.number,
            issue,
            request.syncLabels
          );
        }

        return {
          originalIssue: issue,
          syncedIssueNumber: existingIssue.number,
          action: 'updated',
          reason: 'Issue updated with latest information'
        };
      }

      return {
        originalIssue: issue,
        syncedIssueNumber: existingIssue.number,
        action: 'skipped',
        reason: 'Issue already up to date'
      };
    }

    if (request.dryRun) {
      return {
        originalIssue: issue,
        action: 'skipped',
        reason: 'Dry run mode - issue would be created'
      };
    }

    const createdIssue = await this.createTargetIssue(
      request.targetOwner,
      request.targetRepo,
      issue,
      request.syncLabels
    );

    return {
      originalIssue: issue,
      syncedIssueNumber: createdIssue.number,
      action: 'created',
      reason: 'New issue created'
    };
  }

  private shouldUpdateIssue(newIssue: Issue, existingIssue: Issue): boolean {
    return newIssue.updatedAt > existingIssue.updatedAt ||
           newIssue.state.value !== existingIssue.state.value ||
           newIssue.price.value !== existingIssue.price.value;
  }

  private async createTargetIssue(
    owner: string,
    repo: string,
    sourceIssue: Issue,
    syncLabels?: boolean
  ): Promise<Issue> {
    const issueData = {
      title: this.formatTitle(sourceIssue),
      body: this.formatBody(sourceIssue),
      labels: syncLabels ? sourceIssue.labels : [],
      state: sourceIssue.state,
      price: sourceIssue.price
    };

    return await this.issueRepository.create(owner, repo, issueData);
  }

  private async updateTargetIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    sourceIssue: Issue,
    syncLabels?: boolean
  ): Promise<Issue> {
    const updates = {
      title: this.formatTitle(sourceIssue),
      body: this.formatBody(sourceIssue),
      state: sourceIssue.state,
      price: sourceIssue.price
    };

    const updatedIssue = await this.issueRepository.update(
      owner,
      repo,
      issueNumber,
      updates
    );

    if (syncLabels) {
      await this.issueRepository.setLabels(
        owner,
        repo,
        issueNumber,
        sourceIssue.labels
      );
    }

    return updatedIssue;
  }

  private formatTitle(issue: Issue): string {
    return `[${issue.organizationName}/${issue.repositoryName}] ${issue.title}`;
  }

  private formatBody(issue: Issue): string {
    const header = `> **Original Issue:** ${issue.htmlUrl}\n` +
                  `> **Organization:** ${issue.organizationName}\n` +
                  `> **Repository:** ${issue.repositoryName}\n` +
                  `> **Issue Number:** #${issue.number}\n` +
                  `> **Created:** ${issue.createdAt.toISOString()}\n` +
                  `> **Updated:** ${issue.updatedAt.toISOString()}\n`;

    const price = issue.price.value > 0 
      ? `\n**Price:** ${issue.price.formatted}\n`
      : '';

    const separator = '\n---\n\n';

    return header + price + separator + (issue.body || 'No description provided.');
  }
}