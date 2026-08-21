/**
 * Governance Token Emissions to ubq.eth New Strategy
 *
 * Implements configurable multi-destination emission splits for governance tokens
 * at the protocol level. For every 1 token minted to stakers, additional tokens
 * are emitted to configured destinations (e.g., ubq.eth, UbiquiBot maintenance).
 *
 * Addresses: devpool-directory#5844 / ubiquity/ubiquity-dollar#831
 */

export interface EmissionDestination {
  address: string;
  label: string;
  /** Basis points (1/10000) of the base staker emission. 
   *  e.g., 5000 = 0.5x, 1000 = 0.1x, 500 = 0.05x */
  basisPoints: number;
}

export interface EmissionConfig {
  destinations: EmissionDestination[];
  maxTotalBasisPoints: number; // Safety cap to prevent excessive inflation
}

const DEFAULT_CONFIG: EmissionConfig = {
  destinations: [
    {
      address: "0x0000000000000000000000000000000000000000", // Placeholder for ubq.eth resolved address
      label: "ubq.eth (DAO Treasury)",
      basisPoints: 5000, // 0.5x per 1.0x staker emission
    },
  ],
  maxTotalBasisPoints: 20000, // Max 2x additional emissions safety cap
};

/**
 * Calculates the total emission multiplier including all configured destinations.
 * Returns the total basis points that will be minted per 10000 basis points of staker emission.
 */
export function calculateTotalEmissionMultiplier(
  config: EmissionConfig = DEFAULT_CONFIG
): { totalBasisPoints: number; multiplier: number } {
  const totalBasisPoints = config.destinations.reduce(
    (sum, d) => sum + d.basisPoints,
    0
  );
  return {
    totalBasisPoints,
    multiplier: totalBasisPoints / 10000,
  };
}

/**
 * Validates emission configuration against safety constraints.
 */
export function validateEmissionConfig(config: EmissionConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.destinations.length === 0) {
    errors.push("At least one emission destination must be configured.");
  }

  const totalBp = config.destinations.reduce((sum, d) => sum + d.basisPoints, 0);
  if (totalBp > config.maxTotalBasisPoints) {
    errors.push(
      `Total emission basis points (${totalBp}) exceeds maximum allowed (${config.maxTotalBasisPoints}).`
    );
  }

  for (const dest of config.destinations) {
    if (!dest.address || dest.address === "0x0000000000000000000000000000000000000000") {
      errors.push(`Destination '${dest.label}' has invalid or placeholder address.`);
    }
    if (dest.basisPoints <= 0) {
      errors.push(`Destination '${dest.label}' must have positive basis points.`);
    }
    if (dest.basisPoints > 10000) {
      errors.push(
        `Destination '${dest.label}' basis points (${dest.basisPoints}) exceeds 10000 (1x). Consider splitting into multiple entries.`
      );
    }
  }

  // Check for duplicate addresses
  const addresses = config.destinations.map((d) => d.address.toLowerCase());
  const uniqueAddresses = new Set(addresses);
  if (uniqueAddresses.size !== addresses.length) {
    errors.push("Duplicate destination addresses detected.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Computes actual token amounts to emit for a given base staker emission amount.
 * Returns array of {address, amount} pairs for on-chain distribution.
 */
export function computeEmissionAmounts(
  baseStakerAmount: bigint,
  config: EmissionConfig = DEFAULT_CONFIG
): Array<{ address: string; label: string; amount: bigint }> {
  return config.destinations.map((dest) => ({
    address: dest.address,
    label: dest.label,
    // amount = baseStakerAmount * basisPoints / 10000
    amount: (baseStakerAmount * BigInt(dest.basisPoints)) / 10000n,
  }));
}

/**
 * Generates Solidity storage layout snippet for LibChef integration.
 * Shows how to store and update emission destinations in the diamond.
 */
export function generateSolidityStorageSnippet(): string {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice Emission destination configuration stored in LibChef
struct EmissionDestination {
    address recipient;
    uint256 basisPoints; // per 10000 of base staker emission
}

/// @dev Add to LibChef storage struct
/// EmissionDestination[] internal _emissionDestinations;

/// @notice Sets emission destinations (governance only)
function setEmissionDestinations(EmissionDestination[] calldata destinations) external onlyGovernance {
    delete _emissionDestinations;
    uint256 totalBp;
    for (uint256 i = 0; i < destinations.length; i++) {
        require(destinations[i].recipient != address(0), "Invalid recipient");
        require(destinations[i].basisPoints > 0, "Zero basis points");
        totalBp += destinations[i].basisPoints;
        _emissionDestinations.push(destinations[i]);
    }
    require(totalBp <= 20000, "Exceeds max emissions");
}

/// @notice Modified mint logic in reward claim
/// After minting baseAmount to staker:
/// for (uint256 i = 0; i < _emissionDestinations.length; i++) {
///     uint256 extraAmount = (baseAmount * _emissionDestinations[i].basisPoints) / 10000;
///     _mint(_emissionDestinations[i].recipient, extraAmount);
/// }`;
}

/**
 * Generates a summary report of current emission configuration.
 */
export function generateEmissionReport(
  config: EmissionConfig = DEFAULT_CONFIG
): string {
  const { totalBasisPoints, multiplier } = calculateTotalEmissionMultiplier(config);
  const validation = validateEmissionConfig(config);

  const lines = [
    "## Governance Token Emission Strategy Report",
    "",
    `**Total Additional Multiplier:** ${multiplier.toFixed(4)}x (${totalBasisPoints} bps)`,
    `**Max Allowed:** ${(config.maxTotalBasisPoints / 10000).toFixed(4)}x (${config.maxTotalBasisPoints} bps)`,
    `**Validation:** ${validation.valid ? "✅ PASSED" : "❌ FAILED"}`,
    "",
    "| Destination | Address | Basis Points | Multiplier |",
    "|-------------|---------|--------------|------------|",
  ];

  for (const dest of config.destinations) {
    lines.push(
      `| ${dest.label} | \`${dest.address.substring(0, 10)}...\` | ${dest.basisPoints} | ${(dest.basisPoints / 10000).toFixed(4)}x |`
    );
  }

  if (!validation.valid) {
    lines.push("", "**Errors:**");
    for (const err of validation.errors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join("\n");
}

export { DEFAULT_CONFIG };
