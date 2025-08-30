export interface PullRequestEntity {
  id: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  issueNumber?: number;
  repositoryUrl: string;
  organizationName: string;
  repositoryName: string;
  authorUsername: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  mergedAt?: Date;
  htmlUrl: string;
  draft: boolean;
}

export class PullRequest implements PullRequestEntity {
  constructor(
    public readonly id: string,
    public readonly number: number,
    public readonly title: string,
    public readonly body: string,
    public readonly state: 'open' | 'closed' | 'merged',
    public readonly repositoryUrl: string,
    public readonly organizationName: string,
    public readonly repositoryName: string,
    public readonly authorUsername: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly htmlUrl: string,
    public readonly draft: boolean,
    public readonly issueNumber?: number,
    public readonly closedAt?: Date,
    public readonly mergedAt?: Date
  ) {}

  static create(params: PullRequestEntity): PullRequest {
    return new PullRequest(
      params.id,
      params.number,
      params.title,
      params.body,
      params.state,
      params.repositoryUrl,
      params.organizationName,
      params.repositoryName,
      params.authorUsername,
      params.createdAt,
      params.updatedAt,
      params.htmlUrl,
      params.draft,
      params.issueNumber,
      params.closedAt,
      params.mergedAt
    );
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  isClosed(): boolean {
    return this.state === 'closed';
  }

  isMerged(): boolean {
    return this.state === 'merged';
  }

  isLinkedToIssue(): boolean {
    return this.issueNumber !== undefined;
  }

  getFullIdentifier(): string {
    return `${this.organizationName}/${this.repositoryName}#${this.number}`;
  }

  extractIssueNumber(): number | undefined {
    if (this.issueNumber) return this.issueNumber;
    
    const match = this.title.match(/#(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }
}