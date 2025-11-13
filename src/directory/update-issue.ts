import { GitHubIssue } from "./directory";

export interface MetadataInterface {
  meta?: string;
  directoryIssue?: any;
  partnerIssue?: any;
  issueDelta?: any;
  labelRemoved?: any;
  originalLabels?: any;
  // Add other fields as needed
}

export interface UpdateIssueParams {
  partnerIssue: any;
  directoryIssue: any;
}

export async function updateDirectoryIssue(params: UpdateIssueParams): Promise<void>;
export async function updateDirectoryIssue(issue: GitHubIssue, metadata: MetadataInterface): Promise<void>;
export async function updateDirectoryIssue(paramsOrIssue: UpdateIssueParams | GitHubIssue, metadata?: MetadataInterface): Promise<void> {
  if (metadata) {
    // Original call
    const issue = paramsOrIssue as GitHubIssue;
    console.log(`Updating issue ${issue.number} with metadata:`, metadata);
  } else {
    // New call
    const params = paramsOrIssue as UpdateIssueParams;
    console.log(`Updating issue ${params.directoryIssue.number} with partner issue:`, params.partnerIssue);
  }
}
