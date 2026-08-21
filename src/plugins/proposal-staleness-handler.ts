/**
 * Handling old proposals (Issue #5058)
 * 
 * Mechanism to automatically manage stale proposals:
 * 1. Identifies open issues without Price label (proposals) older than threshold
 * 2. Posts a comment asking for update/status
 * 3. Closes proposal if no response within grace period
 * 
 * Addresses: devpool-directory#5058 / ubiquity-os/plugins-wishlist#70
 */

import { Octokit } from "octokit";

export interface ProposalStalenessConfig {
  /** Days after which a proposal is considered stale and needs an update request */
  staleAfterDays: number;
  /** Days to wait for response after posting update request before closing */
  closeAfterDays: number;
  /** Label that identifies priced issues (not proposals) */
  priceLabelPrefix: string;
  /** Bot username to track our own comments */
  botUsername: string;
}

const DEFAULT_CONFIG: ProposalStalenessConfig = {
  staleAfterDays: 30,
  closeAfterDays: 14,
  priceLabelPrefix: "Price:",
  botUsername: "ubiquity-os[bot]",
};

export interface StaleProposal {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  created_at: string;
  days_old: number;
  last_comment_at: string | null;
  has_update_request: boolean;
  action: "request_update" | "close" | "skip";
}

/**
 * Check if an issue is a proposal (no Price label).
 */
function isProposal(labels: Array<{ name: string }>, pricePrefix: string): boolean {
  return !labels.some(l => l.name.startsWith(pricePrefix));
}

/**
 * Calculate days between two dates.
 */
function daysBetween(from: string | Date, to: Date = new Date()): number {
  const fromDate = typeof from === "string" ? new Date(from) : from;
  const diffMs = to.getTime() - fromDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Find all stale proposals in a repository.
 */
export async function findStaleProposals(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: ProposalStalenessConfig = DEFAULT_CONFIG
): Promise<StaleProposal[]> {
  const results: StaleProposal[] = [];
  const now = new Date();

  try {
    // Fetch all open issues (paginated)
    const iterator = octokit.paginate.iterator(
      octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        state: "open",
        per_page: 100,
        sort: "created",
        direction: "asc", // oldest first
      }
    );

    for await (const response of iterator) {
      for (const issue of response.data) {
        // Skip PRs
        if (issue.pull_request) continue;

        // Skip if it has a Price label (not a proposal)
        const labels = issue.labels as Array<{ name: string }>;
        if (!isProposal(labels, config.priceLabelPrefix)) continue;

        const daysOld = daysBetween(issue.created_at, now);

        // Not yet stale
        if (daysOld < config.staleAfterDays) continue;

        // Check for existing update request comment from bot
        let hasUpdateRequest = false;
        let lastCommentAt: string | null = null;

        try {
          const comments = await octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: issue.number,
            per_page: 100,
            sort: "created",
            direction: "desc",
          });

          for (const comment of comments.data) {
            const isBot = comment.user?.login === config.botUsername ||
                          comment.user?.type === "Bot";
            
            if (isBot && comment.body?.includes("📋 **Proposal Status Update Request**")) {
              hasUpdateRequest = true;
              lastCommentAt = comment.created_at;
              break;
            }
          }

          // Also check if any human commented after the bot's request
          if (hasUpdateRequest && lastCommentAt) {
            const botCommentDate = new Date(lastCommentAt);
            for (const comment of comments.data) {
              const commentDate = new Date(comment.created_at);
              const isHuman = comment.user?.type !== "Bot" && 
                              comment.user?.login !== config.botUsername;
              if (isHuman && commentDate > botCommentDate) {
                // Human responded, skip this proposal
                hasUpdateRequest = false;
                break;
              }
            }
          }
        } catch (e) {
          // If we can't fetch comments, be conservative and skip
          continue;
        }

        let action: StaleProposal["action"] = "skip";

        if (!hasUpdateRequest) {
          // First time marking as stale: request update
          action = "request_update";
        } else if (lastCommentAt) {
          // Already requested update, check if grace period expired
          const daysSinceRequest = daysBetween(lastCommentAt, now);
          if (daysSinceRequest >= config.closeAfterDays) {
            action = "close";
          }
        }

        if (action !== "skip") {
          results.push({
            owner,
            repo,
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
            created_at: issue.created_at,
            days_old: daysOld,
            last_comment_at: lastCommentAt,
            has_update_request: hasUpdateRequest,
            action,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan proposals for ${owner}/${repo}:`, error);
  }

  return results;
}

/**
 * Post an update request comment on a stale proposal.
 */
export async function postUpdateRequest(
  octokit: Octokit,
  proposal: StaleProposal
): Promise<boolean> {
  const body = `📋 **Proposal Status Update Request**

This proposal has been open for **${proposal.days_old} days** without activity.

To keep our backlog healthy, please confirm if this proposal is still relevant:
- ✅ **Still needed?** Reply with a brief status update or timeline.
- ❌ **No longer needed?** This issue will be auto-closed in 14 days if no response is received.

If you're still planning to work on this, consider requesting assignment via \`/start\`.

---
*Automated staleness check — reply to prevent auto-close.*`;

  try {
    await octokit.rest.issues.createComment({
      owner: proposal.owner,
      repo: proposal.repo,
      issue_number: proposal.number,
      body,
    });
    console.log(`✅ Posted update request on ${proposal.owner}/${proposal.repo}#${proposal.number}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to post update request on ${proposal.owner}/${proposal.repo}#${proposal.number}:`, error);
    return false;
  }
}

/**
 * Close a stale proposal that received no response.
 */
export async function closeStaleProposal(
  octokit: Octokit,
  proposal: StaleProposal
): Promise<boolean> {
  const body = `🔒 **Auto-closed: No response to staleness check**

This proposal was flagged as stale ${proposal.days_old} days after creation and received no update request response within the grace period.

If this proposal is still relevant, please reopen it with a status update.

---
*Closed by automated proposal staleness handler.*`;

  try {
    await octokit.rest.issues.createComment({
      owner: proposal.owner,
      repo: proposal.repo,
      issue_number: proposal.number,
      body,
    });

    await octokit.rest.issues.update({
      owner: proposal.owner,
      repo: proposal.repo,
      issue_number: proposal.number,
      state: "closed",
      state_reason: "not_planned",
    });

    console.log(`🔒 Closed stale proposal ${proposal.owner}/${proposal.repo}#${proposal.number}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to close ${proposal.owner}/${proposal.repo}#${proposal.number}:`, error);
    return false;
  }
}

/**
 * Run the full staleness handling cycle for a repository.
 */
export async function handleStaleProposals(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: ProposalStalenessConfig = DEFAULT_CONFIG
): Promise<{ requested: number; closed: number; skipped: number }> {
  const proposals = await findStaleProposals(octokit, owner, repo, config);
  
  let requested = 0;
  let closed = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    if (proposal.action === "request_update") {
      if (await postUpdateRequest(octokit, proposal)) {
        requested++;
      } else {
        skipped++;
      }
    } else if (proposal.action === "close") {
      if (await closeStaleProposal(octokit, proposal)) {
        closed++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
    
    // Rate limit courtesy
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Staleness Report for ${owner}/${repo}:`);
  console.log(`   Update requests posted: ${requested}`);
  console.log(`   Proposals closed: ${closed}`);
  console.log(`   Skipped: ${skipped}`);

  return { requested, closed, skipped };
}
