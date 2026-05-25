import type { PartnerIssue } from "../artifacts/types";

export const UPDATE_REQUEST_MARKER = "<!-- devpool-old-proposal:update-request -->";
export const CLOSE_MARKER = "<!-- devpool-old-proposal:closed -->";

export type OldProposalConfig = {
  staleAfterDays: number;
  responseWindowDays: number;
  adminMention?: string;
  dryRun: boolean;
};

export const DEFAULT_OLD_PROPOSAL_CONFIG: OldProposalConfig = {
  staleAfterDays: 30,
  responseWindowDays: 7,
  dryRun: true,
};

type ProposalComment = {
  id?: number;
  body?: string | null;
  created_at: string;
  user?: {
    login?: string;
    type?: string;
  } | null;
  reactions?: {
    total_count?: number;
  } | null;
};

type OctokitLike = {
  paginate?: (fn: unknown, params: Record<string, unknown>) => Promise<ProposalComment[]>;
  rest: {
    issues: {
      listComments: (...args: any[]) => Promise<{ data: ProposalComment[] }>;
      createComment: (...args: any[]) => Promise<unknown>;
      update: (...args: any[]) => Promise<unknown>;
    };
  };
};

type SkipReason = "priced" | "not-open" | "not-stale" | "waiting" | "responded";

export type OldProposalAction =
  | { type: "request-update"; issue: string; reason: "stale"; dryRun: boolean }
  | { type: "close"; issue: string; reason: "expired"; dryRun: boolean }
  | { type: "skip"; issue: string; reason: SkipReason };

export function buildOldProposalConfig(env: NodeJS.ProcessEnv = process.env): OldProposalConfig {
  return {
    staleAfterDays: parsePositiveInt(env.OLD_PROPOSAL_STALE_AFTER_DAYS, DEFAULT_OLD_PROPOSAL_CONFIG.staleAfterDays),
    responseWindowDays: parsePositiveInt(env.OLD_PROPOSAL_RESPONSE_WINDOW_DAYS, DEFAULT_OLD_PROPOSAL_CONFIG.responseWindowDays),
    adminMention: env.OLD_PROPOSAL_ADMIN_MENTION || undefined,
    dryRun: env.OLD_PROPOSAL_DRY_RUN !== "false",
  };
}

export async function handleOldProposals(input: {
  octokit: OctokitLike;
  proposals: PartnerIssue[];
  config?: OldProposalConfig;
  now?: Date;
}): Promise<OldProposalAction[]> {
  const config = input.config ?? DEFAULT_OLD_PROPOSAL_CONFIG;
  const now = input.now ?? new Date();
  const actions: OldProposalAction[] = [];

  for (const proposal of input.proposals) {
    const issueRef = `${proposal.owner}/${proposal.repo}#${proposal.number}`;
    const precheck = precheckProposal(proposal, now, config);
    if (precheck) {
      actions.push({ type: "skip", issue: issueRef, reason: precheck });
      continue;
    }

    const comments = await listComments(input.octokit, proposal);
    const requestComment = findLatestUpdateRequest(comments);

    if (!requestComment) {
      actions.push({ type: "request-update", issue: issueRef, reason: "stale", dryRun: config.dryRun });
      if (!config.dryRun) {
        await input.octokit.rest.issues.createComment({
          owner: proposal.owner,
          repo: proposal.repo,
          issue_number: proposal.number,
          body: buildUpdateRequestBody(config),
        });
      }
      continue;
    }

    if (hasResponseAfterRequest(comments, requestComment)) {
      actions.push({ type: "skip", issue: issueRef, reason: "responded" });
      continue;
    }

    if (ageInDays(requestComment.created_at, now) < config.responseWindowDays) {
      actions.push({ type: "skip", issue: issueRef, reason: "waiting" });
      continue;
    }

    actions.push({ type: "close", issue: issueRef, reason: "expired", dryRun: config.dryRun });
    if (!config.dryRun) {
      await input.octokit.rest.issues.createComment({
        owner: proposal.owner,
        repo: proposal.repo,
        issue_number: proposal.number,
        body: buildCloseCommentBody(),
      });
      await input.octokit.rest.issues.update({
        owner: proposal.owner,
        repo: proposal.repo,
        issue_number: proposal.number,
        state: "closed",
        state_reason: "not_planned",
      });
    }
  }

  return actions;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function precheckProposal(
  proposal: PartnerIssue,
  now: Date,
  config: OldProposalConfig
): SkipReason | null {
  if (proposal.state !== "open") return "not-open";
  if (proposal.labels.some((label) => /^Price:\s*/.test(label))) return "priced";
  if (ageInDays(proposal.updated_at, now) < config.staleAfterDays) return "not-stale";
  return null;
}

async function listComments(octokit: OctokitLike, proposal: PartnerIssue): Promise<ProposalComment[]> {
  const params = {
    owner: proposal.owner,
    repo: proposal.repo,
    issue_number: proposal.number,
    per_page: 100,
  };

  if (octokit.paginate) {
    return octokit.paginate(octokit.rest.issues.listComments, params);
  }

  const { data } = await octokit.rest.issues.listComments(params);
  return data;
}

function findLatestUpdateRequest(comments: ProposalComment[]): ProposalComment | null {
  return comments
    .filter((comment) => comment.body?.includes(UPDATE_REQUEST_MARKER))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
}

function hasResponseAfterRequest(comments: ProposalComment[], requestComment: ProposalComment): boolean {
  if ((requestComment.reactions?.total_count ?? 0) > 0) return true;

  const requestTime = Date.parse(requestComment.created_at);
  return comments.some((comment) => {
    if (comment.body?.includes(UPDATE_REQUEST_MARKER)) return false;
    if (Date.parse(comment.created_at) <= requestTime) return false;
    return comment.user?.type !== "Bot";
  });
}

function ageInDays(isoDate: string, now: Date): number {
  return (now.getTime() - Date.parse(isoDate)) / 86_400_000;
}

function buildUpdateRequestBody(config: OldProposalConfig): string {
  const admin = config.adminMention ? `${config.adminMention} ` : "";
  return [
    UPDATE_REQUEST_MARKER,
    `${admin}Could you please share an update on whether this proposal is still relevant?`,
    "",
    `If there is no response within ${config.responseWindowDays} days, this may be closed as not planned.`,
  ].join("\n");
}

function buildCloseCommentBody(): string {
  return [
    CLOSE_MARKER,
    "Closing this stale proposal as not planned because there was no response after the update request window.",
  ].join("\n");
}
