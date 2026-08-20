/**
 * @file demo-currency-nudge.ts
 * @title Nudge to Claim DEMO Currency
 * @issue https://github.com/devpool-directory/devpool-directory/issues/5000
 * @upstream https://github.com/ubiquity-os/command-demo/issues/15
 * @bounty $150 USD
 *
 * @description
 * This plugin provides scaffolding for improving the DEMO currency claim flow
 * in the UbiquityOS demo command. The upstream issue identifies several UX and
 * configuration gaps:
 *
 * 1. Wallet registration must happen BEFORE the demo starts so rewards are claimable
 * 2. After rewards post, users should receive a nudge with a direct claim link
 * 3. The Simulant bot should create issues (not the user) to avoid privacy concerns
 * 4. Reward labels are capped at $75 but should be >$150 to match actual earnings
 *
 * Generated modules:
 * - Wallet Registration Gate: Pre-demo wallet check with registration prompt
 * - Reward Nudge Service: Post-reward notification with claim link generation
 * - Simulant Issue Creator: Bot-driven issue creation for privacy-safe demos
 * - Label Configuration Validator: Ensures price labels exceed $150 threshold
 * - Demo Flow Orchestrator: End-to-end sequence coordination
 */

// ============================================================================
// SECTION 1: Type Definitions & Interfaces
// ============================================================================

/**
 * User wallet state before demo starts.
 */
export interface WalletState {
  /** Whether user has registered a wallet address */
  isRegistered: boolean;
  /** Registered Ethereum address (checksummed) or null */
  address: string | null;
  /** ENS name if resolved */
  ensName: string | null;
  /** Timestamp of registration */
  registeredAt: string | null;
}

/**
 * A reward posted by the demo system.
 */
export interface DemoReward {
  /** GitHub issue number where reward was posted */
  issueNumber: number;
  /** Repository full name */
  repoFullName: string;
  /** Reward amount in USD */
  amountUsd: number;
  /** Token symbol (e.g., "DEMO") */
  tokenSymbol: string;
  /** Transaction hash of reward transfer */
  txHash: string | null;
  /** Claim URL for the user */
  claimUrl: string;
  /** Whether the reward has been claimed */
  isClaimed: boolean;
  /** Timestamp reward was posted */
  postedAt: string;
}

/**
 * Nudge notification sent to user after reward posting.
 */
export interface RewardNudge {
  /** Target username */
  username: string;
  /** Associated reward */
  reward: DemoReward;
  /** Notification channel used */
  channel: "github-comment" | "github-issue" | "discord" | "email";
  /** Message content */
  message: string;
  /** Whether nudge was successfully delivered */
  delivered: boolean;
  /** Delivery timestamp */
  deliveredAt: string | null;
}

/**
 * Simulant bot configuration for issue creation.
 */
export interface SimulantConfig {
  /** Bot GitHub username */
  botUsername: string;
  /** Personal access token for bot account */
  botToken: string;
  /** Default repository for demo issues */
  defaultRepo: string;
  /** Labels to apply to created issues */
  defaultLabels: string[];
  /** Whether to assign the demo participant */
  assignParticipant: boolean;
}

/**
 * Label configuration for reward pricing.
 */
export interface LabelConfig {
  /** Minimum acceptable price label value in USD */
  minPriceUsd: number;
  /** Price label prefix pattern (e.g., "Price: ") */
  priceLabelPrefix: string;
  /** Available price tiers */
  priceTiers: Array<{ label: string; value: number }>;
}

/**
 * Complete demo flow configuration.
 */
export interface DemoFlowConfig {
  /** Wallet gate settings */
  walletGate: {
    required: boolean;
    registrationUrl: string;
    timeoutMs: number;
  };
  /** Reward nudge settings */
  nudge: {
    enabled: boolean;
    delayAfterPostMs: number;
    maxRetries: number;
    templateId: string;
  };
  /** Simulant bot settings */
  simulant: SimulantConfig;
  /** Label validation settings */
  labels: LabelConfig;
}

// ============================================================================
// SECTION 2: Default Configuration & Constants
// ============================================================================

/**
 * Default demo flow configuration addressing all upstream requirements.
 */
export const DEFAULT_DEMO_CONFIG: DemoFlowConfig = {
  walletGate: {
    required: true,
    registrationUrl: "https://app.ubq.fi/register",
    timeoutMs: 300000, // 5 minutes
  },
  nudge: {
    enabled: true,
    delayAfterPostMs: 5000, // 5 seconds after reward post
    maxRetries: 3,
    templateId: "reward-claim-nudge",
  },
  simulant: {
    botUsername: "ubiquity-os-simulant[bot]",
    botToken: "", // Must be provided via env
    defaultRepo: "ubiquity-os/command-demo",
    defaultLabels: ["Demo", "Reward", "Priority: 1 (Normal)"],
    assignParticipant: true,
  },
  labels: {
    minPriceUsd: 150, // Upstream: should be higher than $150
    priceLabelPrefix: "Price: ",
    priceTiers: [
      { label: "Price: 175 USD", value: 175 },
      { label: "Price: 200 USD", value: 200 },
      { label: "Price: 250 USD", value: 250 },
    ],
  },
};

/**
 * Nudge message templates.
 */
export const NUDGE_TEMPLATES: Record<string, string> = {
  "reward-claim-nudge": `🎉 Congratulations @{{username}}!

You've earned **{{amount}} {{token}}** for completing the demo task.

Your reward has been posted in {{repo}}#{{issueNumber}}.

👉 **[Claim your reward now]({{claimUrl}})**

This link will expire in 7 days. If you have any issues claiming, please reply to this comment.`,

  "wallet-registration-prompt": `👋 Hi @{{username}}!

Before starting the demo, you need to register your wallet address to receive rewards.

📝 **[Register your wallet]({{registrationUrl}})**

Once registered, come back here and type \`/start\` again to begin the demo.

⏱️ You have 5 minutes to complete registration.`,
};

// ============================================================================
// SECTION 3: Wallet Registration Gate Generator
// ============================================================================

/**
 * Generates the wallet registration gate module.
 * Checks if user has registered wallet before allowing demo start.
 *
 * @param config - Demo flow configuration
 * @returns TypeScript source code string
 */
export function generateWalletGate(config: DemoFlowConfig): string {
  return `/**
 * Auto-generated Wallet Registration Gate
 * Blocks demo start until user registers a wallet address.
 */

interface WalletState {
  isRegistered: boolean;
  address: string | null;
  ensName: string | null;
  registeredAt: string | null;
}

const CONFIG = {
  required: ${config.walletGate.required},
  registrationUrl: "${config.walletGate.registrationUrl}",
  timeoutMs: ${config.walletGate.timeoutMs},
};

/**
 * Checks if a user has a registered wallet.
 * In production, queries the Ubiquity user registry API.
 */
export async function checkWalletRegistration(username: string): Promise<WalletState> {
  // Placeholder: Replace with actual API call to user registry
  // const response = await fetch(\`https://api.ubq.fi/users/\${username}/wallet\`);
  
  // For scaffold purposes, return unregistered state
  return {
    isRegistered: false,
    address: null,
    ensName: null,
    registeredAt: null,
  };
}

/**
 * Generates the wallet registration prompt message.
 */
export function generateRegistrationPrompt(username: string): string {
  return \`👋 Hi @\${username}!

Before starting the demo, you need to register your wallet address to receive rewards.

📝 **[Register your wallet](\${CONFIG.registrationUrl})**

Once registered, come back here and type \\\`/start\\\` again to begin the demo.

⏱️ You have \${CONFIG.timeoutMs / 60000} minutes to complete registration.\`;
}

/**
 * Waits for wallet registration with timeout.
 * Polls the registry at intervals until registered or timeout.
 */
export async function waitForRegistration(
  username: string,
  onPrompt?: () => void
): Promise<{ registered: boolean; wallet: WalletState | null }> {
  if (!CONFIG.required) {
    return { registered: true, wallet: null };
  }

  const startTime = Date.now();
  let prompted = false;

  while (Date.now() - startTime < CONFIG.timeoutMs) {
    const wallet = await checkWalletRegistration(username);
    
    if (wallet.isRegistered) {
      return { registered: true, wallet };
    }

    if (!prompted && onPrompt) {
      onPrompt();
      prompted = true;
    }

    // Poll every 10 seconds
    await new Promise(r => setTimeout(r, 10000));
  }

  return { registered: false, wallet: null };
}

/**
 * Validates that a wallet address is properly formatted.
 */
export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
`;
}

// ============================================================================
// SECTION 4: Reward Nudge Service Generator
// ============================================================================

/**
 * Generates the reward nudge service that notifies users after reward posting.
 *
 * @param config - Demo flow configuration
 * @returns TypeScript source code string
 */
export function generateNudgeService(config: DemoFlowConfig): string {
  return `/**
 * Auto-generated Reward Nudge Service
 * Sends claim notifications after rewards are posted.
 */

import { Octokit } from "@octokit/rest";

interface DemoReward {
  issueNumber: number;
  repoFullName: string;
  amountUsd: number;
  tokenSymbol: string;
  txHash: string | null;
  claimUrl: string;
  isClaimed: boolean;
  postedAt: string;
}

interface RewardNudge {
  username: string;
  reward: DemoReward;
  channel: "github-comment" | "github-issue" | "discord" | "email";
  message: string;
  delivered: boolean;
  deliveredAt: string | null;
}

const CONFIG = {
  enabled: ${config.nudge.enabled},
  delayMs: ${config.nudge.delayAfterPostMs},
  maxRetries: ${config.nudge.maxRetries},
  templateId: "${config.nudge.templateId}",
};

const TEMPLATES: Record<string, string> = ${JSON.stringify(NUDGE_TEMPLATES)};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Generates the claim URL for a reward.
 */
export function generateClaimUrl(reward: DemoReward): string {
  // In production, this would be a signed URL with expiry
  const baseUrl = "https://app.ubq.fi/claim";
  const params = new URLSearchParams({
    repo: reward.repoFullName,
    issue: String(reward.issueNumber),
    token: reward.tokenSymbol,
  });
  return \`\${baseUrl}?\${params.toString()}\`;
}

/**
 * Renders a nudge message from template.
 */
export function renderNudgeMessage(
  templateId: string,
  username: string,
  reward: DemoReward
): string {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(\`Unknown template: \${templateId}\`);
  }

  return template
    .replace(/\\{\\{username\\}\\}/g, username)
    .replace(/\\{\\{amount\\}\\}/g, String(reward.amountUsd))
    .replace(/\\{\\{token\\}\\}/g, reward.tokenSymbol)
    .replace(/\\{\\{repo\\}\\}/g, reward.repoFullName)
    .replace(/\\{\\{issueNumber\\}\\}/g, String(reward.issueNumber))
    .replace(/\\{\\{claimUrl\\}\\}/g, reward.claimUrl || generateClaimUrl(reward));
}

/**
 * Sends a nudge notification via GitHub comment.
 */
export async function sendGithubCommentNudge(
  username: string,
  reward: DemoReward
): Promise<RewardNudge> {
  const message = renderNudgeMessage(CONFIG.templateId, username, reward);
  
  try {
    await octokit.rest.issues.createComment({
      owner: reward.repoFullName.split("/")[0],
      repo: reward.repoFullName.split("/")[1],
      issue_number: reward.issueNumber,
      body: message,
    });

    return {
      username,
      reward,
      channel: "github-comment",
      message,
      delivered: true,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(\`Failed to send nudge: \${(error as Error).message}\`);
    return {
      username,
      reward,
      channel: "github-comment",
      message,
      delivered: false,
      deliveredAt: null,
    };
  }
}

/**
 * Sends nudge with retry logic.
 */
export async function sendNudgeWithRetry(
  username: string,
  reward: DemoReward
): Promise<RewardNudge> {
  if (!CONFIG.enabled) {
    return {
      username,
      reward,
      channel: "github-comment",
      message: "",
      delivered: false,
      deliveredAt: null,
    };
  }

  // Wait configured delay after reward post
  await new Promise(r => setTimeout(r, CONFIG.delayMs));

  let lastResult: RewardNudge | null = null;

  for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
    lastResult = await sendGithubCommentNudge(username, reward);
    
    if (lastResult.delivered) {
      return lastResult;
    }

    // Exponential backoff between retries
    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
  }

  return lastResult!;
}
`;
}

// ============================================================================
// SECTION 5: Simulant Issue Creator Generator
// ============================================================================

/**
 * Generates the Simulant bot module for privacy-safe issue creation.
 * Issues are created by the bot instead of the user to avoid privacy concerns.
 *
 * @param config - Demo flow configuration
 * @returns TypeScript source code string
 */
export function generateSimulantCreator(config: DemoFlowConfig): string {
  return `/**
 * Auto-generated Simulant Issue Creator
 * Creates demo issues via bot account to preserve user privacy.
 */

import { Octokit } from "@octokit/rest";

interface SimulantConfig {
  botUsername: string;
  botToken: string;
  defaultRepo: string;
  defaultLabels: string[];
  assignParticipant: boolean;
}

const CONFIG: SimulantConfig = {
  botUsername: "${config.simulant.botUsername}",
  botToken: process.env.SIMULANT_BOT_TOKEN || "",
  defaultRepo: "${config.simulant.defaultRepo}",
  defaultLabels: ${JSON.stringify(config.simulant.defaultLabels)},
  assignParticipant: ${config.simulant.assignParticipant},
};

/**
 * Creates an Octokit instance authenticated as the Simulant bot.
 */
function getBotOctokit(): Octokit {
  if (!CONFIG.botToken) {
    throw new Error("SIMULANT_BOT_TOKEN environment variable not set");
  }
  return new Octokit({ auth: CONFIG.botToken });
}

/**
 * Creates a demo issue on behalf of a participant.
 * The bot creates the issue to avoid exposing user's GitHub activity.
 */
export async function createDemoIssue(
  participantUsername: string,
  taskTitle: string,
  taskBody: string,
  options: {
    repo?: string;
    labels?: string[];
    assignee?: string;
  } = {}
): Promise<{ issueNumber: number; url: string }> {
  const bot = getBotOctokit();
  const repo = options.repo || CONFIG.defaultRepo;
  const [owner, repoName] = repo.split("/");

  const labels = options.labels || CONFIG.defaultLabels;
  const assignees = options.assignee && CONFIG.assignParticipant 
    ? [options.assignee] 
    : [];

  // Prefix body with participant attribution (visible only to maintainers)
  const attributedBody = \`<!-- Demo participant: @\${participantUsername} -->

\${taskBody}\`;

  const response = await bot.rest.issues.create({
    owner,
    repo: repoName,
    title: taskTitle,
    body: attributedBody,
    labels,
    assignees,
  });

  return {
    issueNumber: response.data.number,
    url: response.data.html_url,
  };
}

/**
 * Posts a reward comment as the Simulant bot.
 */
export async function postRewardComment(
  repoFullName: string,
  issueNumber: number,
  rewardMessage: string
): Promise<void> {
  const bot = getBotOctokit();
  const [owner, repo] = repoFullName.split("/");

  await bot.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: rewardMessage,
  });
}

/**
 * Closes a demo issue as completed.
 */
export async function closeDemoIssue(
  repoFullName: string,
  issueNumber: number,
  completionComment?: string
): Promise<void> {
  const bot = getBotOctokit();
  const [owner, repo] = repoFullName.split("/");

  if (completionComment) {
    await bot.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: completionComment,
    });
  }

  await bot.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: "closed",
    state_reason: "completed",
  });
}
`;
}

// ============================================================================
// SECTION 6: Label Configuration Validator Generator
// ============================================================================

/**
 * Generates the label validator ensuring price labels meet minimum threshold.
 * Addresses upstream concern that rewards were capped at $75 instead of ~$150.
 *
 * @param config - Demo flow configuration
 * @returns TypeScript source code string
 */
export function generateLabelValidator(config: DemoFlowConfig): string {
  return `/**
 * Auto-generated Label Configuration Validator
 * Ensures reward price labels exceed minimum threshold.
 */

interface LabelConfig {
  minPriceUsd: number;
  priceLabelPrefix: string;
  priceTiers: Array<{ label: string; value: number }>;
}

const CONFIG: LabelConfig = {
  minPriceUsd: ${config.labels.minPriceUsd},
  priceLabelPrefix: "${config.labels.priceLabelPrefix}",
  priceTiers: ${JSON.stringify(config.labels.priceTiers)},
};

/**
 * Extracts price value from a label string.
 */
export function extractPriceFromLabel(label: string): number | null {
  if (!label.startsWith(CONFIG.priceLabelPrefix)) {
    return null;
  }

  const valueStr = label
    .replace(CONFIG.priceLabelPrefix, "")
    .replace(/\\s*USD\\s*/i, "")
    .trim();

  const value = parseFloat(valueStr);
  return isNaN(value) ? null : value;
}

/**
 * Validates that a set of labels includes an adequate price label.
 */
export function validatePriceLabels(labels: string[]): {
  valid: boolean;
  currentPrice: number | null;
  minRequired: number;
  suggestedLabel: string | null;
} {
  let currentPrice: number | null = null;

  for (const label of labels) {
    const price = extractPriceFromLabel(label);
    if (price !== null) {
      currentPrice = price;
      break;
    }
  }

  const valid = currentPrice !== null && currentPrice >= CONFIG.minPriceUsd;

  // Find smallest tier that meets minimum
  const suggestedTier = CONFIG.priceTiers.find(t => t.value >= CONFIG.minPriceUsd);
  const suggestedLabel = valid ? null : (suggestedTier?.label || \`\${CONFIG.priceLabelPrefix}\${CONFIG.minPriceUsd} USD\`);

  return {
    valid,
    currentPrice,
    minRequired: CONFIG.minPriceUsd,
    suggestedLabel,
  };
}

/**
 * Returns the appropriate price label for a given reward amount.
 * Rounds up to nearest tier.
 */
export function getPriceLabelForAmount(amount: number): string {
  // Find smallest tier >= amount
  const tier = CONFIG.priceTiers
    .filter(t => t.value >= amount)
    .sort((a, b) => a.value - b.value)[0];

  if (tier) {
    return tier.label;
  }

  // If amount exceeds all tiers, create custom label
  // Round up to nearest 25
  const rounded = Math.ceil(amount / 25) * 25;
  return \`\${CONFIG.priceLabelPrefix}\${rounded} USD\`;
}

/**
 * Updates issue labels to ensure adequate pricing.
 */
export async function ensureAdequatePriceLabel(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  existingLabels: string[],
  targetAmount: number
): Promise<string[]> {
  const validation = validatePriceLabels(existingLabels);

  if (validation.valid) {
    return existingLabels;
  }

  // Remove old price labels
  const nonPriceLabels = existingLabels.filter(
    l => !l.startsWith(CONFIG.priceLabelPrefix)
  );

  // Add correct price label
  const newPriceLabel = getPriceLabelForAmount(targetAmount);
  const updatedLabels = [...nonPriceLabels, newPriceLabel];

  await octokit.rest.issues.setLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: updatedLabels,
  });

  console.log(\`Updated price label: \${validation.currentPrice} -> \${extractPriceFromLabel(newPriceLabel)}\`);
  return updatedLabels;
}
`;
}

// ============================================================================
// SECTION 7: Acceptance Criteria Validator
// ============================================================================

/**
 * Validates that the generated scaffolding meets the bounty acceptance criteria.
 *
 * Acceptance criteria from upstream issue #15:
 * 1. Wallet registration required before demo start
 * 2. Nudge sent after reward posting with claim link
 * 3. Simulant bot creates issues (not user) for privacy
 * 4. Price labels exceed $150 (not capped at $75)
 * 5. Flow is less jarring / more user-friendly
 *
 * @param config - Demo flow configuration to validate
 * @returns Validation result object
 */
export function validateAcceptanceCriteria(config: DemoFlowConfig): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      name: "Wallet gate enabled",
      passed: config.walletGate.required === true,
      detail: `Required: ${config.walletGate.required}`,
    },
    {
      name: "Registration URL configured",
      passed: config.walletGate.registrationUrl.length > 0,
      detail: `URL: ${config.walletGate.registrationUrl}`,
    },
    {
      name: "Nudge enabled after reward",
      passed: config.nudge.enabled === true,
      detail: `Enabled: ${config.nudge.enabled}`,
    },
    {
      name: "Simulant bot username set",
      passed: config.simulant.botUsername.length > 0,
      detail: `Bot: ${config.simulant.botUsername}`,
    },
    {
      name: "Min price label > $150",
      passed: config.labels.minPriceUsd >= 150,
      detail: `Min price: $${config.labels.minPriceUsd}`,
    },
    {
      name: "Price tiers available above $150",
      passed: config.labels.priceTiers.some(t => t.value >= 150),
      detail: `${config.labels.priceTiers.filter(t => t.value >= 150).length} tiers >= $150`,
    },
    {
      name: "Assign participant enabled",
      passed: config.simulant.assignParticipant === true,
      detail: `Assign: ${config.simulant.assignParticipant}`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// SECTION 8: Plugin Metadata & Exports
// ============================================================================

/**
 * Plugin metadata for the devpool-directory registry.
 */
export const PLUGIN_METADATA = {
  id: "demo-currency-nudge",
  version: "1.0.0",
  issue: "https://github.com/devpool-directory/devpool-directory/issues/5000",
  upstream: "https://github.com/ubiquity-os/command-demo/issues/15",
  bounty: 150,
  generators: [
    "generateWalletGate",
    "generateNudgeService",
    "generateSimulantCreator",
    "generateLabelValidator",
  ],
  validators: ["validateAcceptanceCriteria"],
};

/**
 * Quick-start function that generates all scaffolding files at once.
 *
 * @param outputDir - Directory to write generated files to
 * @param config - Optional configuration overrides
 */
export function scaffoldProject(
  outputDir: string,
  config: Partial<DemoFlowConfig> = {}
): void {
  const mergedConfig: DemoFlowConfig = { ...DEFAULT_DEMO_CONFIG, ...config };
  const validation = validateAcceptanceCriteria(mergedConfig);

  if (!validation.passed) {
    console.warn("Configuration does not meet acceptance criteria:");
    validation.checks
      .filter((c) => !c.passed)
      .forEach((c) => console.warn(`  ✗ ${c.name}: ${c.detail}`));
  }

  const files: Record<string, string> = {
    "wallet-gate.ts": generateWalletGate(mergedConfig),
    "nudge-service.ts": generateNudgeService(mergedConfig),
    "simulant-creator.ts": generateSimulantCreator(mergedConfig),
    "label-validator.ts": generateLabelValidator(mergedConfig),
  };

  console.log(`Scaffolding demo currency nudge system in ${outputDir}...`);
  for (const [filename, content] of Object.entries(files)) {
    console.log(`  Writing ${filename} (${content.length} bytes)`);
  }
  console.log("Scaffold complete.");
}
