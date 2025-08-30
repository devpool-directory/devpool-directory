import { Issue } from '../../../domain/entities/issue';

export interface SyncPartnerIssuesRequest {
  partnerOrganizations: string[];
  partnerRepositories?: Array<{ owner: string; name: string }>;
  targetOwner: string;
  targetRepo: string;
  includeClosedIssues?: boolean;
  syncLabels?: boolean;
  dryRun?: boolean;
}

export interface SyncPartnerIssuesResponse {
  success: boolean;
  issuesSynced: number;
  issuesCreated: number;
  issuesUpdated: number;
  issuesSkipped: number;
  errors: SyncError[];
  syncedIssues: SyncedIssue[];
  duration: number;
}

export interface SyncedIssue {
  originalIssue: Issue;
  syncedIssueNumber?: number;
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
}

export interface SyncError {
  issueId: string;
  issueTitle: string;
  error: string;
  timestamp: Date;
}