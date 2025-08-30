import { commitTwitterMap } from "../git";
import { TwitterMap } from "../twitter/initialize-twitter-map";
import twitter from "../twitter/twitter";
import { checkIfForked } from "./check-if-forked";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue, GitHubLabel, Labels, octokit } from "./directory";
import { getDirectoryIssueLabelsFromPartnerIssue } from "./get-directory-issue-labels";
import { getSocialMediaText } from "./get-social-media-text";

interface GitHubError extends Error {
  status?: number;
  response?: {
    data?: {
      message?: string;
      errors?: Array<{ code?: string }>;
    };
  };
}

export async function newDirectoryIssue(partnerIssue: GitHubIssue, projectUrl: string, twitterMap: TwitterMap) {
  if (partnerIssue.state === "closed") return; // if issue is "closed" then skip it, no need to copy/paste already "closed" issues

  const hasPriceLabel = (partnerIssue.labels as GitHubLabel[]).some((label) => label.name.includes(Labels.PRICE)); // check if the issue is the same type as it should be

  let body;
  if (await checkIfForked()) {
    body = partnerIssue.html_url.replace("https://github.com", "https://www.github.com");
  } else {
    body = partnerIssue.html_url;
  }

  // create a new `id: XXX` label
  // NOTICE: this is a workaround until https://github.com/octokit/rest.js/issues/479 is solved
  let labelAlreadyExists = false;
  try {
    await octokit.rest.issues.createLabel({
      owner: DEVPOOL_OWNER_NAME,
      repo: DEVPOOL_REPO_NAME,
      name: `id: ${partnerIssue.node_id}`,
    });
  } catch (err) {
    // If label already exists, that's fine
    const error = err as GitHubError;
    if (error.status === 422 && error.response?.data?.errors?.[0]?.code === "already_exists") {
      console.log(`Label 'id: ${partnerIssue.node_id}' already exists`);
      labelAlreadyExists = true;
    } else {
      // For any other error, we should not proceed with issue creation
      console.error("Failed to create a label:", err);
      throw new Error(`Failed to create label 'id: ${partnerIssue.node_id}': ${error.message}`);
    }
  }

  // If label already exists, check if an issue with this label already exists
  if (labelAlreadyExists) {
    try {
      const { data: existingIssues } = await octokit.rest.issues.listForRepo({
        owner: DEVPOOL_OWNER_NAME,
        repo: DEVPOOL_REPO_NAME,
        labels: `id: ${partnerIssue.node_id}`,
        state: "all",
        per_page: 1,  // Only need to check if any issue exists
      });

      if (existingIssues.length > 0) {
        console.log(`Issue with label 'id: ${partnerIssue.node_id}' already exists: ${existingIssues[0].html_url}`);
        console.log(`Skipping duplicate creation for partner issue: ${partnerIssue.html_url}`);
        return;
      }
    } catch (err) {
      console.error("Failed to check for existing issues:", err);
      throw new Error("Failed to check for existing issues, aborting to prevent potential duplicate creation.");
    }
  }

  // create a new issue
  try {
    const createdIssue = await octokit.rest.issues.create({
      owner: DEVPOOL_OWNER_NAME,
      repo: DEVPOOL_REPO_NAME,
      title: partnerIssue.title,
      body,
      labels: getDirectoryIssueLabelsFromPartnerIssue(partnerIssue),
    });
    console.log(`Created: ${createdIssue.data.html_url} (${partnerIssue.html_url})`);

    if (!createdIssue) {
      console.log("No new issue to tweet about");
      return;
    }

    // post to social media (only if it's not a proposal)
    if (hasPriceLabel) {
      try {
        const socialMediaText = getSocialMediaText(createdIssue.data);
        const tweetId = await twitter.postTweet(socialMediaText);

        if (tweetId && tweetId.id) {
          twitterMap[createdIssue.data.node_id] = tweetId.id;
          await commitTwitterMap(twitterMap);
        }
      } catch (err) {
        console.error("Failed to post tweet: ", err);
      }
    }
  } catch (err) {
    // Check if the error is because the issue already exists (based on title or other constraints)
    const error = err as GitHubError;
    if (error.status === 422) {
      console.warn("Issue creation failed with validation error - possible duplicate:", {
        partnerIssueTitle: partnerIssue.title,
        partnerIssueUrl: partnerIssue.html_url,
        projectUrl,
        error: error.response?.data?.message || error.message,
      });
    } else {
      console.error("Failed to create new issue:", {
        partnerIssueTitle: partnerIssue.title,
        partnerIssueUrl: partnerIssue.html_url,
        projectUrl,
        error: err,
      });
    }
    return;
  }
}
