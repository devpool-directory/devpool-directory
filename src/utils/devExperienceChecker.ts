import type { Octokit } from "@octokit/rest";

export type LanguageBytesMap = Record<string, number>;

export interface ContributorProfile {
  username: string;
  repositoriesCount: number;
  languages: LanguageBytesMap;
  languageRepoCount: Record<string, number>;
  isOrgMember?: boolean;
}

export interface RepositoryRequirements {
  owner: string;
  repo: string;
  languages: LanguageBytesMap;
  primaryLanguage?: string;
  requiredLanguages?: string[];
}

export interface ExperienceCheckConfig {
  /** Minimum bytes of code required in public repositories for a required language (default: 1000) */
  minBytesPerLanguage?: number;
  /** Minimum number of repositories containing the required language (default: 1) */
  minReposPerLanguage?: number;
  /** Optional minimum percentage of contributor's overall code in the language (0 - 100) */
  minLanguagePercentage?: number;
  /** High-stakes languages that require experience if present in the target repo (e.g. Solidity, Cairo) */
  strictLanguages?: string[];
  /** Minimum share of repo bytes for a language to be considered required (default: 0.10 = 10%) */
  repoDominanceThreshold?: number;
  /** Usernames exempt from experience gating */
  whitelistedUsers?: string[];
  /** Whether organization members bypass the experience check (default: true) */
  bypassOrgMembers?: boolean;
}

export interface LanguageMatchResult {
  language: string;
  required: boolean;
  userBytes: number;
  userRepos: number;
  repoBytes: number;
  passed: boolean;
  failureReason?: string;
}

export interface ExperienceCheckResult {
  eligible: boolean;
  username: string;
  score: number;
  bypassed: boolean;
  bypassReason?: string;
  primaryLanguage?: string;
  requiredLanguages: string[];
  languageMatches: Record<string, LanguageMatchResult>;
  reason: string;
  warnings: string[];
}

const DEFAULT_STRICT_LANGUAGES = ["Solidity", "Vyper", "Cairo", "Rust"];

const DEFAULT_CONFIG: Required<ExperienceCheckConfig> = {
  minBytesPerLanguage: 1000,
  minReposPerLanguage: 1,
  minLanguagePercentage: 0,
  strictLanguages: DEFAULT_STRICT_LANGUAGES,
  repoDominanceThreshold: 0.1,
  whitelistedUsers: [],
  bypassOrgMembers: true,
};

/**
 * Derives which languages are mandatory for an issue/repository.
 */
export function determineRequiredLanguages(
  repo: RepositoryRequirements,
  config?: ExperienceCheckConfig
): string[] {
  if (repo.requiredLanguages && repo.requiredLanguages.length > 0) {
    return Array.from(new Set(repo.requiredLanguages));
  }

  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const totalRepoBytes = Object.values(repo.languages).reduce((sum, b) => sum + b, 0);
  const required = new Set<string>();

  // Check strict domain languages (e.g. Solidity) if they exist in repo
  for (const strictLang of resolvedConfig.strictLanguages) {
    const bytes = repo.languages[strictLang];
    if (bytes && bytes > 0) {
      required.add(strictLang);
    }
  }

  // Check dominant languages based on byte fraction threshold
  if (totalRepoBytes > 0) {
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      if (bytes / totalRepoBytes >= resolvedConfig.repoDominanceThreshold) {
        required.add(lang);
      }
    }
  }

  // Fallback to explicit primaryLanguage if available and nothing else was identified
  if (required.size === 0 && repo.primaryLanguage) {
    required.add(repo.primaryLanguage);
  }

  return Array.from(required);
}

/**
 * Evaluates whether a contributor meets developer experience prerequisites to start an issue.
 */
export function checkDevExperience(
  contributor: ContributorProfile,
  repo: RepositoryRequirements,
  config?: ExperienceCheckConfig
): ExperienceCheckResult {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];

  // 1. Whitelist bypass check
  const isWhitelisted = resolvedConfig.whitelistedUsers.some(
    (u) => u.toLowerCase() === contributor.username.toLowerCase()
  );
  if (isWhitelisted) {
    return {
      eligible: true,
      username: contributor.username,
      score: 100,
      bypassed: true,
      bypassReason: `Contributor @${contributor.username} is explicitly whitelisted.`,
      primaryLanguage: repo.primaryLanguage,
      requiredLanguages: [],
      languageMatches: {},
      reason: `User @${contributor.username} bypassed developer experience verification (whitelisted contributor).`,
      warnings,
    };
  }

  // 2. Org member bypass check
  if (resolvedConfig.bypassOrgMembers && contributor.isOrgMember) {
    return {
      eligible: true,
      username: contributor.username,
      score: 100,
      bypassed: true,
      bypassReason: `Contributor @${contributor.username} is an organization member.`,
      primaryLanguage: repo.primaryLanguage,
      requiredLanguages: [],
      languageMatches: {},
      reason: `User @${contributor.username} bypassed developer experience verification (organization member).`,
      warnings,
    };
  }

  // 3. Determine required languages
  const requiredLanguages = determineRequiredLanguages(repo, resolvedConfig);

  // If no language requirements (e.g. non-code / empty repo), pass automatically
  if (requiredLanguages.length === 0) {
    return {
      eligible: true,
      username: contributor.username,
      score: 100,
      bypassed: false,
      primaryLanguage: repo.primaryLanguage,
      requiredLanguages: [],
      languageMatches: {},
      reason: `No specific programming language experience is mandated for this repository.`,
      warnings,
    };
  }

  const languageMatches: Record<string, LanguageMatchResult> = {};
  let totalUserBytesAllLangs = Object.values(contributor.languages).reduce((a, b) => a + b, 0);
  let passedCount = 0;
  const failureReasons: string[] = [];
  const successDetails: string[] = [];

  for (const lang of requiredLanguages) {
    const userBytes = contributor.languages[lang] ?? 0;
    const userRepos = contributor.languageRepoCount[lang] ?? 0;
    const repoBytes = repo.languages[lang] ?? 0;

    let passed = true;
    const failureParts: string[] = [];

    if (userRepos < resolvedConfig.minReposPerLanguage) {
      passed = false;
      failureParts.push(
        `repositories with ${lang}: ${userRepos} < ${resolvedConfig.minReposPerLanguage}`
      );
    }

    if (userBytes < resolvedConfig.minBytesPerLanguage) {
      passed = false;
      failureParts.push(
        `code volume for ${lang}: ${userBytes.toLocaleString()} bytes < ${resolvedConfig.minBytesPerLanguage.toLocaleString()} bytes`
      );
    }

    if (resolvedConfig.minLanguagePercentage > 0 && totalUserBytesAllLangs > 0) {
      const userPct = (userBytes / totalUserBytesAllLangs) * 100;
      if (userPct < resolvedConfig.minLanguagePercentage) {
        passed = false;
        failureParts.push(
          `language proportion: ${userPct.toFixed(1)}% < ${resolvedConfig.minLanguagePercentage}%`
        );
      }
    }

    if (passed) {
      passedCount += 1;
      successDetails.push(`${lang} (${userRepos} repos, ${userBytes.toLocaleString()} bytes)`);
    } else {
      failureReasons.push(`${lang} (${failureParts.join("; ")})`);
    }

    languageMatches[lang] = {
      language: lang,
      required: true,
      userBytes,
      userRepos,
      repoBytes,
      passed,
      failureReason: failureParts.length > 0 ? failureParts.join(", ") : undefined,
    };
  }

  const score = Math.round((passedCount / requiredLanguages.length) * 100);
  const eligible = passedCount === requiredLanguages.length;

  let reason = "";
  if (eligible) {
    reason = `Developer experience verification passed for @${contributor.username}. Verified background in: ${successDetails.join(", ")}.`;
  } else {
    reason = `Developer experience verification failed for @${contributor.username}. Insufficient track record in required technologies: ${failureReasons.join(" | ")}.`;
  }

  return {
    eligible,
    username: contributor.username,
    score,
    bypassed: false,
    primaryLanguage: repo.primaryLanguage,
    requiredLanguages,
    languageMatches,
    reason,
    warnings,
  };
}

/**
 * Formats a GitHub comment string summarizing the experience verification decision.
 */
export function formatEligibilityComment(result: ExperienceCheckResult): string {
  if (result.bypassed) {
    return `> [!NOTE]\n> **Developer Experience:** @${result.username} is exempt from experience verification (${result.bypassReason ?? "Authorized"}).`;
  }

  if (result.eligible) {
    const list = Object.values(result.languageMatches)
      .map(
        (m) =>
          `- **${m.language}**: Passed (${m.userRepos} repos, ${m.userBytes.toLocaleString()} bytes)`
      )
      .join("\n");
    return `> [!TIP]\n> **Developer Experience Verified:** @${result.username} meets the experience prerequisites (Score: ${result.score}/100).\n\n${list}`;
  }

  const failureList = Object.values(result.languageMatches)
    .filter((m) => !m.passed)
    .map((m) => `- **${m.language}**: Ineligible — ${m.failureReason}`)
    .join("\n");

  return `> [!WARNING]\n> **Experience Check Failed:** @${result.username} does not meet the developer experience requirements to start this issue.\n\n${failureList}\n\nPlease gain relevant experience or submit smaller contributions before attempting tasks requiring this stack.`;
}

/**
 * Fetches language breakdown for a repository via GitHub REST API.
 */
export async function fetchRepositoryLanguages(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<LanguageBytesMap> {
  const resp = await octokit.rest.repos.listLanguages({ owner, repo });
  return (resp.data || {}) as LanguageBytesMap;
}

/**
 * Aggregates public repository language statistics for a contributor.
 */
export async function fetchContributorProfile(
  octokit: Octokit,
  username: string,
  options?: { maxRepos?: number; orgToCheck?: string }
): Promise<ContributorProfile> {
  const maxRepos = options?.maxRepos ?? 30;
  const languages: LanguageBytesMap = {};
  const languageRepoCount: Record<string, number> = {};

  let isOrgMember = false;
  if (options?.orgToCheck) {
    try {
      const membership = await octokit.rest.orgs.checkMembershipForUser({
        org: options.orgToCheck,
        username,
      });
      isOrgMember = (membership.status as number) === 204;
    } catch {
      isOrgMember = false;
    }
  }

  try {
    const reposResp = await octokit.rest.repos.listForUser({
      username,
      per_page: Math.min(maxRepos, 100),
      sort: "updated",
      type: "owner",
    });

    const userRepos = reposResp.data || [];
    for (const r of userRepos) {
      if (r.language) {
        languageRepoCount[r.language] = (languageRepoCount[r.language] || 0) + 1;
        // GitHub user repo list provides primary language; size is in KB
        const sizeBytes = (r.size || 0) * 1024;
        languages[r.language] = (languages[r.language] || 0) + sizeBytes;
      }
    }

    return {
      username,
      repositoriesCount: userRepos.length,
      languages,
      languageRepoCount,
      isOrgMember,
    };
  } catch (err) {
    return {
      username,
      repositoriesCount: 0,
      languages: {},
      languageRepoCount: {},
      isOrgMember,
    };
  }
}

/**
 * End-to-end evaluation helper for issue start eligibility.
 */
export async function evaluateStartEligibility(
  octokit: Octokit,
  params: {
    username: string;
    owner: string;
    repo: string;
    issueNumber?: number;
    config?: ExperienceCheckConfig;
  }
): Promise<ExperienceCheckResult> {
  const [repoLangs, contributor] = await Promise.all([
    fetchRepositoryLanguages(octokit, params.owner, params.repo).catch(() => ({})),
    fetchContributorProfile(octokit, params.username, {
      maxRepos: 30,
      orgToCheck: params.owner,
    }),
  ]);

  const repoReq: RepositoryRequirements = {
    owner: params.owner,
    repo: params.repo,
    languages: repoLangs,
  };

  return checkDevExperience(contributor, repoReq, params.config);
}
