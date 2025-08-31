import { injectable, inject } from "inversify";
import { TYPES } from "../../../shared/types";
import { PullRequestRepository, PullRequestFilter } from "../../../domain/repositories/pull-request-repository.interface";
import { PullRequest } from "../../../domain/entities/pull-request";
import { GitHubClient } from "../github-client";
import { Logger } from "../../../shared/logger";

@injectable()
export class GitHubPullRequestRepository implements PullRequestRepository {
  constructor(@inject(TYPES.GitHubClient) private githubClient: GitHubClient, @inject(TYPES.Logger) private logger: Logger) {}

  async findById(owner: string, repo: string, pullNumber: number): Promise<PullRequest | null> {
    try {
      const { data } = await this.githubClient.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      return this.mapToPullRequest(data);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      this.logger.error("Failed to fetch pull request", { owner, repo, pullNumber, error });
      throw error;
    }
  }

  async findAll(owner: string, repo: string, filter?: PullRequestFilter): Promise<PullRequest[]> {
    try {
      const { data } = await this.githubClient.rest.pulls.list({
        owner,
        repo,
        state: filter?.state || "open",
        head: filter?.head,
        base: filter?.base,
        sort: filter?.sort || "created",
        direction: filter?.direction || "desc",
        per_page: filter?.perPage || 100,
        page: filter?.page || 1,
      });

      return data.map((pr) => this.mapToPullRequest(pr));
    } catch (error) {
      this.logger.error("Failed to fetch pull requests", { owner, repo, filter, error });
      throw error;
    }
  }

  async findByIssue(owner: string, repo: string, issueNumber: number): Promise<PullRequest[]> {
    try {
      const pulls = await this.findAll(owner, repo);
      return pulls.filter(
        (pr) =>
          pr.body?.includes(`#${issueNumber}`) ||
          pr.body?.includes(`fixes #${issueNumber}`) ||
          pr.body?.includes(`closes #${issueNumber}`) ||
          pr.body?.includes(`resolves #${issueNumber}`)
      );
    } catch (error) {
      this.logger.error("Failed to find PRs by issue", { owner, repo, issueNumber, error });
      throw error;
    }
  }

  async create(
    owner: string,
    repo: string,
    pullRequest: {
      title: string;
      body: string;
      head: string;
      base: string;
      draft?: boolean;
    }
  ): Promise<PullRequest> {
    try {
      const { data } = await this.githubClient.rest.pulls.create({
        owner,
        repo,
        title: pullRequest.title,
        body: pullRequest.body,
        head: pullRequest.head,
        base: pullRequest.base,
        draft: pullRequest.draft,
      });

      return this.mapToPullRequest(data);
    } catch (error) {
      this.logger.error("Failed to create pull request", { owner, repo, pullRequest, error });
      throw error;
    }
  }

  async update(
    owner: string,
    repo: string,
    pullNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      base?: string;
    }
  ): Promise<PullRequest> {
    try {
      const { data } = await this.githubClient.rest.pulls.update({
        owner,
        repo,
        pull_number: pullNumber,
        title: updates.title,
        body: updates.body,
        state: updates.state,
        base: updates.base,
      });

      return this.mapToPullRequest(data);
    } catch (error) {
      this.logger.error("Failed to update pull request", { owner, repo, pullNumber, updates, error });
      throw error;
    }
  }

  async merge(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      mergeMethod?: "merge" | "squash" | "rebase";
      commitTitle?: string;
      commitMessage?: string;
    }
  ): Promise<void> {
    try {
      await this.githubClient.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: options?.mergeMethod || "merge",
        commit_title: options?.commitTitle,
        commit_message: options?.commitMessage,
      });
    } catch (error) {
      this.logger.error("Failed to merge pull request", { owner, repo, pullNumber, options, error });
      throw error;
    }
  }

  async close(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    return this.update(owner, repo, pullNumber, { state: "closed" });
  }

  async reopen(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    return this.update(owner, repo, pullNumber, { state: "open" });
  }

  async getCommits(owner: string, repo: string, pullNumber: number): Promise<any[]> {
    try {
      const { data } = await this.githubClient.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to get PR commits", { owner, repo, pullNumber, error });
      throw error;
    }
  }

  async getFiles(owner: string, repo: string, pullNumber: number): Promise<any[]> {
    try {
      const { data } = await this.githubClient.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to get PR files", { owner, repo, pullNumber, error });
      throw error;
    }
  }

  async getReviews(owner: string, repo: string, pullNumber: number): Promise<any[]> {
    try {
      const { data } = await this.githubClient.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to get PR reviews", { owner, repo, pullNumber, error });
      throw error;
    }
  }

  async requestReview(owner: string, repo: string, pullNumber: number, reviewers: string[]): Promise<void> {
    try {
      await this.githubClient.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pullNumber,
        reviewers,
      });
    } catch (error) {
      this.logger.error("Failed to request review", { owner, repo, pullNumber, reviewers, error });
      throw error;
    }
  }

  async linkToIssue(owner: string, repo: string, pullNumber: number, issueNumber: number): Promise<void> {
    try {
      const pr = await this.findById(owner, repo, pullNumber);
      if (!pr) {
        throw new Error(`Pull request #${pullNumber} not found`);
      }

      const updatedBody = pr.body ? `${pr.body}\n\nCloses #${issueNumber}` : `Closes #${issueNumber}`;

      await this.update(owner, repo, pullNumber, { body: updatedBody });
    } catch (error) {
      this.logger.error("Failed to link PR to issue", { owner, repo, pullNumber, issueNumber, error });
      throw error;
    }
  }

  private mapToPullRequest(data: any): PullRequest {
    return new PullRequest({
      id: data.id,
      nodeId: data.node_id,
      number: data.number,
      title: data.title,
      body: data.body || "",
      state: data.state,
      locked: data.locked,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
      mergedAt: data.merged_at ? new Date(data.merged_at) : undefined,
      draft: data.draft || false,
      user: {
        login: data.user.login,
        id: data.user.id,
        nodeId: data.user.node_id,
        avatarUrl: data.user.avatar_url,
        type: data.user.type,
      },
      htmlUrl: data.html_url,
      headRef: data.head.ref,
      headSha: data.head.sha,
      baseRef: data.base.ref,
      baseSha: data.base.sha,
      labels: data.labels || [],
      assignees: data.assignees || [],
      reviewers: data.requested_reviewers || [],
      teamReviewers: data.requested_teams || [],
      milestone: data.milestone,
      authorAssociation: data.author_association,
      autoMerge: data.auto_merge,
      activeLockReason: data.active_lock_reason,
      merged: data.merged || false,
      mergeable: data.mergeable,
      mergeableState: data.mergeable_state,
      mergedBy: data.merged_by,
      comments: data.comments || 0,
      reviewComments: data.review_comments || 0,
      maintainerCanModify: data.maintainer_can_modify || false,
      commits: data.commits || 0,
      additions: data.additions || 0,
      deletions: data.deletions || 0,
      changedFiles: data.changed_files || 0,
    });
  }
}
