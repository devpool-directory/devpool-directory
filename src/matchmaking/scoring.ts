import type { PartnerIssue, UserProfile, MatchResult } from "./types";

const SKILL_KEYWORDS = [
  // Languages
  "typescript", "javascript", "rust", "go", "python", "solidity", "vyper",
  "java", "c++", "c#", "ruby", "php", "swift", "kotlin", "scala",
  "html", "css", "scss", "sql", "graphql", "assembly",
  // Frameworks
  "react", "vue", "angular", "svelte", "nextjs", "nuxt", "express",
  "fastify", "nestjs", "django", "flask", "rails", "laravel",
  "ethers", "hardhat", "foundry", "wagmi", "viem", "web3js",
  "@ubiquity-os/plugin-template", "ubiquity-os", "ubq-os",
  // Tools
  "github", "git", "docker", "kubernetes", "aws", "gcp", "azure",
  "circleci", "github-actions", "gitlab-ci", "jenkins",
  "postgresql", "mysql", "redis", "mongodb", "elasticsearch",
  "terraform", "ansible", "prometheus", "grafana",
  // Concepts
  "smart-contract", "defi", "dao", "nft", "token", "staking",
  "api", "rest", "websocket", "grpc", "microservices",
  "ci/cd", "devops", "testing", "security", "audit",
  "machine-learning", "ai", "llm", "nlp",
  // Practices
  "refactoring", "clean-code", "tdd", "code-review", "agile",
];

/**
 * Tokenize text into lowercase words, stripping punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Extract price from a Price: label, returns amount in USD or null.
 */
export function extractPrice(labels: string[]): number | null {
  for (const label of labels) {
    const m = label.match(/price:\s*\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:usd)?/i);
    if (m) return parseFloat(m[1].replace(",", ""));
    const m2 = label.match(/price:\s*([\d,]+(?:\.\d{2})?)\s*(?:usd)?/i);
    if (m2) return parseFloat(m2[1].replace(",", ""));
  }
  return null;
}

/**
 * Extract time estimate from Time: label.
 */
export function extractTime(labels: string[]): string | null {
  for (const label of labels) {
    if (label.toLowerCase().startsWith("time:")) {
      return label.slice(5).trim();
    }
  }
  return null;
}

/**
 * Build a skill keyword frequency map from a list of issues.
 */
export function buildSkillProfile(issues: PartnerIssue[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const issue of issues) {
    const combined =
      issue.title +
      " " +
      (issue.body || "") +
      " " +
      issue.labels.join(" ");
    const tokens = tokenize(combined);

    for (const keyword of SKILL_KEYWORDS) {
      const count = tokens.filter((t) => t.includes(keyword)).length;
      if (count > 0) {
        freq.set(keyword, (freq.get(keyword) || 0) + count);
      }
    }

    // Also count repo + owner as skills
    freq.set(issue.owner.toLowerCase(), (freq.get(issue.owner.toLowerCase()) || 0) + 1);
    freq.set(`${issue.owner}/${issue.repo}`.toLowerCase(), (freq.get(`${issue.owner}/${issue.repo}`.toLowerCase()) || 0) + 1);
  }
  return freq;
}

/**
 * Score a task against a user's skill profile.
 * Returns a score 0-100+.
 */
export function scoreTask(task: PartnerIssue, profile: UserProfile): { score: number; matchedSkills: string[] } {
  const combined = task.title + " " + (task.body || "") + " " + task.labels.join(" ");
  const tokens = tokenize(combined);
  const matchedSkills: string[] = [];
  let score = 0;

  for (const [keyword, weight] of profile.skillKeywords) {
    if (tokens.some((t) => t.includes(keyword))) {
      score += weight;
      matchedSkills.push(keyword);
    }
  }

  // Boost for price (higher bounties = more trust signal)
  const price = extractPrice(task.labels);
  if (price !== null) {
    score += Math.log10(price + 1) * 5;
  }

  // Small boost for Time label presence (specification quality signal)
  if (extractTime(task.labels)) {
    score += 3;
  }

  // Small boost for assigned but not closed (ongoing engagement)
  if (task.assignees.length > 0) {
    score -= 5; // Penalize assigned tasks slightly
  }

  return { score, matchedSkills };
}

/**
 * Sort tasks by match score, returning highest first.
 * Streams results by emitting matches in descending score order.
 */
export function rankTasks(
  tasks: PartnerIssue[],
  profile: UserProfile,
  mirrorState: Record<string, { directory_issue_url?: string }>
): MatchResult[] {
  const scored = tasks
    .filter((t) => t.state === "open")
    .map((issue): MatchResult => {
      const { score, matchedSkills } = scoreTask(issue, profile);
      return {
        issue,
        score,
        matchedSkills: [...new Set(matchedSkills)].slice(0, 6),
        directoryUrl: mirrorState[issue.node_id]?.directory_issue_url,
      };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
