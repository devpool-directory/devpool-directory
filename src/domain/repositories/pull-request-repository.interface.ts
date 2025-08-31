import { PullRequest } from "../entities/pull-request";

export interface PullRequestFilter {
  state?: "open" | "closed" | "all";
  head?: string;
  base?: string;
  sort?: "created" | "updated" | "popularity" | "long-running";
  direction?: "asc" | "desc";
  perPage?: number;
  page?: number;
}

export interface PullRequestRepository {
  findById(owner: string, repo: string, pullNumber: number): Promise<PullRequest | null>;

  findAll(owner: string, repo: string, filter?: PullRequestFilter): Promise<PullRequest[]>;

  findByIssue(owner: string, repo: string, issueNumber: number): Promise<PullRequest[]>;

  create(
    owner: string,
    repo: string,
    pullRequest: {
      title: string;
      body: string;
      head: string;
      base: string;
      draft?: boolean;
    }
  ): Promise<PullRequest>;

  update(
    owner: string,
    repo: string,
    pullNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      base?: string;
    }
  ): Promise<PullRequest>;

  merge(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      mergeMethod?: "merge" | "squash" | "rebase";
      commitTitle?: string;
      commitMessage?: string;
    }
  ): Promise<void>;

  close(owner: string, repo: string, pullNumber: number): Promise<PullRequest>;

  reopen(owner: string, repo: string, pullNumber: number): Promise<PullRequest>;

  getCommits(owner: string, repo: string, pullNumber: number): Promise<any[]>;

  getFiles(owner: string, repo: string, pullNumber: number): Promise<any[]>;

  getReviews(owner: string, repo: string, pullNumber: number): Promise<any[]>;

  requestReview(owner: string, repo: string, pullNumber: number, reviewers: string[]): Promise<void>;

  linkToIssue(owner: string, repo: string, pullNumber: number, issueNumber: number): Promise<void>;
}
