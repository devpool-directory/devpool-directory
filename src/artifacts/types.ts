export type PartnerIssueKey = {
  owner: string;
  repo: string;
  number: number;
  node_id: string;
};

export type PartnerIssue = PartnerIssueKey & {
  title: string;
  url: string;
  body?: string;
  labels: string[];
  assignees: string[];
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type PartnerPullRequest = {
  owner: string;
  repo: string;
  number: number;
  state: "open" | "closed";
  url: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MirrorStateEntry = {
  directory_issue_number?: number;
  directory_issue_url?: string;
  assigned: boolean;
  assignees: string[];
  price_label?: string | null;
  time_label?: string | null;
  category?: string;
  /** Complete reward distribution history for this issue, ordered chronologically. */
  reward_history?: RewardHistoryEntry[];
};

export type RewardHistoryEntry = {
  /** ISO-8601 timestamp of this distribution event. */
  timestamp: string;
  /** Per-beneficiary rewards in this distribution. */
  beneficiaries: Record<string, number>; // user login -> amount in USD
  /** GitHub comment URL or summary describing this distribution. */
  comment_url?: string;
  /** Payment mode used: 'direct' | 'permit' */
  payment_mode?: "direct" | "permit";
  /** Total USD distributed in this event (sum of beneficiaries). */
  total_distributed: number;
};

export type DifferentialResult = {
  /** Issue node_id. */
  node_id: string;
  /** Beneficiaries whose reward increased. Only these receive a new payment. */
  positive_differences: Record<string, number>; // user -> additional USD
  /** Beneficiaries whose reward decreased (e.g., price label reduced). */
  negative_differences: Record<string, number>; // user -> reduction USD ( informational)
  /** Beneficiaries whose reward is unchanged. */
  unchanged: string[];
  /** New total reward per beneficiary after this distribution. */
  new_totals: Record<string, number>;
  /** Previous total reward per beneficiary from last distribution. */
  previous_totals: Record<string, number>;
  /** Whether this is a reopened issue (price increased or new beneficiary added). */
  is_reopened: boolean;
};

export type MirrorState = Record<string, MirrorStateEntry>; // key = partner node_id

export type Statistics = {
  rewards: { notAssigned: number; assigned: number; completed: number; total: number };
  tasks: { notAssigned: number; assigned: number; completed: number; total: number };
  lifetime?: { rewardsCompletedUSD: number; tasksCompletedPriced: number };
};
