import { injectable, inject } from 'inversify';
import { Issue } from '../entities/issue';
import { Repository } from '../entities/repository';
import { IssueRepository, IssueFilter } from '../repositories/issue-repository.interface';
import { OrganizationRepository } from '../repositories/organization-repository.interface';
import { TYPES } from '../../shared/types';

export interface AggregationOptions {
  includeClosedIssues?: boolean;
  includePullRequests?: boolean;
  filterByLabels?: string[];
  filterByPrice?: { min?: number; max?: number };
  sortBy?: 'created' | 'updated' | 'price' | 'comments';
  limit?: number;
}

export interface AggregationResult {
  issues: Issue[];
  totalCount: number;
  repositories: string[];
  organizations: string[];
  totalValue: number;
  timestamp: Date;
}

@injectable()
export class IssueAggregatorService {
  constructor(
    @inject(TYPES.IssueRepository) private readonly issueRepository: IssueRepository,
    @inject(TYPES.OrganizationRepository) private readonly organizationRepository: OrganizationRepository
  ) {}

  async aggregateFromOrganizations(
    organizations: string[],
    options: AggregationOptions = {}
  ): Promise<AggregationResult> {
    const allIssues: Issue[] = [];
    const repositorySet = new Set<string>();
    const organizationSet = new Set<string>();

    for (const org of organizations) {
      try {
        const repos = await this.organizationRepository.findRepositories(org, {
          type: 'public',
          sort: 'updated',
          direction: 'desc'
        });

        for (const repo of repos) {
          if (!repo.isActive() || !repo.hasOpenIssues()) {
            continue;
          }

          const filter: IssueFilter = {
            state: options.includeClosedIssues ? undefined : { value: 'open' } as any,
            labels: options.filterByLabels,
            sort: options.sortBy || 'created',
            direction: 'desc'
          };

          const issues = await this.issueRepository.findAll(
            repo.owner,
            repo.name,
            filter
          );

          const filteredIssues = this.filterIssues(issues, options);
          
          allIssues.push(...filteredIssues);
          
          if (filteredIssues.length > 0) {
            repositorySet.add(repo.fullName);
            organizationSet.add(org);
          }
        }
      } catch (error) {
        console.error(`Failed to aggregate issues from organization ${org}:`, error);
      }
    }

    const sortedIssues = this.sortIssues(allIssues, options.sortBy);
    const limitedIssues = options.limit 
      ? sortedIssues.slice(0, options.limit)
      : sortedIssues;

    const totalValue = this.calculateTotalValue(limitedIssues);

    return {
      issues: limitedIssues,
      totalCount: limitedIssues.length,
      repositories: Array.from(repositorySet),
      organizations: Array.from(organizationSet),
      totalValue,
      timestamp: new Date()
    };
  }

  async aggregateFromRepositories(
    repositories: Array<{ owner: string; name: string }>,
    options: AggregationOptions = {}
  ): Promise<AggregationResult> {
    const allIssues: Issue[] = [];
    const repositorySet = new Set<string>();
    const organizationSet = new Set<string>();

    for (const repo of repositories) {
      try {
        const filter: IssueFilter = {
          state: options.includeClosedIssues ? undefined : { value: 'open' } as any,
          labels: options.filterByLabels,
          sort: options.sortBy || 'created',
          direction: 'desc'
        };

        const issues = await this.issueRepository.findAll(
          repo.owner,
          repo.name,
          filter
        );

        const filteredIssues = this.filterIssues(issues, options);
        
        allIssues.push(...filteredIssues);
        
        if (filteredIssues.length > 0) {
          repositorySet.add(`${repo.owner}/${repo.name}`);
          organizationSet.add(repo.owner);
        }
      } catch (error) {
        console.error(`Failed to aggregate issues from ${repo.owner}/${repo.name}:`, error);
      }
    }

    const sortedIssues = this.sortIssues(allIssues, options.sortBy);
    const limitedIssues = options.limit 
      ? sortedIssues.slice(0, options.limit)
      : sortedIssues;

    const totalValue = this.calculateTotalValue(limitedIssues);

    return {
      issues: limitedIssues,
      totalCount: limitedIssues.length,
      repositories: Array.from(repositorySet),
      organizations: Array.from(organizationSet),
      totalValue,
      timestamp: new Date()
    };
  }

  private filterIssues(issues: Issue[], options: AggregationOptions): Issue[] {
    let filtered = issues;

    if (options.filterByPrice) {
      filtered = filtered.filter(issue => {
        const price = issue.price.value;
        const { min = 0, max = Number.MAX_VALUE } = options.filterByPrice!;
        return price >= min && price <= max;
      });
    }

    if (!options.includePullRequests) {
      filtered = filtered.filter(issue => !issue.htmlUrl.includes('/pull/'));
    }

    return filtered;
  }

  private sortIssues(issues: Issue[], sortBy?: string): Issue[] {
    const sorted = [...issues];

    switch (sortBy) {
      case 'price':
        return sorted.sort((a, b) => b.price.compareTo(a.price));
      case 'updated':
        return sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      case 'created':
      default:
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  }

  private calculateTotalValue(issues: Issue[]): number {
    return issues.reduce((total, issue) => total + issue.price.value, 0);
  }

  async findRelatedIssues(issue: Issue, limit: number = 10): Promise<Issue[]> {
    const searchQuery = this.buildSearchQuery(issue);
    const results = await this.issueRepository.search(searchQuery);
    
    return results
      .filter(result => result.id !== issue.id)
      .slice(0, limit);
  }

  private buildSearchQuery(issue: Issue): string {
    const keywords = this.extractKeywords(issue.title);
    const labels = issue.labels.map(l => `label:"${l.name}"`).join(' ');
    const repo = `repo:${issue.organizationName}/${issue.repositoryName}`;
    
    return `${keywords} ${labels} ${repo} is:issue`;
  }

  private extractKeywords(title: string): string {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
    const words = title.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    return words.slice(0, 5).join(' ');
  }
}