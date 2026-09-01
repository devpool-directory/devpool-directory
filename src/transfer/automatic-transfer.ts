import {
  buildPermitDescriptor,
  getAssigneeLogin,
  hasTransferLabel,
  invokePermitGeneration,
  markTransferResult,
  parsePriceFromLabels,
  type PermitDescriptor,
  type TransferResult,
} from "../permit-generation";

type LabelLike = string | { name?: string };

export interface DirectoryIssueRef {
  node_id: string;
  number: number;
  html_url: string;
  labels?: LabelLike[];
}

export interface PartnerIssueRef {
  assignee?: { login?: string } | null;
  assignees?: { login?: string }[] | null;
  labels?: LabelLike[];
}

export interface AutomaticTransferParams {
  enabled: boolean;
  dry: boolean;
  desiredState: "open" | "closed";
  desiredReason?: "completed" | "not_planned";
  partner: PartnerIssueRef;
  partnerLabels: string[];
  directoryIssue: DirectoryIssueRef;
  permitUrl: string;
  evmPrivateKey: string;
  owner: string;
  repo: string;
  octokitWrite: { issues: { addLabels: (...args: any[]) => Promise<unknown> } } | null;
}

export type AutomaticTransferDeps = {
  invokePermitGeneration: (
    permitUrl: string,
    permits: PermitDescriptor[],
    dry: boolean
  ) => Promise<TransferResult>;
  markTransferResult: typeof markTransferResult;
};

const defaultDeps: AutomaticTransferDeps = {
  invokePermitGeneration,
  markTransferResult,
};

export type AutomaticTransferOutcome = "skipped" | "success" | "failed";

export async function maybeTriggerAutomaticTransfer(
  params: AutomaticTransferParams,
  deps: AutomaticTransferDeps = defaultDeps
): Promise<AutomaticTransferOutcome> {
  const {
    enabled,
    dry,
    desiredState,
    desiredReason,
    partner,
    partnerLabels,
    directoryIssue,
    permitUrl,
    evmPrivateKey,
    owner,
    repo,
    octokitWrite,
  } = params;

  if (!enabled || dry || desiredState !== "closed" || desiredReason !== "completed" || !octokitWrite) {
    return "skipped";
  }

  const assignee = getAssigneeLogin(partner);
  const priceStr = parsePriceFromLabels(partnerLabels);
  const directoryLabels = (directoryIssue.labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((name): name is string => Boolean(name));

  if (!assignee || !priceStr || hasTransferLabel(directoryLabels)) {
    return "skipped";
  }

  const permit = buildPermitDescriptor({
    username: assignee,
    amount: priceStr,
    evmPrivateKeyEncrypted: evmPrivateKey,
    nodeId: directoryIssue.node_id,
    issueNumber: directoryIssue.number,
    issueUrl: directoryIssue.html_url,
  });

  const result = await deps.invokePermitGeneration(permitUrl, [permit], false);
  await deps.markTransferResult(octokitWrite, owner, repo, directoryIssue.number, result.success);
  return result.success ? "success" : "failed";
}

export interface ProcessCompletedTransferParams {
  directoryIssue: DirectoryIssueRef;
  partner: PartnerIssueRef & { state: string; state_reason?: string | null };
  permitUrl: string;
  evmPrivateKey: string;
  owner: string;
  repo: string;
  dry: boolean;
  force: boolean;
  octokitWrite: { issues: { addLabels: (...args: any[]) => Promise<unknown> } } | null;
}

export async function processCompletedIssueTransfer(
  params: ProcessCompletedTransferParams,
  deps: AutomaticTransferDeps = defaultDeps
): Promise<AutomaticTransferOutcome> {
  const { directoryIssue, partner, permitUrl, evmPrivateKey, owner, repo, dry, force, octokitWrite } = params;

  const directoryLabels = (directoryIssue.labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((name): name is string => Boolean(name));
  if (!force && hasTransferLabel(directoryLabels)) {
    return "skipped";
  }

  if (partner.state !== "closed" || partner.state_reason === "not_planned") {
    return "skipped";
  }

  const assignee = getAssigneeLogin(partner);
  const priceStr = parsePriceFromLabels(partner.labels || []);
  if (!assignee || !priceStr) {
    return "skipped";
  }

  const permit = buildPermitDescriptor({
    username: assignee,
    amount: priceStr,
    evmPrivateKeyEncrypted: evmPrivateKey,
    nodeId: directoryIssue.node_id,
    issueNumber: directoryIssue.number,
    issueUrl: directoryIssue.html_url,
  });

  const result = await deps.invokePermitGeneration(permitUrl, [permit], dry);
  if (!dry && octokitWrite) {
    await deps.markTransferResult(octokitWrite, owner, repo, directoryIssue.number, result.success);
  }

  return result.success ? "success" : "failed";
}
