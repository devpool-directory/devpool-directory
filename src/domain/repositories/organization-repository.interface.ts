import { Organization } from "../entities/organization";
import { Repository } from "../entities/repository";

export interface OrganizationRepository {
  findByLogin(login: string): Promise<Organization | null>;

  findRepositories(
    login: string,
    options?: {
      type?: "all" | "public" | "private" | "forks" | "sources" | "member";
      sort?: "created" | "updated" | "pushed" | "full_name";
      direction?: "asc" | "desc";
      perPage?: number;
      page?: number;
    }
  ): Promise<Repository[]>;

  findMembers(
    login: string,
    options?: {
      filter?: "2fa_disabled" | "all";
      role?: "all" | "admin" | "member";
      perPage?: number;
      page?: number;
    }
  ): Promise<any[]>;

  findTeams(login: string): Promise<any[]>;

  isOrganizationMember(organization: string, username: string): Promise<boolean>;

  hasRepository(organization: string, repoName: string): Promise<boolean>;

  getOrganizationStats(login: string): Promise<{
    publicRepos: number;
    privateRepos?: number;
    members?: number;
    teams?: number;
    projects?: number;
  }>;
}
