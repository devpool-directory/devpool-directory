import { injectable, inject } from 'inversify';
import { GitHubClient } from '../github-client';
import { IssueRepository, IssueFilter } from '../../../domain/repositories/issue-repository.interface';
import { Issue } from '../../../domain/entities/issue';
import { IssueState } from '../../../domain/value-objects/issue-state';
import { IssuePrice } from '../../../domain/value-objects/issue-price';
import { Label } from '../../../domain/value-objects/label';
import { TYPES } from '../../../shared/container/types';

@injectable()
export class GitHubIssueRepository implements IssueRepository {
  constructor(
    @inject(TYPES.GitHubClient) private githubClient: GitHubClient
  ) {}

  async findById(owner: string, repo: string, issueNumber: number): Promise<Issue | null> {
    try {
      const response = await this.githubClient.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}',
        { owner, repo, issue_number: issueNumber }
      );
      
      return this.mapToIssue(response, owner, repo);
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async findAll(owner: string, repo: string, filter?: IssueFilter): Promise<Issue[]> {
    const parameters: any = {
      owner,
      repo,
      state: filter?.state?.value || 'open',
      sort: filter?.sort || 'created',
      direction: filter?.direction || 'desc',
      per_page: filter?.perPage || 100,
      page: filter?.page || 1
    };

    if (filter?.labels && filter.labels.length > 0) {
      parameters.labels = filter.labels.join(',');
    }

    if (filter?.assignee) {
      parameters.assignee = filter.assignee;
    }

    if (filter?.creator) {
      parameters.creator = filter.creator;
    }

    if (filter?.milestone) {
      parameters.milestone = filter.milestone;
    }

    if (filter?.since) {
      parameters.since = filter.since.toISOString();
    }

    const issues = await this.githubClient.paginate(
      'GET /repos/{owner}/{repo}/issues',
      parameters
    );

    return issues
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => this.mapToIssue(issue, owner, repo));
  }

  async findByOrganization(organization: string, filter?: IssueFilter): Promise<Issue[]> {
    const parameters: any = {
      org: organization,
      state: filter?.state?.value || 'open',
      sort: filter?.sort || 'created',
      direction: filter?.direction || 'desc',
      per_page: filter?.perPage || 100,
      page: filter?.page || 1
    };

    if (filter?.labels && filter.labels.length > 0) {
      parameters.labels = filter.labels.join(',');
    }

    if (filter?.since) {
      parameters.since = filter.since.toISOString();
    }

    const issues = await this.githubClient.paginate(
      'GET /orgs/{org}/issues',
      parameters
    );

    return issues
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => {
        const [owner, repo] = issue.repository.full_name.split('/');
        return this.mapToIssue(issue, owner, repo);
      });
  }

  async create(owner: string, repo: string, issue: Partial<Issue>): Promise<Issue> {
    const response = await this.githubClient.request(
      'POST /repos/{owner}/{repo}/issues',
      {
        owner,
        repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels?.map(l => l.name),
        assignees: issue.assignees
      }
    );

    return this.mapToIssue(response, owner, repo);
  }

  async update(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: Partial<Issue>
  ): Promise<Issue> {
    const response = await this.githubClient.request(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo,
        issue_number: issueNumber,
        title: updates.title,
        body: updates.body,
        state: updates.state?.value,
        labels: updates.labels?.map(l => l.name),
        assignees: updates.assignees
      }
    );

    return this.mapToIssue(response, owner, repo);
  }

  async close(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    const response = await this.githubClient.request(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed'
      }
    );

    return this.mapToIssue(response, owner, repo);
  }

  async reopen(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    const response = await this.githubClient.request(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo,
        issue_number: issueNumber,
        state: 'open'
      }
    );

    return this.mapToIssue(response, owner, repo);
  }

  async addLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: Label
  ): Promise<void> {
    await this.githubClient.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      {
        owner,
        repo,
        issue_number: issueNumber,
        labels: [label.name]
      }
    );
  }

  async removeLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    labelName: string
  ): Promise<void> {
    await this.githubClient.request(
      'DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}',
      {
        owner,
        repo,
        issue_number: issueNumber,
        name: labelName
      }
    );
  }

  async setLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: Label[]
  ): Promise<void> {
    await this.githubClient.request(
      'PUT /repos/{owner}/{repo}/issues/{issue_number}/labels',
      {
        owner,
        repo,
        issue_number: issueNumber,
        labels: labels.map(l => l.name)
      }
    );
  }

  async assign(
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[]
  ): Promise<void> {
    await this.githubClient.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/assignees',
      {
        owner,
        repo,
        issue_number: issueNumber,
        assignees
      }
    );
  }

  async unassign(
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[]
  ): Promise<void> {
    await this.githubClient.request(
      'DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees',
      {
        owner,
        repo,
        issue_number: issueNumber,
        assignees
      }
    );
  }

  async addComment(
    owner: string,
    repo: string,
    issueNumber: number,
    comment: string
  ): Promise<void> {
    await this.githubClient.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner,
        repo,
        issue_number: issueNumber,
        body: comment
      }
    );
  }

  async search(query: string): Promise<Issue[]> {
    const response = await this.githubClient.request(
      'GET /search/issues',
      {
        q: query,
        sort: 'created',
        order: 'desc',
        per_page: 100
      }
    );

    return response.items
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => {
        const [owner, repo] = issue.repository_url.split('/').slice(-2);
        return this.mapToIssue(issue, owner, repo);
      });
  }

  async findDuplicates(issue: Issue): Promise<Issue[]> {
    const query = `${issue.title} repo:${issue.organizationName}/${issue.repositoryName} is:issue`;
    
    const results = await this.search(query);
    
    return results.filter(result => result.id !== issue.id);
  }

  private mapToIssue(githubIssue: any, owner: string, repo: string): Issue {
    const labels = (githubIssue.labels || []).map((label: any) =>
      Label.fromGitHub(label)
    );

    const priceLabel = labels.find((l: Label) => l.isPriceLabel());
    const price = priceLabel 
      ? IssuePrice.fromLabel(priceLabel.name)
      : IssuePrice.zero();

    const timeLabel = labels.find((l: Label) => l.isTimeLabel());

    return Issue.create({
      id: githubIssue.id.toString(),
      number: githubIssue.number,
      title: githubIssue.title,
      body: githubIssue.body || '',
      state: IssueState.fromString(githubIssue.state),
      price,
      labels,
      assignee: githubIssue.assignee?.login,
      assignees: (githubIssue.assignees || []).map((a: any) => a.login),
      repositoryUrl: `https://github.com/${owner}/${repo}`,
      organizationName: owner,
      repositoryName: repo,
      createdAt: new Date(githubIssue.created_at),
      updatedAt: new Date(githubIssue.updated_at),
      closedAt: githubIssue.closed_at ? new Date(githubIssue.closed_at) : undefined,
      htmlUrl: githubIssue.html_url,
      priceLabel: priceLabel?.name,
      priceTimeLabel: timeLabel?.name
    });
  }
}