import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubLabel, Labels, octokit } from "./directory";
import { ensureLabelsExist } from "./label-utils";
import { MetadataInterface } from "./update-issue";

export async function setUnavailableLabelToIssue({ directoryIssue, partnerIssue, issueDelta, labelRemoved, originalLabels }: MetadataInterface) {
  const hasUnavailableLabel = directoryIssue.labels.some((label: GitHubLabel) => label.name === Labels.UNAVAILABLE);
  const isProjectAssigned = !!partnerIssue.assignees?.length;
  const isProjectOpen = partnerIssue.state === "open";

  console.log({
    issueNumber: partnerIssue.number,
    state: directoryIssue.state,
    assigned: isProjectAssigned,
    unavailable: hasUnavailableLabel,
  });

  // Apply the "Unavailable" label to the devpool issue if the project issue is open and assigned
  if (isProjectOpen && isProjectAssigned && !hasUnavailableLabel) {
    try {
      const labelsToApply = issueDelta.labels ? labelRemoved.concat(Labels.UNAVAILABLE) : originalLabels.concat(Labels.UNAVAILABLE);
      try {
        await ensureLabelsExist(labelsToApply);
      } catch (err) {
        console.error("Failed to ensure labels before adding Unavailable:", err);
      }
      await octokit.rest.issues.addLabels({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        issue_number: directoryIssue.number,
        labels: labelsToApply,
      });
      console.log(`Added label "${Labels.UNAVAILABLE}" to Issue #${directoryIssue.number}`);
    } catch (err) {
      console.error(`Error adding label to Issue #${directoryIssue.number}:`, err);
    }
  }
  // Remove the "Unavailable" label if the project issue is closed
  else if (partnerIssue.state === "closed" && hasUnavailableLabel) {
    try {
      await octokit.rest.issues.removeLabel({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        issue_number: directoryIssue.number,
        name: Labels.UNAVAILABLE,
      });

      console.log(`Removed label "${Labels.UNAVAILABLE}" from Issue #${directoryIssue.number}`);
    } catch (err) {
      console.error(`Error removing label from Issue #${directoryIssue.number}:`, err);
    }
  }
}
