/**
 * @file github-decoupling.ts
 * @description Scaffolding and generator utilities for decoupling Ubiquity OS plugins
 * from GitHub-specific dependencies, enabling portability to other task management
 * platforms (Asana, Linear, Google Sheets, etc.).
 * 
 * Upstream Issue: ubiquity-os-marketplace/text-conversation-rewards#385
 * Bounty Value: $1200 USD
 * 
 * This module provides:
 * - Abstract TaskProvider interface for platform-agnostic task operations
 * - Adapter generators for Asana, Linear, and Google Sheets
 * - Identity resolution utilities for cross-platform user mapping
 * - Migration scaffolding for existing GitHub-dependent plugins
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents a normalized task across any project management platform.
 * Decouples internal plugin logic from platform-specific data structures.
 */
export interface NormalizedTask {
  /** Platform-unique task identifier */
  id: string;
  /** Human-readable task title */
  title: string;
  /** Task description/body in markdown or plain text */
  body: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Assigned user(s) as normalized identities */
  assignees: NormalizedIdentity[];
  /** Labels/tags associated with the task */
  labels: string[];
  /** Timestamp when task was created */
  createdAt: Date;
  /** Timestamp when task was last updated */
  updatedAt: Date;
  /** Optional due date */
  dueDate?: Date;
  /** Platform-specific metadata passthrough */
  metadata?: Record<string, unknown>;
}

/**
 * Unified task status enum that maps across platforms.
 */
export enum TaskStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  IN_REVIEW = "in_review",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REOPENED = "reopened",
}

/**
 * Cross-platform identity representation.
 * Solves the problem of associating one human's identity across several platforms.
 */
export interface NormalizedIdentity {
  /** Unique identifier within the source platform */
  platformId: string;
  /** Source platform name */
  platform: SupportedPlatform;
  /** Display name on the source platform */
  displayName: string;
  /** Email address if available */
  email?: string;
  /** Avatar URL if available */
  avatarUrl?: string;
  /** Resolved universal identity ID (if linked) */
  universalId?: string;
}

/**
 * Supported task management platforms for decoupled integration.
 */
export enum SupportedPlatform {
  GITHUB = "github",
  ASANA = "asana",
  LINEAR = "linear",
  GOOGLE_SHEETS = "google_sheets",
  JIRA = "jira",
  TRELLO = "trello",
}

/**
 * Configuration for connecting to a specific task management platform.
 */
export interface PlatformConfig {
  platform: SupportedPlatform;
  /** API key, token, or service account credentials */
  credentials: string | Record<string, string>;
  /** Workspace/project/organization identifier */
  workspaceId: string;
  /** Optional base URL for self-hosted instances */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retries for transient failures */
  maxRetries?: number;
}

/**
 * Abstract interface that all platform adapters must implement.
 * This is the core decoupling mechanism.
 */
export interface ITaskProvider {
  /** Platform identifier */
  readonly platform: SupportedPlatform;

  /** Fetch a single task by its platform-specific ID */
  getTask(taskId: string): Promise<NormalizedTask>;

  /** List tasks matching optional filters */
  listTasks(filters?: TaskFilter): Promise<NormalizedTask[]>;

  /** Update task status */
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;

  /** Add a comment/update to a task */
  addComment(taskId: string, body: string): Promise<void>;

  /** Assign users to a task */
  assignTask(taskId: string, identities: NormalizedIdentity[]): Promise<void>;

  /** Resolve a platform identity to a universal identity */
  resolveIdentity(platformId: string): Promise<NormalizedIdentity | null>;

  /** Link two platform identities as the same human */
  linkIdentities(
    primary: NormalizedIdentity,
    secondary: NormalizedIdentity
  ): Promise<string>;

  /** Check if the provider connection is healthy */
  healthCheck(): Promise<boolean>;
}

/**
 * Filters for listing tasks across platforms.
 */
export interface TaskFilter {
  status?: TaskStatus[];
  labels?: string[];
  assigneeIds?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// GENERATOR FUNCTIONS
// ============================================================================

/**
 * Generates TypeScript code for an Asana task provider adapter.
 * Implements ITaskProvider using the Asana REST API v1.0.
 * 
 * @param config - Platform configuration for Asana
 * @returns Complete TypeScript source code for the adapter
 */
export function generateAsanaAdapter(config: PlatformConfig): string {
  return `/**
 * Auto-generated Asana Task Provider Adapter
 * Generated at: ${new Date().toISOString()}
 * Workspace: ${config.workspaceId}
 */

import { ITaskProvider, NormalizedTask, TaskStatus, NormalizedIdentity, SupportedPlatform, TaskFilter } from "./types";

const ASANA_BASE_URL = "${config.baseUrl || "https://app.asana.com/api/1.0"}";
const WORKSPACE_GID = "${config.workspaceId}";
const REQUEST_TIMEOUT = ${config.timeoutMs || 30000};
const MAX_RETRIES = ${config.maxRetries || 3};

export class AsanaTaskProvider implements ITaskProvider {
  readonly platform = SupportedPlatform.ASANA;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = \`\${ASANA_BASE_URL}\${path}\`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            "Authorization": \`Bearer \${this.token}\`,
            "Content-Type": "application/json",
            "Asana-Enable": "new_goal_memberships,new_user_task_lists",
            ...(options?.headers || {}),
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(\`Asana API error: \${response.status} \${response.statusText}\`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  async getTask(taskId: string): Promise<NormalizedTask> {
    const response = await this.request<{ data: any }>(\`/tasks/\${taskId}?opt_fields=name,notes,completed,assignee,labels,created_at,modified_at,due_on\`);
    return this.normalizeTask(response.data);
  }

  async listTasks(filters?: TaskFilter): Promise<NormalizedTask[]> {
    const params = new URLSearchParams({
      workspace: WORKSPACE_GID,
      opt_fields: "name,notes,completed,assignee,labels,created_at,modified_at,due_on",
    });

    if (filters?.limit) params.set("limit", String(filters.limit));

    const response = await this.request<{ data: any[] }>(\`/tasks?\${params.toString()}\`);
    return response.data.map(t => this.normalizeTask(t));
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const completed = status === TaskStatus.COMPLETED;
    await this.request(\`/tasks/\${taskId}\`, {
      method: "PUT",
      body: JSON.stringify({ data: { completed } }),
    });
  }

  async addComment(taskId: string, body: string): Promise<void> {
    await this.request(\`/tasks/\${taskId}/stories\`, {
      method: "POST",
      body: JSON.stringify({ data: { text: body } }),
    });
  }

  async assignTask(taskId: string, identities: NormalizedIdentity[]): Promise<void> {
    const assignee = identities.find(i => i.platform === SupportedPlatform.ASANA);
    if (assignee) {
      await this.request(\`/tasks/\${taskId}\`, {
        method: "PUT",
        body: JSON.stringify({ data: { assignee: assignee.platformId } }),
      });
    }
  }

  async resolveIdentity(platformId: string): Promise<NormalizedIdentity | null> {
    try {
      const response = await this.request<{ data: any }>(\`/users/\${platformId}\`);
      return {
        platformId: response.data.gid,
        platform: SupportedPlatform.ASANA,
        displayName: response.data.name,
        email: response.data.email,
        avatarUrl: response.data.photo?.image_128x128,
      };
    } catch {
      return null;
    }
  }

  async linkIdentities(primary: NormalizedIdentity, secondary: NormalizedIdentity): Promise<string> {
    // Identity linking would be handled by a separate identity resolution service
    // This is a placeholder for the scaffolding
    console.warn("Identity linking requires external identity service integration");
    return \`linked-\${primary.platformId}-\${secondary.platformId}\`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("/workspaces/" + WORKSPACE_GID);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeTask(raw: any): NormalizedTask {
    return {
      id: raw.gid,
      title: raw.name || "",
      body: raw.notes || "",
      status: raw.completed ? TaskStatus.COMPLETED : TaskStatus.OPEN,
      assignees: raw.assignee ? [{
        platformId: raw.assignee.gid,
        platform: SupportedPlatform.ASANA,
        displayName: raw.assignee.name || "Unknown",
      }] : [],
      labels: (raw.labels || []).map((l: any) => l.name || l.gid),
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.modified_at),
      dueDate: raw.due_on ? new Date(raw.due_on) : undefined,
      metadata: { permalink_url: raw.permalink_url },
    };
  }
}
`;
}

/**
 * Generates TypeScript code for a Linear task provider adapter.
 * Implements ITaskProvider using the Linear GraphQL API.
 * 
 * @param config - Platform configuration for Linear
 * @returns Complete TypeScript source code for the adapter
 */
export function generateLinearAdapter(config: PlatformConfig): string {
  return `/**
 * Auto-generated Linear Task Provider Adapter
 * Generated at: ${new Date().toISOString()}
 * Team: ${config.workspaceId}
 */

import { ITaskProvider, NormalizedTask, TaskStatus, NormalizedIdentity, SupportedPlatform, TaskFilter } from "./types";

const LINEAR_GRAPHQL_URL = "${config.baseUrl || "https://api.linear.app/graphql"}";
const TEAM_ID = "${config.workspaceId}";
const REQUEST_TIMEOUT = ${config.timeoutMs || 30000};

export class LinearTaskProvider implements ITaskProvider {
  readonly platform = SupportedPlatform.LINEAR;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(LINEAR_GRAPHQL_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(\`Linear API error: \${response.status}\`);
      }

      const result = await response.json();
      if (result.errors) {
        throw new Error(\`Linear GraphQL errors: \${JSON.stringify(result.errors)}\`);
      }

      return result.data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getTask(taskId: string): Promise<NormalizedTask> {
    const data = await this.graphql<{ issue: any }>(\`
      query GetIssue($id: String!) {
        issue(id: $id) {
          id title description state { name type }
          assignee { id name email avatarUrl }
          labels { nodes { name } }
          createdAt updatedAt dueDate
        }
      }
    \`, { id: taskId });

    return this.normalizeIssue(data.issue);
  }

  async listTasks(filters?: TaskFilter): Promise<NormalizedTask[]> {
    const filterClauses: string[] = [\`team: { id: { eq: "\${TEAM_ID}" } }\`];
    
    if (filters?.status?.length) {
      const types = filters.status.map(s => this.statusToLinearType(s));
      filterClauses.push(\`state: { type: { in: [\${types.map(t => \`"\${t}"\`).join(",")}] } }\`);
    }

    if (filters?.labels?.length) {
      filterClauses.push(\`labels: { name: { in: [\${filters.labels.map(l => \`"\${l}"\`).join(",")}] } }\`);
    }

    const data = await this.graphql<{ issues: { nodes: any[] } }>(\`
      query ListIssues {
        issues(filter: { ${filterClauses.join(", ")} }, first: ${filters?.limit || 50}) {
          nodes {
            id title description state { name type }
            assignee { id name email avatarUrl }
            labels { nodes { name } }
            createdAt updatedAt dueDate
          }
        }
      }
    \`);

    return data.issues.nodes.map(n => this.normalizeIssue(n));
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const stateType = this.statusToLinearType(status);
    // Would need to look up state ID by type first in production
    await this.graphql(\`
      mutation UpdateState($id: String!, $type: String!) {
        issueUpdate(id: $id, input: { stateId: $type }) { success }
      }
    \`, { id: taskId, type: stateType });
  }

  async addComment(taskId: string, body: string): Promise<void> {
    await this.graphql(\`
      mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
      }
    \`, { issueId: taskId, body });
  }

  async assignTask(taskId: string, identities: NormalizedIdentity[]): Promise<void> {
    const linearUser = identities.find(i => i.platform === SupportedPlatform.LINEAR);
    if (linearUser) {
      await this.graphql(\`
        mutation Assign($id: String!, $userId: String!) {
          issueUpdate(id: $id, input: { assigneeId: $userId }) { success }
        }
      \`, { id: taskId, userId: linearUser.platformId });
    }
  }

  async resolveIdentity(platformId: string): Promise<NormalizedIdentity | null> {
    try {
      const data = await this.graphql<{ user: any }>(\`
        query GetUser($id: String!) {
          user(id: $id) { id name email avatarUrl }
        }
      \`, { id: platformId });

      return {
        platformId: data.user.id,
        platform: SupportedPlatform.LINEAR,
        displayName: data.user.name,
        email: data.user.email,
        avatarUrl: data.user.avatarUrl,
      };
    } catch {
      return null;
    }
  }

  async linkIdentities(primary: NormalizedIdentity, secondary: NormalizedIdentity): Promise<string> {
    console.warn("Identity linking requires external identity service integration");
    return \`linked-\${primary.platformId}-\${secondary.platformId}\`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.graphql("{ viewer { id } }");
      return true;
    } catch {
      return false;
    }
  }

  private statusToLinearType(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.OPEN: return "unstarted";
      case TaskStatus.IN_PROGRESS: return "started";
      case TaskStatus.IN_REVIEW: return "in_review";
      case TaskStatus.COMPLETED: return "completed";
      case TaskStatus.CANCELLED: return "canceled";
      case TaskStatus.REOPENED: return "unstarted";
      default: return "unstarted";
    }
  }

  private normalizeIssue(raw: any): NormalizedTask {
    return {
      id: raw.id,
      title: raw.title || "",
      body: raw.description || "",
      status: this.linearTypeToStatus(raw.state?.type),
      assignees: raw.assignee ? [{
        platformId: raw.assignee.id,
        platform: SupportedPlatform.LINEAR,
        displayName: raw.assignee.name || "Unknown",
        email: raw.assignee.email,
        avatarUrl: raw.assignee.avatarUrl,
      }] : [],
      labels: (raw.labels?.nodes || []).map((l: any) => l.name),
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      dueDate: raw.dueDate ? new Date(raw.dueDate) : undefined,
    };
  }

  private linearTypeToStatus(type?: string): TaskStatus {
    switch (type) {
      case "unstarted": return TaskStatus.OPEN;
      case "started": return TaskStatus.IN_PROGRESS;
      case "in_review": return TaskStatus.IN_REVIEW;
      case "completed": return TaskStatus.COMPLETED;
      case "canceled": return TaskStatus.CANCELLED;
      default: return TaskStatus.OPEN;
    }
  }
}
`;
}

/**
 * Generates TypeScript code for a Google Sheets task provider adapter.
 * Uses Google Sheets API v4 with service account authentication.
 * Addresses UX concerns about rendering interactive elements in sheets.
 * 
 * @param config - Platform configuration for Google Sheets
 * @returns Complete TypeScript source code for the adapter
 */
export function generateGoogleSheetsAdapter(config: PlatformConfig): string {
  return `/**
 * Auto-generated Google Sheets Task Provider Adapter
 * Generated at: ${new Date().toISOString()}
 * Spreadsheet: ${config.workspaceId}
 * 
 * NOTE: Google Sheets lacks native interactive UI elements like buttons.
 * This adapter uses checkbox columns for completion status and
 * data validation dropdowns for status fields as UX workarounds.
 */

import { ITaskProvider, NormalizedTask, TaskStatus, NormalizedIdentity, SupportedPlatform, TaskFilter } from "./types";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SPREADSHEET_ID = "${config.workspaceId}";
const TASK_SHEET_NAME = "Tasks";
const IDENTITIES_SHEET_NAME = "Identities";

// Column mapping for the Tasks sheet
const COLUMNS = {
  ID: "A",
  TITLE: "B",
  BODY: "C",
  STATUS: "D",
  ASSIGNEE_EMAIL: "E",
  LABELS: "F",
  CREATED_AT: "G",
  UPDATED_AT: "H",
  DUE_DATE: "I",
  COMPLETED_CHECKBOX: "J", // Checkbox column for UX
} as const;

export class GoogleSheetsTaskProvider implements ITaskProvider {
  readonly platform = SupportedPlatform.GOOGLE_SHEETS;
  private credentials: Record<string, string>;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(credentials: Record<string, string>) {
    this.credentials = credentials;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Service account JWT flow
    const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = Buffer.from(JSON.stringify({
      iss: this.credentials.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");

    // In production, sign with private key using crypto.createSign
    // This is scaffolding - actual implementation needs proper JWT signing
    const signedJwt = \`\${jwtHeader}.\${jwtPayload}.SIGNATURE_PLACEHOLDER\`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedJwt,
      }),
    });

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  private async sheetsRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const url = \`\${SHEETS_API_BASE}/\${SPREADSHEET_ID}\${path}\`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": \`Bearer \${token}\`,
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(\`Sheets API error: \${response.status} \${response.statusText}\`);
    }

    return response.json() as Promise<T>;
  }

  async getTask(taskId: string): Promise<NormalizedTask> {
    const range = \`\${TASK_SHEET_NAME}!A:J\`;
    const data = await this.sheetsRequest<{ values: string[][] }>(\`/values/\${range}\`);
    
    const row = data.values?.find(r => r[0] === taskId);
    if (!row) throw new Error(\`Task \${taskId} not found\`);
    
    return this.rowToTask(row);
  }

  async listTasks(filters?: TaskFilter): Promise<NormalizedTask[]> {
    const range = \`\${TASK_SHEET_NAME}!A:J\`;
    const data = await this.sheetsRequest<{ values: string[][] }>(\`/values/\${range}\`);
    
    let tasks = (data.values || []).slice(1).map(r => this.rowToTask(r)); // Skip header
    
    if (filters?.status?.length) {
      tasks = tasks.filter(t => filters.status!.includes(t.status));
    }
    if (filters?.labels?.length) {
      tasks = tasks.filter(t => t.labels.some(l => filters.labels!.includes(l)));
    }
    if (filters?.limit) {
      tasks = tasks.slice(0, filters.limit);
    }
    
    return tasks;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const completed = status === TaskStatus.COMPLETED;
    const statusValue = this.statusToSheetValue(status);
    
    // Find row index first (would cache in production)
    const range = \`\${TASK_SHEET_NAME}!A:A\`;
    const data = await this.sheetsRequest<{ values: string[][] }>(\`/values/\${range}\`);
    const rowIndex = data.values?.findIndex(r => r[0] === taskId);
    
    if (rowIndex === undefined || rowIndex < 0) {
      throw new Error(\`Task \${taskId} not found\`);
    }

    const sheetRow = rowIndex + 1; // 1-indexed
    await this.sheetsRequest("", {
      method: "PUT",
      body: JSON.stringify({
        range: \`\${TASK_SHEET_NAME}!D\${sheetRow}:J\${sheetRow}\`,
        majorDimension: "ROWS",
        values: [[statusValue, undefined, undefined, undefined, undefined, undefined, completed ? "TRUE" : "FALSE"]],
      }),
    });
  }

  async addComment(taskId: string, body: string): Promise<void> {
    // Google Sheets doesn't have native comments via API in the same way
    // Append to a "Comments" sheet or use notes
    console.warn("Google Sheets comments are limited. Consider appending to a dedicated Comments sheet.");
  }

  async assignTask(taskId: string, identities: NormalizedIdentity[]): Promise<void> {
    const gsUser = identities.find(i => i.platform === SupportedPlatform.GOOGLE_SHEETS || i.email);
    if (gsUser?.email) {
      const range = \`\${TASK_SHEET_NAME}!A:A\`;
      const data = await this.sheetsRequest<{ values: string[][] }>(\`/values/\${range}\`);
      const rowIndex = data.values?.findIndex(r => r[0] === taskId);
      
      if (rowIndex !== undefined && rowIndex >= 0) {
        const sheetRow = rowIndex + 1;
        await this.sheetsRequest("", {
          method: "PUT",
          body: JSON.stringify({
            range: \`\${TASK_SHEET_NAME}!E\${sheetRow}\`,
            values: [[gsUser.email]],
          }),
        });
      }
    }
  }

  async resolveIdentity(platformId: string): Promise<NormalizedIdentity | null> {
    // Look up in Identities sheet
    const range = \`\${IDENTITIES_SHEET_NAME}!A:D\`;
    const data = await this.sheetsRequest<{ values: string[][] }>(\`/values/\${range}\`);
    const row = data.values?.find(r => r[0] === platformId || r[1] === platformId);
    
    if (!row) return null;
    
    return {
      platformId: row[0],
      platform: SupportedPlatform.GOOGLE_SHEETS,
      displayName: row[2] || platformId,
      email: row[1],
    };
  }

  async linkIdentities(primary: NormalizedIdentity, secondary: NormalizedIdentity): Promise<string> {
    // Append to Identities sheet with shared universal ID
    const universalId = \`universal-\${Date.now()}\`;
    await this.sheetsRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          appendCells: {
            sheetId: 1, // Identities sheet
            rows: [{ values: [
              { stringValue: primary.platformId },
              { stringValue: primary.email || "" },
              { stringValue: primary.displayName },
              { stringValue: universalId },
            ]}],
            fields: "*",
          },
        }],
      }),
    });
    return universalId;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.sheetsRequest("");
      return true;
    } catch {
      return false;
    }
  }

  private rowToTask(row: string[]): NormalizedTask {
    return {
      id: row[0] || "",
      title: row[1] || "",
      body: row[2] || "",
      status: this.sheetValueToStatus(row[3]),
      assignees: row[4] ? [{
        platformId: row[4],
        platform: SupportedPlatform.GOOGLE_SHEETS,
        displayName: row[4],
        email: row[4],
      }] : [],
      labels: row[5] ? row[5].split(",").map(l => l.trim()).filter(Boolean) : [],
      createdAt: row[6] ? new Date(row[6]) : new Date(),
      updatedAt: row[7] ? new Date(row[7]) : new Date(),
      dueDate: row[8] ? new Date(row[8]) : undefined,
      metadata: { completedCheckbox: row[9] === "TRUE" },
    };
  }

  private statusToSheetValue(status: TaskStatus): string {
    const map: Record<TaskStatus, string> = {
      [TaskStatus.OPEN]: "Open",
      [TaskStatus.IN_PROGRESS]: "In Progress",
      [TaskStatus.IN_REVIEW]: "In Review",
      [TaskStatus.COMPLETED]: "Done",
      [TaskStatus.CANCELLED]: "Cancelled",
      [TaskStatus.REOPENED]: "Reopened",
    };
    return map[status] || "Open";
  }

  private sheetValueToStatus(value?: string): TaskStatus {
    const map: Record<string, TaskStatus> = {
      "open": TaskStatus.OPEN,
      "in progress": TaskStatus.IN_PROGRESS,
      "in review": TaskStatus.IN_REVIEW,
      "done": TaskStatus.COMPLETED,
      "completed": TaskStatus.COMPLETED,
      "cancelled": TaskStatus.CANCELLED,
      "reopened": TaskStatus.REOPENED,
    };
    return map[(value || "").toLowerCase()] || TaskStatus.OPEN;
  }
}
`;
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

/**
 * Analyzes existing plugin source code to identify GitHub-specific dependencies
 * and generates a migration report with recommended replacements.
 * 
 * @param sourceCode - The TypeScript source code to analyze
 * @returns Migration analysis report
 */
export function analyzeGitHubDependencies(sourceCode: string): MigrationReport {
  const patterns = [
    { regex: /@octokit\/rest/gi, replacement: "ITaskProvider.getTask()", severity: "high" },
    { regex: /@octokit\/graphql/gi, replacement: "ITaskProvider.listTasks()", severity: "high" },
    { regex: /github\.com\/repos\//gi, replacement: "Platform-agnostic task ID", severity: "medium" },
    { regex: /process\.env\.GITHUB_TOKEN/gi, replacement: "PlatformConfig.credentials", severity: "high" },
    { regex: /context\.payload\.(issue|pull_request)/gi, replacement: "NormalizedTask parameter", severity: "high" },
    { regex: /github\.rest\.issues\./gi, replacement: "ITaskProvider methods", severity: "high" },
    { regex: /@actions\/github/gi, replacement: "Abstract webhook handler", severity: "medium" },
  ];

  const findings: MigrationFinding[] = [];
  for (const pattern of patterns) {
    const matches = sourceCode.match(pattern.regex);
    if (matches) {
      findings.push({
        pattern: pattern.regex.source,
        occurrences: matches.length,
        suggestedReplacement: pattern.replacement,
        severity: pattern.severity as "high" | "medium" | "low",
      });
    }
  }

  return {
    totalFindings: findings.reduce((sum, f) => sum + f.occurrences, 0),
    findings,
    estimatedEffortHours: findings.length * 2 + 4,
    recommendedAdapter: determineRecommendedAdapter(sourceCode),
  };
}

interface MigrationFinding {
  pattern: string;
  occurrences: number;
  suggestedReplacement: string;
  severity: "high" | "medium" | "low";
}

interface MigrationReport {
  totalFindings: number;
  findings: MigrationFinding[];
  estimatedEffortHours: number;
  recommendedAdapter: SupportedPlatform;
}

function determineRecommendedAdapter(sourceCode: string): SupportedPlatform {
  // Heuristic: if code references spreadsheets or tabular data, suggest Sheets
  if (/spreadsheet|sheet|csv|table/i.test(sourceCode)) {
    return SupportedPlatform.GOOGLE_SHEETS;
  }
  // Default to Linear for dev-focused workflows
  return SupportedPlatform.LINEAR;
}

/**
 * Generates a factory function that creates the appropriate ITaskProvider
 * based on runtime configuration. Enables dynamic platform switching.
 * 
 * @returns TypeScript source for the provider factory
 */
export function generateProviderFactory(): string {
  return `/**
 * Task Provider Factory
 * Creates platform-specific ITaskProvider instances based on configuration.
 */

import { ITaskProvider, PlatformConfig, SupportedPlatform } from "./types";
import { AsanaTaskProvider } from "./adapters/asana";
import { LinearTaskProvider } from "./adapters/linear";
import { GoogleSheetsTaskProvider } from "./adapters/google-sheets";

export function createTaskProvider(config: PlatformConfig): ITaskProvider {
  switch (config.platform) {
    case SupportedPlatform.ASANA:
      return new AsanaTaskProvider(
        typeof config.credentials === "string" ? config.credentials : ""
      );
    
    case SupportedPlatform.LINEAR:
      return new LinearTaskProvider(
        typeof config.credentials === "string" ? config.credentials : ""
      );
    
    case SupportedPlatform.GOOGLE_SHEETS:
      return new GoogleSheetsTaskProvider(
        typeof config.credentials === "object" ? config.credentials : {}
      );
    
    case SupportedPlatform.GITHUB:
      // Legacy support - wrap Octokit in ITaskProvider
      throw new Error("GitHub adapter should be migrated. Use a decoupled platform instead.");
    
    default:
      throw new Error(\`Unsupported platform: \${config.platform}\`);
  }
}

/**
 * Validates platform configuration before provider creation.
 */
export function validatePlatformConfig(config: PlatformConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.platform) errors.push("Platform is required");
  if (!config.credentials) errors.push("Credentials are required");
  if (!config.workspaceId) errors.push("Workspace ID is required");
  
  if (config.platform === SupportedPlatform.GOOGLE_SHEETS) {
    if (typeof config.credentials !== "object") {
      errors.push("Google Sheets requires service account JSON credentials object");
    }
  } else {
    if (typeof config.credentials !== "string") {
      errors.push(\`\${config.platform} requires a string API token\`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
`;
}

/**
 * Generates identity resolution service scaffolding for cross-platform
 * user mapping. Addresses the requirement to "associate one human's
 * identity across several platforms."
 * 
 * @returns TypeScript source for the identity resolver
 */
export function generateIdentityResolver(): string {
  return `/**
 * Cross-Platform Identity Resolution Service
 * Links user identities across multiple task management platforms.
 */

import { NormalizedIdentity, SupportedPlatform } from "./types";

interface IdentityLink {
  universalId: string;
  platformIdentities: Map<SupportedPlatform, string>;
  primaryEmail?: string;
  verifiedAt: Date;
}

export class IdentityResolver {
  private links: Map<string, IdentityLink> = new Map();
  private emailIndex: Map<string, string> = new Map(); // email -> universalId
  private platformIndex: Map<string, string> = new Map(); // platform:id -> universalId

  /**
   * Register a known identity link between platforms.
   */
  registerLink(universalId: string, identities: NormalizedIdentity[]): void {
    const link: IdentityLink = {
      universalId,
      platformIdentities: new Map(),
      verifiedAt: new Date(),
    };

    for (const identity of identities) {
      link.platformIdentities.set(identity.platform, identity.platformId);
      this.platformIndex.set(\`\${identity.platform}:\${identity.platformId}\`, universalId);
      
      if (identity.email) {
        link.primaryEmail = link.primaryEmail || identity.email;
        this.emailIndex.set(identity.email.toLowerCase(), universalId);
      }
    }

    this.links.set(universalId, link);
  }

  /**
   * Resolve a platform-specific identity to a universal ID.
   */
  resolve(platform: SupportedPlatform, platformId: string): string | null {
    return this.platformIndex.get(\`\${platform}:\${platformId}\`) || null;
  }

  /**
   * Resolve by email address across all platforms.
   */
  resolveByEmail(email: string): string | null {
    return this.emailIndex.get(email.toLowerCase()) || null;
  }

  /**
   * Get all platform identities for a universal ID.
   */
  getIdentities(universalId: string): Map<SupportedPlatform, string> | null {
    return this.links.get(universalId)?.platformIdentities || null;
  }

  /**
   * Merge two universal IDs (e.g., when discovering they're the same person).
   */
  mergeUniversalIds(keepId: string, removeId: string): void {
    const keepLink = this.links.get(keepId);
    const removeLink = this.links.get(removeId);
    
    if (!keepLink || !removeLink) return;

    // Transfer all platform identities
    for (const [platform, pid] of removeLink.platformIdentities) {
      if (!keepLink.platformIdentities.has(platform)) {
        keepLink.platformIdentities.set(platform, pid);
        this.platformIndex.set(\`\${platform}:\${pid}\`, keepId);
      }
    }

    // Update email index
    if (removeLink.primaryEmail) {
      this.emailIndex.set(removeLink.primaryEmail.toLowerCase(), keepId);
    }

    // Remove merged identity
    this.links.delete(removeId);
  }

  /**
   * Export all links for persistence.
   */
  export(): Array<{ universalId: string; platforms: Record<string, string>; email?: string }> {
    return Array.from(this.links.entries()).map(([uid, link]) => ({
      universalId: uid,
      platforms: Object.fromEntries(link.platformIdentities),
      email: link.primaryEmail,
    }));
  }

  /**
   * Import previously exported links.
   */
  import(data: Array<{ universalId: string; platforms: Record<string, string>; email?: string }>): void {
    for (const entry of data) {
      const identities: NormalizedIdentity[] = Object.entries(entry.platforms).map(([p, id]) => ({
        platformId: id,
        platform: p as SupportedPlatform,
        displayName: "",
        email: entry.email,
      }));
      this.registerLink(entry.universalId, identities);
    }
  }
}
`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates that a generated adapter correctly implements ITaskProvider.
 * Performs structural checks on the generated source code.
 * 
 * @param source - Generated TypeScript source code
 * @param platform - Expected platform
 * @returns Validation result with any errors found
 */
export function validateGeneratedAdapter(
  source: string,
  platform: SupportedPlatform
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required method implementations
  const requiredMethods = [
    "getTask",
    "listTasks",
    "updateTaskStatus",
    "addComment",
    "assignTask",
    "resolveIdentity",
    "linkIdentities",
    "healthCheck",
  ];

  for (const method of requiredMethods) {
    if (!source.includes(`async ${method}(`)) {
      errors.push(\`Missing required method: \${method}\`);
    }
  }

  // Check platform declaration
  if (!source.includes(`SupportedPlatform.${platform.toUpperCase()}`)) {
    errors.push(\`Platform mismatch: expected \${platform}\`);
  }

  // Check NormalizedTask usage
  if (!source.includes("NormalizedTask")) {
    errors.push("Does not use NormalizedTask return type");
  }

  // Check error handling
  if (!source.includes("try") && !source.includes("catch")) {
    errors.push("No error handling detected");
  }

  return { valid: errors.length === 0, errors };
}
