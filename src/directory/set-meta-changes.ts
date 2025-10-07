import { checkIfForked } from "./check-if-forked";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, octokit } from "./directory";
import { ensureLabelsExist } from "./label-utils";
import { MetadataInterface } from "./update-issue";

export async function setMetaChanges({ issueDelta: metaChanges, partnerIssue, directoryIssue, labelRemoved, originalLabels }: MetadataInterface) {
  const shouldUpdate = metaChanges.title || metaChanges.body || metaChanges.labels;

  if (shouldUpdate) {
    let directoryIssueBody = partnerIssue.html_url;
    const isFork = await checkIfForked();
    if (isFork) {
      directoryIssueBody = partnerIssue.html_url.replace("https://github.com", "https://www.github.com");
    }

    try {
      // Ensure any labels we plan to set actually exist
      const labelsToApply = metaChanges.labels ? labelRemoved : originalLabels;
      try {
        await ensureLabelsExist(labelsToApply);
      } catch (err) {
        console.error("Failed to ensure labels before issue update:", err);
      }

      await octokit.rest.issues.update({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        issue_number: directoryIssue.number,
        title: metaChanges.title ? partnerIssue.title : directoryIssue.title,
        body: directoryIssueBody,
        labels: labelsToApply,
        state: partnerIssue.state === "closed" ? "closed" : "open",
      });
    } catch (err) {
      console.error(err);
    }

    console.log(`Updated metadata for issue:`, {
      partnerIssueUrl: partnerIssue.html_url,
      directoryIssueUrl: directoryIssue.html_url,
      changes: metaChanges,
    });
  }
}
