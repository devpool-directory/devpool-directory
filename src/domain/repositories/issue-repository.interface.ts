import { Issue } from "../entities/issue";
import { IssueState } from "../value-objects/issue-state";
import { Label } from "../value-objects/label";

export interface IssueFilter {
  state?: IssueState;
  labels?: string[];
  assignee?: string;
  creator?: string;
  milestone?: string;
  since?: Date;
  sort?: "created" | "updated" | "comments";
  direction?: "asc" | "desc";
  perPage?: number;
  page?: number;
}

export interface IssueRepository {
  findById(owner: string, repo: string, issueNumber: number): Promise<Issue | null>;

  findAll(owner: string, repo: string, filter?: IssueFilter): Promise<Issue[]>;

  findByOrganization(organization: string, filter?: IssueFilter): Promise<Issue[]>;

  create(owner: string, repo: string, issue: Partial<Issue>): Promise<Issue>;

  update(owner: string, repo: string, issueNumber: number, updates: Partial<Issue>): Promise<Issue>;

  close(owner: string, repo: string, issueNumber: number): Promise<Issue>;

  reopen(owner: string, repo: string, issueNumber: number): Promise<Issue>;

  addLabel(owner: string, repo: string, issueNumber: number, label: Label): Promise<void>;

  removeLabel(owner: string, repo: string, issueNumber: number, labelName: string): Promise<void>;

  setLabels(owner: string, repo: string, issueNumber: number, labels: Label[]): Promise<void>;

  assign(owner: string, repo: string, issueNumber: number, assignees: string[]): Promise<void>;

  unassign(owner: string, repo: string, issueNumber: number, assignees: string[]): Promise<void>;

  addComment(owner: string, repo: string, issueNumber: number, comment: string): Promise<void>;

  search(query: string): Promise<Issue[]>;

  findDuplicates(issue: Issue): Promise<Issue[]>;
}
