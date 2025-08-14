import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue, GitHubLabel, octokit } from "./directory/directory";
import { getRepositoryIssues } from "./directory/get-repository-issues";
import { execSync } from "child_process";

interface IssueGroup {
  nodeId: string;
  issues: GitHubIssue[];
}

export async function deduplicateIssues(isDryRun = false) {
  console.log(`Starting deduplication process for ${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}...`);
  console.log(`Dry run: ${isDryRun}`);

  // Check authentication and permissions
  try {
    // Check who is authenticated with the API token
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(`\nAuthenticated as: ${user.login} (${user.name || 'No name'}) - ID: ${user.id}`);
    console.log(`User type: ${user.type}`);
    
    // Check rate limit to see if authenticated
    const { data: rateLimit } = await octokit.rest.rateLimit.get();
    console.log(`API Rate limit: ${rateLimit.rate.remaining}/${rateLimit.rate.limit}`);
    
    // Check GH CLI authentication
    try {
      const ghAuthStatus = execSync('gh auth status', { encoding: 'utf8', stdio: 'pipe' });
      console.log('\nGH CLI authentication status:', ghAuthStatus);
      
      // Also check who gh is logged in as
      const ghUser = execSync('gh api user --jq .login', { encoding: 'utf8', stdio: 'pipe' }).trim();
      const ghUserId = execSync('gh api user --jq .id', { encoding: 'utf8', stdio: 'pipe' }).trim();
      console.log(`GH CLI authenticated as: ${ghUser} (ID: ${ghUserId})`);
    } catch (error) {
      console.error('GH CLI not authenticated or error checking status:', error);
    }
    
    // Check repository permissions
    const { data: repo } = await octokit.rest.repos.get({
      owner: DEVPOOL_OWNER_NAME,
      repo: DEVPOOL_REPO_NAME
    });
    console.log(`Repository permissions: ${JSON.stringify(repo.permissions)}`);
    
  } catch (error) {
    console.error('Failed to check authentication:', error);
    console.log('\nContinuing anyway...');
  }

  // Fetch all issues
  const allIssues = await getRepositoryIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);
  console.log(`Found ${allIssues.length} total issues`);

  // Group issues by their id: label
  const issueGroups = new Map<string, IssueGroup>();

  for (const issue of allIssues) {
    // Skip closed issues
    if (issue.state === "closed") continue;

    const labels = issue.labels as GitHubLabel[];
    const idLabel = labels.find((label) => label.name.startsWith("id: "));

    if (idLabel) {
      const nodeId = idLabel.name.substring(4); // Remove "id: " prefix

      if (!issueGroups.has(nodeId)) {
        issueGroups.set(nodeId, {
          nodeId,
          issues: [],
        });
      }

      const group = issueGroups.get(nodeId);
      if (group) {
        group.issues.push(issue);
      }
    }
  }

  // Find duplicates
  let totalDuplicates = 0;
  const duplicatesToClose: GitHubIssue[] = [];

  for (const [nodeId, group] of issueGroups) {
    if (group.issues.length > 1) {
      console.log(`\nFound ${group.issues.length} issues with label "id: ${nodeId}":`);

      // Sort by creation date (oldest first)
      group.issues.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Keep the oldest issue, mark others as duplicates
      const [keepIssue, ...duplicates] = group.issues;

      console.log(`  Keeping: #${keepIssue.number} (created: ${keepIssue.created_at}) - ${keepIssue.title}`);

      for (const duplicate of duplicates) {
        console.log(`  Closing: #${duplicate.number} (created: ${duplicate.created_at}) - ${duplicate.title}`);
        duplicatesToClose.push(duplicate);
        totalDuplicates++;
      }
    }
  }

  console.log(`\nTotal duplicates found: ${totalDuplicates}`);

  if (totalDuplicates === 0) {
    console.log("No duplicates found!");
    return { totalDuplicates: 0, closedIssues: 0 };
  }

  if (isDryRun) {
    console.log("\nDry run completed. No issues were closed.");
    return { totalDuplicates, closedIssues: 0 };
  }

  // Delete duplicate issues using gh CLI
  console.log("\nDeleting duplicate issues...");
  let deletedCount = 0;

  for (const issue of duplicatesToClose) {
    try {
      // Delete the issue using gh CLI
      const command = `gh issue delete ${issue.number} --repo ${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME} --yes`;
      console.log(`  Deleting issue #${issue.number}: ${issue.title}`);

      execSync(command, { encoding: "utf8" });

      deletedCount++;
      console.log(`  ✓ Deleted issue #${issue.number}`);

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  ✗ Failed to delete issue #${issue.number}:`, error);
    }
  }

  console.log(`\nDeduplication completed. Deleted ${deletedCount} duplicate issues.`);
  return { totalDuplicates, closedIssues: deletedCount };
}

// Run as standalone script if called directly
if (require.main === module) {
  const isDryRun = process.argv.includes("--dry-run");
  deduplicateIssues(isDryRun)
    .then((result) => {
      console.log("\nSummary:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error during deduplication:", error);
      process.exit(1);
    });
}
