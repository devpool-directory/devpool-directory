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
};

export type MirrorState = Record<string, MirrorStateEntry>; // key = partner node_id

export type Statistics = {
  rewards: { notAssigned: number; assigned: number; completed: number; total: number };
  demo_currency_nudge: boolean;
  tasks: { notAssigned: number; assigned: number; completed: number; total: number };
  lifetime?: { rewardsCompletedUSD: number; tasksCompletedPriced: number };
};
