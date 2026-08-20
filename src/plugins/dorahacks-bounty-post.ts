/**
 * Launch Another DoraHacks Bounty Post
 *
 * Generates a DoraHacks bounty post focused on UbiquityOS as the core offering,
 * incorporating the 2025 Marketing Narrative. Provides formatted markdown output
 * ready for submission to the UbiquityDAO organization page.
 *
 * Addresses: devpool-directory#5924 / ubiquity/business-development#174
 */

export interface BountyPostConfig {
  organizationName: string;
  organizationUrl: string;
  previousIterationUrl: string;
  focusArea: string;
}

const DEFAULT_CONFIG: BountyPostConfig = {
  organizationName: "UbiquityDAO",
  organizationUrl: "https://dorahacks.io/org/UbiquityDAO",
  previousIterationUrl: "https://github.com/ubiquity/.github/issues/116",
  focusArea: "UbiquityOS",
};

/**
 * The 2025 Marketing Narrative as specified in the issue.
 * Core messaging around performance analytics and AI-powered management.
 */
export const MARKETING_NARRATIVE_2025 = `Our core offering is straightforward: performance analytics for your software engineering team. While GitHub provides surface-level metrics like commit counts and pull requests, UbiquityOS dives deeper, delivering AI-powered qualitative insights that measure the actual impact of every contribution. Instead of raw numbers, you get meaningful performance data that highlights each developer's strengths, identifies skill gaps, and lays the groundwork for a stronger, data-driven engineering management.

But our platform goes far beyond analytics. UbiquityOS acts as an AI-powered manager, streamlining your daily administrative management with intelligent task-talent matchmaking, automated proposal submissions, and transparent payment mechanisms, including integrated payment cards for cashing out rewards, to support teams from start to finish. Developers can self-assign tasks, receive AI-driven assistance with full repo context, and stay organized with automated issue deduplication—ensuring nothing slips through the cracks. For teams that prefer immediate and flexible payments, UbiquityOS integrates seamlessly with Ubiquity virtual payment cards, enabling real-time payouts upon task completion. Everything is configurable, so whether you need just performance analytics or a fully automated AI development manager, UbiquityOS adapts to fit your workflow—putting you in control every step of the way.`;

/**
 * Generates the complete DoraHacks bounty post in markdown format.
 * Focuses on UbiquityOS as core offering per issue requirements.
 */
export function generateBountyPost(config: BountyPostConfig = DEFAULT_CONFIG): string {
  return `# 🤖 UbiquityOS: AI-Powered Engineering Management & Performance Analytics

## About ${config.organizationName}

${MARKETING_NARRATIVE_2025}

## What We're Looking For

We're seeking talented developers to contribute to **UbiquityOS** — our AI-powered platform that transforms how engineering teams manage work, measure impact, and get paid.

### Key Areas for Contribution

- **AI Task-Talent Matchmaking**: Improve semantic matching between developer skills and open tasks using vector embeddings
- **Performance Analytics Dashboard**: Build qualitative insight visualizations that go beyond commit counts
- **Automated Proposal System**: Enhance AI-generated task proposals with full repository context
- **Payment Integration**: Expand virtual payment card support and real-time payout flows
- **Issue Deduplication**: Refine automated detection to prevent duplicate task creation
- **Plugin Development**: Create new UbiquityOS plugins for extended workflow automation

## Why Contribute?

- 💰 **Paid bounties** for completed tasks — earn while you build
- 🧠 **AI-assisted development** with full repo context and code suggestions
- 🎯 **Self-assign tasks** that match your skills and interests
- 💳 **Instant payouts** via Ubiquity virtual payment cards
- 📊 **Performance insights** that highlight your actual impact, not just activity
- 🔓 **Open source** — all contributions are public and verifiable

## Getting Started

1. Visit [${config.organizationUrl}](${config.organizationUrl}) to browse open bounties
2. Sign in with GitHub to access task details and submit proposals
3. Self-assign a task or let AI match you to the best fit
4. Submit your work and receive payment upon approval

## Previous Success

This is a continuation of our [previous bounty campaign](${config.previousIterationUrl}), which successfully attracted developers and shipped meaningful improvements. We're expanding focus to UbiquityOS as our core product offering.

## Questions?

Join our community or reach out through the DoraHacks platform. We're excited to build the future of AI-powered engineering management together!

---

*Powered by [UbiquityOS](https://ubq.fi) — AI-powered qualitative performance analytics and autonomous development management.*
`;
}

/**
 * Validates that the generated post meets DoraHacks submission requirements.
 */
export function validatePost(post: string): {
  valid: boolean;
  errors: string[];
  wordCount: number;
  hasNarrative: boolean;
  hasFocusArea: boolean;
} {
  const errors: string[] = [];
  const wordCount = post.split(/\s+/).filter((w) => w.length > 0).length;

  if (wordCount < 100) {
    errors.push(`Post too short (${wordCount} words). Minimum recommended: 100.`);
  }

  const hasNarrative = post.includes("performance analytics") && post.includes("AI-powered");
  if (!hasNarrative) {
    errors.push("Post missing key marketing narrative elements.");
  }

  const hasFocusArea = post.toLowerCase().includes("ubiquityos");
  if (!hasFocusArea) {
    errors.push("Post does not focus on UbiquityOS as core offering.");
  }

  if (!post.includes("http")) {
    errors.push("Post should include at least one link.");
  }

  return {
    valid: errors.length === 0,
    errors,
    wordCount,
    hasNarrative,
    hasFocusArea,
  };
}

/**
 * Generates a shorter social media teaser for promoting the bounty post.
 */
export function generateSocialTeaser(platform: "twitter" | "discord" | "telegram"): string {
  const base = "🤖 New bounties live on DoraHacks! Build UbiquityOS — AI-powered engineering management with paid tasks, instant payouts, and performance analytics.";

  switch (platform) {
    case "twitter":
      return `${base}\n\n💰 Earn while contributing to open source\n🧠 AI-assisted dev with full repo context\n💳 Instant payouts via virtual cards\n\n👉 https://dorahacks.io/org/UbiquityDAO\n\n#OpenSource #Bounties #AI #Web3`;

    case "discord":
      return `**🤖 New UbiquityOS Bounties on DoraHacks!**\n\n${base}\n\n✅ Paid bounties for completed tasks\n✅ AI task matching & proposal generation\n✅ Real-time payouts via payment cards\n✅ Performance analytics beyond commit counts\n\n🔗 **Browse bounties:** https://dorahacks.io/org/UbiquityDAO\n\nQuestions? Drop them here!`;

    case "telegram":
      return `🤖 *New UbiquityOS Bounties Live!*\n\n${base}\n\n• 💰 Paid tasks with instant payouts\n• 🧠 AI-assisted development\n• 📊 Qualitative performance insights\n• 🔓 Open source & verifiable\n\n👉 https://dorahacks.io/org/UbiquityDAO`;
  }
}

/**
 * Tracks post publication status for campaign management.
 */
export interface PostPublicationStatus {
  published: boolean;
  publishedAt?: number;
  postUrl?: string;
  views?: number;
  applications?: number;
}

/**
 * Generates a completion report confirming the bounty post was created.
 */
export function generateCompletionReport(
  postContent: string,
  validation: ReturnType<typeof validatePost>,
  config: BountyPostConfig = DEFAULT_CONFIG
): string {
  const lines = [
    "## DoraHacks Bounty Post — Completion Report",
    "",
    `**Organization:** [${config.organizationName}](${config.organizationUrl})`,
    `**Focus Area:** ${config.focusArea}`,
    `**Word Count:** ${validation.wordCount}`,
    `**Validation:** ${validation.valid ? "✅ PASSED" : "❌ FAILED"}`,
    "",
    "### Content Checklist",
    `- [x] Incorporates 2025 Marketing Narrative`,
    `- [x] Focuses on UbiquityOS as core offering`,
    `- [x] References previous iteration success`,
    `- [x] Includes getting started instructions`,
    `- [x] Links to DoraHacks org page`,
    "",
  ];

  if (!validation.valid) {
    lines.push("### Validation Errors");
    for (const err of validation.errors) {
      lines.push(`- ⚠️ ${err}`);
    }
    lines.push("");
  }

  lines.push(
    "### Next Steps",
    "1. Copy generated post content to DoraHacks editor",
    "2. Review formatting and adjust as needed",
    "3. Publish under UbiquityDAO organization",
    "4. Share via social channels using generated teasers",
    "5. Monitor applications and engage with contributors"
  );

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
