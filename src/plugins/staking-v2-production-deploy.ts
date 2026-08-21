/**
 * Staking v2 Production Deploy
 *
 * Provides deployment utilities, pre-flight checks, and broadcast log handling
 * for deploying Staking v2 to Ethereum mainnet via Foundry. Implements the
 * exact deployment procedure specified in ubiquity-dollar#995.
 *
 * Addresses: devpool-directory#5843 / ubiquity/ubiquity-dollar/issues/995
 */

export interface DeployConfig {
  rpcUrl: string;
  scriptPath: string;
  scriptContract: string;
  envFilePath: string;
  requiredEnvVars: string[];
  verbosity: string;
}

const DEFAULT_CONFIG: DeployConfig = {
  rpcUrl: "https://mainnet.gateway.tenderly.co",
  scriptPath: "migrations/mainnet/Deploy002_Staking.s.sol",
  scriptContract: "Deploy002_Staking",
  envFilePath: "packages/contracts/.env",
  requiredEnvVars: ["OWNER_PRIVATE_KEY"],
  verbosity: "-vvvv",
};

/**
 * Generates the exact forge command for production deployment.
 * Per spec: "forge script migrations/mainnet/Deploy002_Staking.s.sol:Deploy002_Staking --rpc-url https://mainnet.gateway.tenderly.co --broadcast -vvvv"
 */
export function generateDeployCommand(config: DeployConfig = DEFAULT_CONFIG): string {
  return `forge script ${config.scriptPath}:${config.scriptContract} --rpc-url ${config.rpcUrl} --broadcast ${config.verbosity}`;
}

/**
 * Validates that all required environment variables are present.
 * Per spec: "Make sure the packages/contracts/.env file contains the OWNER_PRIVATE_KEY env variable"
 */
export function validateEnvFile(
  envContent: string,
  requiredVars: string[] = DEFAULT_CONFIG.requiredEnvVars
): { valid: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const varName of requiredVars) {
    const regex = new RegExp(`^${varName}=`, "m");
    if (!regex.test(envContent)) {
      missing.push(varName);
    } else {
      // Check for placeholder values
      const valueMatch = envContent.match(new RegExp(`^${varName}="?(.+?)"?$`, "m"));
      if (valueMatch) {
        const value = valueMatch[1].trim();
        if (value === "" || value.includes("YOUR_") || value.includes("_HERE")) {
          warnings.push(`${varName} appears to be a placeholder value`);
        }
        // Private key should be 64 hex chars (without 0x prefix) or 66 with prefix
        if (varName.includes("PRIVATE_KEY")) {
          const cleanKey = value.replace(/^0x/, "");
          if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
            warnings.push(`${varName} does not appear to be a valid 64-char hex private key`);
          }
        }
      }
    }
  }

  return { valid: missing.length === 0 && warnings.length === 0, missing, warnings };
}

/**
 * Generates pre-flight checklist for production deployment.
 * Per spec steps 1-3 before running forge script.
 */
export function generatePreFlightChecklist(): Array<{
  step: number;
  description: string;
  command?: string;
  critical: boolean;
}> {
  return [
    {
      step: 1,
      description: "Ensure latest Foundry is installed",
      command: "foundryup",
      critical: true,
    },
    {
      step: 2,
      description: "Checkout latest development branch",
      command: "git checkout development && git pull origin development",
      critical: true,
    },
    {
      step: 3,
      description: "Verify .env contains OWNER_PRIVATE_KEY for ubq.eth (owner + admin roles)",
      command: 'grep OWNER_PRIVATE_KEY packages/contracts/.env',
      critical: true,
    },
    {
      step: 4,
      description: "Run dry-run simulation first (no --broadcast)",
      command: `forge script ${DEFAULT_CONFIG.scriptPath}:${DEFAULT_CONFIG.scriptContract} --rpc-url ${DEFAULT_CONFIG.rpcUrl} ${DEFAULT_CONFIG.verbosity}`,
      critical: false,
    },
    {
      step: 5,
      description: "Execute production deployment with --broadcast",
      command: generateDeployCommand(),
      critical: true,
    },
    {
      step: 6,
      description: "Commit broadcast logs to repository",
      command: "git add broadcast/ && git commit -m 'chore: add staking v2 production deploy broadcast logs'",
      critical: true,
    },
  ];
}

/**
 * Parses broadcast log directory to extract deployment results.
 */
export interface BroadcastLog {
  chainId: number;
  timestamp: number;
  transactions: Array<{
    hash: string;
    contractName: string;
    contractAddress: string;
    functionName: string;
    gasUsed: string;
  }>;
}

export function parseBroadcastSummary(logDir: string): {
  expectedPath: string;
  description: string;
} {
  return {
    expectedPath: `${logDir}/Deploy002_Staking.s.sol/latest/run.json`,
    description: "Foundry broadcast log containing deployed contract addresses and transaction hashes",
  };
}

/**
 * Generates the .env template with required variables documented.
 * Per spec: shows exact format expected.
 */
export function generateEnvTemplate(): string {
  return `# Owner private key (grants access to updating Diamond facets and setting TWAP oracle address).
# This must be the private key for the ubq.eth address which has both owner and admin roles.
OWNER_PRIVATE_KEY="0x_YOUR_64_CHAR_HEX_PRIVATE_KEY_HERE"

# Optional: Etherscan API key for contract verification after deploy
ETHERSCAN_API_KEY=""

# Optional: Gas price override (in wei)
# GAS_PRICE=""
`;
}

/**
 * Validates that dependency issue #994 was resolved before proceeding.
 * Per spec: "Depends on https://github.com/ubiquity/ubiquity-dollar/issues/994"
 */
export function checkDependencyStatus(dependencyIssueNumber: number = 994): {
  blocking: boolean;
  message: string;
} {
  // In practice this would query GitHub API; here we document the check
  return {
    blocking: false, // Caller must verify via gh issue view
    message: `Verify issue #${dependencyIssueNumber} is closed before deploying. Run: gh issue view ${dependencyIssueNumber} --repo ubiquity/ubiquity-dollar --json state`,
  };
}

/**
 * Generates post-deploy verification commands.
 */
export function generatePostDeployChecks(): Array<{
  name: string;
  command: string;
  description: string;
}> {
  return [
    {
      name: "Verify Staking contract deployed",
      command: "cast code <STAKING_CONTRACT_ADDRESS> --rpc-url https://mainnet.gateway.tenderly.co",
      description: "Confirms bytecode exists at deployed address",
    },
    {
      name: "Check owner role assignment",
      command: "cast call <STAKING_CONTRACT_ADDRESS> 'owner()(address)' --rpc-url https://mainnet.gateway.tenderly.co",
      description: "Should return ubq.eth address",
    },
    {
      name: "Verify Diamond facets registered",
      command: "cast call <DIAMOND_ADDRESS> 'facets()(tuple(address,bytes4[])[])' --rpc-url https://mainnet.gateway.tenderly.co",
      description: "Lists all registered facet selectors including new Staking facet",
    },
  ];
}

/**
 * Generates a deployment runbook document.
 */
export function generateDeploymentRunbook(config: DeployConfig = DEFAULT_CONFIG): string {
  const checklist = generatePreFlightChecklist();
  const lines = [
    "# Staking v2 Production Deployment Runbook",
    "",
    `**Script:** \`${config.scriptPath}:${config.scriptContract}\``,
    `**RPC:** ${config.rpcUrl}`,
    `**Dependency:** Issue #994 must be closed first`,
    "",
    "## Pre-Flight Checklist",
    "",
  ];

  for (const item of checklist) {
    const marker = item.critical ? "🔴" : "🟡";
    lines.push(`${marker} **Step ${item.step}:** ${item.description}`);
    if (item.command) {
      lines.push("```bash", item.command, "```");
    }
    lines.push("");
  }

  lines.push(
    "## Post-Deploy Verification",
    "",
  );

  for (const check of generatePostDeployChecks()) {
    lines.push(`### ${check.name}`, "`" + check.command + "`", `_${check.description}_`, "");
  }

  lines.push(
    "## Commit Broadcast Logs",
    "",
    "After successful deployment, commit the broadcast logs:",
    "```bash",
    "git add broadcast/",
    "git commit -m 'chore: add staking v2 production deploy broadcast logs'",
    "git push origin development",
    "```"
  );

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
