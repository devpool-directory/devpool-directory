import { injectable, inject } from "inversify";
import { TYPES } from "../../../shared/types";
import { OrganizationRepository } from "../../../domain/repositories/organization-repository.interface";
import { Organization } from "../../../domain/entities/organization";
import { Repository } from "../../../domain/entities/repository";
import { GitHubClient } from "../github-client";
import { Logger } from "../../../shared/logger";

@injectable()
export class GitHubOrganizationRepository implements OrganizationRepository {
  constructor(@inject(TYPES.GitHubClient) private githubClient: GitHubClient, @inject(TYPES.Logger) private logger: Logger) {}

  async findByLogin(login: string): Promise<Organization | null> {
    try {
      const { data } = await this.githubClient.rest.orgs.get({ org: login });

      return new Organization({
        id: data.id,
        nodeId: data.node_id,
        login: data.login,
        name: data.name || data.login,
        description: data.description,
        avatarUrl: data.avatar_url,
        websiteUrl: data.blog,
        location: data.location,
        email: data.email,
        twitterUsername: data.twitter_username,
        publicRepos: data.public_repos,
        publicGists: data.public_gists,
        followers: data.followers,
        following: data.following,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        type: data.type,
        htmlUrl: data.html_url,
        hasOrganizationProjects: data.has_organization_projects,
        hasRepositoryProjects: data.has_repository_projects,
        isVerified: data.is_verified,
        reposUrl: data.repos_url,
      });
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      this.logger.error("Failed to fetch organization", { login, error });
      throw error;
    }
  }

  async findRepositories(
    login: string,
    options?: {
      type?: "all" | "public" | "private" | "forks" | "sources" | "member";
      sort?: "created" | "updated" | "pushed" | "full_name";
      direction?: "asc" | "desc";
      perPage?: number;
      page?: number;
    }
  ): Promise<Repository[]> {
    try {
      const { data } = await this.githubClient.rest.repos.listForOrg({
        org: login,
        type: options?.type || "all",
        sort: options?.sort || "updated",
        direction: options?.direction || "desc",
        per_page: options?.perPage || 100,
        page: options?.page || 1,
      });

      return data.map(
        (repo) =>
          new Repository({
            id: repo.id,
            nodeId: repo.node_id,
            name: repo.name,
            fullName: repo.full_name,
            owner: {
              login: repo.owner.login,
              id: repo.owner.id,
              nodeId: repo.owner.node_id,
              avatarUrl: repo.owner.avatar_url,
              type: repo.owner.type,
            },
            private: repo.private,
            htmlUrl: repo.html_url,
            description: repo.description,
            fork: repo.fork,
            url: repo.url,
            createdAt: new Date(repo.created_at),
            updatedAt: new Date(repo.updated_at),
            pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : undefined,
            gitUrl: repo.git_url,
            sshUrl: repo.ssh_url,
            cloneUrl: repo.clone_url,
            svnUrl: repo.svn_url,
            homepage: repo.homepage,
            size: repo.size,
            stargazersCount: repo.stargazers_count,
            watchersCount: repo.watchers_count,
            language: repo.language,
            hasIssues: repo.has_issues,
            hasProjects: repo.has_projects,
            hasDownloads: repo.has_downloads,
            hasWiki: repo.has_wiki,
            hasPages: repo.has_pages,
            hasDiscussions: repo.has_discussions,
            forksCount: repo.forks_count,
            mirrorUrl: repo.mirror_url,
            archived: repo.archived,
            disabled: repo.disabled,
            openIssuesCount: repo.open_issues_count,
            license: repo.license,
            allowForking: repo.allow_forking,
            isTemplate: repo.is_template,
            webCommitSignoffRequired: repo.web_commit_signoff_required,
            topics: repo.topics || [],
            visibility: repo.visibility,
            forks: repo.forks,
            openIssues: repo.open_issues,
            watchers: repo.watchers,
            defaultBranch: repo.default_branch,
          })
      );
    } catch (error) {
      this.logger.error("Failed to fetch organization repositories", { login, options, error });
      throw error;
    }
  }

  async findMembers(
    login: string,
    options?: {
      filter?: "2fa_disabled" | "all";
      role?: "all" | "admin" | "member";
      perPage?: number;
      page?: number;
    }
  ): Promise<any[]> {
    try {
      const { data } = await this.githubClient.rest.orgs.listMembers({
        org: login,
        filter: options?.filter || "all",
        role: options?.role || "all",
        per_page: options?.perPage || 100,
        page: options?.page || 1,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to fetch organization members", { login, options, error });
      throw error;
    }
  }

  async findTeams(login: string): Promise<any[]> {
    try {
      const { data } = await this.githubClient.rest.teams.list({
        org: login,
        per_page: 100,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to fetch organization teams", { login, error });
      throw error;
    }
  }

  async isOrganizationMember(organization: string, username: string): Promise<boolean> {
    try {
      await this.githubClient.rest.orgs.checkMembershipForUser({
        org: organization,
        username,
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      this.logger.error("Failed to check organization membership", { organization, username, error });
      throw error;
    }
  }

  async hasRepository(organization: string, repoName: string): Promise<boolean> {
    try {
      await this.githubClient.rest.repos.get({
        owner: organization,
        repo: repoName,
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      this.logger.error("Failed to check repository existence", { organization, repoName, error });
      throw error;
    }
  }

  async getOrganizationStats(login: string): Promise<{
    publicRepos: number;
    privateRepos?: number;
    members?: number;
    teams?: number;
    projects?: number;
  }> {
    try {
      const org = await this.findByLogin(login);
      if (!org) {
        throw new Error(`Organization ${login} not found`);
      }

      const [members, teams] = await Promise.all([this.findMembers(login).catch(() => []), this.findTeams(login).catch(() => [])]);

      return {
        publicRepos: org.publicRepos,
        members: members.length,
        teams: teams.length,
      };
    } catch (error) {
      this.logger.error("Failed to get organization stats", { login, error });
      throw error;
    }
  }
}
