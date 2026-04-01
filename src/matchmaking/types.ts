export interface PartnerIssue {
  owner: string;
  repo: string;
  number: number;
  node_id: string;
  title: string;
  url: string;
  body?: string;
  labels: string[];
  assignees: string[];
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
}

export interface MirrorState {
  directory_issue_number?: number;
  directory_issue_url?: string;
  assigned: boolean;
  assignees: string[];
  price_label?: string | null;
  time_label?: string | null;
  category?: string;
}

export interface MatchResult {
  issue: PartnerIssue;
  score: number;
  matchedSkills: string[];
  directoryUrl?: string;
}

export interface UserProfile {
  login: string;
  avatarUrl: string;
  closedIssues: PartnerIssue[];
  skillKeywords: Map<string, number>;
}

export interface ArtifactStore {
  issues: PartnerIssue[];
  mirrorState: Record<string, MirrorState>;
  loaded: boolean;
}
