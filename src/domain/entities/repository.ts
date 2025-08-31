export interface RepositoryEntity {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  description?: string;
  url: string;
  htmlUrl: string;
  isPrivate: boolean;
  isArchived: boolean;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
  pushedAt?: Date;
  openIssuesCount: number;
  stargazersCount: number;
  forksCount: number;
  language?: string;
  topics: string[];
}

export class Repository implements RepositoryEntity {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly fullName: string,
    public readonly owner: string,
    public readonly url: string,
    public readonly htmlUrl: string,
    public readonly isPrivate: boolean,
    public readonly isArchived: boolean,
    public readonly defaultBranch: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly openIssuesCount: number,
    public readonly stargazersCount: number,
    public readonly forksCount: number,
    public readonly topics: string[],
    public readonly description?: string,
    public readonly pushedAt?: Date,
    public readonly language?: string
  ) {}

  static create(params: RepositoryEntity): Repository {
    return new Repository(
      params.id,
      params.name,
      params.fullName,
      params.owner,
      params.url,
      params.htmlUrl,
      params.isPrivate,
      params.isArchived,
      params.defaultBranch,
      params.createdAt,
      params.updatedAt,
      params.openIssuesCount,
      params.stargazersCount,
      params.forksCount,
      params.topics,
      params.description,
      params.pushedAt,
      params.language
    );
  }

  isActive(): boolean {
    return !this.isArchived && !this.isPrivate;
  }

  hasOpenIssues(): boolean {
    return this.openIssuesCount > 0;
  }

  getOwnerAndName(): { owner: string; name: string } {
    const parts = this.fullName.split("/");
    return {
      owner: parts[0],
      name: parts[1],
    };
  }

  hasTopic(topic: string): boolean {
    return this.topics.includes(topic);
  }
}
