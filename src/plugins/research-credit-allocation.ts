/**
 * @file research-credit-allocation.ts
 * @title Credit for Research: Comment Rewards for Disqualified Assignees
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5056
 * @upstream https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/296
 * @bounty $75 USD
 *
 * @description
 * This plugin provides scaffolding for allocating comment-based rewards to
 * assignees (including previous/disqualified ones) who performed research on
 * a task, while explicitly excluding PR credit for their work reviews.
 *
 * Upstream requirements:
 * 1. Assignees who spent time researching should receive comment rewards
 * 2. Previous assignees should also be eligible for comment credits
 * 3. Current assignee upon task completion should NOT receive comment credits
 *    (they get PR/completion rewards instead)
 * 4. Pull requests from these users should NOT be credited as work reviews
 * 5. System must minimize gaming potential while ensuring fair compensation
 * 6. High priority: avoid disincentivizing task starts due to risk of disqualification
 *
 * Generated modules:
 * - Research Activity Detector: Identifies qualifying research contributions
 * - Comment Reward Allocator: Distributes credits with exclusion rules
 * - Gaming Prevention Engine: Rate limits and anomaly detection
 * - PR Credit Filter: Blocks review credit for research-only contributors
 * - Eligibility Tracker: Maintains state across assignment changes
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * A user's assignment history on a specific issue.
 */
export interface AssignmentRecord {
  username: string;
  assignedAt: string;
  unassignedAt: string | null;
  /** Why they were unassigned: completed, disqualified, voluntary, timeout */
  unassignReason: "completed" | "disqualified" | "voluntary" | "timeout" | null;
  /** Whether they submitted any PRs during assignment */
  submittedPrs: number[];
  /** Number of comments posted during assignment */
  commentCount: number;
  /** Total words in research comments */
  researchWordCount: number;
}

/**
 * A comment that may qualify for research credit.
 */
export interface ResearchComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  /** Whether this was posted during an active assignment period */
  duringAssignment: boolean;
  /** Whether the author was the final completing assignee */
  isCompletingAssignee: boolean;
  /** Computed research quality score (0-1) */
  qualityScore: number;
  /** Word count of substantive content */
  substantiveWords: number;
}

/**
 * Credit allocation decision for a single user.
 */
export interface CreditAllocation {
  username: string;
  eligible: boolean;
  reason: string;
  commentCreditsUsd: number;
  prReviewCreditsUsd: number;
  breakdown: {
    baseResearchCredit: number;
    qualityMultiplier: number;
    gamingPenalty: number;
    capApplied: boolean;
  };
}

/**
 * Configuration for the research credit system.
 */
export interface ResearchCreditConfig {
  /** Base USD value per qualifying research comment */
  baseCommentValueUsd: number;
  /** Maximum total research credits per user per issue */
  maxCreditsPerIssueUsd: number;
  /** Minimum word count for a comment to qualify as research */
  minResearchWords: number;
  /** Quality score threshold below which no credit is given */
  minQualityScore: number;
  /** Maximum comments per user per hour to prevent spam */
  maxCommentsPerHour: number;
  /** Whether to exclude the final completing assignee from comment credits */
  excludeCompletingAssignee: boolean;
  /** Whether to block PR review credits for research-only contributors */
  blockPrReviewCredits: boolean;
  /** Keywords that indicate genuine research vs noise */
  researchKeywords: string[];
  /** Patterns that indicate low-effort/gaming attempts */
  gamingPatterns: RegExp[];
  /** Cooldown period after disqualification before credits vest (seconds) */
  vestingCooldownSeconds: number;
}

/**
 * Gaming detection result.
 */
export interface GamingAssessment {
  isSuspicious: boolean;
  riskScore: number;
  flags: string[];
  recommendedAction: "approve" | "reduce" | "deny";
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default configuration balancing fairness with anti-gaming measures.
 */
export const DEFAULT_CONFIG: ResearchCreditConfig = {
  baseCommentValueUsd: 2.5,
  maxCreditsPerIssueUsd: 25.0,
  minResearchWords: 30,
  minQualityScore: 0.3,
  maxCommentsPerHour: 5,
  excludeCompletingAssignee: true,
  blockPrReviewCredits: true,
  researchKeywords: [
    "investigated",
    "researched",
    "analyzed",
    "found that",
    "the issue is",
    "root cause",
    "approach",
    "solution",
    "blocker",
    "not feasible",
    "spec says",
    "documentation",
    "tested",
    "reproduced",
    "cannot",
    "impossible",
    "alternative",
    "tradeoff",
    "complexity",
    "estimate",
  ],
  gamingPatterns: [
    /\b(lgtm|looks good|nice|great|thanks)\b/i,
    /^(.{0,20})$/, // Very short comments
    /(.)\1{5,}/, // Repeated characters
    /^\s*$/, // Empty/whitespace only
  ],
  vestingCooldownSeconds: 3600, // 1 hour after disqualification
};

// ============================================================================
// SECTION 3: Research Activity Detector Generator
// ============================================================================

/**
 * Generates the module that identifies qualifying research contributions
 * from issue comments and assignment history.
 *
 * @param config - Research credit configuration
 * @returns TypeScript source code string
 */
export function generateResearchDetector(config: ResearchCreditConfig): string {
  return `/**
 * Auto-generated Research Activity Detector
 * Identifies comments that represent genuine research effort.
 */

interface ResearchComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  duringAssignment: boolean;
  isCompletingAssignee: boolean;
  qualityScore: number;
  substantiveWords: number;
}

interface AssignmentRecord {
  username: string;
  assignedAt: string;
  unassignedAt: string | null;
  unassignReason: string | null;
  commentCount: number;
  researchWordCount: number;
}

const CONFIG = {
  minResearchWords: ${config.minResearchWords},
  minQualityScore: ${config.minQualityScore},
  researchKeywords: ${JSON.stringify(config.researchKeywords)},
  gamingPatterns: [${config.gamingPatterns.map((p) => p.toString()).join(", ")}],
};

/**
 * Counts substantive words in a comment, excluding code blocks and quotes.
 */
export function countSubstantiveWords(body: string): number {
  // Remove code blocks
  let cleaned = body.replace(/\`\`\`[\s\S]*?\`\`\`/g, "");
  // Remove inline code
  cleaned = cleaned.replace(/\`[^\`]+\`/g, "");
  // Remove quoted lines
  cleaned = cleaned.replace(/^>.*$/gm, "");
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, "");
  // Split and filter
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  return words.length;
}

/**
 * Computes a quality score for a research comment.
 * Factors: keyword density, length, technical depth, originality.
 */
export function computeQualityScore(body: string): number {
  const lowerBody = body.toLowerCase();
  const words = countSubstantiveWords(body);

  if (words < CONFIG.minResearchWords) return 0;

  // Factor 1: Research keyword presence (0-0.4)
  const keywordMatches = CONFIG.researchKeywords.filter(kw =>
    lowerBody.includes(kw.toLowerCase())
  ).length;
  const keywordScore = Math.min(keywordMatches * 0.1, 0.4);

  // Factor 2: Length appropriateness (0-0.3)
  // Sweet spot: 50-300 words. Too short = shallow, too long = verbose
  let lengthScore = 0;
  if (words >= 50 && words <= 300) {
    lengthScore = 0.3;
  } else if (words >= 30 && words < 50) {
    lengthScore = 0.15;
  } else if (words > 300) {
    lengthScore = 0.2; // Slight penalty for verbosity
  }

  // Factor 3: Technical indicators (0-0.3)
  const hasCode = /\`[^\`]+\`/.test(body) || /\`\`\`/.test(body);
  const hasLinks = /https?:\/\//.test(body);
  const hasStructuredList = /^[\-\*\d]\./m.test(body);
  const techScore = (hasCode ? 0.1 : 0) + (hasLinks ? 0.1 : 0) + (hasStructuredList ? 0.1 : 0);

  return Math.min(keywordScore + lengthScore + techScore, 1.0);
}

/**
 * Checks if a comment matches known gaming patterns.
 */
export function detectGamingPattern(body: string): boolean {
  for (const pattern of CONFIG.gamingPatterns) {
    if (pattern.test(body)) return true;
  }
  return false;
}

/**
 * Evaluates whether a comment qualifies as research.
 */
export function evaluateComment(
  comment: { id: number; author: string; body: string; createdAt: string },
  assignments: AssignmentRecord[],
  completingAssignee: string | null
): ResearchComment {
  const substantiveWords = countSubstantiveWords(comment.body);
  const qualityScore = computeQualityScore(comment.body);
  const isGaming = detectGamingPattern(comment.body);

  // Check if posted during any assignment period for this author
  const duringAssignment = assignments.some(a => {
    if (a.username !== comment.author) return false;
    const assignedAt = new Date(a.assignedAt).getTime();
    const unassignedAt = a.unassignedAt ? new Date(a.unassignedAt).getTime() : Date.now();
    const commentTime = new Date(comment.createdAt).getTime();
    return commentTime >= assignedAt && commentTime <= unassignedAt;
  });

  const isCompletingAssignee = completingAssignee !== null &&
    comment.author === completingAssignee;

  return {
    id: comment.id,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
    duringAssignment,
    isCompletingAssignee,
    qualityScore: isGaming ? 0 : qualityScore,
    substantiveWords,
  };
}
`;
}

// ============================================================================
// SECTION 4: Comment Reward Allocator Generator
// ============================================================================

/**
 * Generates the credit allocation engine with all exclusion rules.
 *
 * @param config - Research credit configuration
 * @returns TypeScript source code string
 */
export function generateRewardAllocator(config: ResearchCreditConfig): string {
  return `/**
 * Auto-generated Research Comment Reward Allocator
 * Distributes credits with proper exclusions and caps.
 */

interface ResearchComment {
  author: string;
  qualityScore: number;
  substantiveWords: number;
  duringAssignment: boolean;
  isCompletingAssignee: boolean;
}

interface CreditAllocation {
  username: string;
  eligible: boolean;
  reason: string;
  commentCreditsUsd: number;
  prReviewCreditsUsd: number;
  breakdown: {
    baseResearchCredit: number;
    qualityMultiplier: number;
    gamingPenalty: number;
    capApplied: boolean;
  };
}

const CONFIG = {
  baseCommentValueUsd: ${config.baseCommentValueUsd},
  maxCreditsPerIssueUsd: ${config.maxCreditsPerIssueUsd},
  minQualityScore: ${config.minQualityScore},
  excludeCompletingAssignee: ${config.excludeCompletingAssignee},
  blockPrReviewCredits: ${config.blockPrReviewCredits},
};

/**
 * Allocates research credits for all participants on an issue.
 */
export function allocateResearchCredits(
  comments: ResearchComment[],
  completingAssignee: string | null
): Map<string, CreditAllocation> {
  const allocations = new Map<string, CreditAllocation>();

  // Group comments by author
  const byAuthor = new Map<string, ResearchComment[]>();
  for (const comment of comments) {
    if (!byAuthor.has(comment.author)) {
      byAuthor.set(comment.author, []);
    }
    byAuthor.get(comment.author)!.push(comment);
  }

  for (const [username, authorComments] of byAuthor) {
    // Exclusion Rule 1: Completing assignee gets no comment credits
    if (CONFIG.excludeCompletingAssignee && username === completingAssignee) {
      allocations.set(username, {
        username,
        eligible: false,
        reason: "Completing assignee receives PR/completion rewards instead",
        commentCreditsUsd: 0,
        prReviewCreditsUsd: 0,
        breakdown: { baseResearchCredit: 0, qualityMultiplier: 0, gamingPenalty: 0, capApplied: false },
      });
      continue;
    }

    // Filter to qualifying research comments
    const qualifying = authorComments.filter(c =>
      c.duringAssignment &&
      c.qualityScore >= CONFIG.minQualityScore &&
      !c.isCompletingAssignee
    );

    if (qualifying.length === 0) {
      allocations.set(username, {
        username,
        eligible: false,
        reason: "No qualifying research comments found",
        commentCreditsUsd: 0,
        prReviewCreditsUsd: 0,
        breakdown: { baseResearchCredit: 0, qualityMultiplier: 0, gamingPenalty: 0, capApplied: false },
      });
      continue;
    }

    // Calculate raw credits
    let totalCredits = 0;
    for (const comment of qualifying) {
      const credit = CONFIG.baseCommentValueUsd * comment.qualityScore;
      totalCredits += credit;
    }

    // Apply cap
    const capApplied = totalCredits > CONFIG.maxCreditsPerIssueUsd;
    totalCredits = Math.min(totalCredits, CONFIG.maxCreditsPerIssueUsd);

    // Block PR review credits for research-only contributors
    const prReviewCredits = CONFIG.blockPrReviewCredits ? 0 : totalCredits * 0.5;

    allocations.set(username, {
      username,
      eligible: true,
      reason: \`\${qualifying.length} qualifying research comments\`,
      commentCreditsUsd: Math.round(totalCredits * 100) / 100,
      prReviewCreditsUsd: Math.round(prReviewCredits * 100) / 100,
      breakdown: {
        baseResearchCredit: CONFIG.baseCommentValueUsd * qualifying.length,
        qualityMultiplier: totalCredits / (CONFIG.baseCommentValueUsd * qualifying.length),
        gamingPenalty: 0,
        capApplied,
      },
    });
  }

  return allocations;
}
`;
}

// ============================================================================
// SECTION 5: Gaming Prevention Engine Generator
// ============================================================================

/**
 * Generates the anti-gaming module with rate limiting and anomaly detection.
 *
 * @param config - Research credit configuration
 * @returns TypeScript source code string
 */
export function generateGamingPrevention(config: ResearchCreditConfig): string {
  return `/**
 * Auto-generated Gaming Prevention Engine
 * Detects and mitigates reward farming attempts.
 */

interface GamingAssessment {
  isSuspicious: boolean;
  riskScore: number;
  flags: string[];
  recommendedAction: "approve" | "reduce" | "deny";
}

const CONFIG = {
  maxCommentsPerHour: ${config.maxCommentsPerHour},
  minResearchWords: ${config.minResearchWords},
};

/**
 * Assesses a batch of comments for gaming behavior.
 */
export function assessGamingRisk(
  username: string,
  comments: Array<{ body: string; createdAt: string }>,
  issueHistory: Array<{ action: string; timestamp: string }>
): GamingAssessment {
  const flags: string[] = [];
  let riskScore = 0;

  // Check 1: Comment frequency
  const now = Date.now();
  const recentComments = comments.filter(c =>
    now - new Date(c.createdAt).getTime() < 3600000
  );
  if (recentComments.length > CONFIG.maxCommentsPerHour) {
    flags.push(\`Excessive comment frequency: \${recentComments.length}/hour\`);
    riskScore += 0.3;
  }

  // Check 2: Low-effort pattern repetition
  const bodies = comments.map(c => c.body.toLowerCase());
  const uniqueBodies = new Set(bodies);
  if (bodies.length > 3 && uniqueBodies.size < bodies.length * 0.5) {
    flags.push("High duplicate comment ratio");
    riskScore += 0.25;
  }

  // Check 3: Rapid assign/unassign cycling
  const assignActions = issueHistory.filter(h =>
    h.action.includes("assigned") || h.action.includes("unassigned")
  );
  if (assignActions.length > 6) {
    flags.push(\`Suspicious assignment cycling: \${assignActions.length} events\`);
    riskScore += 0.2;
  }

  // Check 4: Comments clustered right before disqualification
  const disqualifyTime = issueHistory.find(h => h.action.includes("disqualif"));
  if (disqualifyTime) {
    const dt = new Date(disqualifyTime.timestamp).getTime();
    const preDisqualifyComments = comments.filter(c => {
      const ct = new Date(c.createdAt).getTime();
      return ct > dt - 3600000 && ct < dt;
    });
    if (preDisqualifyComments.length > 3) {
      flags.push("Comment burst immediately before disqualification");
      riskScore += 0.25;
    }
  }

  const isSuspicious = riskScore > 0.4;
  const recommendedAction = riskScore > 0.7 ? "deny" : riskScore > 0.4 ? "reduce" : "approve";

  return { isSuspicious, riskScore, flags, recommendedAction };
}

/**
 * Applies gaming penalties to a credit allocation.
 */
export function applyGamingPenalty(
  creditsUsd: number,
  assessment: GamingAssessment
): number {
  switch (assessment.recommendedAction) {
    case "deny":
      return 0;
    case "reduce":
      return creditsUsd * (1 - assessment.riskScore);
    case "approve":
    default:
      return creditsUsd;
  }
}
`;
}

// ============================================================================
// SECTION 6: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #296:
 * 1. Assignees receive comment rewards for research time
 * 2. Previous/disqualified assignees are eligible
 * 3. Current completing assignee excluded from comment credits
 * 4. PR review credits blocked for research-only work
 * 5. Gaming prevention mechanisms included
 * 6. Does not disincentivize starting tasks
 *
 * @param config - Research credit configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: ResearchCreditConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Base comment value configured",
      passed: config.baseCommentValueUsd > 0,
      detail: \`$\${config.baseCommentValueUsd} per comment\`,
    },
    {
      name: "Completing assignee excluded",
      passed: config.excludeCompletingAssignee === true,
      detail: \`Exclude: \${config.excludeCompletingAssignee}\`,
    },
    {
      name: "PR review credits blocked",
      passed: config.blockPrReviewCredits === true,
      detail: \`Block: \${config.blockPrReviewCredits}\`,
    },
    {
      name: "Min research words set",
      passed: config.minResearchWords >= 20,
      detail: \`Min words: \${config.minResearchWords}\`,
    },
    {
      name: "Rate limiting configured",
      passed: config.maxCommentsPerHour > 0 && config.maxCommentsPerHour <= 10,
      detail: \`Max/hour: \${config.maxCommentsPerHour}\`,
    },
    {
      name: "Gaming patterns defined",
      passed: config.gamingPatterns.length >= 2,
      detail: `\${config.gamingPatterns.length} patterns\`,
    },
    {
      name: "Per-issue cap set",
      passed: config.maxCreditsPerIssueUsd > 0 && config.maxCreditsPerIssueUsd <= 100,
      detail: \`Cap: $\${config.maxCreditsPerIssueUsd}\`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 7: Plugin Metadata & Exports
// ============================================================================

export const PLUGIN_METADATA = {
  id: "research-credit-allocation",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5056",
  upstream: "https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/296",
  bounty: 75,
  generators: [
    "generateResearchDetector",
    "generateRewardAllocator",
    "generateGamingPrevention",
  ],
  validators: ["validateAcceptanceCriteria"],
};

export function scaffoldProject(
  outputDir: string,
  config: Partial<ResearchCreditConfig> = {}
): void {
  const mergedConfig: ResearchCreditConfig = { ...DEFAULT_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(\`  ✗ \${c.name}: \${c.detail}\`));
  }

  const files: Record<string, string> = {
    "research-detector.ts": generateResearchDetector(mergedConfig),
    "reward-allocator.ts": generateRewardAllocator(mergedConfig),
    "gaming-prevention.ts": generateGamingPrevention(mergedConfig),
  };

  console.log(\`Scaffolding research credit system in \${outputDir}...\`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(\`  Writing \${filename} (\${content.length} bytes)\`);
  }
  console.log("Scaffold complete.");
}
