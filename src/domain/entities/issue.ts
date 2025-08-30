import { IssuePrice } from '../value-objects/issue-price';
import { IssueState } from '../value-objects/issue-state';
import { Label } from '../value-objects/label';

export interface IssueEntity {
  id: string;
  number: number;
  title: string;
  body: string;
  state: IssueState;
  price: IssuePrice;
  labels: Label[];
  assignee?: string;
  repositoryUrl: string;
  organizationName: string;
  repositoryName: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  htmlUrl: string;
  assignees: string[];
  priceLabel?: string;
  priceTimeLabel?: string;
}

export class Issue implements IssueEntity {
  constructor(
    public readonly id: string,
    public readonly number: number,
    public readonly title: string,
    public readonly body: string,
    public readonly state: IssueState,
    public readonly price: IssuePrice,
    public readonly labels: Label[],
    public readonly repositoryUrl: string,
    public readonly organizationName: string,
    public readonly repositoryName: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly htmlUrl: string,
    public readonly assignees: string[] = [],
    public readonly assignee?: string,
    public readonly closedAt?: Date,
    public readonly priceLabel?: string,
    public readonly priceTimeLabel?: string
  ) {}

  static create(params: IssueEntity): Issue {
    return new Issue(
      params.id,
      params.number,
      params.title,
      params.body,
      params.state,
      params.price,
      params.labels,
      params.repositoryUrl,
      params.organizationName,
      params.repositoryName,
      params.createdAt,
      params.updatedAt,
      params.htmlUrl,
      params.assignees,
      params.assignee,
      params.closedAt,
      params.priceLabel,
      params.priceTimeLabel
    );
  }

  isPriced(): boolean {
    return this.price.value > 0;
  }

  isOpen(): boolean {
    return this.state.isOpen();
  }

  isClosed(): boolean {
    return this.state.isClosed();
  }

  hasLabel(labelName: string): boolean {
    return this.labels.some(label => label.name === labelName);
  }

  getFullIdentifier(): string {
    return `${this.organizationName}/${this.repositoryName}#${this.number}`;
  }
}