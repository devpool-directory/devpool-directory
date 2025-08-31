export interface StatisticsData {
  timestamp: Date;
  issues: {
    total: number;
    open: number;
    closed: number;
    labeled: number;
    assigned: number;
    priced: number;
  };
  pullRequests: {
    total: number;
    open: number;
    closed: number;
    merged: number;
    draft: number;
  };
  rewards: {
    total: number;
    paid: number;
    pending: number;
    byTier: Record<string, number>;
  };
  contributors: {
    total: number;
    active: number;
    new: number;
  };
  partnerRepositories: number;
  lastUpdated: Date;
}

export class Statistics {
  public readonly timestamp: Date;
  public readonly issues: {
    total: number;
    open: number;
    closed: number;
    labeled: number;
    assigned: number;
    priced: number;
  };
  public readonly pullRequests: {
    total: number;
    open: number;
    closed: number;
    merged: number;
    draft: number;
  };
  public readonly rewards: {
    total: number;
    paid: number;
    pending: number;
    byTier: Record<string, number>;
  };
  public readonly contributors: {
    total: number;
    active: number;
    new: number;
  };
  public readonly partnerRepositories: number;
  public readonly lastUpdated: Date;

  constructor(data: StatisticsData) {
    this.timestamp = data.timestamp;
    this.issues = data.issues;
    this.pullRequests = data.pullRequests;
    this.rewards = data.rewards;
    this.contributors = data.contributors;
    this.partnerRepositories = data.partnerRepositories;
    this.lastUpdated = data.lastUpdated;
  }

  static create(params: StatisticsData): Statistics {
    return new Statistics(params);
  }

  getCompletionRate(): number {
    if (this.issues.total === 0) return 0;
    return (this.issues.closed / this.issues.total) * 100;
  }

  getPricedRate(): number {
    if (this.issues.total === 0) return 0;
    return (this.issues.priced / this.issues.total) * 100;
  }

  getMergeRate(): number {
    if (this.pullRequests.total === 0) return 0;
    return (this.pullRequests.merged / this.pullRequests.total) * 100;
  }

  getAssignmentRate(): number {
    if (this.issues.total === 0) return 0;
    return (this.issues.assigned / this.issues.total) * 100;
  }

  getAverageReward(): number {
    if (this.issues.priced === 0) return 0;
    return this.rewards.total / this.issues.priced;
  }

  toJSON(): Record<string, any> {
    return {
      timestamp: this.timestamp instanceof Date ? this.timestamp.toISOString() : this.timestamp,
      issues: this.issues,
      pullRequests: this.pullRequests,
      rewards: this.rewards,
      contributors: this.contributors,
      partnerRepositories: this.partnerRepositories,
      lastUpdated: this.lastUpdated instanceof Date ? this.lastUpdated.toISOString() : this.lastUpdated,
      metrics: {
        completionRate: this.getCompletionRate(),
        pricedRate: this.getPricedRate(),
        mergeRate: this.getMergeRate(),
        assignmentRate: this.getAssignmentRate(),
        averageReward: this.getAverageReward(),
      },
    };
  }
}
