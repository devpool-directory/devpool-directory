/**
 * Check dev experience on starting an issue (Issue #5027)
 * 
 * Validates that a collaborator has relevant prior experience before allowing
 * them to /start on high-complexity issues (e.g., Solidity, Ethereum).
 * 
 * Addresses: devpool-directory#5027 / ubiquity-os/plugins-wishlist#26
 */

import { Octokit } from "octokit";

export interface ExperienceCheckResult {
  username: string;
  eligible: boolean;
  confidence: number; // 0.0 - 1.0
  matched_repos: string[];
  matched_languages: string[];
  reason: string;
}

export interface RequiredExperience {
  languages?: string[];      // e.g., ["solidity", "typescript"]
  topics?: string[];         // e.g., ["ethereum", "defi", "smart-contracts"]
  min_repo_count?: number;   // minimum public repos
  min_followers?: number;    // minimum followers as proxy for reputation
}

// Default requirements for high-risk Solidity/Ethereum tasks
const DEFAULT_SOLIDITY_REQUIREMENTS: RequiredExperience = {
  languages: ["solidity"],
  topics: ["ethereum", "smart-contracts", "defi", "evm"],
  min_repo_count: 3,
  min_followers: 5,
};

/**
 * Analyze a user's GitHub profile for relevant experience signals.
 */
export async function checkDeveloperExperience(
  octokit: Octokit,
  username: string,
  requirements: RequiredExperience = DEFAULT_SOLIDITY_REQUIREMENTS
): Promise<ExperienceCheckResult> {
  const result: ExperienceCheckResult = {
    username,
    eligible: false,
    confidence: 0.0,
    matched_repos: [],
    matched_languages: [],
    reason: "",
  };

  try {
    // Fetch user profile
    const { data: user } = await octokit.rest.users.getByUsername({ username });
    
    // Check follower threshold
    if (requirements.min_followers && (user.followers || 0) < requirements.min_followers) {
      result.reason = `Insufficient followers (${user.followers}/${requirements.min_followers})`;
      return result;
    }

    // Fetch user's repositories
    const { data: repos } = await octokit.rest.repos.listForUser({
      username,
      per_page: 100,
      sort: "updated",
    });

    if (requirements.min_repo_count && repos.length < requirements.min_repo_count) {
      result.reason = `Insufficient public repos (${repos.length}/${requirements.min_repo_count})`;
      return result;
    }

    // Analyze repos for language and topic matches
    const langMatches = new Set<string>();
    const repoMatches: string[] = [];
    let score = 0;

    const reqLangs = (requirements.languages || []).map(l => l.toLowerCase());
    const reqTopics = (requirements.topics || []).map(t => t.toLowerCase());

    for (const repo of repos.slice(0, 50)) { // Cap at 50 for rate limit safety
      const repoLang = (repo.language || "").toLowerCase();
      const repoTopics = (repo.topics || []).map(t => t.toLowerCase());
      const repoDesc = (repo.description || "").toLowerCase();

      // Language match
      if (reqLangs.some(rl => repoLang.includes(rl))) {
        langMatches.add(repoLang);
        score += 0.3;
      }

      // Topic/description match
      const topicMatch = reqTopics.some(rt => 
        repoTopics.some(t => t.includes(rt)) || repoDesc.includes(rt)
      );
      if (topicMatch) {
        repoMatches.push(repo.full_name);
        score += 0.2;
      }
    }

    result.matched_languages = [...langMatches];
    result.matched_repos = repoMatches.slice(0, 10);

    // Normalize confidence
    result.confidence = Math.min(1.0, score);
    result.eligible = result.confidence >= 0.4;
    result.reason = result.eligible
      ? `Found ${result.matched_languages.length} matching languages across ${result.matched_repos.length} relevant repos`
      : `No sufficient evidence of required experience (confidence: ${result.confidence.toFixed(2)})`;

  } catch (error: any) {
    result.reason = `Error checking profile: ${error.message}`;
  }

  return result;
}

/**
 * Format experience check result for display.
 */
export function formatExperienceCheck(result: ExperienceCheckResult): string {
  const status = result.eligible ? "✅ ELIGIBLE" : "❌ NOT ELIGIBLE";
  const lines = [
    `\n${"=".repeat(60)}`,
    `DEV EXPERIENCE CHECK: @${result.username}`,
    `${"=".repeat(60)}`,
    `Status: ${status}`,
    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
    `Reason: ${result.reason}`,
  ];

  if (result.matched_languages.length > 0) {
    lines.push(`Matched Languages: ${result.matched_languages.join(", ")}`);
  }
  if (result.matched_repos.length > 0) {
    lines.push(`Relevant Repos:`);
    for (const repo of result.matched_repos.slice(0, 5)) {
      lines.push(`  • ${repo}`);
    }
  }

  lines.push(`${"=".repeat(60)}\n`);
  return lines.join("\n");
}
