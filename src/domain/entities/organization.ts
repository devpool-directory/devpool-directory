export interface OrganizationEntity {
  id: string;
  login: string;
  name?: string;
  description?: string;
  url: string;
  htmlUrl: string;
  avatarUrl: string;
  createdAt: Date;
  updatedAt: Date;
  publicReposCount: number;
  type: "Organization" | "User";
  isVerified?: boolean;
  hasOrganizationProjects?: boolean;
  hasRepositoryProjects?: boolean;
}

export class Organization implements OrganizationEntity {
  constructor(
    public readonly id: string,
    public readonly login: string,
    public readonly url: string,
    public readonly htmlUrl: string,
    public readonly avatarUrl: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly publicReposCount: number,
    public readonly type: "Organization" | "User",
    public readonly name?: string,
    public readonly description?: string,
    public readonly isVerified?: boolean,
    public readonly hasOrganizationProjects?: boolean,
    public readonly hasRepositoryProjects?: boolean
  ) {}

  static create(params: OrganizationEntity): Organization {
    return new Organization(
      params.id,
      params.login,
      params.url,
      params.htmlUrl,
      params.avatarUrl,
      params.createdAt,
      params.updatedAt,
      params.publicReposCount,
      params.type,
      params.name,
      params.description,
      params.isVerified,
      params.hasOrganizationProjects,
      params.hasRepositoryProjects
    );
  }

  isOrganization(): boolean {
    return this.type === "Organization";
  }

  isUser(): boolean {
    return this.type === "User";
  }

  getDisplayName(): string {
    return this.name || this.login;
  }

  hasProjects(): boolean {
    return Boolean(this.hasOrganizationProjects || this.hasRepositoryProjects);
  }
}
