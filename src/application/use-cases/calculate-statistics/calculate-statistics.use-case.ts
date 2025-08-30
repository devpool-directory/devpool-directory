import { injectable, inject } from 'inversify';
import { TYPES } from '../../../shared/types';
import { IssueRepository } from '../../../domain/repositories/issue-repository.interface';
import { PullRequestRepository } from '../../../domain/repositories/pull-request-repository.interface';
import { Statistics } from '../../../domain/entities/statistics';
import { Logger } from '../../../shared/logger';
import { GitStorageRepository } from '../../../infrastructure/storage/git-storage.repository';

export interface CalculateStatisticsInput {
  owner: string;
  repo: string;
  partnerRepos?: string[];
}

export interface CalculateStatisticsOutput {
  statistics: Statistics;
  savedToStorage: boolean;
}

@injectable()
export class CalculateStatisticsUseCase {
  constructor(
    @inject(TYPES.IssueRepository) private issueRepository: IssueRepository,
    @inject(TYPES.PullRequestRepository) private pullRequestRepository: PullRequestRepository,
    @inject(TYPES.GitStorageRepository) private storage: GitStorageRepository,
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  async execute(input: CalculateStatisticsInput): Promise<CalculateStatisticsOutput> {
    this.logger.info('Calculating statistics', { owner: input.owner, repo: input.repo });

    try {
      // Fetch all issues from the directory repository
      const issues = await this.issueRepository.findAll(input.owner, input.repo, {
        state: 'all',
        perPage: 100
      });

      // Fetch all pull requests
      const pullRequests = await this.pullRequestRepository.findAll(input.owner, input.repo, {
        state: 'all',
        perPage: 100
      });

      // Calculate statistics
      const statistics = new Statistics({
        timestamp: new Date(),
        issues: {
          total: issues.length,
          open: issues.filter(i => i.state === 'open').length,
          closed: issues.filter(i => i.state === 'closed').length,
          labeled: issues.filter(i => i.labels.length > 0).length,
          assigned: issues.filter(i => i.assignees.length > 0).length,
          priced: issues.filter(i => this.hasPriceLabel(i.labels)).length
        },
        pullRequests: {
          total: pullRequests.length,
          open: pullRequests.filter(pr => pr.state === 'open').length,
          closed: pullRequests.filter(pr => pr.state === 'closed').length,
          merged: pullRequests.filter(pr => pr.merged).length,
          draft: pullRequests.filter(pr => pr.draft).length
        },
        rewards: this.calculateRewards(issues),
        contributors: this.getUniqueContributors(issues, pullRequests),
        partnerRepositories: input.partnerRepos?.length || 0,
        lastUpdated: new Date()
      });

      // Save statistics to storage
      let savedToStorage = false;
      try {
        await this.storage.write('devpool-statistics.json', statistics.toJSON());
        savedToStorage = true;
        this.logger.info('Statistics saved to storage');
      } catch (error) {
        this.logger.error('Failed to save statistics to storage', error);
      }

      return {
        statistics,
        savedToStorage
      };
    } catch (error) {
      this.logger.error('Failed to calculate statistics', error);
      throw error;
    }
  }

  private hasPriceLabel(labels: any[]): boolean {
    return labels.some(label => 
      typeof label === 'object' && label.name && 
      label.name.toLowerCase().includes('price:')
    );
  }

  private calculateRewards(issues: any[]): {
    total: number;
    paid: number;
    pending: number;
    byTier: Record<string, number>;
  } {
    const rewards = {
      total: 0,
      paid: 0,
      pending: 0,
      byTier: {} as Record<string, number>
    };

    for (const issue of issues) {
      const priceLabel = issue.labels.find((label: any) => 
        label.name && label.name.toLowerCase().includes('price:')
      );

      if (priceLabel) {
        const priceMatch = priceLabel.name.match(/price:\s*(\d+)/i);
        if (priceMatch) {
          const price = parseInt(priceMatch[1], 10);
          rewards.total += price;

          if (issue.state === 'closed') {
            rewards.paid += price;
          } else {
            rewards.pending += price;
          }

          // Categorize by tier
          const tier = this.getPriceTier(price);
          rewards.byTier[tier] = (rewards.byTier[tier] || 0) + 1;
        }
      }
    }

    return rewards;
  }

  private getPriceTier(price: number): string {
    if (price <= 25) return 'micro';
    if (price <= 100) return 'small';
    if (price <= 500) return 'medium';
    if (price <= 1000) return 'large';
    return 'xlarge';
  }

  private getUniqueContributors(issues: any[], pullRequests: any[]): {
    total: number;
    active: number;
    new: number;
  } {
    const allContributors = new Set<string>();
    const activeContributors = new Set<string>();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Add issue creators and assignees
    for (const issue of issues) {
      if (issue.user?.login) {
        allContributors.add(issue.user.login);
        
        if (new Date(issue.createdAt) > oneMonthAgo) {
          activeContributors.add(issue.user.login);
        }
      }

      for (const assignee of issue.assignees || []) {
        if (assignee.login) {
          allContributors.add(assignee.login);
          activeContributors.add(assignee.login);
        }
      }
    }

    // Add PR authors
    for (const pr of pullRequests) {
      if (pr.user?.login) {
        allContributors.add(pr.user.login);
        
        if (new Date(pr.createdAt) > oneMonthAgo) {
          activeContributors.add(pr.user.login);
        }
      }
    }

    return {
      total: allContributors.size,
      active: activeContributors.size,
      new: activeContributors.size // Simplified for now
    };
  }
}