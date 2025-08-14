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
    // First check rate limit to see if we're authenticated
    const { data: rateLimit } = await octokit.rest.rateLimit.get();
    console.log(`\nAPI Rate limit: ${rateLimit.rate.remaining}/${rateLimit.rate.limit}`);
    
    // Try to get authenticated user info (works for PATs, fails for GitHub Apps)
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      console.log(`Authenticated as user: ${user.login} (${user.name || 'No name'}) - ID: ${user.id}`);
      console.log(`User type: ${user.type}`);
    } catch (userError: any) {
      if (userError.status === 403 && userError.message?.includes('Resource not accessible by integration')) {
        console.log('Authenticated as GitHub App (not a personal access token)');
        
        // Try to get app info
        try {
          const { data: app } = await octokit.rest.apps.getAuthenticated();
          console.log(`GitHub App: ${app.name} (ID: ${app.id})`);
          console.log(`App permissions:`, app.permissions);
        } catch (appError) {
          console.log('Could not retrieve GitHub App details');
        }
      } else {
        throw userError;
      }
    }
    
    // Check GH CLI authentication (this is what actually deletes issues)
    console.log('\n--- GH CLI Authentication ---');
    console.log('Note: GH_TOKEN environment variable is:', process.env.GH_TOKEN ? 'SET' : 'NOT SET');
    console.log('Note: GITHUB_TOKEN environment variable is:', process.env.GITHUB_TOKEN ? 'SET' : 'NOT SET');
    
    try {
      // Check if gh is authenticated
      execSync('gh auth status 2>&1', { encoding: 'utf8', stdio: 'pipe' });
      
      // Get the authenticated user for gh CLI
      const ghUser = execSync('gh api user --jq .login 2>/dev/null', { encoding: 'utf8', stdio: 'pipe' }).trim();
      const ghUserId = execSync('gh api user --jq .id 2>/dev/null', { encoding: 'utf8', stdio: 'pipe' }).trim();
      const ghUserType = execSync('gh api user --jq .type 2>/dev/null', { encoding: 'utf8', stdio: 'pipe' }).trim();
      console.log(`GH CLI authenticated as: ${ghUser} (ID: ${ghUserId}, Type: ${ghUserType})`);
      
      // Check what permissions this user has
      const ghScopes = execSync('gh api user --jq ".[]" 2>/dev/null || echo "Could not get scopes"', { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      }).trim();
      
      // Check if gh can access the repo
      const repoCheck = execSync(`gh api repos/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME} --jq .permissions 2>/dev/null`, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      }).trim();
      console.log(`GH CLI repository permissions: ${repoCheck}`);
      
      // Check if this user can delete issues (requires write access)
      const canDelete = repoCheck.includes('"push":true') || repoCheck.includes('"admin":true');
      if (!canDelete) {
        console.warn(`⚠️  WARNING: User ${ghUser} may not have permission to delete issues (needs write access)`);
      }
    } catch (error: any) {
      console.error('GH CLI not authenticated or cannot access repository');
      console.error('Error:', error.message || error);
      console.log('\n⚠️  IMPORTANT: The gh CLI must be authenticated with a token that has permission to delete issues.');
      console.log('The API token (GITHUB_TOKEN) is used for reading issues, but gh CLI is used for deletion.');
      console.log('Make sure GH_TOKEN secret is set to a PAT with repo scope from a user with write access.');
      
      if (!isDryRun) {
        throw new Error('Cannot proceed without gh CLI authentication for deletions');
      }
    }
    
  } catch (error: any) {
    console.error('Failed to check authentication:', error.message || error);
    if (!isDryRun && error.message?.includes('Cannot proceed')) {
      throw error;
    }
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
