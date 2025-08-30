import { checkIfForked } from "./check-if-forked";
import { GitHubIssue, GitHubIssueWithStateReason, GitHubLabel, Labels, octokit, DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME } from "./directory";
import { getDirectoryIssueLabelsFromPartnerIssue } from "./get-directory-issue-labels";
import { setMetaChanges } from "./set-meta-changes";
import { setUnavailableLabelToIssue } from "./set-unavailable-label-to-issue";

export async function updateDirectoryIssue({ directoryIssue, partnerIssue }: { directoryIssue: GitHubIssue; partnerIssue: GitHubIssue }) {
  // Cast to extended interface to access state_reason
  const partnerIssueWithReason = partnerIssue as GitHubIssueWithStateReason;
  
  // If partner issue is closed as unplanned, close the directory issue
  if (partnerIssueWithReason.state === "closed" && partnerIssueWithReason.state_reason === "not_planned" && directoryIssue.state === "open") {
    try {
      await octokit.rest.issues.update({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        issue_number: directoryIssue.number,
        state: "closed",
        state_reason: "not_planned",
      });
      console.log(`Closed directory issue #${directoryIssue.number} as unplanned (partner issue was closed as unplanned)`);
      return;
    } catch (err) {
      console.error(`Error closing directory issue #${directoryIssue.number}:`, err);
    }
  }
  
  // remove the "unavailable" label as this adds it and statistics rely on it
  const labelRemoved = getDirectoryIssueLabelsFromPartnerIssue(partnerIssue).filter((label) => label != Labels.UNAVAILABLE);
  const originalLabels = partnerIssue.labels.map((label) => (label as GitHubLabel).name);

  const isFork = await checkIfForked();
  let partnerIssueUrl = partnerIssue.html_url;
  if (isFork) {
    partnerIssueUrl = partnerIssue.html_url.replace("https://github.com", "https://www.github.com");
  }

  const issueDelta: IssueDelta = {
    title: directoryIssue.title !== partnerIssue.title,
    body: directoryIssue.body !== partnerIssueUrl,
    labels: !areEqual(originalLabels, labelRemoved),
  };

  const metadata: MetadataInterface = {
    issueDelta,
    partnerIssue,
    directoryIssue,
    labelRemoved,
    originalLabels,
  };
  await setMetaChanges(metadata);
  await setUnavailableLabelToIssue(metadata);
}

function areEqual(a: string[], b: string[]) {
  return a.sort().join(",") === b.sort().join(",");
}

export interface MetadataInterface {
  issueDelta: IssueDelta;
  partnerIssue: GitHubIssue;
  directoryIssue: GitHubIssue;
  labelRemoved: string[];
  originalLabels: string[];
}

interface IssueDelta {
  title: boolean;
  body: boolean;
  labels: boolean;
}
